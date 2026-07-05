import { read, write } from "./driver.js";

/**
 * BYOK provider keys, stored encrypted at rest (the API layer encrypts before
 * calling here — this module never sees plaintext). Keyed per user + provider.
 */
export interface StoredKey {
  provider: string;
  ciphertext: string;
  iv: string;
  tag: string;
  updatedAt: string;
}

export async function upsertProviderKey(userId: string, key: StoredKey): Promise<void> {
  await write(
    `MATCH (u:User {id: $userId})
     MERGE (u)-[:HAS_KEY]->(k:ProviderKey {provider: $provider})
     SET k.ciphertext = $ciphertext, k.iv = $iv, k.tag = $tag, k.updatedAt = $updatedAt`,
    { userId, ...key },
  );
}

export async function getProviderKey(userId: string, provider: string): Promise<StoredKey | null> {
  const rows = await read(
    `MATCH (u:User {id: $userId})-[:HAS_KEY]->(k:ProviderKey {provider: $provider})
     RETURN k { .provider, .ciphertext, .iv, .tag, .updatedAt } AS key`,
    { userId, provider },
    (r) => r.get("key") as StoredKey,
  );
  return rows[0] ?? null;
}

export async function listProviderKeys(userId: string): Promise<{ provider: string; updatedAt: string }[]> {
  return read(
    `MATCH (u:User {id: $userId})-[:HAS_KEY]->(k:ProviderKey)
     RETURN { provider: k.provider, updatedAt: k.updatedAt } AS key ORDER BY key.provider`,
    { userId },
    (r) => r.get("key") as { provider: string; updatedAt: string },
  );
}

export async function deleteProviderKey(userId: string, provider: string): Promise<void> {
  await write(
    `MATCH (u:User {id: $userId})-[:HAS_KEY]->(k:ProviderKey {provider: $provider}) DETACH DELETE k`,
    { userId, provider },
  );
}

/** Per-project API tokens for the MCP server. Only the hash is stored. */
export async function createApiToken(input: {
  projectId: string;
  hash: string;
  label: string;
  createdBy: string;
  createdAt: string;
}): Promise<void> {
  await write(
    `MATCH (p:Project {id: $projectId})
     CREATE (t:ApiToken {hash: $hash, projectId: $projectId, label: $label,
                         createdBy: $createdBy, createdAt: $createdAt})
     CREATE (p)-[:HAS_TOKEN]->(t)`,
    input,
  );
}

export async function resolveApiToken(hash: string): Promise<{ projectId: string } | null> {
  const rows = await read(
    `MATCH (t:ApiToken {hash: $hash}) RETURN { projectId: t.projectId } AS token`,
    { hash },
    (r) => r.get("token") as { projectId: string },
  );
  return rows[0] ?? null;
}

export async function listApiTokens(projectId: string): Promise<{ label: string; createdAt: string }[]> {
  return read(
    `MATCH (p:Project {id: $projectId})-[:HAS_TOKEN]->(t:ApiToken)
     RETURN { label: t.label, createdAt: t.createdAt } AS token ORDER BY token.createdAt DESC`,
    { projectId },
    (r) => r.get("token") as { label: string; createdAt: string },
  );
}
