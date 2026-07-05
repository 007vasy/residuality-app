/**
 * Criticality (NKP) estimator — TS port of scripts/criticality_estimate.py.
 *
 * N = number of naive-architecture components
 * K = average undirected weighted degree (naive edges + significant contagion couplings >= 0.5)
 * P = constraint density (assumptions + regulatory/safety residues + focus areas)
 * regime = frozen | edge | chaotic | "indeterminate — ..."
 */
import type { Architecture, Contagion, Criticality, Residue } from "../schema.js";
import { pyRound } from "./util.js";

export const MIN_STRESSORS = 25;
export const MIN_RESIDUES = 8;
export const COUPLING_SIGNIFICANT = 0.5;

export const K_FROZEN_MAX = 1.5;
export const K_CHAOTIC_MIN = 4.5;
export const P_CHAOTIC_MAX = 0.2;

const P_BASELINE = 0.1;
const P_PER_ASSUMPTION = 0.05;
const P_ASSUMPTION_CAP = 0.4;
const P_PER_REG_SAFETY_RESIDUE = 0.04;
const P_REG_SAFETY_CAP = 0.3;
const P_PER_FOCUS = 0.05;
const P_FOCUS_CAP = 0.2;

const REGULATORY_PATTERNS = new Set([
  "audit_log_immutability",
  "event_sourcing_audit_trail",
  "per_minute_billing_path",
  "manual_override_with_review",
]);
const SAFETY_PATTERNS = new Set([
  "unlock_redundancy",
  "local_autonomy",
  "alpr_camera_fallback_identity",
  "runbook_as_code",
]);

export interface CriticalityInput {
  naive_architecture: Architecture;
  residue_stack: Residue[];
  stressors: unknown[];
  contagion?: Pick<Contagion, "coupling_matrix"> & { brittleness_rank?: Contagion["brittleness_rank"] };
  focus?: string[];
}

export function computeN(arch: Architecture): number {
  return (arch.components ?? []).length;
}

export function computeK(arch: Architecture, residues: Residue[], contagion?: CriticalityInput["contagion"]): number {
  const components = arch.components ?? [];
  if (components.length === 0) return 0;
  const compIds = new Set(components.map((c) => c.id));
  const degree = new Map<string, number>();
  const bump = (id: string, by: number) => degree.set(id, (degree.get(id) ?? 0) + by);

  for (const e of arch.edges ?? []) {
    if (compIds.has(e.from) && compIds.has(e.to)) {
      bump(e.from, 1);
      bump(e.to, 1);
    }
  }

  const matrix = contagion?.coupling_matrix ?? [];

  // Approximate residue -> components-touched by scanning residue text for
  // component ids, component names, and >=4-char alpha tech-assumption tokens.
  const nameToId = new Map<string, string>();
  for (const c of components) if (c.name) nameToId.set(c.name.toLowerCase(), c.id);
  const techToId = new Map<string, string>();
  for (const c of components) {
    for (const ta of c.tech_assumptions ?? []) {
      for (const tok of ta.toLowerCase().split(/\s+/)) {
        if (tok.length >= 4 && /^[a-z]+$/.test(tok) && !techToId.has(tok)) techToId.set(tok, c.id);
      }
    }
  }

  const resComponents: Set<string>[] = residues.map((r) => {
    const text = `${r.minimal_change_description ?? ""} ${r.intent ?? ""} ${r.name ?? ""}`;
    const lower = text.toLowerCase();
    const found = new Set<string>();
    for (const cid of compIds) if (text.includes(cid)) found.add(cid);
    for (const [nm, cid] of nameToId) if (lower.includes(nm)) found.add(cid);
    for (const [tok, cid] of techToId) if (lower.includes(tok)) found.add(cid);
    return found;
  });

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i]!;
    for (let j = 0; j < row.length; j++) {
      const w = row[j]!;
      if (i >= j || w < COUPLING_SIGNIFICANT) continue;
      const shared = new Set<string>([...(resComponents[i] ?? []), ...(resComponents[j] ?? [])]);
      for (const cid of shared) bump(cid, w);
    }
  }

  let total = 0;
  for (const v of degree.values()) total += v;
  return pyRound(total / components.length, 3);
}

