import { createHash, randomBytes } from "node:crypto";
import type { Config } from "./config.js";

/**
 * Minimal OAuth2 for Google + X (Twitter). Authorization-code flow; X additionally
 * uses PKCE. Providers are only enabled when their client id/secret are configured,
 * so the app runs fine locally without them. Social login is passwordless.
 */

export type OAuthProvider = "google" | "x";

interface PendingState {
  provider: OAuthProvider;
  verifier: string;
  createdAt: number;
}

// Short-lived state store (10 min). In-memory is fine for a single API instance;
// for multi-instance, back this with Redis/Neo4j.
const pending = new Map<string, PendingState>();
const STATE_TTL_MS = 10 * 60 * 1000;

function gc() {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [k, v] of pending) if (v.createdAt < cutoff) pending.delete(k);
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function enabledProviders(cfg: Config): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  if (cfg.oauth.google) out.push("google");
  if (cfg.oauth.x) out.push("x");
  return out;
}

function redirectUri(cfg: Config, provider: OAuthProvider): string {
  return `${cfg.publicBaseUrl}/api/auth/oauth/${provider}/callback`;
}

/** Build the provider authorize URL and remember the state. */
export function buildAuthorizeUrl(cfg: Config, provider: OAuthProvider): string {
  gc();
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  pending.set(state, { provider, verifier, createdAt: Date.now() });

  if (provider === "google") {
    const p = new URLSearchParams({
      client_id: cfg.oauth.google!.clientId,
      redirect_uri: redirectUri(cfg, "google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  }
  // X (Twitter) OAuth2 with PKCE
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const p = new URLSearchParams({
    client_id: cfg.oauth.x!.clientId,
    redirect_uri: redirectUri(cfg, "x"),
    response_type: "code",
    scope: "tweet.read users.read",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://twitter.com/i/oauth2/authorize?${p.toString()}`;
}

export interface OAuthProfile {
  provider: OAuthProvider;
  sub: string;
  email: string;
  displayName: string;
}

/** Exchange the callback code for a normalized profile. Throws on any failure. */
export async function handleCallback(
  cfg: Config,
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<OAuthProfile> {
  const st = pending.get(state);
  pending.delete(state);
  if (!st || st.provider !== provider) throw new Error("invalid or expired OAuth state");

  if (provider === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.oauth.google!.clientId,
        client_secret: cfg.oauth.google!.clientSecret,
        redirect_uri: redirectUri(cfg, "google"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`google token exchange failed: ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${access_token}` },
    });
    if (!infoRes.ok) throw new Error(`google userinfo failed: ${infoRes.status}`);
    const info = (await infoRes.json()) as { sub: string; email?: string; name?: string };
    return {
      provider,
      sub: info.sub,
      email: info.email ?? "",
      displayName: info.name ?? info.email ?? "Google user",
    };
  }

  // X (Twitter)
  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${cfg.oauth.x!.clientId}:${cfg.oauth.x!.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: cfg.oauth.x!.clientId,
      redirect_uri: redirectUri(cfg, "x"),
      code_verifier: st.verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`x token exchange failed: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) throw new Error(`x users/me failed: ${meRes.status}`);
  const me = (await meRes.json()) as { data: { id: string; name?: string; username?: string } };
  return {
    provider,
    sub: me.data.id,
    email: "", // X does not return email by default
    displayName: me.data.name ?? me.data.username ?? "X user",
  };
}
