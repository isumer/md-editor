// Two prime rounds agree when the slower is at most this much slower than the faster.
export const PRIME_STEADY_RATIO = 1.25;

export function isSteady(previousMs: number, currentMs: number): boolean {
  return Math.max(previousMs, currentMs) <= Math.min(previousMs, currentMs) * PRIME_STEADY_RATIO;
}