export function computeP(arch: Architecture, residues: Residue[], focus: string[] = []): number {
  let p = P_BASELINE;
  const pAssumptions = Math.min(P_ASSUMPTION_CAP, P_PER_ASSUMPTION * (arch.assumptions ?? []).length);
  const regSafetyCount = residues.filter(
    (r) => r.source_pattern && (REGULATORY_PATTERNS.has(r.source_pattern) || SAFETY_PATTERNS.has(r.source_pattern)),
  ).length;
  const pRegSafety = Math.min(P_REG_SAFETY_CAP, P_PER_REG_SAFETY_RESIDUE * regSafetyCount);
  const pFocus = Math.min(P_FOCUS_CAP, P_PER_FOCUS * focus.length);
  return pyRound(Math.min(1.0, p + pAssumptions + pRegSafety + pFocus), 3);
}

export function classifyRegime(N: number, K: number, P: number): string {
  if (N < 4) return "indeterminate — too few components";
  if (K < K_FROZEN_MAX) return "frozen";
  if (K > K_CHAOTIC_MIN || P < P_CHAOTIC_MAX) return "chaotic";
  return "edge";
}

export function deltasFor(
  regime: string,
  contagion: CriticalityInput["contagion"],
): { action: string; expected_NKP_shift: string }[] {
  const out: { action: string; expected_NKP_shift: string }[] = [];
  if (regime.startsWith("indeterminate")) return out;
  if (regime === "frozen") {
    out.push({
      action: "Add a circuit_breaker_fallback_cache at the most-loaded read path",
      expected_NKP_shift: "K +0.3 to +0.6, P unchanged",
    });
    out.push({
      action: "Add a read_only_degraded_mode for the write-critical surface that has no fallback today",
      expected_NKP_shift: "K +0.2 to +0.5, P unchanged",
    });
    out.push({
      action: "Add a bulkhead if any tenant or downstream can starve the cluster",
      expected_NKP_shift: "K +0.2 to +0.4, P +0.04",
    });
  } else if (regime === "chaotic") {
    const ranked = contagion?.brittleness_rank ?? [];
    if (ranked.length > 0) {
      out.push({
        action: `Decouple ${ranked[0]!.residue_id} from its most-coupled neighbour (see brittleness_rank)`,
        expected_NKP_shift: "K -0.5 to -1.0",
      });
    }
    out.push({
      action: "Add tenant_isolated_blast_radius if a tenant defect can contaminate other tenants",
      expected_NKP_shift: "K -0.3, P +0.04",
    });
    out.push({
      action: "Add audit_log_immutability if chaos is partly driven by a lack of investigability",
      expected_NKP_shift: "K unchanged, P +0.05",
    });
  }
  return out;
}

export function computeCriticality(input: CriticalityInput): Criticality {
  const { naive_architecture: arch, residue_stack: residues, stressors, contagion, focus = [] } = input;
  const nStressors = (stressors ?? []).length;
  const nResidues = (residues ?? []).length;

  const N = computeN(arch);
  const K = computeK(arch, residues, contagion);
  const P = computeP(arch, residues, focus);

  if (nStressors < MIN_STRESSORS || nResidues < MIN_RESIDUES) {
    return {
      N,
      K,
      P,
      regime: `indeterminate — need more data (have ${nStressors} stressors, ${nResidues} residues; need ${MIN_STRESSORS} and ${MIN_RESIDUES})`,
      deltas: [],
    };
  }

  const regime = classifyRegime(N, K, P);
  return { N, K, P, regime, deltas: deltasFor(regime, contagion) };
}
