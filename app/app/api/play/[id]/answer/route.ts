import { db } from "@/lib/db";
import { grade, score, timedOut } from "@/lib/game";
import { HttpError, readJson, route, uuid } from "@/lib/http";
import { requireParticipant } from "@/lib/participant";
import { isClosed, loadSession } from "@/lib/session";

export const POST = route(async (req, p) => {
  const id = uuid(p.id);
  const me = await requireParticipant(id);
  const s = await loadSession(id);
  const b = await readJson(req);
  if (s.status !== "running" || isClosed(s)) throw new HttpError(409, "This game is not accepting answers");
  const total = s.snapshot.length;

  const teacherPaced = s.pacing === "teacher";
  const qIndex = teacherPaced ? s.current_index : me.current_index;
  if (b.q_index !== qIndex || qIndex < 0 || qIndex >= total) throw new HttpError(409, "That question is not open");
  const startedAt = teacherPaced ? s.question_started_at : me.question_started_at;
  if (!startedAt) throw new HttpError(409, "That question is not open");

  const q = s.snapshot[qIndex];
  const { stored, correct } = grade(q, b.answer);
  const elapsed = Math.max(0, s.now.getTime() - startedAt.getTime());
  const late = timedOut(q, elapsed);
  const sql = db();

  const result = await sql.begin(async (tx) => {
    const points = late ? 0 : score(q, correct, elapsed);
    const [row] = await tx`insert into responses (participant_id, q_index, attempt, answer, correct, time_ms, points)
      values (${me.id}, ${qIndex}, ${me.attempt}, ${tx.json(stored as never)}, ${late && correct !== null ? false : correct},
              ${Math.min(elapsed, 2_000_000)}, ${points})
      on conflict (participant_id, q_index, attempt) do nothing returning points, correct`;
    if (!row) {
      // double submit: return what was stored, score nothing twice
      const [old] = await tx`select points, correct from responses
        where participant_id = ${me.id} and q_index = ${qIndex} and attempt = ${me.attempt}`;
      return { points: old.points as number, correct: old.correct as boolean | null, repeat: true };
    }
    const nextIndex = qIndex + 1;
    if (teacherPaced) {
      await tx`update participants set score = score + ${points} where id = ${me.id}`;
    } else {
      await tx`update participants set score = score + ${points}, current_index = ${nextIndex},
        question_started_at = null, finished = ${nextIndex >= total} where id = ${me.id}`;
    }
    return { points, correct: row.correct as boolean | null, repeat: false };
  });

  return Response.json({
    correct: result.correct,
    points: result.points,
    timedOut: late,
    correctAnswer: q.correct,
    done: !teacherPaced && qIndex + 1 >= total,
  });
});
