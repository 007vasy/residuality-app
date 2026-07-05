import { createLlmClient, type LlmClient } from "@residuality/llm";
import { getProviderKey, listMembers } from "@residuality/db";
import { decryptSecret } from "./crypto.js";
import type { Config } from "./config.js";

/**
 * Resolve an LLM client for a user from their encrypted BYOK key.
 * Returns null if the user has no key stored for the provider.
 */
export async function llmClientForUser(
  userId: string,
  cfg: Config,
  provider = "anthropic",
): Promise<LlmClient | null> {
  const stored = await getProviderKey(userId, provider);
  if (!stored) return null;
  const apiKey = decryptSecret(stored, cfg.encryptionKey);
  return createLlmClient({ provider, apiKey, defaultModel: cfg.defaultModel });
}

/**
 * Resolve an LLM client for a project (for MCP/agent-driven actions where there's
 * no interactive user): use the first project member — owners first — who has a
 * stored key for the provider.
 */
export async function llmClientForProject(
  projectId: string,
  cfg: Config,
  provider = "anthropic",
): Promise<LlmClient | null> {
  const members = await listMembers(projectId);
  const ordered = [...members].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
  for (const m of ordered) {
    const client = await llmClientForUser(m.userId, cfg, provider);
    if (client) return client;
  }
  return null;
}
