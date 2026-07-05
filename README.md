# Residuality — collaborative architecture stress lab

Open-source, self-hostable tool for **[Residuality Theory](https://leanpub.com/residuality)** (Barry O'Reilly). Model your software architecture, throw a diverse set of **stressors** at it, and **toggle them on and off to watch your resilience risk recompute live** — which components light up, how coupled the system is, whether it sits *frozen*, at the *edge of chaos*, or *chaotic*, and how well your **residues** cover the risk.

Backed by **Neo4j** (the incidence matrix *is* a graph). Bring your own LLM key (**BYOK**) to have Claude generate stressors, derive residues, and edit the architecture — or drive the whole thing from **Claude Code / Claude Desktop via the built-in MCP server**. Teams collaborate on multiple architectures with live updates.

```bash
git clone <your-fork-url> residuality-app && cd residuality-app
cp .env.example .env
# set a real APP_ENCRYPTION_KEY:  openssl rand -hex 32
docker compose up --build
# → web UI at http://localhost:8080   ·   Neo4j browser at http://localhost:7474
```

Register an account, create a project, click **Seed EV demo** to load the gold EV-charging example, open the **Matrix** tab, and start toggling stressors.

---

## Why this exists

You cannot predict the future, so requirements-gathering can only get you so far. Residuality Theory says: take a **naive architecture** (what you'd draw on a whiteboard), stress it against deliberately diverse and unexpected events, see the bad business states it drifts into (**attractors**), and add the *smallest* changes that survive them (**residues**). The residues, stacked together, are your resilient architecture. Analyzing which stressors hit which components surfaces hidden **coupling** and tells you whether you're near the **critical point** (the edge of chaos) — the sweet spot between rigid and cascading.

This app turns that method into a shared, interactive, always-live surface for risk management.

### Glossary

| Term | Meaning |
|---|---|
| **Naive architecture** | The pre-stress design; the happy path, honest about its assumptions. |
| **Stressor** | Any external event that perturbs the system — technical, regulatory, market, human, adversarial, environmental, supply-chain, scale, time. Diversity is the point. |
| **Attractor** | The *business* state the system drifts into under a stressor if you do nothing. |
| **Residue** | The minimal architectural change that lets the business survive an attractor. |
| **Incidence matrix** | Stressor × component: a cell is "1" if the stressor hits the component. Rows/columns reveal blast radius and criticality. |
| **Coupling (K)** | Two components are coupled if a single stressor hits both. Average coupling per component; high K → chaotic, low K → frozen. |
| **Criticality / edge of chaos** | The regime the system sits in: `frozen` (rigid), `edge` (adaptive — the target), `chaotic` (cascading). |
| **Residual index** | How many more stressors the residual architecture survives vs the naive one. |

## Features

- **Interactive incidence matrix** — the centerpiece. Rows = stressors, columns = components. Toggle a stressor and every metric recomputes live: per-component criticality (heat), coupling K, regime, residual index, hotspots.
- **Live architecture graph** — nodes sized/coloured by live criticality; hotspots in red.
- **BYOK AI actions** — with your own Anthropic key: generate a diverse stressor set (all 9 categories + black swans), derive the attractor + minimal residue for any stressor, and edit the architecture from a natural-language instruction.
- **MCP server** — drive the exact same operations from Claude Code / Desktop; changes appear live in the web UI.
- **Multi-user collaboration** — email/password auth, project membership roles (owner/editor/viewer), WebSocket live updates.
- **Skill-compatible** — import/export the residuality skill's `state.json`; the compute engine is a faithful, unit-tested port of the skill's Python scripts (parity-verified against fixtures whose oracle sections were computed by the skill's own scripts).
- **One-command deploy** — `docker compose up` brings up Neo4j + API + web.

## Using the MCP server (Claude Code)

In the web app: open a project → **Settings** → **MCP server access** → *Create token* (shown once). Then:

```bash
claude mcp add residuality --transport http \
  http://localhost:8080/mcp \
  --header "Authorization: Bearer <token>"
```

Claude can now call `get_architecture`, `add_stressor`, `set_affects`, `generate_stressors`, `derive_residue`, `get_metrics`, `export_state`, and more. AI-backed tools use the project owner's stored BYOK key.

## BYOK

Add your Anthropic API key under a project's **Settings**. It's encrypted at rest (AES-256-GCM using `APP_ENCRYPTION_KEY`) and never returned to the browser. Default model is `claude-opus-4-8`; `claude-sonnet-4-6` and `claude-haiku-4-5` are also selectable.

## Architecture

```
apps/
  api/    Fastify — REST + SSE + WebSocket + mounted MCP endpoint (/mcp)
  web/    React + Vite — matrix, graph, metrics, stressor board, settings
packages/
  core/   Zod schema + compute engine (criticality, contagion, incidence) — port of the skill, unit-tested for parity
  db/     Neo4j driver, constraints, Cypher queries, EV seed
  llm/    Provider-agnostic Claude client + ported skill prompts
  mcp/    MCP server + tools
```

**Graph model (Neo4j):** `Project → Architecture → Component`; `Project → Stressor`; `(Stressor)-[:AFFECTS]->(Component)` (the incidence matrix); `(Stressor)-[:PRODUCES]->(Residue)-[:INTEGRATED_INTO]->(Architecture)`; `(Residue)-[:COUPLED_WITH]->(Residue)`.

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test          # core parity tests against the gold fixtures

# Run against a local Neo4j (docker run -p 7687:7687 -e NEO4J_AUTH=neo4j/residuality neo4j:5.26):
pnpm dev:api          # API on :4000 (set NEO4J_URI / JWT_SECRET / APP_ENCRYPTION_KEY)
pnpm dev:web          # Vite on :5173, proxying /api → :4099 (edit vite.config.ts for your API port)
```

## License

Apache-2.0 — see [LICENSE](./LICENSE). Residuality Theory is the work of Barry M. O'Reilly; this project is an independent open-source implementation.
