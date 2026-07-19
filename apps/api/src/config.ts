export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface Config {
  port: number;
  jwtSecret: string;
  encryptionKey: Buffer;
  corsOrigins: string[];
  defaultProvider: string;
  defaultModel: string;
  /** Public origin the browser reaches (e.g. https://stressforge.example). Used for OAuth redirects. */
  publicBaseUrl: string;
  oauth: {
    google?: OAuthProviderConfig;
    x?: OAuthProviderConfig;
  };
  /**
   * Abuse controls for public demos.
   * - allowRegistration: when false, email/password signup is disabled (login + OAuth still work).
   * - registrationInviteCode: if set, register body must include matching inviteCode.
   * - maxProjectsPerUser: cap owned projects (0 = unlimited). Demo default should be small.
   * - rateLimitMax: global requests per IP per minute (0 = disabled).
   */
  allowRegistration: boolean;
  registrationInviteCode?: string;
  maxProjectsPerUser: number;
  rateLimitMax: number;
  authRateLimitMax: number;
  aiRateLimitMax: number;
}

function parseEncryptionKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is required");
  // Accept hex (64 chars) or base64; must decode to 32 bytes.
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, "hex");
  else buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`APP_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`);
  }
  return buf;
}

function envBool(env: NodeJS.ProcessEnv, key: string, defaultValue: boolean): boolean {
  const v = env[key];
  if (v === undefined || v === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
}

function envInt(env: NodeJS.ProcessEnv, key: string, defaultValue: number): number {
  const v = env[key];
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const invite = (env.REGISTRATION_INVITE_CODE ?? "").trim();
  return {
    // Cloud Run sets PORT (default 8080); fall back to API_PORT for local/dev.
    port: Number(env.PORT ?? env.API_PORT ?? 4000),
    jwtSecret: env.JWT_SECRET ?? "dev-insecure-secret-change-me",
    encryptionKey: parseEncryptionKey(env.APP_ENCRYPTION_KEY),
    corsOrigins: (env.CORS_ORIGIN ?? "http://localhost:8080,http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    defaultProvider: env.DEFAULT_LLM_PROVIDER ?? "anthropic",
    defaultModel: env.DEFAULT_LLM_MODEL ?? "claude-opus-4-8",
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? "http://localhost:8080").replace(/\/$/, ""),
    oauth: {
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
          : undefined,
      x:
        env.X_CLIENT_ID && env.X_CLIENT_SECRET
          ? { clientId: env.X_CLIENT_ID, clientSecret: env.X_CLIENT_SECRET }
          : undefined,
    },
    allowRegistration: envBool(env, "ALLOW_REGISTRATION", true),
    registrationInviteCode: invite || undefined,
    maxProjectsPerUser: envInt(env, "MAX_PROJECTS_PER_USER", 0),
    // Global soft ceiling; auth/AI routes use tighter limits below.
    rateLimitMax: envInt(env, "RATE_LIMIT_MAX", 300),
    authRateLimitMax: envInt(env, "AUTH_RATE_LIMIT_MAX", 20),
    aiRateLimitMax: envInt(env, "AI_RATE_LIMIT_MAX", 10),
  };
}
