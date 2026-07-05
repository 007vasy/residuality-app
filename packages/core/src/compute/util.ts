/**
 * Numeric helpers chosen for parity with the skill's Python scripts.
 *
 * Python's built-in round() uses banker's rounding (round-half-to-even). To keep
 * the TS compute engine bit-for-bit comparable with the reference fixtures, we
 * replicate that behaviour instead of using Math.round (round-half-up).
 */
export function pyRound(value: number, ndigits = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, ndigits);
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const eps = 1e-9;
  let rounded: number;
  if (Math.abs(diff - 0.5) < eps) {
    // Exact-ish tie: round to even.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / factor;
}

/** Linear-interpolated percentile matching contagion_matrix.percentile(). */
export function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const k = (sorted.length - 1) * (pct / 100);
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sorted[f]!;
  return sorted[f]! + (sorted[c]! - sorted[f]!) * (k - f);
}

/** Levenshtein edit distance (iterative, matches residue_dedupe.levenshtein). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i, ...new Array<number>(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      const ins = curr[j - 1]! + 1;
      const del = prev[j]! + 1;
      const sub = prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      curr[j] = Math.min(ins, del, sub);
    }
    prev = curr;
  }
  return prev[prev.length - 1]!;
}
