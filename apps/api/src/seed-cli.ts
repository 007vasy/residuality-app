/**
 * One-shot seed runner. On Cloud Run this is executed as a Job (not on every
 * service instance boot), so seeding the public example gallery happens exactly
 * once and never races across service instances. Idempotent: skips examples that
 * already exist by name. Migrates constraints first, then seeds, then exits.
 */
import { closeDriver, migrate, seedExampleGallery, verifyConnectivity } from "@stressforge/db";

async function main() {
  console.log("[seed] connecting to Neo4j...");
  await verifyConnectivity();
  console.log("[seed] running migrations...");
  await migrate();
  console.log("[seed] seeding example gallery...");
  const { created, skipped } = await seedExampleGallery();
  console.log(`[seed] done — created: ${created.length} (${created.join(", ") || "none"})`);
  console.log(`[seed] skipped(existing): ${skipped.length}`);
  await closeDriver();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await closeDriver().catch(() => {});
  process.exit(1);
});
