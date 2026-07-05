import type { AttractorNode, ResidueCoupling, ResidueNode } from "@stressforge/core";
import { read, withWriteTx, write } from "./driver.js";
import { nextSeqId } from "./ids.js";

const RESIDUE_RETURN = `r { .id, .projectId, .name, .intent, .minimalChangeDescription,
    appliesToStressors: coalesce(r.appliesToStressors, []),
    stackFitCitations: coalesce(r.stackFitCitations, []),
    sourcePattern: r.sourcePattern, estimatedCost: r.estimatedCost,
    integrated: coalesce(r.integrated, false) } AS residue`;

export async function listResidues(projectId: string): Promise<ResidueNode[]> {
  return read(
    `MATCH (p:Project {id: $projectId})-[:HAS_STRESSOR]->(:Stressor)-[:PRODUCES]->(r:Residue)
     WITH DISTINCT r RETURN ${RESIDUE_RETURN} ORDER BY r.id`,
    { projectId },
    (rr) => rr.get("residue") as ResidueNode,
  );
}

export async function addResidue(input: {
  projectId: string;
  name: string;
  intent: string;
  minimalChangeDescription: string;
  appliesToStressors: string[];
  stackFitCitations: string[];
  sourcePattern?: string | null;
  estimatedCost?: string;
  integrated?: boolean;
  id?: string;
}): Promise<ResidueNode> {
  return withWriteTx(async (tx) => {
    const id = input.id ?? (await nextSeqId(tx, input.projectId, "Residue", "R"));
    const res = await tx.run(
      `MATCH (p:Project {id: $projectId})
       CREATE (r:Residue {id: $id, projectId: $projectId, name: $name, intent: $intent,
                          minimalChangeDescription: $minimalChangeDescription,
                          appliesToStressors: $appliesToStressors,
                          stackFitCitations: $stackFitCitations,
                          sourcePattern: $sourcePattern, estimatedCost: $estimatedCost,
                          integrated: $integrated})
       WITH r
       UNWIND $appliesToStressors AS sid
       MATCH (s:Stressor {projectId: $projectId, id: sid})
       MERGE (s)-[:PRODUCES]->(r)
       WITH DISTINCT r
       RETURN ${RESIDUE_RETURN}`,
      {
        id,
        projectId: input.projectId,
        name: input.name,
        intent: input.intent,
        minimalChangeDescription: input.minimalChangeDescription,
        appliesToStressors: input.appliesToStressors,
        stackFitCitations: input.stackFitCitations,
        sourcePattern: input.sourcePattern ?? null,
        estimatedCost: input.estimatedCost ?? null,
        integrated: input.integrated ?? false,
      },
    );
    return res.records[0]!.get("residue") as ResidueNode;
  });
}

export async function setResidueIntegrated(
  projectId: string,
  residueId: string,
  integrated: boolean,
): Promise<void> {
  await write(
    `MATCH (r:Residue {projectId: $projectId, id: $residueId}) SET r.integrated = $integrated`,
    { projectId, residueId, integrated },
  );
}

export async function deleteResidue(projectId: string, residueId: string): Promise<void> {
  await write(
    `MATCH (r:Residue {projectId: $projectId, id: $residueId}) DETACH DELETE r`,
    { projectId, residueId },
  );
}

/** Attractors */
export async function addAttractor(input: {
  projectId: string;
  stressorId: string;
  name: string;
  description: string;
  whyDrifts?: string;
  polarity?: string;
  id?: string;
}): Promise<AttractorNode> {
  return withWriteTx(async (tx) => {
    const id = input.id ?? (await nextSeqId(tx, input.projectId, "Attractor", "A"));
    const res = await tx.run(
      `MATCH (s:Stressor {projectId: $projectId, id: $stressorId})
       CREATE (at:Attractor {id: $id, projectId: $projectId, stressorId: $stressorId,
                             name: $name, description: $description, whyDrifts: $whyDrifts,
                             polarity: $polarity})
       CREATE (s)-[:LEADS_TO]->(at)
       RETURN at { .id, .projectId, .stressorId, .name, .description, .whyDrifts, .polarity } AS attractor`,
      {
        id,
        projectId: input.projectId,
        stressorId: input.stressorId,
        name: input.name,
        description: input.description,
        whyDrifts: input.whyDrifts ?? null,
        polarity: input.polarity ?? "negative",
      },
    );
    return res.records[0]!.get("attractor") as AttractorNode;
  });
}

export async function listAttractors(projectId: string): Promise<AttractorNode[]> {
  return read(
    `MATCH (p:Project {id: $projectId})-[:HAS_STRESSOR]->(:Stressor)-[:LEADS_TO]->(at:Attractor)
     RETURN at { .id, .projectId, .stressorId, .name, .description, .whyDrifts, .polarity } AS attractor
     ORDER BY at.id`,
    { projectId },
    (r) => r.get("attractor") as AttractorNode,
  );
}

/** Residue-to-residue contagion couplings */
export async function setCoupling(projectId: string, c: ResidueCoupling): Promise<void> {
  await write(
    `MATCH (r1:Residue {projectId: $projectId, id: $from})
     MATCH (r2:Residue {projectId: $projectId, id: $to})
     MERGE (r1)-[k:COUPLED_WITH]->(r2)
     SET k.weight = $weight, k.reason = $reason`,
    { projectId, from: c.fromResidue, to: c.toResidue, weight: c.weight, reason: c.reason },
  );
}

export async function listCouplings(projectId: string): Promise<ResidueCoupling[]> {
  return read(
    `MATCH (r1:Residue {projectId: $projectId})-[k:COUPLED_WITH]->(r2:Residue {projectId: $projectId})
     RETURN { fromResidue: r1.id, toResidue: r2.id, weight: k.weight, reason: k.reason } AS coupling`,
    { projectId },
    (r) => r.get("coupling") as ResidueCoupling,
  );
}
