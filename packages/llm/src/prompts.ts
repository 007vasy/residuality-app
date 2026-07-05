/**
 * Prompt builders ported from the residuality skill's references/prompt_templates.md
 * (Blocks A/B/C/D) and its theory primer. They encode the skill's inviolable rules:
 * business-first stressors/attractors, diverse categories + black swans, and minimal
 * residues that cite real stack facts.
 */
import { STRESSOR_CATEGORY_META } from "@stressforge/core";

export interface ArchInput {
  summary: string;
  businessContext?: string;
  components: { id: string; name: string; kind: string; responsibilities?: string[]; techAssumptions?: string[] }[];
  edges: { from: string; to: string; kind: string }[];
}

export function renderArchitecture(arch: ArchInput): string {
  const comps = arch.components
    .map(
      (c) =>
        `  ${c.id} "${c.name}" [${c.kind}]${c.responsibilities?.length ? ` — ${c.responsibilities.join("; ")}` : ""}`,
    )
    .join("\n");
  const edges = arch.edges.map((e) => `  ${e.from} --${e.kind}--> ${e.to}`).join("\n");
  return `SUMMARY: ${arch.summary}\n${arch.businessContext ? `BUSINESS CONTEXT: ${arch.businessContext}\n` : ""}COMPONENTS:\n${comps || "  (none)"}\nEDGES:\n${edges || "  (none)"}`;
}

const CATEGORY_LIST = STRESSOR_CATEGORY_META.map((c) => `- ${c.id}: ${c.label}`).join("\n");

export function stressorGenerationPrompt(args: {
  arch: ArchInput;
  userStackFacts: string[];
  existingStressorNames: string[];
  focus: string[];
  count: number;
}): string {
  const { arch, userStackFacts, existingStressorNames, focus, count } = args;
  return `You are running a resilience stress-simulation of a software architecture (public complexity-science techniques: stressor simulation, incidence matrices, coupling analysis). Generate a DIVERSE set of stressors for the architecture below. A stressor is any external event that perturbs the system — technical, regulatory, market, human, adversarial, environmental, supply-chain, scale, or time-related. The point is diversity and unexpectedness, described from the BUSINESS side (readable by a non-engineer), never pure tech jargon.

ARCHITECTURE:
${renderArchitecture(arch)}

CONFIRMED TECH STACK FACTS:
${userStackFacts.length ? userStackFacts.map((f) => `- ${f}`).join("\n") : "- (none provided)"}

CATEGORIES (each stressor must use exactly one id):
${CATEGORY_LIST}
${focus.length ? `\nFOCUS AREAS (weight these categories more heavily, but never below the floors): ${focus.join(", ")}` : ""}

RULES:
- Generate ${count} NEW stressors. Cover ALL nine categories. Aim for average novelty >= 3.0 and include at least 3 "black swan" stressors (novelty = 5, genuinely surprising/absurd-but-plausible).
- novelty is an integer 1..5. horizon is one of: now, 1y, 5y.
- Each stressor names which components it would directly hit, by component id (from the list above).
- Do NOT repeat these existing stressor names: ${existingStressorNames.join(", ") || "(none)"}.

Return ONLY a JSON array, no prose, of objects with EXACTLY these fields:
[{"name": string, "category": one-of-the-category-ids, "novelty": 1-5, "description": string (business consequence), "horizon": "now"|"1y"|"5y", "affects": [componentId, ...]}]`;
}

export function attractorResiduePrompt(args: {
  arch: ArchInput;
  userStackFacts: string[];
  stressor: { id: string; name: string; category: string; description: string };
}): string {
  const { arch, userStackFacts, stressor } = args;
  return `You are running a resilience stress-simulation. For the single stressor below, first derive the ATTRACTOR (the business state the system drifts into if you do NOTHING — described in business language, not tech), then the smallest RESILIENT ELEMENT / residue (the minimal architectural change that lets the business survive that attractor).

ARCHITECTURE:
${renderArchitecture(arch)}

CONFIRMED TECH STACK FACTS (every residue MUST cite at least one):
${userStackFacts.length ? userStackFacts.map((f) => `- ${f}`).join("\n") : "- (none provided — if you cannot cite a real fact, say so in intent)"}

STRESSOR ${stressor.id} [${stressor.category}]: ${stressor.name}
${stressor.description}

RULES:
- The attractor is a BUSINESS state ("we double-charge customers", not "the DB fails"). Include why_system_drifts_here (the failing assumption / missing fallback / feedback loop).
- The residue is MINIMAL: 1-3 sentences, an obvious implementation hint. If it requires REPLACING a component, you have written another attractor — go smaller.
- stack_fit_citations must reference the confirmed tech facts the residue is compatible with (at least one).
- estimated_cost is one of: low, med, high.

Return ONLY a JSON object, no prose, with EXACTLY:
{"attractor": {"name": string, "description": string, "why_system_drifts_here": string},
 "residue": {"name": string, "intent": string, "minimal_change_description": string, "stack_fit_citations": [string, ...], "estimated_cost": "low"|"med"|"high", "source_pattern": string|null}}`;
}

export function architectureEditPrompt(args: { arch: ArchInput; instruction: string }): string {
  const { arch, instruction } = args;
  return `You are editing a software architecture for a resilience stress-simulation. Apply the user's instruction and return the components/edges to ADD (new C-ids will be assigned by the system, so reference new components by name in edges). Keep changes minimal and consistent with the existing design.

CURRENT ARCHITECTURE:
${renderArchitecture(arch)}

INSTRUCTION:
${instruction}

Component kinds: service, datastore, queue, client, external, human, device, edge.
Edge kinds: sync, async, data, human, device.

Return ONLY a JSON object, no prose, with EXACTLY:
{"summary": string (updated one-line summary, or the same if unchanged),
 "add_components": [{"name": string, "kind": kind, "responsibilities": [string], "tech_assumptions": [string]}],
 "add_edges": [{"from": string (existing component id OR a new component name), "to": string, "kind": kind}],
 "notes": string (what you changed and why, one or two sentences)}`;
}
