import { createHash } from "node:crypto";

// Deterministic permutation of 0..n-1 from a seed, so a student sees the same order on every poll
// and the server can map their answers back without storing anything.
export function perm(n: number, seed: string): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const h = createHash("sha256").update(`${seed}:${i}`).digest();
    const j = h.readUInt32BE(0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
