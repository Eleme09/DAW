/**
 * Standard Pearson-style stereo phase correlation: +1 means L and R are
 * identical (mono-compatible), -1 means they're perfectly out of phase
 * (cancels to silence when summed to mono), 0 means uncorrelated. Same
 * definition every stereo correlation meter in commercial software uses.
 */
export function computeStereoCorrelation(left: ArrayLike<number>, right: ArrayLike<number>): number {
  const n = Math.min(left.length, right.length);
  if (n === 0) return 0;
  let sumLR = 0;
  let sumLL = 0;
  let sumRR = 0;
  for (let i = 0; i < n; i++) {
    const l = left[i];
    const r = right[i];
    sumLR += l * r;
    sumLL += l * l;
    sumRR += r * r;
  }
  const denom = Math.sqrt(sumLL * sumRR);
  if (denom <= 0) return sumLL === 0 && sumRR === 0 ? 1 : 0;
  return Math.min(1, Math.max(-1, sumLR / denom));
}
