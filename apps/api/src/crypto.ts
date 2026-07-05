import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

/** Password hashing with scrypt (no native deps). Format: scrypt$salt$hash (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** AES-256-GCM encryption for BYOK provider keys at rest. */
export interface Encrypted {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string, key: Buffer): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: tag.toString("base64") };
}

export function decryptSecret(enc: Encrypted, key: Buffer): string {
  const iv = Buffer.from(enc.iv, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

/** MCP project tokens: return the plaintext once, store only the sha256 hash. */
export function generateApiToken(): { token: string; hash: string } {
  const token = `rsd_${randomBytes(24).toString("hex")}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { randomUUID };
