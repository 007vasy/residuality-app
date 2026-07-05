import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { SUPPORTED_MODELS } from "@residuality/llm";
import { handleMcpRequest } from "@residuality/mcp";
import {
  addMemberByEmail,
  createApiToken,
  createProject,
  createScenario,
  createUser,
  deleteComponent,
  deleteProject,
  deleteProviderKey,
  deleteScenario,
  findUserByEmail,
  findUserById,
  getProject,
  getUserStackFacts,
  importState,
  listApiTokens,
  listAttractors,
  listMembers,
  listProjectsForUser,
  listProviderKeys,
  listScenarios,
  listAffects,
  removeEdge,
  removeMember,
  resolveApiToken,
  seedEvCharging,
  setCoupling,
  setUserStackFacts,
  touchProject,
  updateComponent,
  updateProject,
  updateScenario,
  upsertProviderKey,
  createArchitecture,
} from "@residuality/db";
import { stateSchema } from "@residuality/core";
import { z } from "zod";
import type { Config } from "./config.js";
import { makeAuthenticate, requireRole, signJwt } from "./auth.js";
import { encryptSecret, generateApiToken, hashPassword, hashToken, verifyPassword } from "./crypto.js";
import { ApiResidualityService } from "./service.js";
import { llmClientForUser } from "./llm-resolver.js";
import { startSse } from "./sse.js";
import { broadcastChange, joinRoom, leaveRoom } from "./ws.js";
import { verifyJwt } from "./auth.js";

