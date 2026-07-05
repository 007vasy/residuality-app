import type { Project, ProjectMember, Role } from "@residuality/core";
import { read, write } from "./driver.js";
import { uuid } from "./ids.js";

const PROJECT_RETURN = "p { .id, .name, .description, .createdAt, .updatedAt } AS project";

export async function createProject(input: {
  name: string;
  description: string;
  ownerId: string;
  now: string;
}): Promise<Project> {
  const id = uuid();
  return write(
    `MATCH (u:User {id: $ownerId})
     CREATE (p:Project {id: $id, name: $name, description: $description,
                        createdAt: $now, updatedAt: $now})
     CREATE (u)-[:MEMBER_OF {role: 'owner'}]->(p)
     RETURN ${PROJECT_RETURN}`,
    { id, ...input },
    (res) => res.records[0]!.get("project") as Project,
  );
}

export async function listProjectsForUser(userId: string): Promise<(Project & { role: Role })[]> {
  return read(
    `MATCH (u:User {id: $userId})-[m:MEMBER_OF]->(p:Project)
     RETURN p { .id, .name, .description, .createdAt, .updatedAt, role: m.role } AS project
     ORDER BY p.updatedAt DESC`,
    { userId },
    (r) => r.get("project") as Project & { role: Role },
  );
}

export async function getProject(projectId: string): Promise<Project | null> {
  const rows = await read(
    `MATCH (p:Project {id: $projectId}) RETURN ${PROJECT_RETURN}`,
    { projectId },
    (r) => r.get("project") as Project,
  );
  return rows[0] ?? null;
}

export async function touchProject(projectId: string, now: string): Promise<void> {
  await write(`MATCH (p:Project {id: $projectId}) SET p.updatedAt = $now`, { projectId, now });
}

export async function getUserStackFacts(projectId: string): Promise<string[]> {
  const rows = await read(
    `MATCH (p:Project {id: $projectId}) RETURN coalesce(p.userStackFacts, []) AS facts`,
    { projectId },
    (r) => r.get("facts") as string[],
  );
  return rows[0] ?? [];
}

export async function setUserStackFacts(projectId: string, facts: string[]): Promise<void> {
  await write(`MATCH (p:Project {id: $projectId}) SET p.userStackFacts = $facts`, { projectId, facts });
}

export async function updateProject(
  projectId: string,
  patch: { name?: string; description?: string },
  now: string,
): Promise<Project | null> {
  const rows = await write(
    `MATCH (p:Project {id: $projectId})
     SET p += $patch, p.updatedAt = $now
     RETURN ${PROJECT_RETURN}`,
    { projectId, patch, now },
    (res) => res.records.map((r) => r.get("project") as Project),
  );
  return rows[0] ?? null;
}

export async function deleteProject(projectId: string): Promise<void> {
  await write(
    `MATCH (p:Project {id: $projectId})
     OPTIONAL MATCH (p)-[:HAS_ARCHITECTURE]->(a:Architecture)
     OPTIONAL MATCH (a)-[:HAS_COMPONENT]->(c:Component)
     OPTIONAL MATCH (p)-[:HAS_STRESSOR]->(s:Stressor)
     OPTIONAL MATCH (s)-[:PRODUCES]->(r:Residue)
     OPTIONAL MATCH (s)-[:LEADS_TO]->(at:Attractor)
     OPTIONAL MATCH (p)-[:HAS_SCENARIO]->(sc:Scenario)
     DETACH DELETE p, a, c, s, r, at, sc`,
    { projectId },
  );
}

/** Membership / RBAC */
export async function getMemberRole(projectId: string, userId: string): Promise<Role | null> {
  const rows = await read(
    `MATCH (u:User {id: $userId})-[m:MEMBER_OF]->(p:Project {id: $projectId})
     RETURN m.role AS role`,
    { projectId, userId },
    (r) => r.get("role") as Role,
  );
  return rows[0] ?? null;
}

export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  return read(
    `MATCH (u:User)-[m:MEMBER_OF]->(p:Project {id: $projectId})
     RETURN { userId: u.id, email: u.email, displayName: u.displayName, role: m.role } AS member
     ORDER BY member.role, member.email`,
    { projectId },
    (r) => r.get("member") as ProjectMember,
  );
}

export async function addMemberByEmail(
  projectId: string,
  email: string,
  role: Role,
): Promise<ProjectMember | null> {
  const rows = await write(
    `MATCH (p:Project {id: $projectId})
     MATCH (u:User {email: $email})
     MERGE (u)-[m:MEMBER_OF]->(p)
     SET m.role = $role
     RETURN { userId: u.id, email: u.email, displayName: u.displayName, role: m.role } AS member`,
    { projectId, email, role },
    (res) => res.records.map((r) => r.get("member") as ProjectMember),
  );
  return rows[0] ?? null;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await write(
    `MATCH (u:User {id: $userId})-[m:MEMBER_OF]->(p:Project {id: $projectId}) DELETE m`,
    { projectId, userId },
  );
}
