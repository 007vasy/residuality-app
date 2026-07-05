import { randomUUID } from "node:crypto";
import type { Transaction } from "./driver.js";

export function uuid(): string {
  return randomUUID();
}

/** Zero-pad to 2 digits like the skill's C01/S01/R01 convention. */
export function formatSeqId(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/**
 * Allocate the next sequential id for a labelled entity within a project,
 * e.g. next Component -> "C07". Runs inside a write tx so concurrent callers
 * on the same session serialize; the (projectId,id) uniqueness constraint is
 * the ultimate guard.
 */
export async function nextSeqId(
  tx: Transaction,
  projectId: string,
  label: "Component" | "Stressor" | "Residue" | "Attractor",
  prefix: string,
): Promise<string> {
  const res = await tx.run(
    `MATCH (n:${label} {projectId: $projectId})
     RETURN coalesce(max(toInteger(substring(n.id, 1))), 0) AS maxN`,
    { projectId },
  );
  const maxN = (res.records[0]?.get("maxN") as number) ?? 0;
  return formatSeqId(prefix, maxN + 1);
}
