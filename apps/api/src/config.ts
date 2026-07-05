export interface Config {
  port: number;
  jwtSecret: string;
  encryptionKey: Buffer;
  corsOrigins: string[];
  defaultProvider: string;
  defaultModel: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.API_PORT ?? 4000),
    jwtSecret: env.JWT_SECRET ?? "dev-insecure-secret-change-me",
    encryptionKey: parseEncryptionKey(env.APP_ENCRYPTION_KEY),
    corsOrigins: (env.CORS_ORIGIN ?? "http://localhost:8080,http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    defaultProvider: env.DEFAULT_LLM_PROVIDER ?? "anthropic",
    defaultModel: env.DEFAULT_LLM_MODEL ?? "claude-opus-4-8",
  };
}