export async function buildApp(cfg: Config) {
  const app = Fastify({ logger: true });

  // Treat an empty application/json body as {} — several POSTs (seed, AI actions)
  // are sent with the JSON content-type but no body, which the default parser
  // rejects with a 400. (MCP requests always carry a body and parse normally.)
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = (body as string).trim();
    if (text === "") return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  await app.register(cors, { origin: cfg.corsOrigins, credentials: true });
  await app.register(websocket);

  const authenticate = makeAuthenticate(cfg.jwtSecret);

  // Build a service bound to a project, broadcasting changes to collaborators.
  async function serviceFor(projectId: string) {
    const project = await getProject(projectId);
    if (!project) return null;
    return new ApiResidualityService(projectId, project.name, cfg, (resources) =>
      broadcastChange(projectId, resources),
    );
  }

  function publicUser(u: { id: string; email: string; displayName: string }) {
    return { id: u.id, email: u.email, displayName: u.displayName };
  }

  // ---- Auth ----
  app.post("/api/auth/register", async (req, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(8), displayName: z.string().min(1) })
      .parse(req.body);
    if (await findUserByEmail(body.email)) return reply.code(409).send({ error: "email already registered" });
    const user = await createUser({
      email: body.email,
      displayName: body.displayName,
      passwordHash: hashPassword(body.password),
      createdAt: new Date().toISOString(),
    });
    return { token: signJwt(user.id, cfg.jwtSecret), user: publicUser(user) };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await findUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    return { token: signJwt(user.id, cfg.jwtSecret), user: publicUser(user) };
  });

  app.get("/api/me", { preHandler: authenticate }, async (req, reply) => {
    const user = await findUserById(req.userId!);
    if (!user) return reply.code(404).send({ error: "not found" });
    return { user: publicUser(user) };
  });

  app.get("/api/models", async () => ({ models: SUPPORTED_MODELS, default: cfg.defaultModel }));

  // ---- BYOK keys (per user) ----
  app.get("/api/keys", { preHandler: authenticate }, async (req) => ({
    keys: await listProviderKeys(req.userId!),
  }));

  app.put("/api/keys/:provider", { preHandler: authenticate }, async (req) => {
    const { provider } = req.params as { provider: string };
    const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);
    const enc = encryptSecret(apiKey, cfg.encryptionKey);
    await upsertProviderKey(req.userId!, { provider, ...enc, updatedAt: new Date().toISOString() });
    return { ok: true };
  });

  app.delete("/api/keys/:provider", { preHandler: authenticate }, async (req) => {
    const { provider } = req.params as { provider: string };
    await deleteProviderKey(req.userId!, provider);
    return { ok: true };
  });

  // ---- Projects ----
  app.get("/api/projects", { preHandler: authenticate }, async (req) => ({
    projects: await listProjectsForUser(req.userId!),
  }));

  app.post("/api/projects", { preHandler: authenticate }, async (req) => {
    const body = z.object({ name: z.string().min(1), description: z.string().default("") }).parse(req.body);
    const now = new Date().toISOString();
    const project = await createProject({ ...body, ownerId: req.userId!, now });
    await createArchitecture({
      projectId: project.id,
      kind: "naive",
      name: "Naive architecture",
      summary: `Architecture for ${project.name}`,
    });
    return { project };
  });

  // Helper: guard membership, returns projectId or sends error.
  async function guard(req: FastifyRequest, reply: FastifyReply, min: "viewer" | "editor" | "owner") {
    const { id } = req.params as { id: string };
    const role = await requireRole(req, reply, id, min);
    return role ? id : null;
  }

  app.get("/api/projects/:id", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    const project = await getProject(id);
    return { project, role: await requireRole(req, reply, id, "viewer") };
  });

  app.patch("/api/projects/:id", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "owner");
    if (!id) return;
    const patch = z.object({ name: z.string().optional(), description: z.string().optional() }).parse(req.body);
    const project = await updateProject(id, patch, new Date().toISOString());
    broadcastChange(id, ["project"]);
    return { project };
  });

  app.delete("/api/projects/:id", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "owner");
    if (!id) return;
    await deleteProject(id);
    return { ok: true };
  });

  // ---- Members ----
  app.get("/api/projects/:id/members", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    return { members: await listMembers(id) };
  });

  app.post("/api/projects/:id/members", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "owner");
    if (!id) return;
    const body = z.object({ email: z.string().email(), role: z.enum(["owner", "editor", "viewer"]) }).parse(req.body);
    const member = await addMemberByEmail(id, body.email, body.role);
    if (!member) return reply.code(404).send({ error: "no user with that email" });
    broadcastChange(id, ["members"]);
    return { member };
  });

  app.delete("/api/projects/:id/members/:userId", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "owner");
    if (!id) return;
    const { userId } = req.params as { userId: string };
    await removeMember(id, userId);
    broadcastChange(id, ["members"]);
    return { ok: true };
  });

  // ---- Architecture / components / edges ----
  app.get("/api/projects/:id/architecture", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    const svc = await serviceFor(id);
    return await svc!.getArchitecture();
  });

  app.post("/api/projects/:id/components", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z
      .object({
        name: z.string().min(1),
        kind: z.enum(["service", "datastore", "queue", "client", "external", "human", "device", "edge"]),
        responsibilities: z.array(z.string()).optional(),
        techAssumptions: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const svc = await serviceFor(id);
    return { component: await svc!.addComponent(body) };
  });

  app.patch("/api/projects/:id/components/:cid", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const { cid } = req.params as { cid: string };
    const patch = z
      .object({
        name: z.string().optional(),
        kind: z.string().optional(),
        responsibilities: z.array(z.string()).optional(),
        techAssumptions: z.array(z.string()).optional(),
      })
      .parse(req.body);
    await updateComponent(id, cid, patch as never);
    broadcastChange(id, ["architecture", "metrics"]);
    return { ok: true };
  });

  app.delete("/api/projects/:id/components/:cid", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const { cid } = req.params as { cid: string };
    await deleteComponent(id, cid);
    broadcastChange(id, ["architecture", "metrics"]);
    return { ok: true };
  });

  app.put("/api/projects/:id/edges", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const svc = await serviceFor(id);
    const body = z
      .object({ from: z.string(), to: z.string(), kind: z.enum(["sync", "async", "data", "human", "device"]) })
      .parse(req.body);
    // setEdge is on db; use service architecture path indirectly via addComponent? Use db directly:
    const { setEdge } = await import("@residuality/db");
    await setEdge(id, body);
    broadcastChange(id, ["architecture", "metrics"]);
    return { ok: true };
  });

  app.delete("/api/projects/:id/edges", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z.object({ from: z.string(), to: z.string() }).parse(req.body);
    await removeEdge(id, body.from, body.to);
    broadcastChange(id, ["architecture", "metrics"]);
    return { ok: true };
  });

  app.get("/api/projects/:id/stack-facts", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    return { facts: await getUserStackFacts(id) };
  });

  app.put("/api/projects/:id/stack-facts", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z.object({ facts: z.array(z.string()) }).parse(req.body);
    await setUserStackFacts(id, body.facts);
    return { ok: true };
  });

  // ---- Stressors + incidence ----
  app.get("/api/projects/:id/stressors", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    const svc = await serviceFor(id);
    return { stressors: await svc!.listStressors(), affects: await listAffects(id) };
  });

  app.post("/api/projects/:id/stressors", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z
      .object({
        name: z.string().min(1),
        category: z.enum([
          "regulatory", "market", "tech", "human", "adversarial",
          "environmental", "supply-chain", "scale", "time",
        ]),
        novelty: z.number().int().min(1).max(5),
        description: z.string().default(""),
        horizon: z.enum(["now", "1y", "5y"]).optional(),
        affects: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const svc = await serviceFor(id);
    return { stressor: await svc!.addStressor(body) };
  });

  app.patch("/api/projects/:id/stressors/:sid", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const { sid } = req.params as { sid: string };
    const patch = z
      .object({
        name: z.string().optional(),
        category: z.string().optional(),
        novelty: z.number().int().min(1).max(5).optional(),
        description: z.string().optional(),
        horizon: z.enum(["now", "1y", "5y"]).optional(),
      })
      .parse(req.body);
    const svc = await serviceFor(id);
    await svc!.updateStressor(sid, patch);
    return { ok: true };
  });

  app.delete("/api/projects/:id/stressors/:sid", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const { sid } = req.params as { sid: string };
    const svc = await serviceFor(id);
    await svc!.deleteStressor(sid);
    return { ok: true };
  });

  app.put("/api/projects/:id/affects", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z.object({ stressorId: z.string(), componentId: z.string(), on: z.boolean() }).parse(req.body);
    const svc = await serviceFor(id);
    await svc!.setAffects(body.stressorId, body.componentId, body.on);
    return { ok: true };
  });

  // ---- Residues / attractors / couplings ----
  app.get("/api/projects/:id/residues", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    const svc = await serviceFor(id);
    return { residues: await svc!.listResidues(), attractors: await listAttractors(id) };
  });

  app.post("/api/projects/:id/couplings", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z
      .object({ fromResidue: z.string(), toResidue: z.string(), weight: z.number().min(0).max(1), reason: z.string() })
      .parse(req.body);
    await setCoupling(id, body);
    broadcastChange(id, ["residues", "metrics"]);
    return { ok: true };
  });

  // ---- Scenarios ----
  app.get("/api/projects/:id/scenarios", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    return { scenarios: await listScenarios(id) };
  });

  app.post("/api/projects/:id/scenarios", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const body = z.object({ name: z.string().min(1), enabledStressorIds: z.array(z.string()) }).parse(req.body);
    const scenario = await createScenario({ projectId: id, ...body });
    broadcastChange(id, ["scenarios"]);
    return { scenario };
  });

  app.patch("/api/projects/:id/scenarios/:scid", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const { scid } = req.params as { scid: string };
    const patch = z.object({ name: z.string().optional(), enabledStressorIds: z.array(z.string()).optional() }).parse(req.body);
    const scenario = await updateScenario(id, scid, patch);
    broadcastChange(id, ["scenarios"]);
    return { scenario };
  });

  app.delete("/api/projects/:id/scenarios/:scid", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const { scid } = req.params as { scid: string };
    await deleteScenario(id, scid);
    broadcastChange(id, ["scenarios"]);
    return { ok: true };
  });

  // ---- Metrics (live risk view) ----
  app.get("/api/projects/:id/metrics", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    const q = req.query as { enabled?: string };
    const enabled = q.enabled ? q.enabled.split(",").filter(Boolean) : undefined;
    const svc = await serviceFor(id);
    return { metrics: await svc!.getMetrics(enabled) };
  });

  // ---- Import / export / seed ----
  app.get("/api/projects/:id/export", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "viewer");
    if (!id) return;
    const svc = await serviceFor(id);
    return await svc!.exportState();
  });

  app.post("/api/projects/:id/import", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const state = stateSchema.parse((req.body as { state: unknown }).state);
    await importState(id, state);
    await touchProject(id, new Date().toISOString());
    broadcastChange(id, ["architecture", "stressors", "residues", "metrics"]);
    return { ok: true };
  });

  app.post("/api/projects/:id/seed", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "editor");
    if (!id) return;
    const result = await seedEvCharging(id);
    await touchProject(id, new Date().toISOString());
    broadcastChange(id, ["architecture", "stressors", "residues", "metrics"]);
    return { seeded: result };
  });

  // ---- MCP tokens ----
  app.get("/api/projects/:id/tokens", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "owner");
    if (!id) return;
    return { tokens: await listApiTokens(id) };
  });

  app.post("/api/projects/:id/tokens", { preHandler: authenticate }, async (req, reply) => {
    const id = await guard(req, reply, "owner");
    if (!id) return;
    const { label } = z.object({ label: z.string().min(1) }).parse(req.body);
    const { token, hash } = generateApiToken();
    await createApiToken({ projectId: id, hash, label, createdBy: req.userId!, createdAt: new Date().toISOString() });
    return { token, label }; // token shown once
  });

  // ---- AI (BYOK) endpoints, SSE-streamed progress ----
  async function aiEndpoint(
    req: FastifyRequest,
    reply: FastifyReply,
    run: (svc: ApiResidualityService) => Promise<unknown>,
  ) {
    const { id } = req.params as { id: string };
    const role = await requireRole(req, reply, id, "editor");
    if (!role) return;
    // Prefer the requesting user's own key.
    const userClient = await llmClientForUser(req.userId!, cfg);
    const project = await getProject(id);
    if (!project) return reply.code(404).send({ error: "not found" });
    const svc = new ApiResidualityService(
      id,
      project.name,
      cfg,
      (resources) => broadcastChange(id, resources),
      userClient ?? undefined,
    );
    const sse = startSse(reply);
    sse.send("status", { state: "working" });
    try {
      const result = await run(svc);
      sse.send("result", result);
    } catch (e) {
      sse.send("error", { message: e instanceof Error ? e.message : String(e) });
    } finally {
      sse.close();
    }
  }

  app.post("/api/projects/:id/ai/generate-stressors", { preHandler: authenticate }, async (req, reply) => {
    const body = z.object({ count: z.number().int().min(1).max(60).default(30), focus: z.array(z.string()).default([]) }).parse(req.body ?? {});
    await aiEndpoint(req, reply, (svc) => svc.generateStressors(body.count, body.focus));
  });

  app.post("/api/projects/:id/ai/derive-residue", { preHandler: authenticate }, async (req, reply) => {
    const body = z.object({ stressorId: z.string() }).parse(req.body);
    await aiEndpoint(req, reply, (svc) => svc.deriveResidue(body.stressorId));
  });

  app.post("/api/projects/:id/ai/modify-architecture", { preHandler: authenticate }, async (req, reply) => {
    const body = z.object({ instruction: z.string().min(1) }).parse(req.body);
    await aiEndpoint(req, reply, (svc) => svc.modifyArchitecture(body.instruction));
  });

  // ---- MCP server (per-project bearer token) ----
  app.post("/mcp", async (req, reply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const resolved = token ? await resolveApiToken(hashToken(token)) : null;
    if (!resolved) {
      return reply.code(401).send({ error: "invalid MCP token" });
    }
    const svc = await serviceFor(resolved.projectId);
    if (!svc) return reply.code(404).send({ error: "project not found" });
    reply.hijack();
    await handleMcpRequest(svc, req.raw, reply.raw, req.body);
  });

  // ---- WebSocket (live collaboration) ----
  app.get("/ws", { websocket: true }, (socket, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    const projectId = url.searchParams.get("projectId");
    const userId = token ? verifyJwt(token, cfg.jwtSecret) : null;
    if (!userId || !projectId) {
      socket.close(1008, "unauthorized");
      return;
    }
    // Membership check (async) before joining.
    void requireMembership(projectId, userId).then((ok) => {
      if (!ok) {
        socket.close(1008, "forbidden");
        return;
      }
      joinRoom(projectId, socket);
      socket.on("close", () => leaveRoom(projectId, socket));
    });
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}

async function requireMembership(projectId: string, userId: string): Promise<boolean> {
  const { getMemberRole } = await import("@residuality/db");
  return (await getMemberRole(projectId, userId)) != null;
}
