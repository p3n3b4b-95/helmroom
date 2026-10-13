import { db } from "./db";
import { HttpError } from "./http";
import type { Q } from "./game";

export type SessionRow = {
  id: string;
  host_id: string;
  code: string;
  title: string;
  snapshot: Q[];
  kind: "live" | "homework";
  pacing: "teacher" | "student";
  mode: string;
  deadline: Date | null;
  attempts_allowed: number;
  status: "lobby" | "running" | "ended";
  current_index: number;
  question_started_at: Date | null;
  settings: unknown;
  created_at: Date;
  now: Date; // database clock, so every elapsed-time check uses one clock
};

export async function loadSession(id: string, hostId?: string): Promise<SessionRow> {
  const [s] = await db()<SessionRow[]>`select *, now() as now from game_sessions where id = ${id}`;
  if (!s || (hostId && s.host_id !== hostId)) throw new HttpError(404, "Session not found");
  return s;
}

export const isClosed = (s: SessionRow) =>
  s.status === "ended" || (s.deadline !== null && s.now.getTime() >= s.deadline.getTime());

export const secondsLeft = (limitS: number | null, startedAt: Date | null, now: Date) =>
  limitS !== null && startedAt ? Math.max(0, Math.ceil(limitS - (now.getTime() - startedAt.getTime()) / 1000)) : null;

// counts per option for choice questions, plus raw text answers for open questions
export function tally(q: Q | undefined, answers: unknown[]) {
  if (!q) return { counts: null as number[] | null, texts: [] as string[] };
  if (q.type === "open" || q.type === "fill") {
    return { counts: null, texts: answers.filter((a): a is string => typeof a === "string").slice(0, 100) };
  }
  const counts = q.options.map(() => 0);
  for (const a of answers) {
    for (const i of Array.isArray(a) ? a : [a]) if (typeof i === "number" && counts[i] !== undefined) counts[i]++;
  }
  return { counts, texts: [] as string[] };
}
