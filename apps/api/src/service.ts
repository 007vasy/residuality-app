import type {
  ArchitectureView,
  MetricsView,
  ProjectService,
} from "@stressforge/mcp";
import type {
  AttractorNode,
  ComponentNode,
  AnalysisState,
  ResidueNode,
  StressorNode,
} from "@stressforge/core";
import {
  addAttractor,
  addComponent as dbAddComponent,
  addResidue,
  addStressor as dbAddStressor,
  computeProjectMetrics,
  deleteStressor as dbDeleteStressor,
  exportState as dbExportState,
  getComponents,
  getEdges,
  getPrimaryArchitectureId,
  getUserStackFacts,
  listArchitectures,
  listResidues,
  listStressors,
  setAffects as dbSetAffects,
  setEdge,
  updateStressor as dbUpdateStressor,
} from "@stressforge/db";
import { deriveAttractorResidue, editArchitecture, generateStressors, type ArchInput, type LlmClient } from "@stressforge/llm";
import type { Config } from "./config.js";
import { llmClientForProject } from "./llm-resolver.js";

/**
 * Concrete ProjectService backed by Neo4j + the project's BYOK key. Shared by
 * the MCP server and the REST/SSE handlers so external agents and the web UI drive
 * the exact same operations. Every mutation broadcasts so collaborators see it live.
 */
export class ApiProjectService implements ProjectService {
  constructor(
    readonly projectId: string,
    readonly projectName: string,
    private readonly cfg: Config,
    private readonly onChange: (resources: string[]) => void,
    /** If provided, LLM ops use this client; otherwise resolved from the project. */
    private readonly llm?: LlmClient,
  ) {}

  private async requireLlm(): Promise<LlmClient> {
    if (this.llm) return this.llm;
    const client = await llmClientForProject(this.projectId, this.cfg);
    if (!client) {
      throw new Error(
        "No BYOK key available for this project. A member must add an Anthropic API key in Settings.",
      );
    }
    return client;
  }

