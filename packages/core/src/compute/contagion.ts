/**
 * Contagion matrix — TS port of the skill's scripts/contagion_matrix.py.
 *
 * Given the residue_stack, stressors and user-authored couplings, computes:
 *   incidence          binary residue x stressor matrix
 *   residue_load       per-residue count of stressors addressed
 *   stressor_coverage  per-stressor presence flag (min(1, count))
 *   coupling_matrix    residue x residue, explicit couplings + shared-stressor bonus
 *   brittleness_rank   top 5 by load * average outgoing coupling
 *   hotspots           residues at/above the 75th percentile of load*brittleness
 *   orphan_residues    residues with no applies_to_stressors
 */
import type { Contagion, Coupling, Residue, Stressor } from "../schema.js";
import { percentile, pyFloatStr, pyRound } from "./util.js";

export const SHARED_STRESSOR_BONUS = 0.15;
export const SHARED_STRESSOR_CAP = 0.6;

export function buildIncidence(residues: Residue[], stressors: Stressor[]): number[][] {
  const sIndex = new Map(stressors.map((s, i) => [s.id, i]));
  return residues.map((r) => {
    const row = new Array<number>(stressors.length).fill(0);
    for (const sid of r.applies_to_stressors ?? []) {
      const idx = sIndex.get(sid);
      if (idx !== undefined) row[idx] = 1;
    }
    return row;
  });
}

export function buildCouplingMatrix(residues: Residue[], couplings: Coupling[]): number[][] {
  const n = residues.length;
  const rIndex = new Map(residues.map((r, i) => [r.id, i]));
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  // explicit user couplings (symmetric)
  for (const c of couplings) {
    const i = rIndex.get(c.from_residue);
    const j = rIndex.get(c.to_residue);
    const w = Number(c.weight ?? 0);
    if (i === undefined || j === undefined || i === j) continue;
    matrix[i]![j] = Math.max(matrix[i]![j]!, w);
    matrix[j]![i] = Math.max(matrix[j]![i]!, w);
  }

  // shared-stressor heuristic on top
  const stressorSets = residues.map((r) => new Set(r.applies_to_stressors ?? []));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let shared = 0;
      for (const s of stressorSets[i]!) if (stressorSets[j]!.has(s)) shared++;
      if (shared > 0) {
        const bonus = Math.min(SHARED_STRESSOR_CAP, shared * SHARED_STRESSOR_BONUS);
        matrix[i]![j] = Math.max(matrix[i]![j]!, bonus);
        matrix[j]![i] = Math.max(matrix[j]![i]!, bonus);
      }
    }
  }
  return matrix;
}

export function computeContagion(
  residues: Residue[],
  stressors: Stressor[],
  couplings: Coupling[] = [],
): Contagion {
  if (residues.length === 0) {
    throw new Error("residue_stack is empty; run dedupe first");
  }

  const incidence = buildIncidence(residues, stressors);
  const couplingMatrix = buildCouplingMatrix(residues, couplings);

  const residueLoad: Record<string, number> = {};
  residues.forEach((r, i) => {
    residueLoad[r.id] = incidence[i]!.reduce((a, b) => a + b, 0);
  });

  const stressorCoverage: Record<string, number> = {};
  if (stressors.length > 0) {
    stressors.forEach((s, j) => {
      const count = incidence.reduce((acc, row) => acc + row[j]!, 0);
      stressorCoverage[s.id] = pyRound(Math.min(1.0, count / 1.0), 3);
    });
  }

  // brittleness: load * avg outgoing coupling
  const n = residues.length;
  const brittleness = residues.map((r, i) => {
    const rowSum = couplingMatrix[i]!.reduce((a, b) => a + b, 0);
    const avgCoupling = rowSum / Math.max(1, n - 1);
    const score = pyRound(residueLoad[r.id]! * avgCoupling, 4);
    let why = "";
    if (avgCoupling > 0) {
      let topIdx = 0;
      let topVal = -1;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (couplingMatrix[i]![j]! > topVal) {
          topVal = couplingMatrix[i]![j]!;
          topIdx = j;
        }
      }
      const topNeighbour = residues[topIdx]!.id;
      why = `load=${residueLoad[r.id]}, top coupling -> ${topNeighbour} (${pyFloatStr(pyRound(couplingMatrix[i]![topIdx]!, 2))})`;
    }
    return { residue_id: r.id, score, why };
  });
  const sortedBrittleness = [...brittleness].sort((a, b) => b.score - a.score);
  const brittlenessRank = sortedBrittleness.slice(0, 5);

  // hotspots: top-quartile by load * brittleness score.
  // NOTE: the skill's contagion_matrix.py zips residues (stack order) against the
  // *sorted* brittleness list, so residues[i] is paired with the i-th highest
  // brittleness score rather than its own. We replicate that exactly for parity.
  const combinedScores = residues.map((r, i) => ({
    id: r.id,
    score: residueLoad[r.id]! * sortedBrittleness[i]!.score,
  }));
  const positive = combinedScores.filter((c) => c.score > 0).map((c) => c.score);
  const threshold = positive.length > 0 ? percentile(positive, 75) : 0;
  let hotspots = combinedScores
    .filter((c) => c.score >= threshold && c.score > 0)
    .map((c) => ({
      residue_id: c.id,
      reason: `load*brittleness=${pyFloatStr(pyRound(c.score, 3))} >= 75th percentile (${pyFloatStr(pyRound(threshold, 3))})`,
    }));
  hotspots.sort((a, b) => (a.reason < b.reason ? 1 : a.reason > b.reason ? -1 : 0));
  hotspots = hotspots.slice(0, 5);

  const orphanResidues = residues
    .filter((r) => (r.applies_to_stressors ?? []).length === 0)
    .map((r) => r.id);

  return {
    couplings,
    incidence,
    stressor_coverage: stressorCoverage,
    residue_load: residueLoad,
    coupling_matrix: couplingMatrix.map((row) => row.map((v) => pyRound(v, 3))),
    brittleness_rank: brittlenessRank,
    hotspots,
    orphan_residues: orphanResidues,
  };
}
