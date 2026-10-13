import { HttpError } from "./http";
import type { Q } from "./game";

// The rules a teacher picks for one game. Stored as jsonb on the session, so old rows get defaults.
export type Settings = {
  timer: "on" | "off";
  extra_time: number;        // multiplies every question's time limit: 1, 1.5, 2 or 3
  allow_change: boolean;     // students can change an answer until the question closes
  shuffle_questions: boolean;
  shuffle_answers: boolean;
  show_correct: boolean;     // students see the right answer after answering
  show_leaderboard: boolean; // students see rank and leaderboard
};

export const DEFAULTS: Settings = {
  timer: "on", extra_time: 1, allow_change: true,
  shuffle_questions: false, shuffle_answers: false, show_correct: true, show_leaderboard: true,
};

const EXTRA = [1, 1.5, 2, 3];
const BOOLS = ["allow_change", "shuffle_questions", "shuffle_answers", "show_correct", "show_leaderboard"] as const;

export function parseSettings(raw: unknown): Settings {
  if (raw === undefined || raw === null) return { ...DEFAULTS };
  if (typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "settings must be an object");
  const r = raw as Record<string, unknown>;
  const out: Settings = { ...DEFAULTS };
  if (r.timer !== undefined) {
    if (r.timer !== "on" && r.timer !== "off") throw new HttpError(400, "timer must be on or off");
    out.timer = r.timer;
  }
  if (r.extra_time !== undefined) {
    if (typeof r.extra_time !== "number" || !EXTRA.includes(r.extra_time)) {
      throw new HttpError(400, "extra_time must be 1, 1.5, 2 or 3");
    }
    out.extra_time = r.extra_time;
  }
  for (const k of BOOLS) {
    if (r[k] === undefined) continue;
    if (typeof r[k] !== "boolean") throw new HttpError(400, `${k} must be true or false`);
    out[k] = r[k] as boolean;
  }
  return out;
}

export const withDefaults = (stored: unknown): Settings =>
  ({ ...DEFAULTS, ...((stored && typeof stored === "object" ? stored : {}) as Partial<Settings>) });

// seconds a question stays open, or null when the timer is off
export const limitFor = (q: Q, s: Settings): number | null =>
  s.timer === "off" ? null : Math.ceil(q.time_limit_s * s.extra_time);
