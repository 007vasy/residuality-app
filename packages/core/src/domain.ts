/**
 * Application/graph domain DTOs — the shapes exchanged over REST, MCP, and
 * WebSocket, and stored as Neo4j nodes. These wrap the skill's residuality
 * concepts with app concerns (projects, users, membership, scenarios).
 *
 * Node ids keep the skill's `C##` / `S##` / `R##` convention (allocated
 * per-project) so state.json import/export round-trips with the CLI skill.
 */
import type { ComponentKind, EdgeKind, StressorCategory } from "./schema.js";

export type Role = "owner" | "editor" | "viewer";
export const ROLES: Role[] = ["owner", "editor", "viewer"];

/** Higher number = more privilege. Used for RBAC comparisons. */
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export type ArchitectureKind = "naive" | "residual";
export type AttractorPolarity = "negative" | "acceptable" | "desirable";

/**
 * Analysis mode. The compute engine is domain-agnostic (components + stressors +
 * incidence work for any system); the domain drives vocabulary/framing and which
 * seed library applies.
 */
export type Domain = "software" | "company" | "country" | "planet";
export const DOMAINS: Domain[] = ["software", "company", "country", "planet"];

export const DOMAIN_META: Record<Domain, { label: string; unit: string; blurb: string }> = {
  software: {
    label: "Software architecture",
    unit: "component",
    blurb: "Stress-test a software system: services, datastores, and integrations.",
  },
  company: {
    label: "Company / enterprise risk",
    unit: "function",
    blurb: "Stress the operating model: value chain, functions, and dependencies.",
  },
  country: {
    label: "Country / national risk",
    unit: "sector",
    blurb: "Stress a nation: institutions, sectors, and critical dependencies.",
  },
  planet: {
    label: "Planetary / habitat risk",
    unit: "system",
    blurb: "Stress a civilisation or habitat: life-support, governance, and ecology.",
  },
};

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  domain: Domain;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface ArchitectureNode {
  id: string;
  projectId: string;
  kind: ArchitectureKind;
  name: string;
  version: number;
  summary: string;
  businessContext?: string;
  derivedFromId?: string | null;
}

export interface ComponentNode {
  id: string;
  projectId: string;
  architectureId: string;
  name: string;
  kind: ComponentKind;
  responsibilities: string[];
  techAssumptions: string[];
}

export interface ComponentEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  notes?: string;
}

export interface StressorNode {
  id: string;
  projectId: string;
  name: string;
  category: StressorCategory;
  novelty: number;
  description: string;
  horizon: "now" | "1y" | "5y";
  source: "catalogue" | "generated";
}

export interface AttractorNode {
  id: string;
  projectId: string;
  stressorId: string;
  name: string;
  description: string;
  whyDrifts?: string;
  polarity: AttractorPolarity;
}

export interface ResidueNode {
  id: string;
  projectId: string;
  name: string;
  intent: string;
  minimalChangeDescription: string;
  appliesToStressors: string[];
  stackFitCitations: string[];
  sourcePattern?: string | null;
  estimatedCost?: "low" | "med" | "high";
  integrated: boolean;
}

/** One entry per matrix "1" — a stressor affects a component. */
export interface AffectsEdge {
  stressorId: string;
  componentId: string;
  impact: number;
}

export interface ResidueCoupling {
  fromResidue: string;
  toResidue: string;
  weight: number;
  reason: string;
}

export interface Scenario {
  id: string;
  projectId: string;
  name: string;
  enabledStressorIds: string[];
}
