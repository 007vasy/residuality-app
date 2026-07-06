/**
 * Compact seed DSL + converter. Curated example analyses (software / company /
 * country / planet) are authored as terse `SeedSpec`s and materialised into a
 * project graph. Faithful to the Residuality ERM playbook: naive model (components
 * = functions/sectors/systems) + stressors (9 categories, novelty 1-5, >=3 black
 * swans) + attractor→residue mitigations + hidden couplings + explicit incidence.
 *
 * Residues are written as "the minimal control that WOULD have to exist" — where a
 * real control isn't publicly known it is flagged as a gap, never asserted as fact.
 */
import type { Domain } from "@stressforge/core";
import { addComponent, createArchitecture, setEdge } from "./architecture.js";
import { getPrimaryArchitectureId } from "./graph.js";
import { setUserStackFacts } from "./projects.js";
import { addAttractor, addResidue, setCoupling } from "./residues.js";
import { addStressor, setAffects } from "./stressors.js";

export interface SeedComponent {
  id: string; // C01..
  name: string;
  kind: "service" | "datastore" | "queue" | "client" | "external" | "human" | "device" | "edge";
  resp?: string; // one-line responsibility
}
export interface SeedStressor {
  id: string; // S01..
  name: string;
  cat: "regulatory" | "market" | "tech" | "human" | "adversarial" | "environmental" | "supply-chain" | "scale" | "time";
  novelty: number; // 1-5 (5 = black swan)
  desc: string;
  hits: string[]; // component ids affected
  attractor?: string; // do-nothing business end-state (business language)
}
export interface SeedResidue {
  id: string; // R01..
  name: string;
  intent: string;
  change: string; // minimal control description
  covers: string[]; // stressor ids
  cites?: string[]; // stack facts it leans on (>=1; defaults provided)
  cost?: "low" | "med" | "high";
  gap?: boolean; // true = "control that would need to exist", not a claimed fact
}
export interface SeedSpec {
  name: string;
  domain: Domain;
  description: string;
  summary: string;
  facts: string[]; // load-bearing assumptions / stack facts
  components: SeedComponent[];
  edges?: [string, string, "sync" | "async" | "data" | "human" | "device"][];
  stressors: SeedStressor[];
  residues: SeedResidue[];
  couplings?: [string, string, number, string][]; // r1, r2, weight, reason
}

export interface SeedResult {
  components: number;
  stressors: number;
  residues: number;
  affects: number;
}

/** Materialise a SeedSpec into an existing (empty) project. */
export async function seedFromSpec(projectId: string, spec: SeedSpec): Promise<SeedResult> {
  await setUserStackFacts(projectId, spec.facts);

  let archId = await getPrimaryArchitectureId(projectId);
  if (!archId) {
    const created = await createArchitecture({
      projectId,
      kind: "naive",
      name: "Naive model",
      summary: spec.summary,
    });
    archId = created.id;
  }

  for (const c of spec.components) {
    await addComponent({
      projectId,
      architectureId: archId,
      id: c.id,
      name: c.name,
      kind: c.kind,
      responsibilities: c.resp ? [c.resp] : [],
    });
  }
  for (const [from, to, kind] of spec.edges ?? []) {
    await setEdge(projectId, { from, to, kind });
  }

  let affects = 0;
  for (const s of spec.stressors) {
    await addStressor({
      projectId,
      id: s.id,
      name: s.name,
      category: s.cat,
      novelty: s.novelty,
      description: s.desc,
      horizon: "now",
      source: "catalogue",
    });
    for (const cid of s.hits) {
      await setAffects(projectId, s.id, cid, 1);
      affects++;
    }
    if (s.attractor) {
      await addAttractor({
        projectId,
        stressorId: s.id,
        name: `${s.name} — do-nothing outcome`,
        description: s.attractor,
      });
    }
  }

  for (const r of spec.residues) {
    await addResidue({
      projectId,
      id: r.id,
      name: r.gap ? `${r.name} (gap)` : r.name,
      intent: r.intent,
      minimalChangeDescription: r.change,
      appliesToStressors: r.covers,
      stackFitCitations: r.cites && r.cites.length ? r.cites : [spec.facts[0] ?? "(operating model)"],
      estimatedCost: r.cost,
      integrated: !r.gap,
    });
  }

  for (const [r1, r2, weight, reason] of spec.couplings ?? []) {
    await setCoupling(projectId, { fromResidue: r1, toResidue: r2, weight, reason });
  }

  return {
    components: spec.components.length,
    stressors: spec.stressors.length,
    residues: spec.residues.length,
    affects,
  };
}
