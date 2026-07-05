# Public Sources

StressForge digitises a resilience stress-testing method assembled **only** from publicly available material. This file records exactly what the app's concepts are based on, so any contributor can verify the Public-Only Policy (see [CONTRIBUTING.md](./CONTRIBUTING.md#public-only-policy)).

## Primary academic sources (open / abstract-accessible)

- B. O'Reilly, **"An Introduction to Residuality Theory: Software Design Heuristics for Complex Systems,"** *Procedia Computer Science* 170 (2020) 875–880. DOI [10.1016/j.procs.2020.03.145](https://doi.org/10.1016/j.procs.2020.03.145) · <https://www.sciencedirect.com/science/article/pii/S1877050920305585>
- B. O'Reilly, **"Residuality Theory, random simulation, and attractor networks,"** *Procedia Computer Science* 201 (2022) 476–483. DOI [10.1016/j.procs.2022.03.084](https://doi.org/10.1016/j.procs.2022.03.084) — incidence-matrix / NKP mechanics. Open manuscript: <https://oro.open.ac.uk/98044/1/98044.pdf>

## Public talks & slides

- Jfokus 2022 slide deck (PDF): <https://www.jfokus.se/jfokus22-preso/Residuality-Theory.pdf>
- Conference talks (NDC / GOTO), publicly on YouTube.

## Public practitioner summaries

- Eric Normand, "Residuality Theory" (Substack) — the worked incidence-matrix process and the public **coupon-banner** example, `K = total / N`, and the split/merge/decouple loop: <https://ericnormand.substack.com/p/residuality-theory>
- Architecture Weekly and InfoQ public write-ups (5-step process, residual index).

## Underlying general complexity science (public domain concepts)

- **Kauffman NK networks** — attractors, `N` (nodes) and `K` (average coupling).
- **Self-organized criticality / edge of chaos** — the stable ↔ chaotic boundary.
- **Incidence & adjacency matrices** — standard linear-algebra / graph constructs; row and column sums, coupling detection.
- **Antifragility** (Taleb) — surviving stress the system was not designed for.

## What is intentionally excluded

The app does **not** use, quote, paraphrase closely, or reproduce diagrams, private worked examples, exact prose, or the deeper philosophical sections that appear **only** in the paid Leanpub book *"Residues"* or in paid workshops. Where provenance of a specific example, phrasing, or numeric heuristic could not be confirmed as public, it was replaced with an original / generic implementation.

## Notes on original engineering in this repo

The following are **our own engineering choices** (original implementation), not claims about "the" method:

- The specific numeric thresholds for the criticality regime (frozen / edge / chaotic bands) and the constraint-density (`P`) formula.
- The 9-category stressor taxonomy with per-category minimums and the "diversity gate" (boring-score / black-swan floor).
- The category→component-kind affinity used to synthesise the demo incidence matrix.
- The single 0–100 **Resilience Score** roll-up.
- All UI, API, database schema, and MCP tooling.

These are provided under the repository's Apache-2.0 license as original work.

> Not legal advice. If you deploy StressForge commercially, obtain your own IP/legal review — this file documents good-faith sourcing, not a legal clearance.
