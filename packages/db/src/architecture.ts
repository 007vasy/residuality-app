import type { ArchitectureKind, ArchitectureNode, ComponentEdge, ComponentNode } from "@stressforge/core";
import { read, withWriteTx, write } from "./driver.js";
import { nextSeqId, uuid } from "./ids.js";

const ARCH_RETURN =
  "a { .id, .projectId, .kind, .name, .version, .summary, .businessContext, derivedFromId: a.derivedFromId } AS arch";

export async function createArchitecture(input: {
  projectId: string;
  kind: ArchitectureKind;
  name: string;
  summary: string;
  businessContext?: string;
  version?: number;
  derivedFromId?: string | null;
}): Promise<ArchitectureNode> {
  const id = uuid();
  return write(
    `MATCH (p:Project {id: $projectId})
     CREATE (a:Architecture {id: $id, projectId: $projectId, kind: $kind, name: $name,
                             version: $version, summary: $summary,
                             businessContext: $businessContext, derivedFromId: $derivedFromId})
     CREATE (p)-[:HAS_ARCHITECTURE]->(a)
     RETURN ${ARCH_RETURN}`,
    {
      id,
      projectId: input.projectId,
      kind: input.kind,
      name: input.name,
      version: input.version ?? 1,
      summary: input.summary,
      businessContext: input.businessContext ?? null,
      derivedFromId: input.derivedFromId ?? null,
    },
    (res) => res.records[0]!.get("arch") as ArchitectureNode,
  );
}

export async function listArchitectures(projectId: string): Promise<ArchitectureNode[]> {
  return read(
    `MATCH (p:Project {id: $projectId})-[:HAS_ARCHITECTURE]->(a:Architecture)
     RETURN ${ARCH_RETURN} ORDER BY a.kind, a.version`,
    { projectId },
    (r) => r.get("arch") as ArchitectureNode,
  );
}

export async function getComponents(architectureId: string): Promise<ComponentNode[]> {
  return read(
    `MATCH (a:Architecture {id: $architectureId})-[:HAS_COMPONENT]->(c:Component)
     RETURN c { .id, .projectId, architectureId: $architectureId, .name, .kind,
                responsibilities: coalesce(c.responsibilities, []),
                techAssumptions: coalesce(c.techAssumptions, []) } AS component
     ORDER BY c.id`,
    { architectureId },
    (r) => r.get("component") as ComponentNode,
  );
}

export async function getEdges(architectureId: string): Promise<ComponentEdge[]> {
  return read(
    `MATCH (a:Architecture {id: $architectureId})-[:HAS_COMPONENT]->(c1:Component)-[e:CONNECTS]->(c2:Component)
     WHERE (a)-[:HAS_COMPONENT]->(c2)
     RETURN { from: c1.id, to: c2.id, kind: e.kind, notes: e.notes } AS edge`,
    { architectureId },
    (r) => r.get("edge") as ComponentEdge,
  );
}

export async function addComponent(input: {
  projectId: string;
  architectureId: string;
  name: string;
  kind: string;
  responsibilities?: string[];
  techAssumptions?: string[];
  id?: string;
}): Promise<ComponentNode> {
  return withWriteTx(async (tx) => {
    const id = input.id ?? (await nextSeqId(tx, input.projectId, "Component", "C"));
    const res = await tx.run(
      `MATCH (a:Architecture {id: $architectureId})
       CREATE (c:Component {id: $id, projectId: $projectId, name: $name, kind: $kind,
                            responsibilities: $responsibilities, techAssumptions: $techAssumptions})
       CREATE (a)-[:HAS_COMPONENT]->(c)
       RETURN c { .id, .projectId, architectureId: $architectureId, .name, .kind,
                  .responsibilities, .techAssumptions } AS component`,
      {
        id,
        projectId: input.projectId,
        architectureId: input.architectureId,
        name: input.name,
        kind: input.kind,
        responsibilities: input.responsibilities ?? [],
        techAssumptions: input.techAssumptions ?? [],
      },
    );
    return res.records[0]!.get("component") as ComponentNode;
  });
}

export async function updateComponent(
  projectId: string,
  componentId: string,
  patch: Partial<Pick<ComponentNode, "name" | "kind" | "responsibilities" | "techAssumptions">>,
): Promise<void> {
  await write(
    `MATCH (c:Component {projectId: $projectId, id: $componentId}) SET c += $patch`,
    { projectId, componentId, patch },
  );
}

export async function deleteComponent(projectId: string, componentId: string): Promise<void> {
  await write(
    `MATCH (c:Component {projectId: $projectId, id: $componentId}) DETACH DELETE c`,
    { projectId, componentId },
  );
}

export async function setEdge(
  projectId: string,
  edge: ComponentEdge,
): Promise<void> {
  await write(
    `MATCH (c1:Component {projectId: $projectId, id: $from})
     MATCH (c2:Component {projectId: $projectId, id: $to})
     MERGE (c1)-[e:CONNECTS]->(c2)
     SET e.kind = $kind, e.notes = $notes`,
    { projectId, from: edge.from, to: edge.to, kind: edge.kind, notes: edge.notes ?? null },
  );
}

export async function removeEdge(projectId: string, from: string, to: string): Promise<void> {
  await write(
    `MATCH (c1:Component {projectId: $projectId, id: $from})-[e:CONNECTS]->(c2:Component {projectId: $projectId, id: $to})
     DELETE e`,
    { projectId, from, to },
  );
}
