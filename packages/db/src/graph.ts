import {
  computeContagion,
  computeCriticality,
  computeIncidenceMetrics,
  type Coupling,
  type IncidenceMetrics,
  type ResidualityState,
  type Residue,
  type Stressor as StressorState,
} from "@residuality/core";
import { getComponents, getEdges, listArchitectures, createArchitecture, addComponent, setEdge } from "./architecture.js";
import { getUserStackFacts, setUserStackFacts } from "./projects.js";
import { addResidue, listAttractors, listCouplings, listResidues, addAttractor, setCoupling } from "./residues.js";
import { addStressor, listAffects, listStressors } from "./stressors.js";

/** The naive architecture is the canonical component set for the interactive matrix. */
export async function getPrimaryArchitectureId(projectId: string): Promise<string | null> {
  const archs = await listArchitectures(projectId);
  const naive = archs.find((a) => a.kind === "naive") ?? archs[0];
  return naive?.id ?? null;
}

export interface ProjectMetrics extends IncidenceMetrics {
  architectureId: string | null;
  enabledStressorIds: string[];
}

/**
 * Live risk metrics for a scenario: recompute the stressor x component incidence
 * over the enabled stressor set. `enabledStressorIds === undefined` means "all on".
 */
export async function computeProjectMetrics(
  projectId: string,
  enabledStressorIds?: string[],
): Promise<ProjectMetrics> {
  const architectureId = await getPrimaryArchitectureId(projectId);
  const [stressors, affects, residues] = await Promise.all([
    listStressors(projectId),
    listAffects(projectId),
    listResidues(projectId),
  ]);
  const components = architectureId ? await getComponents(architectureId) : [];
  const edges = architectureId ? await getEdges(architectureId) : [];

  const enabledSet = enabledStressorIds
    ? new Set(enabledStressorIds)
    : new Set(stressors.map((s) => s.id));

  const metrics = computeIncidenceMetrics({
    components: components.map((c) => ({ id: c.id })),
    stressors: stressors.map((s) => ({ id: s.id, enabled: enabledSet.has(s.id) })),
    affects: affects.map((a) => ({ stressorId: a.stressorId, componentId: a.componentId, impact: a.impact })),
    componentEdges: edges.map((e) => ({ from: e.from, to: e.to })),
    residues: residues.map((r) => ({
      id: r.id,
      appliesToStressors: r.appliesToStressors,
      integrated: r.integrated,
    })),
  });

  return { ...metrics, architectureId, enabledStressorIds: [...enabledSet] };
}

/**
 * Build a skill-compatible state.json from the project graph, running the core
 * compute engine to fill contagion + criticality. Round-trips with the CLI skill.
 */
