import type { Scenario } from "@stressforge/core";
import { read, write } from "./driver.js";
import { uuid } from "./ids.js";

const SCENARIO_RETURN =
  "sc { .id, .projectId, .name, enabledStressorIds: coalesce(sc.enabledStressorIds, []) } AS scenario";

export async function listScenarios(projectId: string): Promise<Scenario[]> {
  return read(
    `MATCH (p:Project {id: $projectId})-[:HAS_SCENARIO]->(sc:Scenario)
     RETURN ${SCENARIO_RETURN} ORDER BY sc.name`,
    { projectId },
    (r) => r.get("scenario") as Scenario,
  );
}

export async function createScenario(input: {
  projectId: string;
  name: string;
  enabledStressorIds: string[];
}): Promise<Scenario> {
  const id = uuid();
  return write(
    `MATCH (p:Project {id: $projectId})
     CREATE (sc:Scenario {id: $id, projectId: $projectId, name: $name, enabledStressorIds: $enabledStressorIds})
     CREATE (p)-[:HAS_SCENARIO]->(sc)
     RETURN ${SCENARIO_RETURN}`,
    { id, ...input },
    (res) => res.records[0]!.get("scenario") as Scenario,
  );
}

export async function updateScenario(
  projectId: string,
  scenarioId: string,
  patch: { name?: string; enabledStressorIds?: string[] },
): Promise<Scenario | null> {
  const rows = await write(
    `MATCH (p:Project {id: $projectId})-[:HAS_SCENARIO]->(sc:Scenario {id: $scenarioId})
     SET sc += $patch
     RETURN ${SCENARIO_RETURN}`,
    { projectId, scenarioId, patch },
    (res) => res.records.map((r) => r.get("scenario") as Scenario),
  );
  return rows[0] ?? null;
}

export async function deleteScenario(projectId: string, scenarioId: string): Promise<void> {
  await write(
    `MATCH (p:Project {id: $projectId})-[:HAS_SCENARIO]->(sc:Scenario {id: $scenarioId}) DETACH DELETE sc`,
    { projectId, scenarioId },
  );
}
