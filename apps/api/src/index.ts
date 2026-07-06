import { closeDriver, migrate, seedExampleGallery, verifyConnectivity } from "@stressforge/db";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

async function waitForNeo4j(retries = 30, delayMs = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await verifyConnectivity();
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const cfg = loadConfig();
  console.log("Waiting for Neo4j...");
  await waitForNeo4j();
  console.log("Running migrations...");
  await migrate();

  if (process.env.SEED_EXAMPLES !== "false") {
    console.log("Seeding public example gallery...");
    const { created, skipped } = await seedExampleGallery();
    console.log(`Examples — created: ${created.length}, skipped(existing): ${skipped.length}`);
  }

  const app = await buildApp(cfg);
  await app.listen({ port: cfg.port, host: "0.0.0.0" });
  console.log(`API listening on :${cfg.port}`);

  const shutdown = async () => {
    await app.close();
    await closeDriver();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
