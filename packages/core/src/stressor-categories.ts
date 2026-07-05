/**
 * Port of the skill's `assets/stressor_categories.json`.
 * Category floors and thresholds used by the diversity check.
 */
import type { StressorCategory } from "./schema.js";

export interface CategoryMeta {
  id: StressorCategory;
  label: string;
  min_count: number;
  examples: string[];
}

export const STRESSOR_CATEGORY_META: CategoryMeta[] = [
  {
    id: "regulatory",
    label: "Regulatory / legal",
    min_count: 2,
    examples: [
      "GDPR data-subject deletion mid-process",
      "new tax regime",
      "regulator mandates a billing model change",
      "export-control reclassification",
    ],
  },
  {
    id: "market",
    label: "Market / competitive",
    min_count: 1,
    examples: [
      "competitor undercuts price",
      "demand spike from viral campaign",
      "incumbent acquires your supplier",
    ],
  },
  {
    id: "tech",
    label: "Technical / infrastructure",
    min_count: 2,
    examples: [
      "region outage",
      "noisy-neighbour CPU starvation",
      "language runtime CVE",
      "schema migration deadlock",
    ],
  },
  {
    id: "human",
    label: "Human / organisational",
    min_count: 2,
    examples: [
      "operator runs the wrong script",
      "key engineer leaves",
      "support team can't reproduce a defect",
      "on-call paged at 3am misreads runbook",
    ],
  },
  {
    id: "adversarial",
    label: "Adversarial / abuse",
    min_count: 2,
    examples: [
      "credential stuffing",
      "fraudulent unlock attempt",
      "social-engineered support agent",
      "supply-chain dependency takeover",
    ],
  },
  {
    id: "environmental",
    label: "Physical / environmental",
    min_count: 1,
    examples: [
      "sub-zero temperature",
      "vandalism with foreign object",
      "lightning strike on cellular tower",
      "sticker peels off in rain",
    ],
  },
  {
    id: "supply-chain",
    label: "Supply chain / vendor",
    min_count: 1,
    examples: [
      "payment processor down",
      "SaaS vendor changes pricing 10x",
      "open-source maintainer abandons project",
    ],
  },
  {
    id: "scale",
    label: "Scale / load",
    min_count: 2,
    examples: [
      "queue contention at peak",
      "tenant 100x larger than median",
      "long-tail latency tail blows SLO",
      "fan-out blowup",
    ],
  },
  {
    id: "time",
    label: "Time / lifecycle",
    min_count: 1,
    examples: [
      "leap-second event",
      "DST transition",
      "5y data accretion makes a query unviable",
      "domain expires",
    ],
  },
];

export const BORING_SCORE_THRESHOLD = 0.6;
export const NOVELTY_AVERAGE_FLOOR = 3.0;
export const BLACK_SWAN_FLOOR = 3;
