/**
 * High-level residuality LLM operations. Each returns validated, app-shaped data
 * that the API/MCP layers persist to Neo4j. Provider-agnostic — takes any LlmClient.
 */
import { STRESSOR_CATEGORIES } from "@stressforge/core";
import { extractJson, type LlmClient } from "./client.js";
import {
  architectureEditPrompt,
  attractorResiduePrompt,
  stressorGenerationPrompt,
  type ArchInput,
} from "./prompts.js";

export interface GeneratedStressor {
  name: string;
  category: string;
  novelty: number;
  description: string;
  horizon: "now" | "1y" | "5y";
  affects: string[];
}

const CATEGORY_SET = new Set<string>(STRESSOR_CATEGORIES);
const HORIZONS = new Set(["now", "1y", "5y"]);

function clampNovelty(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.min(5, Math.max(1, v));
}

export async function generateStressors(
  client: LlmClient,
  args: {
    arch: ArchInput;
    userStackFacts: string[];
    existingStressorNames?: string[];
    focus?: string[];
    count?: number;
    model?: string;
  },
): Promise<GeneratedStressor[]> {
  const prompt = stressorGenerationPrompt({
    arch: args.arch,
    userStackFacts: args.userStackFacts,
    existingStressorNames: args.existingStressorNames ?? [],
    focus: args.focus ?? [],
    count: args.count ?? 30,
  });
  const text = await client.generateText({ prompt, model: args.model });
  const raw = extractJson<unknown[]>(text);
  const validComponentIds = new Set(args.arch.components.map((c) => c.id));
  return (Array.isArray(raw) ? raw : [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.name === "string" && CATEGORY_SET.has(String(r.category)))
    .map((r) => ({
      name: String(r.name),
      category: String(r.category),
      novelty: clampNovelty(r.novelty),
      description: String(r.description ?? ""),
      horizon: HORIZONS.has(String(r.horizon)) ? (String(r.horizon) as "now" | "1y" | "5y") : "now",
      affects: Array.isArray(r.affects)
        ? r.affects.map(String).filter((id) => validComponentIds.has(id))
        : [],
    }));
}

export interface DerivedAttractorResidue {
  attractor: { name: string; description: string; whyDrifts: string };
  residue: {
    name: string;
    intent: string;
    minimalChangeDescription: string;
    stackFitCitations: string[];
    estimatedCost: "low" | "med" | "high";
    sourcePattern: string | null;
  };
}

export async function deriveAttractorResidue(
  client: LlmClient,
  args: {
    arch: ArchInput;
    userStackFacts: string[];
    stressor: { id: string; name: string; category: string; description: string };
    model?: string;
  },
): Promise<DerivedAttractorResidue> {
  const prompt = attractorResiduePrompt({
    arch: args.arch,
    userStackFacts: args.userStackFacts,
    stressor: args.stressor,
  });
  const text = await client.generateText({ prompt, model: args.model, maxTokens: 4000 });
  const raw = extractJson<Record<string, any>>(text);
  const a = raw.attractor ?? {};
  const r = raw.residue ?? {};
  const citations = Array.isArray(r.stack_fit_citations) && r.stack_fit_citations.length
    ? r.stack_fit_citations.map(String)
    : args.userStackFacts.length
      ? [args.userStackFacts[0]!]
      : ["(unspecified stack)"];
  const cost = ["low", "med", "high"].includes(String(r.estimated_cost)) ? String(r.estimated_cost) : "med";
  return {
    attractor: {
      name: String(a.name ?? `${args.stressor.name} attractor`),
      description: String(a.description ?? ""),
      whyDrifts: String(a.why_system_drifts_here ?? ""),
    },
    residue: {
      name: String(r.name ?? `Residue for ${args.stressor.name}`),
      intent: String(r.intent ?? ""),
      minimalChangeDescription: String(r.minimal_change_description ?? ""),
      stackFitCitations: citations,
      estimatedCost: cost as "low" | "med" | "high",
      sourcePattern: r.source_pattern != null ? String(r.source_pattern) : null,
    },
  };
}

export interface ArchitectureEdit {
  summary: string;
  addComponents: { name: string; kind: string; responsibilities: string[]; techAssumptions: string[] }[];
  addEdges: { from: string; to: string; kind: string }[];
  notes: string;
}

const COMPONENT_KINDS = new Set(["service", "datastore", "queue", "client", "external", "human", "device", "edge"]);
const EDGE_KINDS = new Set(["sync", "async", "data", "human", "device"]);

export async function editArchitecture(
  client: LlmClient,
  args: { arch: ArchInput; instruction: string; model?: string },
): Promise<ArchitectureEdit> {
  const prompt = architectureEditPrompt({ arch: args.arch, instruction: args.instruction });
  const text = await client.generateText({ prompt, model: args.model });
  const raw = extractJson<Record<string, any>>(text);
  const addComponents = (Array.isArray(raw.add_components) ? raw.add_components : [])
    .map((c: Record<string, unknown>) => ({
      name: String(c.name ?? "").trim(),
      kind: COMPONENT_KINDS.has(String(c.kind)) ? String(c.kind) : "service",
      responsibilities: Array.isArray(c.responsibilities) ? c.responsibilities.map(String) : [],
      techAssumptions: Array.isArray(c.tech_assumptions) ? c.tech_assumptions.map(String) : [],
    }))
    .filter((c: { name: string }) => c.name.length > 0);
  const addEdges = (Array.isArray(raw.add_edges) ? raw.add_edges : [])
    .map((e: Record<string, unknown>) => ({
      from: String(e.from ?? "").trim(),
      to: String(e.to ?? "").trim(),
      kind: EDGE_KINDS.has(String(e.kind)) ? String(e.kind) : "sync",
    }))
    .filter((e: { from: string; to: string }) => e.from && e.to);
  return {
    summary: String(raw.summary ?? args.arch.summary),
    addComponents,
    addEdges,
    notes: String(raw.notes ?? ""),
  };
}
