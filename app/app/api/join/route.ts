import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cookieOpts, newToken, sha256 } from "@/lib/auth";
import { HttpError, rateLimit, readJson, route } from "@/lib/http";
import { participantCookie } from "@/lib/participant";

export const POST = route(async (req) => {
  rateLimit(req, "join", 30); // 6-digit codes: slow down guessing
  const b = await readJson(req);
  const code = typeof b.code === "string" ? b.code.replace(/\s/g, "") : "";
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "Codes are 6 digits");
  if (!name) throw new HttpError(400, "Enter your name");

  const sql = db();
  const [s] = await sql`select id, title, kind, pacing, status, attempts_allowed,
      (status = 'ended' or (deadline is not null and deadline <= now())) as closed
    from game_sessions where code = ${code} and status <> 'ended'`;
  if (!s || s.closed) throw new HttpError(404, "No open game with that code");

  const token = newToken();
  const [existing] = await sql`select id, attempt, finished from participants
    where session_id = ${s.id} and lower(display_name) = lower(${name})`;

  let pid: string;
  if (!existing) {
    const [p] = await sql`insert into participants (session_id, display_name, token_hash)
      values (${s.id}, ${name}, ${sha256(token)}) returning id`;
    pid = p.id;
  } else if (s.kind === "homework" && existing.finished && existing.attempt < s.attempts_allowed) {
    // same name, finished, attempts left: a new attempt (identity is the name, there are no student accounts)
    await sql`update participants set token_hash = ${sha256(token)}, attempt = attempt + 1, score = 0,
      finished = false, current_index = 0, question_started_at = null where id = ${existing.id}`;
    pid = existing.id;
  } else {
    throw new HttpError(409, s.kind === "homework" ? "That name has no attempts left or is mid-attempt" : "That name is taken in this game");
  }
  (await cookies()).set(participantCookie(s.id), token, cookieOpts(60 * 60 * 24 * 31));
  return Response.json({ sessionId: s.id, participantId: pid, title: s.title }, { status: 201 });
});
