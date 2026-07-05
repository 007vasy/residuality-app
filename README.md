# StressForge — Resilient Architecture & Risk Simulator

Open-source, self-hostable tool to **stress-test software architectures**. Model your system as components, throw a diverse set of **stressors** at it, and **toggle them on and off to watch your resilience risk recompute live** — which components light up, how coupled the system is (K), whether it sits *frozen*, at the *edge of chaos*, or *chaotic*, a single **Resilience Score**, and how well your **resilient elements** (mitigations) cover the risk.

Backed by **Neo4j** (an incidence matrix is naturally a graph). Bring your own LLM key (**BYOK**) to have an AI assistant generate stressors, derive mitigations, and edit the architecture — or drive the whole thing from **Claude Code / Claude Desktop via the built-in MCP server**. Teams collaborate on multiple architectures with live updates.

```bash
git clone <your-fork-url> stressforge && cd stressforge
cp .env.example .env
# set a real APP_ENCRYPTION_KEY:  openssl rand -hex 32
docker compose up --build
# → web UI at http://localhost:8080   ·   Neo4j browser at http://localhost:7474
```

Register an account, create a project, click **Seed demo** to load an example, open the **Matrix** tab, and start toggling stressors.

---

## Public-only foundation

StressForge is an **original** tool — original UI, code, naming, and flow. Its *method* digitises ideas that are **publicly documented** in complexity science and software-architecture research:

- **Incidence / adjacency matrices** and their row/column analysis
- **Kauffman-style coupling and criticality** (the NKP model; average coupling `K`; the "edge of chaos")
- **Attractors** and network dynamics
- **Stressor simulation** (random simulation of environmental perturbations) and **contagion / coupling analysis**
- **Naive vs. resilient** architecture comparison and an empirical **hold-out** test

The concrete public sources are listed in [`PUBLIC-SOURCES.md`](./PUBLIC-SOURCES.md), the most accessible being B. O'Reilly, *["An Introduction to Residuality Theory," Procedia CS 170 (2020)](https://www.sciencedirect.com/science/article/pii/S1877050920305585)*.

**What StressForge deliberately does NOT do:** it does not reproduce text, diagrams, private examples, or philosophical material that appears only in paid books or workshops. All bundled examples are generic or of the publicly-shared "coupon banner" / "car-charging" style. See the [Public-Only Policy in CONTRIBUTING.md](./CONTRIBUTING.md#public-only-policy).

> This project is inspired by public research; it is not affiliated with or endorsed by any author or company. "Residuality" is not used as the product name or in-app terminology — only as an academic citation.

## Glossary (generic terminology used in-app)

| Term | Meaning |
|---|---|
| **Component** | A part of your architecture (service, datastore, client, device, external, …). |
| **Stressor** | Any external event that could perturb the system — technical, regulatory, market, human, adversarial, environmental, supply-chain, scale, time. Diversity is the point. |
| **Attractor** | The *business* state the system drifts into under a stressor if you do nothing. |
| **Resilient element** (residue) | The minimal architectural change that lets the business survive an attractor. |
| **Incidence matrix** | Stressor × component: a cell is "1" if the stressor hits the component. Rows/columns reveal blast radius and criticality. |
| **Coupling (K)** | Two components are coupled if a single stressor hits both. Average coupling per component; high K → chaotic, low K → frozen. |
| **Criticality / edge of chaos** | The regime the system sits in: `frozen` (rigid), `edge` (adaptive — the target), `chaotic` (cascading). |
| **Resilience Score** | A single 0–100 roll-up of coverage, regime, and coupling for at-a-glance risk. |

## Features

- **Interactive incidence matrix** — the centerpiece. Toggle a stressor and every metric recomputes live: per-component criticality (heat), coupling K, regime, Resilience Score, coverage.
- **Live architecture graph** — nodes sized/coloured by live criticality; hotspots highlighted.
- **BYOK AI actions** — with your own key: generate a diverse stressor set (incl. "suggest wild stressors"), derive the attractor + minimal resilient element for any stressor, and edit the architecture from a natural-language instruction.
- **MCP server** — drive the same operations from Claude Code / Desktop; changes appear live in the web UI.
- **Multi-user collaboration** — email/password auth, project roles (owner/editor/viewer), WebSocket live updates.
- **Portable analysis JSON** import/export.
- **One-command deploy** — `docker compose up` brings up Neo4j + API + web.

## Using the MCP server (Claude Code)

Open a project → **Settings** → **MCP server access** → *Create token* (shown once). Then:

```bash
claude mcp add stressforge --transport http \
  http://localhost:8080/mcp \
  --header "Authorization: Bearer <token>"
```

## BYOK

Add your Anthropic API key under a project's **Settings**. It's encrypted at rest (AES-256-GCM using `APP_ENCRYPTION_KEY`) and never returned to the browser.

## Architecture

```
apps/
  api/    Fastify — REST + SSE + WebSocket + mounted MCP endpoint (/mcp)
  web/    React + Vite — matrix, graph, metrics, stressor board, settings
packages/
  core/   Zod schema + compute engine (criticality, contagion, incidence), unit-tested for parity
  db/     Neo4j driver, constraints, Cypher queries, demo seed
  llm/    Provider-agnostic Claude client + prompts
  mcp/    MCP server + tools
```

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the local Neo4j and dev-server instructions — and the Public-Only Policy every contribution must follow.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