export async function exportState(projectId: string, projectName: string, now: string): Promise<ResidualityState> {
  const architectureId = await getPrimaryArchitectureId(projectId);
  const [components, edges, stressors, residues, attractors, couplings, userStackFacts] = await Promise.all([
    architectureId ? getComponents(architectureId) : Promise.resolve([]),
    architectureId ? getEdges(architectureId) : Promise.resolve([]),
    listStressors(projectId),
    listResidues(projectId),
    listAttractors(projectId),
    listCouplings(projectId),
    getUserStackFacts(projectId),
  ]);

  const residueStack: Residue[] = residues.map((r) => ({
    id: r.id,
    name: r.name,
    intent: r.intent,
    minimal_change_description: r.minimalChangeDescription,
    applies_to_stressors: r.appliesToStressors,
    stack_fit_citations: r.stackFitCitations.length ? r.stackFitCitations : ["(unspecified)"],
    source_pattern: r.sourcePattern ?? null,
    ...(r.estimatedCost ? { estimated_cost: r.estimatedCost } : {}),
  }));

  const stressorState: StressorState[] = stressors.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    novelty: s.novelty,
    description: s.description,
    horizon: s.horizon,
    source: s.source,
  }));

  const couplingState: Coupling[] = couplings.map((c) => ({
    from_residue: c.fromResidue,
    to_residue: c.toResidue,
    weight: c.weight,
    reason: c.reason,
  }));

  // attractors_residues: pair each attractor with the residues its stressor produced.
  const residuesByStressor = new Map<string, Residue[]>();
  for (const r of residueStack) {
    for (const sid of r.applies_to_stressors) {
      const list = residuesByStressor.get(sid) ?? [];
      list.push(r);
      residuesByStressor.set(sid, list);
    }
  }
  const attractorsResidues = attractors.flatMap((a) => {
    const rs = residuesByStressor.get(a.stressorId) ?? [];
    return rs.map((r) => ({
      stressor_id: a.stressorId,
      attractor: { name: a.name, description: a.description, why_system_drifts_here: a.whyDrifts ?? "" },
      residue: r,
    }));
  });

  const state: ResidualityState = {
    schema_version: "1.0",
    project: projectName,
    created_at: now,
    updated_at: now,
    mode: "analyze",
    focus: [],
    naive_architecture: {
      summary: `Architecture for ${projectName}`,
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        responsibilities: c.responsibilities,
        tech_assumptions: c.techAssumptions,
      })),
      edges: edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, ...(e.notes ? { notes: e.notes } : {}) })),
    },
    user_stack_facts: userStackFacts,
    stressors: stressorState,
    attractors_residues: attractorsResidues,
    residue_stack: residueStack,
    history: [{ timestamp: now, mode: "analyze", note: "exported from residuality-app" }],
    open_questions: [],
  };

  if (residueStack.length > 0) {
    state.contagion = computeContagion(residueStack, stressorState, couplingState);
    state.criticality = computeCriticality({
      naive_architecture: state.naive_architecture,
      residue_stack: residueStack,
      stressors: stressorState,
      contagion: state.contagion,
      focus: [],
    });
  }

  return state;
}

/**
 * Import a skill-produced state.json into an existing (empty) project. Creates the into an existing (empty) project. Creates the
 * naive architecture, components, edges, stressors, residues, attractors, and
 * couplings. AFFECTS (stressor x component) edges are not present in state.json,
 * so the interactive matrix starts empty and is populated in-app or via the LLM.
 */
export async function importState(projectId: string, state: ResidualityState): Promise<void> {
  await setUserStackFacts(projectId, state.user_stack_facts ?? []);

  const arch = await createArchitecture({
    projectId,
    kind: "naive",
    name: "Naive architecture",
    summary: state.naive_architecture.summary,
    businessContext: state.naive_architecture.business_context,
  });

  for (const c of state.naive_architecture.components) {
    await addComponent({
      projectId,
      architectureId: arch.id,
      id: c.id,
      name: c.name,
      kind: c.kind,
      responsibilities: c.responsibilities ?? [],
      techAssumptions: c.tech_assumptions ?? [],
    });
  }
  for (const e of state.naive_architecture.edges) {
    await setEdge(projectId, { from: e.from, to: e.to, kind: e.kind, notes: e.notes });
  }
  for (const s of state.stressors) {
    await addStressor({
      projectId,
      id: s.id,
      name: s.name,
      category: s.category,
      novelty: s.novelty,
      description: s.description,
      horizon: s.horizon,
      source: s.source,
    });
  }
  for (const r of state.residue_stack) {
    await addResidue({
      projectId,
      id: r.id,
      name: r.name,
      intent: r.intent,
      minimalChangeDescription: r.minimal_change_description,
      appliesToStressors: r.applies_to_stressors,
      stackFitCitations: r.stack_fit_citations,
      sourcePattern: r.source_pattern,
      estimatedCost: r.estimated_cost,
      integrated: true,
    });
  }
  for (const ar of state.attractors_residues) {
    await addAttractor({
      projectId,
      stressorId: ar.stressor_id,
      name: ar.attractor.name,
      description: ar.attractor.description,
      whyDrifts: ar.attractor.why_system_drifts_here,
    });
  }
  for (const c of state.contagion?.couplings ?? []) {
    await setCoupling(projectId, {
      fromResidue: c.from_residue,
      toResidue: c.to_residue,
      weight: c.weight,
      reason: c.reason,
    });
  }
}
