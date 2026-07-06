import { read, write } from "./driver.js";
import { createProject } from "./projects.js";
import { ALL_SEEDS } from "./seeds/index.js";
import { seedFromSpec } from "./seed-spec.js";
import { uuid } from "./ids.js";

const SYSTEM_EMAIL = "examples@stressforge.app";

/** A headless owner account for the public example gallery (never logs in). */
async function ensureSystemUser(now: string): Promise<string> {
  const existing = await read(
    `MATCH (u:User {email: $email}) RETURN u.id AS id`,
    { email: SYSTEM_EMAIL },
    (r) => r.get("id") as string,
  );
  if (existing[0]) return existing[0];
  const id = uuid();
  await write(
    `CREATE (u:User {id: $id, email: $email, displayName: $displayName,
                     passwordHash: $passwordHash, createdAt: $now})`,
    { id, email: SYSTEM_EMAIL, displayName: "StressForge Examples", passwordHash: "x$disabled$disabled", now },
  );
  return id;
}

/**
 * Idempotently create every curated example as a PUBLIC project owned by the
 * system account. Skips any example whose project name already exists, so it's
 * safe to run on every startup. Returns a summary.
 */
export async function seedExampleGallery(): Promise<{ created: string[]; skipped: string[] }> {
  const now = new Date().toISOString();
  const ownerId = await ensureSystemUser(now);

  const existingNames = new Set(
    await read(`MATCH (p:Project) RETURN p.name AS name`, {}, (r) => r.get("name") as string),
  );

  const created: string[] = [];
  const skipped: string[] = [];
  for (const spec of ALL_SEEDS) {
    if (existingNames.has(spec.name)) {
      skipped.push(spec.name);
      continue;
    }
    const project = await createProject({
      name: spec.name,
      description: spec.description,
      ownerId,
      now,
      domain: spec.domain,
      isPublic: true,
    });
    await seedFromSpec(project.id, spec);
    created.push(spec.name);
  }
  return { created, skipped };
}