  private async archInput(): Promise<{ input: ArchInput; architectureId: string | null; summary: string }> {
    const architectureId = await getPrimaryArchitectureId(this.projectId);
    const archs = await listArchitectures(this.projectId);
    const primary = archs.find((a) => a.kind === "naive") ?? archs[0];
    const components = architectureId ? await getComponents(architectureId) : [];
    const edges = architectureId ? await getEdges(architectureId) : [];
    const summary = primary?.summary ?? `Architecture for ${this.projectName}`;
    return {
      architectureId,
      summary,
      input: {
        summary,
        businessContext: primary?.businessContext,
        components: components.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          responsibilities: c.responsibilities,
          techAssumptions: c.techAssumptions,
        })),
        edges: edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
      },
    };
  }

  async getArchitecture(): Promise<ArchitectureView> {
    const architectureId = await getPrimaryArchitectureId(this.projectId);
    const archs = await listArchitectures(this.projectId);
    const primary = archs.find((a) => a.kind === "naive") ?? archs[0];
    const components = architectureId ? await getComponents(architectureId) : [];
    const edges = architectureId ? await getEdges(architectureId) : [];
    return {
      architectureId,
      summary: primary?.summary ?? `Architecture for ${this.projectName}`,
      businessContext: primary?.businessContext,
      components,
      edges,
    };
  }

  listStressors(): Promise<StressorNode[]> {
    return listStressors(this.projectId);
  }

  listResidues(): Promise<ResidueNode[]> {
    return listResidues(this.projectId);
  }

  async addComponent(input: {
    name: string;
    kind: string;
    responsibilities?: string[];
    techAssumptions?: string[];
  }): Promise<ComponentNode> {
    const architectureId = await getPrimaryArchitectureId(this.projectId);
    if (!architectureId) throw new Error("Project has no architecture yet");
    const c = await dbAddComponent({ projectId: this.projectId, architectureId, ...input });
    this.onChange(["architecture", "metrics"]);
    return c;
  }

  async addStressor(input: {
    name: string;
    category: string;
    novelty: number;
    description: string;
    horizon?: string;
    affects?: string[];
  }): Promise<StressorNode> {
    const s = await dbAddStressor({ projectId: this.projectId, source: "generated", ...input });
    for (const cid of input.affects ?? []) {
      await dbSetAffects(this.projectId, s.id, cid, 1);
    }
    this.onChange(["stressors", "metrics"]);
    return s;
  }

  async updateStressor(id: string, patch: Record<string, unknown>): Promise<void> {
    await dbUpdateStressor(this.projectId, id, patch as never);
    this.onChange(["stressors", "metrics"]);
  }

  async deleteStressor(id: string): Promise<void> {
    await dbDeleteStressor(this.projectId, id);
    this.onChange(["stressors", "metrics"]);
  }

  async setAffects(stressorId: string, componentId: string, on: boolean): Promise<void> {
    await dbSetAffects(this.projectId, stressorId, componentId, on ? 1 : null);
    this.onChange(["metrics"]);
  }

  async modifyArchitecture(instruction: string): Promise<{ notes: string; addedComponents: ComponentNode[] }> {
    const llm = await this.requireLlm();
    const { input, architectureId } = await this.archInput();
    if (!architectureId) throw new Error("Project has no architecture yet");
    const edit = await editArchitecture(llm, { arch: input, instruction });

    const nameToId = new Map(input.components.map((c) => [c.name.toLowerCase(), c.id]));
    const added: ComponentNode[] = [];
    for (const c of edit.addComponents) {
      const created = await dbAddComponent({
        projectId: this.projectId,
        architectureId,
        name: c.name,
        kind: c.kind,
        responsibilities: c.responsibilities,
        techAssumptions: c.techAssumptions,
      });
      added.push(created);
      nameToId.set(c.name.toLowerCase(), created.id);
    }
    for (const e of edit.addEdges) {
      const from = nameToId.get(e.from.toLowerCase()) ?? e.from;
      const to = nameToId.get(e.to.toLowerCase()) ?? e.to;
      const known = new Set([...input.components.map((c) => c.id), ...added.map((c) => c.id)]);
      if (known.has(from) && known.has(to)) {
        await setEdge(this.projectId, { from, to, kind: e.kind as never });
      }
    }
    this.onChange(["architecture", "metrics"]);
    return { notes: edit.notes, addedComponents: added };
  }

  async generateStressors(count: number, focus: string[]): Promise<StressorNode[]> {
    const llm = await this.requireLlm();
    const { input } = await this.archInput();
    const facts = await getUserStackFacts(this.projectId);
    const existing = (await listStressors(this.projectId)).map((s) => s.name);
    const generated = await generateStressors(llm, {
      arch: input,
      userStackFacts: facts,
      existingStressorNames: existing,
      focus,
      count,
    });
    const created: StressorNode[] = [];
    for (const g of generated) {
      const s = await dbAddStressor({
        projectId: this.projectId,
        name: g.name,
        category: g.category,
        novelty: g.novelty,
        description: g.description,
        horizon: g.horizon,
        source: "generated",
      });
      for (const cid of g.affects) await dbSetAffects(this.projectId, s.id, cid, 1);
      created.push(s);
    }
    this.onChange(["stressors", "metrics"]);
    return created;
  }

  async deriveResidue(stressorId: string): Promise<{ attractor: AttractorNode; residue: ResidueNode }> {
    const llm = await this.requireLlm();
    const { input } = await this.archInput();
    const facts = await getUserStackFacts(this.projectId);
    const stressors = await listStressors(this.projectId);
    const stressor = stressors.find((s) => s.id === stressorId);
    if (!stressor) throw new Error(`Stressor ${stressorId} not found`);

    const derived = await deriveAttractorResidue(llm, {
      arch: input,
      userStackFacts: facts,
      stressor: {
        id: stressor.id,
        name: stressor.name,
        category: stressor.category,
        description: stressor.description,
      },
    });
    const attractor = await addAttractor({
      projectId: this.projectId,
      stressorId,
      name: derived.attractor.name,
      description: derived.attractor.description,
      whyDrifts: derived.attractor.whyDrifts,
    });
    const residue = await addResidue({
      projectId: this.projectId,
      name: derived.residue.name,
      intent: derived.residue.intent,
      minimalChangeDescription: derived.residue.minimalChangeDescription,
      appliesToStressors: [stressorId],
      stackFitCitations: derived.residue.stackFitCitations,
      sourcePattern: derived.residue.sourcePattern,
      estimatedCost: derived.residue.estimatedCost,
      integrated: true,
    });
    this.onChange(["residues", "attractors", "metrics"]);
    return { attractor, residue };
  }

  async getMetrics(enabledStressorIds?: string[]): Promise<MetricsView> {
    const m = await computeProjectMetrics(this.projectId, enabledStressorIds);
    return {
      N: m.N,
      K: m.K,
      regime: m.regime,
      enabledStressorCount: m.enabledStressorCount,
      componentCriticality: m.componentCriticality,
      stressorBlastRadius: m.stressorBlastRadius,
      coupledPairs: m.coupledPairs,
      hotComponents: m.hotComponents,
      coverage: m.coverage,
      residualIndex: m.residualIndex,
    };
  }

  exportState(): Promise<AnalysisState> {
    return dbExportState(this.projectId, this.projectName, new Date().toISOString());
  }
}
