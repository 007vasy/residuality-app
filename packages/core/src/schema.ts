/**
 * Zod schema for the portable analysis JSON (schema v1.0) — the single validation
 * contract shared by the REST API, the MCP server, and import/export. It models the
 * public method's entities: architecture, stressors, attractors, residues (resilient
 * elements), the contagion/coupling matrix, and the criticality (NKP) roll-up.
 */
import { z } from "zod";

export const COMPONENT_KINDS = [
  "service",
  "datastore",
  "queue",
  "client",
  "external",
  "human",
  "device",
  "edge",
] as const;

export const EDGE_KINDS = ["sync", "async", "data", "human", "device"] as const;

export const STRESSOR_CATEGORIES = [
  "regulatory",
  "market",
  "tech",
  "human",
  "adversarial",
  "environmental",
  "supply-chain",
  "scale",
  "time",
] as const;

export const HORIZONS = ["now", "1y", "5y"] as const;
export const STRESSOR_SOURCES = ["catalogue", "generated"] as const;
export const MODES = ["analyze", "wizard", "iterate", "contagion-only"] as const;
export const FOCUS_AREAS = ["security", "cost", "regulatory", "performance", "safety"] as const;
export const REGIMES = ["frozen", "edge", "chaotic"] as const;
export const COST_LEVELS = ["low", "med", "high"] as const;

// ID patterns match the skill exactly: C##, S##, R## (two or more digits).
const componentId = z.string().regex(/^C[0-9]{2,}$/);
const stressorId = z.string().regex(/^S[0-9]{2,}$/);
const residueId = z.string().regex(/^R[0-9]{2,}$/);

export const componentSchema = z.object({
  id: componentId,
  name: z.string(),
  kind: z.enum(COMPONENT_KINDS),
  responsibilities: z.array(z.string()).optional(),
  tech_assumptions: z.array(z.string()).optional(),
});

export const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(EDGE_KINDS),
  notes: z.string().optional(),
});

export const architectureSchema = z.object({
  summary: z.string().min(1),
  business_context: z.string().optional(),
  components: z.array(componentSchema),
  edges: z.array(edgeSchema),
  assumptions: z.array(z.string()).optional(),
});

export const stressorSchema = z.object({
  id: stressorId,
  name: z.string().min(1),
  category: z.enum(STRESSOR_CATEGORIES),
  novelty: z.number().int().min(1).max(5),
  description: z.string(),
  horizon: z.enum(HORIZONS).default("now"),
  source: z.enum(STRESSOR_SOURCES).default("generated"),
});

export const mergeLogEntrySchema = z.object({
  kept_id: z.string(),
  dropped_id: z.string(),
  similarity: z.number(),
});

export const residueSchema = z.object({
  id: residueId,
  name: z.string().min(1),
  intent: z.string().min(1),
  minimal_change_description: z.string().min(1),
  // Theatre-residue guard: a residue must cover >= 1 stressor.
  applies_to_stressors: z.array(stressorId).min(1),
  // Fictional-stack guard: a residue must cite >= 1 user_stack_fact.
  stack_fit_citations: z.array(z.string()).min(1),
  source_pattern: z.string().nullable().optional(),
  estimated_cost: z.enum(COST_LEVELS).optional(),
  merge_log: z.array(mergeLogEntrySchema).optional(),
});

export const attractorSchema = z.object({
  name: z.string(),
  description: z.string(),
  why_system_drifts_here: z.string().optional(),
});

export const attractorResidueSchema = z.object({
  stressor_id: stressorId,
  attractor: attractorSchema,
  residue: residueSchema,
});

export const couplingSchema = z.object({
  from_residue: residueId,
  to_residue: residueId,
  weight: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export const contagionSchema = z.object({
  couplings: z.array(couplingSchema).optional(),
  incidence: z.array(z.array(z.number().int().min(0).max(1))),
  stressor_coverage: z.record(z.string(), z.number()),
  residue_load: z.record(z.string(), z.number().int().min(0)),
  coupling_matrix: z.array(z.array(z.number().min(0).max(1))),
  brittleness_rank: z.array(
    z.object({
      residue_id: z.string(),
      score: z.number(),
      why: z.string().optional(),
    }),
  ),
  hotspots: z.array(
    z.object({
      residue_id: z.string(),
      reason: z.string(),
    }),
  ),
  orphan_residues: z.array(z.string()).optional(),
});

export const criticalitySchema = z.object({
  N: z.number().int().min(0),
  K: z.number().min(0),
  P: z.number().min(0).max(1),
  // The skill stores free-form "indeterminate — ..." strings alongside the enum
  // values, so we accept any string but expose REGIMES for the canonical set.
  regime: z.string(),
  deltas: z
    .array(
      z.object({
        action: z.string(),
        expected_NKP_shift: z.string(),
      }),
    )
    .optional(),
});

export const historyEntrySchema = z.object({
  timestamp: z.string(),
  mode: z.enum(MODES),
  note: z.string().optional(),
  changed_sections: z.array(z.string()).optional(),
});

export const stateSchema = z.object({
  schema_version: z.literal("1.0"),
  project: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  git_sha: z.string().nullable().optional(),
  mode: z.enum(MODES),
  focus: z.array(z.enum(FOCUS_AREAS)).default([]),
  naive_architecture: architectureSchema,
  user_stack_facts: z.array(z.string()),
  stressors: z.array(stressorSchema),
  attractors_residues: z.array(attractorResidueSchema),
  residue_stack: z.array(residueSchema),
  contagion: contagionSchema.optional(),
  criticality: criticalitySchema.optional(),
  report: z.record(z.string(), z.string()).optional(),
  history: z.array(historyEntrySchema),
  open_questions: z.array(z.string()).default([]),
});

export type Component = z.infer<typeof componentSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type Architecture = z.infer<typeof architectureSchema>;
export type Stressor = z.infer<typeof stressorSchema>;
export type Residue = z.infer<typeof residueSchema>;
export type Attractor = z.infer<typeof attractorSchema>;
export type AttractorResidue = z.infer<typeof attractorResidueSchema>;
export type Coupling = z.infer<typeof couplingSchema>;
export type Contagion = z.infer<typeof contagionSchema>;
export type Criticality = z.infer<typeof criticalitySchema>;
export type AnalysisState = z.infer<typeof stateSchema>;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type StressorCategory = (typeof STRESSOR_CATEGORIES)[number];
export type Regime = (typeof REGIMES)[number];
