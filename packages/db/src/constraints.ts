import { write } from "./driver.js";

/**
 * Idempotent schema migration: uniqueness constraints and lookup indexes.
 * Safe to run on every startup (IF NOT EXISTS).
 */
const STATEMENTS: string[] = [
  // Uniqueness (also creates a backing index)
  "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
  "CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE",
  "CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE",
  "CREATE CONSTRAINT architecture_id IF NOT EXISTS FOR (a:Architecture) REQUIRE a.id IS UNIQUE",
  "CREATE CONSTRAINT component_id IF NOT EXISTS FOR (c:Component) REQUIRE (c.projectId, c.id) IS UNIQUE",
  "CREATE CONSTRAINT stressor_id IF NOT EXISTS FOR (s:Stressor) REQUIRE (s.projectId, s.id) IS UNIQUE",
  "CREATE CONSTRAINT residue_id IF NOT EXISTS FOR (r:Residue) REQUIRE (r.projectId, r.id) IS UNIQUE",
  "CREATE CONSTRAINT attractor_id IF NOT EXISTS FOR (a:Attractor) REQUIRE (a.projectId, a.id) IS UNIQUE",
  "CREATE CONSTRAINT scenario_id IF NOT EXISTS FOR (s:Scenario) REQUIRE s.id IS UNIQUE",
  "CREATE CONSTRAINT token_hash IF NOT EXISTS FOR (t:ApiToken) REQUIRE t.hash IS UNIQUE",
  // Lookup indexes
  "CREATE INDEX stressor_category IF NOT EXISTS FOR (s:Stressor) ON (s.category)",
  "CREATE INDEX architecture_kind IF NOT EXISTS FOR (a:Architecture) ON (a.kind)",
  "CREATE INDEX component_project IF NOT EXISTS FOR (c:Component) ON (c.projectId)",
  "CREATE INDEX stressor_project IF NOT EXISTS FOR (s:Stressor) ON (s.projectId)",
];

export async function migrate(): Promise<void> {
  for (const stmt of STATEMENTS) {
    await write(stmt, {});
  }
}
