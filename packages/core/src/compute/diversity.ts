/**
 * Stressor diversity check — TS port of scripts/stressor_diversity_check.py.
 */
import type { Stressor } from "../schema.js";
import {
  BLACK_SWAN_FLOOR,
  BORING_SCORE_THRESHOLD,
  NOVELTY_AVERAGE_FLOOR,
  STRESSOR_CATEGORY_META,
} from "../stressor-categories.js";
import { pyRound } from "./util.js";

export interface DiversityReport {
  stressor_count: number;
  category_coverage: Record<string, number>;
  missing_categories: string[];
  boring_score: number;
  boring_score_threshold: number;
  novelty_average: number;
  novelty_average_floor: number;
  black_swan_count: number;
  black_swan_floor: number;
  suggestions: string[];
  passes: boolean;
}

function boringScore(stressors: Pick<Stressor, "novelty">[], coverage: Record<string, number>): number {
  if (stressors.length === 0) return 1.0;
  const noveltyAvg = stressors.reduce((a, s) => a + (s.novelty ?? 1), 0) / stressors.length;
  const noveltyTerm = Math.max(0, (NOVELTY_AVERAGE_FLOOR - noveltyAvg) / NOVELTY_AVERAGE_FLOOR);
  const catsBelow = STRESSOR_CATEGORY_META.filter((m) => (coverage[m.id] ?? 0) < m.min_count).length;
  const catTerm = catsBelow / Math.max(1, STRESSOR_CATEGORY_META.length);
  return pyRound(0.5 * noveltyTerm + 0.5 * catTerm, 4);
}

export function checkDiversity(stressors: Stressor[]): DiversityReport {
  const coverage: Record<string, number> = {};
  for (const m of STRESSOR_CATEGORY_META) coverage[m.id] = 0;
  for (const s of stressors) {
    const cat = s.category ?? "<unknown>";
    coverage[cat] = (coverage[cat] ?? 0) + 1;
  }

  const missing = STRESSOR_CATEGORY_META.filter((m) => (coverage[m.id] ?? 0) < m.min_count).map((m) => m.id);
  const noveltyAvg = pyRound(
    stressors.reduce((a, s) => a + (s.novelty ?? 1), 0) / Math.max(1, stressors.length),
    3,
  );
  const blackSwan = stressors.filter((s) => (s.novelty ?? 0) === 5).length;
  const score = boringScore(stressors, coverage);

  const suggestions: string[] = [];
  for (const cid of missing) {
    const meta = STRESSOR_CATEGORY_META.find((m) => m.id === cid)!;
    const gap = meta.min_count - (coverage[cid] ?? 0);
    const sample = meta.examples.slice(0, 2).join("; ");
    suggestions.push(`add ${gap} more '${cid}' stressor(s); inspiration: ${sample}`);
  }
  if (noveltyAvg < NOVELTY_AVERAGE_FLOOR) {
    suggestions.push(`average novelty ${noveltyAvg} is below floor; add stressors with novelty 4-5`);
  }
  if (blackSwan < BLACK_SWAN_FLOOR) {
    suggestions.push(`only ${blackSwan} novelty-5 (black-swan) stressors; floor is ${BLACK_SWAN_FLOOR}`);
  }
  if (stressors.length < 30) {
    suggestions.push(`only ${stressors.length} stressors; aim for 30+ for a serious analysis`);
  }

  return {
    stressor_count: stressors.length,
    category_coverage: coverage,
    missing_categories: missing,
    boring_score: score,
    boring_score_threshold: BORING_SCORE_THRESHOLD,
    novelty_average: noveltyAvg,
    novelty_average_floor: NOVELTY_AVERAGE_FLOOR,
    black_swan_count: blackSwan,
    black_swan_floor: BLACK_SWAN_FLOOR,
    suggestions,
    passes: missing.length === 0 && score <= BORING_SCORE_THRESHOLD && blackSwan >= BLACK_SWAN_FLOOR,
  };
}
