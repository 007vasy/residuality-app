import type { AffectsEdge, StressorNode } from "@residuality/core";
import { read, withWriteTx, write } from "./driver.js";
import { nextSeqId } from "./ids.js";

const STRESSOR_RETURN =
  "s { .id, .projectId, .name, .category, .novelty, .description, .horizon, .source } AS stressor";

export async function listStressors(projectId: string): Promise<StressorNode[]> {
  return read(
    `MATCH (p:Project {id: $projectId})-[:HAS_STRESSOR]->(s:Stressor)
     RETURN ${STRESSOR_RETURN} ORDER BY s.id`,
    { projectId },
    (r) => r.get("stressor") as StressorNode,
  );
}

export async function addStressor(input: {
  projectId: string;
  name: string;
  category: string;
  novelty: number;
  description: string;
  horizon?: string;
  source?: string;
  id?: string;
}): Promise<StressorNode> {
  return withWriteTx(async (tx) => {
    const id = input.id ?? (await nextSeqId(tx, input.projectId, "Stressor", "S"));
    const res = await tx.run(
      `MATCH (p:Project {id: $projectId})
       CREATE (s:Stressor {id: $id, projectId: $projectId, name: $name, category: $category,
                           novelty: $novelty, description: $description,
                           horizon: $horizon, source: $source})
       CREATE (p)-[:HAS_STRESSOR]->(s)
       RETURN ${STRESSOR_RETURN}`,
      {
        id,
        projectId: input.projectId,
        name: input.name,
        category: input.category,
        novelty: input.novelty,
        description: input.description,
        horizon: input.horizon ?? "now",
        source: input.source ?? "generated",
      },
    );
    return res.records[0]!.get("stressor") as StressorNode;
  });
}

export async function updateStressor(
  projectId: string,
  stressorId: string,
  patch: Partial<Pick<StressorNode, "name" | "category" | "novelty" | "description" | "horizon">>,
): Promise<void> {
  await write(
    `MATCH (s:Stressor {projectId: $projectId, id: $stressorId}) SET s += $patch`,
    { projectId, stressorId, patch },
  );
}

export async function deleteStressor(projectId: string, stressorId: string): Promise<void> {
  await write(
    `MATCH (s:Stressor {projectId: $projectId, id: $stressorId}) DETACH DELETE s`,
    { projectId, stressorId },
  );
}

/** Set (or clear) which components a stressor affects — the incidence matrix cells. */
export async function setAffects(
  projectId: string,
  stressorId: string,
  componentId: string,
  impact: number | null,
): Promise<void> {
  if (impact === null) {
    await write(
      `MATCH (s:Stressor {projectId: $projectId, id: $stressorId})-[a:AFFECTS]->(c:Component {projectId: $projectId, id: $componentId})
       DELETE a`,
      { projectId, stressorId, componentId },
    );
    return;
  }
  await write(
    `MATCH (s:Stressor {projectId: $projectId, id: $stressorId})
     MATCH (c:Component {projectId: $projectId, id: $componentId})
     MERGE (s)-[a:AFFECTS]->(c)
     SET a.impact = $impact`,
    { projectId, stressorId, componentId, impact },
  );
}

export async function listAffects(projectId: string): Promise<AffectsEdge[]> {
  return read(
    `MATCH (s:Stressor {projectId: $projectId})-[a:AFFECTS]->(c:Component {projectId: $projectId})
     RETURN { stressorId: s.id, componentId: c.id, impact: coalesce(a.impact, 1) } AS affects`,
    { projectId },
    (r) => r.get("affects") as AffectsEdge,
  );
}
