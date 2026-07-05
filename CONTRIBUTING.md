# Contributing

Thanks for your interest in improving the Residuality app!

## Getting set up

```bash
pnpm install
pnpm -r build
pnpm -r test
```

You need a Neo4j 5.x instance for the API. The quickest path is Docker:

```bash
docker run -d -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/residuality neo4j:5.26
```

Then run the API and web dev servers (see the README → Development).

## Ground rules

- **The compute engine must stay faithful to the residuality skill.** `packages/core` is a port of the skill's Python scripts and is covered by parity tests against the gold fixtures (`ev_charging`, `gstack`). If you change an algorithm, update the tests and explain the divergence.
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
