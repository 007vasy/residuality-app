import { describe, expect, it } from "vitest";
import synthetic from "../__fixtures__/synthetic_state.json" with { type: "json" };
import ev from "../__fixtures__/ev_charging.json" with { type: "json" };
import { computeContagion } from "./contagion.js";
import { computeCriticality } from "./criticality.js";
import { collectInputResidues, dedupeResidues } from "./dedupe.js";
import { checkDiversity } from "./diversity.js";
import { computeIncidenceMetrics } from "./incidence.js";
import type { Residue, Stressor } from "../schema.js";

/**
 * Parity tests: the TS compute engine must reproduce the skill's Python outputs.
 * synthetic_state.json is a fully-synthetic run whose `contagion` + `criticality`
 * sections were computed by the skill's own Python scripts (an independent oracle);
 * we recompute with the TS port and assert equality. (No real project data ships
 * in the repo — this fixture is fictional smart-parking data.)
 */
describe("contagion parity vs synthetic fixture", () => {
  const residues = synthetic.residue_stack as unknown as Residue[];
  const stressors = synthetic.stressors as unknown as Stressor[];
  const couplings = (synthetic.contagion?.couplings ?? []) as any;
  const out = computeContagion(residues, stressors, couplings);
  const expected = synthetic.contagion as any;

  it("incidence matrix matches", () => {
    expect(out.incidence).toEqual(expected.incidence);
  });
  it("residue_load matches", () => {
    expect(out.residue_load).toEqual(expected.residue_load);
  });
  it("stressor_coverage matches", () => {
    expect(out.stressor_coverage).toEqual(expected.stressor_coverage);
  });
  it("coupling_matrix matches", () => {
    expect(out.coupling_matrix).toEqual(expected.coupling_matrix);
  });
  it("brittleness_rank matches", () => {
    expect(out.brittleness_rank).toEqual(expected.brittleness_rank);
  });
  it("hotspots match", () => {
    expect(out.hotspots).toEqual(expected.hotspots);
  });
  it("no orphan residues", () => {
    expect(out.orphan_residues).toEqual([]);
  });
});

describe("criticality parity vs synthetic fixture", () => {
  const crit = computeCriticality({
    naive_architecture: synthetic.naive_architecture as any,
    residue_stack: synthetic.residue_stack as unknown as Residue[],
    stressors: synthetic.stressors,
    contagion: synthetic.contagion as any,
    focus: synthetic.focus as string[],
  });
  const expected = synthetic.criticality as any;

  it("N matches", () => expect(crit.N).toBe(expected.N));
  it("K matches", () => expect(crit.K).toBe(expected.K));
  it("P matches", () => expect(crit.P).toBe(expected.P));
  it("regime matches", () => expect(crit.regime).toBe(expected.regime));
});

describe("dedupe on ev_charging attractors_residues", () => {
  const input = collectInputResidues(ev as any);
  const stack = dedupeResidues(input);

  it("collects the 14 per-stressor residues", () => {
    expect(input.length).toBe(14);
  });
  it("produces a non-empty, no-larger deduped stack", () => {
    expect(stack.length).toBeGreaterThan(0);
    expect(stack.length).toBeLessThanOrEqual(input.length);
  });
  it("every surviving residue keeps required guards", () => {
    for (const r of stack) {
      expect(r.applies_to_stressors.length).toBeGreaterThan(0);
      expect(r.stack_fit_citations.length).toBeGreaterThan(0);
    }
  });
});

describe("diversity check on ev_charging stressors (32, all 9 categories)", () => {
  const report = checkDiversity(ev.stressors as unknown as Stressor[]);
  it("covers all 9 categories (no missing)", () => {
    expect(report.missing_categories).toEqual([]);
  });
  it("boring_score is within the diversity threshold", () => {
    expect(report.boring_score).toBeLessThanOrEqual(report.boring_score_threshold);
  });
  // The EV gold fixture deliberately has only 2 novelty-5 stressors, which is
  // below the black-swan floor of 3 — the skill documents this exact note. So the
  // strict gate does NOT pass, and our port must reflect that faithfully.
  it("flags the known black-swan shortfall (fixture has 2, floor is 3)", () => {
    expect(report.black_swan_count).toBe(2);
    expect(report.passes).toBe(false);
    expect(report.suggestions.some((s) => s.includes("black-swan"))).toBe(true);
  });
});

describe("interactive incidence metrics (toggle behaviour)", () => {
  const base = {
    components: [{ id: "C01" }, { id: "C02" }, { id: "C03" }, { id: "C04" }],
    affects: [
      { stressorId: "S01", componentId: "C01" },
      { stressorId: "S01", componentId: "C02" },
      { stressorId: "S02", componentId: "C02" },
      { stressorId: "S02", componentId: "C03" },
      { stressorId: "S03", componentId: "C04" },
    ],
  };

  it("counts criticality only for enabled stressors", () => {
    const all = computeIncidenceMetrics({
      ...base,
      stressors: [
        { id: "S01", enabled: true },
        { id: "S02", enabled: true },
        { id: "S03", enabled: true },
      ],
    });
    expect(all.componentCriticality).toEqual({ C01: 1, C02: 2, C03: 1, C04: 1 });
    // S01 couples C01-C02, S02 couples C02-C03 -> 2 coupled pairs
    expect(all.coupledPairs.length).toBe(2);
  });

  it("recomputes when a stressor is toggled off", () => {
    const toggled = computeIncidenceMetrics({
      ...base,
      stressors: [
        { id: "S01", enabled: false },
        { id: "S02", enabled: true },
        { id: "S03", enabled: true },
      ],
    });
    expect(toggled.componentCriticality.C01).toBe(0);
    expect(toggled.componentCriticality.C02).toBe(1);
    expect(toggled.coupledPairs.length).toBe(1);
    expect(toggled.enabledStressorCount).toBe(2);
  });

  it("computes coverage and residual index from integrated residues", () => {
    const m = computeIncidenceMetrics({
      ...base,
      stressors: [
        { id: "S01", enabled: true },
        { id: "S02", enabled: true },
        { id: "S03", enabled: true },
      ],
      residues: [{ id: "R01", appliesToStressors: ["S01", "S02"], integrated: true }],
    });
    expect(m.coverage).toBeCloseTo(2 / 3, 3);
    expect(m.residualIndex).toBeCloseTo(2 / 3, 3);
  });
});
