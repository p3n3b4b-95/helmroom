import type { Q } from "./game";
import { perm } from "./shuffle";
import type { Settings } from "./settings";

type Who = { id: string; attempt: number };

// Student-paced games may give each student their own question order. Teacher-paced order is
// shared, so it is shuffled once into the snapshot when the game is created.
export function questionOrder(me: Who, total: number, st: Settings, teacherPaced: boolean): number[] {
  return !teacherPaced && st.shuffle_questions ? perm(total, `${me.id}:${me.attempt}:q`) : Array.from({ length: total }, (_, i) => i);
}

// displayed option position -> real option index
export function optionOrder(me: Who, realIndex: number, n: number, st: Settings): number[] {
  return st.shuffle_answers ? perm(n, `${me.id}:${me.attempt}:${realIndex}:o`) : Array.from({ length: n }, (_, i) => i);
}

const isIdx = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;

// answer as the student sent it (displayed positions) -> real indexes. Bad shapes pass through so grade() rejects them.
export function answerToReal(q: Q, answer: unknown, order: number[]): unknown {
  const n = q.options.length;
  if ((q.type === "mcq" || q.type === "poll") && isIdx(answer, n)) return order[answer];
  if (q.type === "multi" && Array.isArray(answer) && answer.every((x) => isIdx(x, n))) return answer.map((x) => order[x]);
  return answer;
}

// real indexes -> displayed positions, for showing a stored answer or the right answer back to the student
export function answerToShown(q: Q, real: unknown, order: number[]): unknown {
  if ((q.type === "mcq" || q.type === "poll") && typeof real === "number") return order.indexOf(real);
  if (q.type === "multi" && Array.isArray(real)) return real.map((x) => order.indexOf(x as number)).sort((a, b) => a - b);
  return real;
}

export function shownCorrect(q: Q, order: number[]): (number | string)[] {
  if (q.type === "mcq" || q.type === "multi") return (q.correct as number[]).map((i) => order.indexOf(i)).sort((a, b) => a - b);
  return q.correct;
}
