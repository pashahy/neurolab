import { round1 } from '../util/text.js';

export const pts = t => t.points ?? 1;

export function fraction(t, good, total) {
  return { score: total > 0 ? round1(pts(t) * good / total) : 0, max: pts(t) };
}

export const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
