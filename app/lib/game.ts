import { HttpError } from "./http";

export type QType = "mcq" | "multi" | "poll" | "fill" | "open";
export type Q = {
  type: QType;
  prompt: string;
  image_url: string | null;
  options: string[];
  correct: (number | string)[];
  points: number;
  time_limit_s: number;
};
export type PublicQ = Omit<Q, "correct">;

export const publicQ = ({ correct: _c, ...rest }: Q): PublicQ => rest;

const TYPES: QType[] = ["mcq", "multi", "poll", "fill", "open"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

export function parseQuestion(raw: unknown, n: number): Q {
  const r = (raw ?? {}) as Record<string, unknown>;
  const at = `Question ${n + 1}`;
  const type = r.type as QType;
  if (!TYPES.includes(type)) throw new HttpError(400, `${at}: unknown type`);
  const prompt = str(r.prompt, 1000);
  if (!prompt) throw new HttpError(400, `${at}: write the question`);
  const image = str(r.image_url, 500);
  if (image && !/^https:\/\//i.test(image)) throw new HttpError(400, `${at}: image must be an https link`);
  const q: Q = {
    type,
    prompt,
    image_url: image || null,
    options: [],
    correct: [],
    points: int(r.points, 0, 10000, 1000),
    time_limit_s: int(r.time_limit_s, 5, 300, 20),
  };
  if (type === "mcq" || type === "multi" || type === "poll") {
    const opts = Array.isArray(r.options) ? r.options.map((o) => str(o, 200)) : [];
    if (opts.length < 2 || opts.length > 6 || opts.some((o) => !o)) {
      throw new HttpError(400, `${at}: give 2 to 6 answers, none empty`);
    }
    q.options = opts;
    if (type !== "poll") {
      const c = Array.isArray(r.correct) ? r.correct : [];
      const idx = [...new Set(c.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < opts.length))].sort();
      if (idx.length === 0 || (type === "mcq" && idx.length !== 1)) {
        throw new HttpError(400, `${at}: mark ${type === "mcq" ? "exactly one" : "at least one"} correct answer`);
      }
      q.correct = idx;
    }
  } else if (type === "fill") {
    const c = Array.isArray(r.correct) ? r.correct.map((x) => str(x, 200)).filter(Boolean) : [];
    if (c.length === 0) throw new HttpError(400, `${at}: add at least one accepted answer`);
    q.correct = c.slice(0, 20);
  }
  return q;
}

export function parseQuiz(b: Record<string, unknown>) {
  const title = str(b.title, 200);
  if (!title) throw new HttpError(400, "Give the quiz a title");
  const list = Array.isArray(b.questions) ? b.questions : [];
  if (list.length === 0) throw new HttpError(400, "Add at least one question");
  if (list.length > 100) throw new HttpError(400, "At most 100 questions");
  return { title, subject: str(b.subject, 100), questions: list.map(parseQuestion) };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Returns the stored answer and whether it was right (null = not scored). Throws 400 on a bad shape.
export function grade(q: Q, answer: unknown): { stored: number | number[] | string; correct: boolean | null } {
  const bad = () => new HttpError(400, "Invalid answer");
  const inRange = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < q.options.length;
  switch (q.type) {
    case "mcq":
      if (!inRange(answer)) throw bad();
      return { stored: answer, correct: q.correct[0] === answer };
    case "poll":
      if (!inRange(answer)) throw bad();
      return { stored: answer, correct: null };
    case "multi": {
      if (!Array.isArray(answer) || answer.length === 0 || !answer.every(inRange)) throw bad();
      const a = [...new Set(answer)].sort();
      return { stored: a, correct: a.length === q.correct.length && a.every((v, i) => v === q.correct[i]) };
    }
    case "fill": {
      if (typeof answer !== "string" || !answer.trim() || answer.length > 200) throw bad();
      return { stored: answer.trim(), correct: (q.correct as string[]).some((c) => norm(c) === norm(answer)) };
    }
    case "open":
      if (typeof answer !== "string" || !answer.trim() || answer.length > 500) throw bad();
      return { stored: answer.trim(), correct: null };
  }
}

// Full points for an instant answer, down to half for the last second.
export function score(q: Q, correct: boolean | null, elapsedMs: number): number {
  if (!correct) return 0;
  const frac = Math.max(0, 1 - elapsedMs / (q.time_limit_s * 1000));
  return Math.round(q.points * (0.5 + 0.5 * frac));
}

export const GRACE_MS = 2000;
export const timedOut = (q: Q, elapsedMs: number) => elapsedMs > q.time_limit_s * 1000 + GRACE_MS;
