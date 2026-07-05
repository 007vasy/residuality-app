import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { ProjectService } from "./service.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

/** Build an McpServer exposing the StressForge toolset over one project's service. */
export function createMcpServer(service: ProjectService): McpServer {
  const server = new McpServer({
    name: "stressforge",
    version: "0.1.0",
  });

  server.registerTool(
    "get_architecture",
    {
      title: "Get architecture",
      description: `Return the components and edges of project "${service.projectName}".`,
      inputSchema: {},
    },
    async () => json(await service.getArchitecture()),
  );

  server.registerTool(
    "list_stressors",
    { title: "List stressors", description: "List all stressors in the project.", inputSchema: {} },
    async () => json(await service.listStressors()),
  );

  server.registerTool(
    "list_residues",
    { title: "List residues", description: "List all residues in the project.", inputSchema: {} },
    async () => json(await service.listResidues()),
  );

  server.registerTool(
    "add_component",
    {
      title: "Add component",
      description: "Add a component to the architecture.",
      inputSchema: {
        name: z.string(),
        kind: z.enum(["service", "datastore", "queue", "client", "external", "human", "device", "edge"]),
        responsibilities: z.array(z.string()).optional(),
        techAssumptions: z.array(z.string()).optional(),
      },
    },
    async (args) => json(await service.addComponent(args)),
  );

  server.registerTool(
    "add_stressor",
    {
      title: "Add stressor",
      description: "Add a stressor. Optionally list component ids it affects (incidence matrix cells).",
      inputSchema: {
        name: z.string(),
        category: z.enum([
          "regulatory", "market", "tech", "human", "adversarial",
          "environmental", "supply-chain", "scale", "time",
        ]),
        novelty: z.number().int().min(1).max(5),
        description: z.string(),
        horizon: z.enum(["now", "1y", "5y"]).optional(),
        affects: z.array(z.string()).optional(),
      },
    },
    async (args) => json(await service.addStressor(args)),
  );

  server.registerTool(
    "update_stressor",
    {
      title: "Update stressor",
      description: "Update fields of a stressor by id (name, category, novelty, description, horizon).",
      inputSchema: {
        id: z.string(),
        patch: z.record(z.string(), z.any()),
      },
    },
    async ({ id, patch }) => {
      await service.updateStressor(id, patch);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "delete_stressor",
    {
      title: "Delete stressor",
      description: "Delete a stressor by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await service.deleteStressor(id);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "set_affects",
    {
      title: "Set incidence cell",
      description: "Turn the incidence-matrix cell (stressor affects component) on or off.",
      inputSchema: {
        stressorId: z.string(),
        componentId: z.string(),
        on: z.boolean(),
      },
    },
    async ({ stressorId, componentId, on }) => {
      await service.setAffects(stressorId, componentId, on);
      return json({ ok: true });
    },
  );

  server.registerTool(
    "modify_architecture",
    {
      title: "Modify architecture (AI)",
      description:
        "Use the project owner's BYOK key to rewrite/extend the architecture from a natural-language instruction.",
      inputSchema: { instruction: z.string() },
    },
    async ({ instruction }) => {
      try {
        return json(await service.modifyArchitecture(instruction));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "generate_stressors",
    {
      title: "Generate stressors (AI)",
      description:
        "Use the project owner's BYOK key to generate a diverse stressor set (all 9 categories, black swans) and persist it.",
      inputSchema: {
        count: z.number().int().min(1).max(60).optional(),
        focus: z.array(z.enum(["security", "cost", "regulatory", "performance", "safety"])).optional(),
      },
    },
    async ({ count, focus }) => {
      try {
        return json(await service.generateStressors(count ?? 30, focus ?? []));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "derive_residue",
    {
      title: "Derive residue (AI)",
      description:
        "Use the project owner's BYOK key to derive the attractor + minimal residue for one stressor and persist it.",
      inputSchema: { stressorId: z.string() },
    },
    async ({ stressorId }) => {
      try {
        return json(await service.deriveResidue(stressorId));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "get_metrics",
    {
      title: "Get risk metrics",
      description:
        "Compute the live incidence metrics (criticality, coupling K, regime, residual index). Optionally pass the enabled stressor ids for a scenario; omit for all-on.",
      inputSchema: { enabledStressorIds: z.array(z.string()).optional() },
    },
    async ({ enabledStressorIds }) => json(await service.getMetrics(enabledStressorIds)),
  );

  server.registerTool(
    "export_state",
    {
      title: "Export analysis JSON",
      description: "Export the project as a portable analysis JSON (architecture, stressors, residues, contagion, criticality).",
      inputSchema: {},
    },
    async () => json(await service.exportState()),
  );

  return server;
}

/**
 * Handle one MCP HTTP request in stateless mode (a fresh server+transport per
 * request). Wire this behind the API's per-project token auth at POST /mcp.
 */
export async function handleMcpRequest(
  service: ProjectService,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
): Promise<void> {
  const server = createMcpServer(service);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}
