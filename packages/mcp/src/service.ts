/**
 * The operations an MCP client can drive. The API layer implements this per
 * project (resolved from the MCP bearer token), wiring Neo4j + the project
 * owner's BYOK key + WebSocket broadcast so external-agent changes show up live
 * in the web UI.
 */
import type {
  AttractorNode,
  ComponentEdge,
  ComponentNode,
  ResidualityState,
  ResidueNode,
  StressorNode,
} from "@residuality/core";

export interface ArchitectureView {
  architectureId: string | null;
  summary: string;
  businessContext?: string;
  components: ComponentNode[];
  edges: ComponentEdge[];
}

export interface MetricsView {
  N: number;
  K: number;
  regime: string;
  enabledStressorCount: number;
  componentCriticality: Record<string, number>;
  stressorBlastRadius: Record<string, number>;
  coupledPairs: { a: string; b: string; sharedStressors: number }[];
  hotComponents: string[];
  coverage: number;
  residualIndex: number | null;
}

export interface ResidualityService {
  readonly projectId: string;
  readonly projectName: string;

  getArchitecture(): Promise<ArchitectureView>;
  listStressors(): Promise<StressorNode[]>;
  listResidues(): Promise<ResidueNode[]>;

  addComponent(input: {
    name: string;
    kind: string;
    responsibilities?: string[];
    techAssumptions?: string[];
  }): Promise<ComponentNode>;

  addStressor(input: {
    name: string;
    category: string;
    novelty: number;
    description: string;
    horizon?: string;
    affects?: string[];
  }): Promise<StressorNode>;

  updateStressor(id: string, patch: Record<string, unknown>): Promise<void>;
  deleteStressor(id: string): Promise<void>;
  setAffects(stressorId: string, componentId: string, on: boolean): Promise<void>;

  /** LLM (BYOK): rewrite/extend the architecture from a natural-language instruction. */
  modifyArchitecture(instruction: string): Promise<{ notes: string; addedComponents: ComponentNode[] }>;
  /** LLM (BYOK): generate a diverse stressor set and persist it (with AFFECTS edges). */
  generateStressors(count: number, focus: string[]): Promise<StressorNode[]>;
  /** LLM (BYOK): derive the attractor + minimal residue for one stressor and persist. */
  deriveResidue(stressorId: string): Promise<{ attractor: AttractorNode; residue: ResidueNode }>;

  getMetrics(enabledStressorIds?: string[]): Promise<MetricsView>;
  exportState(): Promise<ResidualityState>;
}
