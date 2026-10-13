import { randomBytes, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { HttpError, readJson, route, uuid } from "@/lib/http";
import { parseSettings } from "@/lib/settings";
import { perm } from "@/lib/shuffle";

export const POST = route(async (req, p) => {
  const t = await requireTeacher();
  const quizId = uuid(p.id);
  const b = await readJson(req);
  const kind = b.kind === "homework" ? "homework" : b.kind === "live" ? "live" : null;
  if (!kind) throw new HttpError(400, "kind must be live or homework");
  if (b.mode !== undefined && b.mode !== "classic") throw new HttpError(400, "Only classic mode is available");
  const settings = parseSettings(b.settings);
  const pacing = kind === "homework" || b.pacing === "student" ? "student" : "teacher";

  let deadline: Date | null = null;
  let attempts = 1;
  if (kind === "homework") {
    deadline = new Date(String(b.deadline ?? ""));
    const ms = deadline.getTime() - Date.now();
    if (Number.isNaN(ms) || ms < 60_000) throw new HttpError(400, "Pick a deadline in the future");
    if (ms > 30 * 86_400_000) throw new HttpError(400, "Deadline can be at most 30 days away");
    attempts = typeof b.attempts === "number" ? Math.min(10, Math.max(1, Math.round(b.attempts))) : 1;
  }

  const sql = db();
  const [z] = await sql`select id, title from quizzes where id = ${quizId} and owner_id = ${t.id}`;
  if (!z) throw new HttpError(404, "Quiz not found");
  const qs = await sql`select type, prompt, image_url, options, correct, points, time_limit_s
    from questions where quiz_id = ${quizId} order by position`;
  if (qs.length === 0) throw new HttpError(400, "Quiz has no questions");
  // teacher-paced order is shared by the class, so shuffle once here; student-paced shuffles per student
  const snapshot = pacing === "teacher" && settings.shuffle_questions
    ? perm(qs.length, randomBytes(8).toString("hex")).map((i) => qs[i])
    : qs;

  for (let i = 0; i < 10; i++) {
    const code = String(randomInt(100000, 1000000));
    try {
      const [s] = await sql`insert into game_sessions
        (quiz_id, host_id, code, title, snapshot, kind, pacing, deadline, attempts_allowed, status, settings)
        values (${quizId}, ${t.id}, ${code}, ${z.title}, ${sql.json(snapshot as never)}, ${kind}, ${pacing},
                ${deadline}, ${attempts}, ${kind === "homework" ? "running" : "lobby"}, ${sql.json(settings as never)})
        returning id, code`;
      return Response.json({ id: s.id, code: s.code }, { status: 201 });
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // code taken by an open session, try another
    }
  }
  throw new HttpError(503, "Could not allocate a join code, try again");
});
