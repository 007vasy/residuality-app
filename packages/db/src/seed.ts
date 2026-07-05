import {
  collectInputResidues,
  dedupeResidues,
  type Component,
  type AnalysisState,
  type StressorCategory,
} from "@stressforge/core";
import { evCharging } from "./__fixtures__/ev_charging.js";
import { importState } from "./graph.js";
import { setAffects } from "./stressors.js";

/**
 * Which component *kinds* each stressor category tends to hit, in priority order.
 * This is the realistic residuality signal — a regulatory stressor perturbs the
 * billing/data path, an environmental one hits physical devices and connectivity,
 * an adversarial one hits identity/client, etc. Ordering front-loads the most
 * affected kind so services (there are several) naturally become hotspots.
 */
/** Components hit per stressor (rotating window over its category affinity). */
const SEED_WINDOW = 3;

const CATEGORY_KIND_AFFINITY: Record<StressorCategory, string[]> = {
  tech: ["service", "datastore", "external"],
  environmental: ["device", "edge", "external"],
  regulatory: ["datastore", "service", "human"],
  adversarial: ["service", "client", "edge"],
  "supply-chain": ["external", "service", "device"],
  human: ["human", "service", "client"],
  scale: ["service", "datastore", "queue"],
  market: ["service", "external", "client"],
  time: ["datastore", "service", "device"],
};

/**
 * Deterministically pick 3–4 affected components for a stressor from its ordered
 * affinity list, rotating the window by the stressor's index so different
 * stressors of the same category emphasise different components. This produces a
 * dense but *structured* matrix: overlapping windows create real coupling, and
 * the always-included primary kind concentrates criticality into hotspots.
 */
function pickAffected(affinity: Component[], index: number): Component[] {
  if (affinity.length === 0) return [];
  const chosen = new Map<string, Component>();
  // A rotating window over the (priority-ordered) affinity: dense enough to be
  // interesting, spread across the category's whole affinity so no single hub
  // couples everything, and varied per stressor so toggling moves the metrics.
  const window = Math.min(SEED_WINDOW, affinity.length);
  for (let j = 0; j < window; j++) {
    const c = affinity[(index + j) % affinity.length]!;
    chosen.set(c.id, c);
  }
  return [...chosen.values()];
}

/**
 * Seed a demo project from the EV-charging gold fixture. The fixture is
 * mid-pipeline (per-stressor residues, no deduped stack), so we dedupe first,
 * then synthesise a dense stressor × component incidence matrix from
 * category→kind affinity so the interactive matrix is immediately meaningful.
 */
export async function seedEvCharging(projectId: string): Promise<{
  components: number;
  stressors: number;
  residues: number;
  affects: number;
}> {
  const fixture = evCharging as unknown as AnalysisState;

  // Build the residue stack the skill would have produced at dedupe time.
  const stack = dedupeResidues(collectInputResidues(fixture as any));
  const state: AnalysisState = { ...fixture, residue_stack: stack };

  await importState(projectId, state);

  const components = state.naive_architecture.components;
  const byKind = new Map<string, Component[]>();
  for (const c of components) {
    const list = byKind.get(c.kind) ?? [];
    list.push(c);
    byKind.set(c.kind, list);
  }

  // Build each category's ordered affinity list once (components ordered by the
  // category's kind priority, then by id for stability).
  const affinityByCategory = new Map<string, Component[]>();
  for (const [cat, kinds] of Object.entries(CATEGORY_KIND_AFFINITY)) {
    const ordered: Component[] = [];
    for (const kind of kinds) {
      for (const c of (byKind.get(kind) ?? []).sort((a, b) => a.id.localeCompare(b.id))) {
        ordered.push(c);
      }
    }
    affinityByCategory.set(cat, ordered);
  }

  // Per-category running index so the rotation window advances across stressors
  // of the same category (spreading coverage and creating coupling variety).
  const catIndex = new Map<string, number>();
  let affectsCount = 0;
  for (const s of state.stressors) {
    const affinity = affinityByCategory.get(s.category) ?? [];
    const i = catIndex.get(s.category) ?? 0;
    catIndex.set(s.category, i + 1);
    for (const c of pickAffected(affinity, i)) {
      await setAffects(projectId, s.id, c.id, 1);
      affectsCount++;
    }
  }

  return {
    components: components.length,
    stressors: state.stressors.length,
    residues: stack.length,
    affects: affectsCount,
  };
}
