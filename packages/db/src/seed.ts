import {
  collectInputResidues,
  dedupeResidues,
  type ResidualityState,
} from "@residuality/core";
import { evCharging } from "./__fixtures__/ev_charging.js";
import { importState } from "./graph.js";
import { setAffects } from "./stressors.js";

/**
 * Seed a demo project from the EV-charging gold fixture. The fixture is
 * mid-pipeline (per-stressor residues, no deduped stack), so we dedupe first,
 * then synthesise stressor x component AFFECTS edges by scanning each stressor's
 * description + attractor + residue text for component references — giving the
 * interactive incidence matrix real data to render.
 */
export async function seedEvCharging(projectId: string): Promise<{
  components: number;
  stressors: number;
  residues: number;
  affects: number;
}> {
  const fixture = evCharging as unknown as ResidualityState;

  // Build the residue stack the skill would have produced at dedupe time.
  const stack = dedupeResidues(collectInputResidues(fixture as any));
  const state: ResidualityState = { ...fixture, residue_stack: stack };

  await importState(projectId, state);

  // Synthesise AFFECTS edges.
  const components = state.naive_architecture.components;
  const attractorByStressor = new Map(
    state.attractors_residues.map((ar) => [ar.stressor_id, ar]),
  );

  let affectsCount = 0;
  for (const s of state.stressors) {
    const ar = attractorByStressor.get(s.id);
    const haystack = [
      s.name,
      s.description,
      ar?.attractor.name ?? "",
      ar?.attractor.description ?? "",
      ar?.attractor.why_system_drifts_here ?? "",
      ar?.residue.minimal_change_description ?? "",
      ar?.residue.intent ?? "",
    ]
      .join(" ")
      .toLowerCase();

    for (const c of components) {
      const nameHit = c.name && haystack.includes(c.name.toLowerCase());
      const idHit = haystack.includes(c.id.toLowerCase());
      if (nameHit || idHit) {
        await setAffects(projectId, s.id, c.id, 1);
        affectsCount++;
      }
    }
  }

  return {
    components: components.length,
    stressors: state.stressors.length,
    residues: stack.length,
    affects: affectsCount,
  };
}
