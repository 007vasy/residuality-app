# Contributing

Thanks for your interest in improving StressForge!

## Public-Only Policy

**Every contribution must follow this policy.** StressForge is an original tool whose method is drawn **only** from publicly available material (see [`PUBLIC-SOURCES.md`](./PUBLIC-SOURCES.md)):

- You may use concepts, steps, terminology, and examples that are already public: the open ScienceDirect papers (2020+), public conference decks (e.g. Jfokus 2022), public YouTube talks, Eric Normand's Substack summary (matrix process, coupon-banner example), and general complexity science (Kauffman NK networks, attractors, NKP, incidence matrices, contagion analysis).
- **Do not** reproduce verbatim text, specific private examples, diagrams, phrasing, or the deeper philosophical sections that appear **only** in the paid Leanpub book *"Residues"* or in paid workshops.
- **When unsure whether something is public, default to "do not include"** — replace it with a generic or original implementation.
- Keep the app original in UI, code, naming, and flow. Use the generic in-app vocabulary (Stressors, Resilient Elements / residues, Attractors, Stress Simulation, Resilience Score). Do **not** use "Residuality" as a product name or in marketing/UI copy — it appears only as an academic citation in About / `PUBLIC-SOURCES.md`.

PRs that add examples or copy must state their public source. Anything provenance-uncertain will be asked to be replaced with generic/original content.

## Getting set up

```bash
pnpm install
pnpm -r build
pnpm -r test
```

You need a Neo4j 5.x instance for the API. The quickest path is Docker:

```bash
docker run -d -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/stressforge neo4j:5.26
```

Then run the API and web dev servers (see the README → Development).

## Ground rules

- **The compute engine must stay faithful to the public method it implements.** `packages/core` is covered by parity tests against fixtures (`ev_charging`, `synthetic`) whose oracle sections were produced by an independent reference implementation of the public incidence-matrix / NKP algorithms. If you change an algorithm, update the tests and explain the divergence.
- **Type-check and test before opening a PR:** `pnpm -r typecheck && pnpm -r test`.
- Keep the graph model and the skill's `state.json` import/export round-trip working.
- Match the surrounding code style; no linter config is enforced yet.

## Good first issues

- Replace the SVG architecture view with a richer `react-flow` canvas (drag, edit).
- Add a Cypher/GDS-backed attractor clustering view (Louvain over the coupling graph).
- Add OpenAI / local-model providers behind the existing `LlmClient` interface.
- Scenario diffing (compare two enabled-stressor sets side by side).

## Reporting security issues

Please do not open public issues for security problems. Email the maintainers instead.
