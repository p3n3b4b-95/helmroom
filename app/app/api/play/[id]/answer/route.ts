import { db } from "@/lib/db";
import { grade, score, timedOut } from "@/lib/game";
import { answerToReal, optionOrder, questionOrder, shownCorrect } from "@/lib/play";
import { HttpError, readJson, route, uuid } from "@/lib/http";
import { requireParticipant } from "@/lib/participant";
import { isClosed, loadSession } from "@/lib/session";
import { limitFor, withDefaults } from "@/lib/settings";

export const POST = route(async (req, p) => {
  const id = uuid(p.id);
  const me = await requireParticipant(id);
  const s = await loadSession(id);
  const st = withDefaults(s.settings);
  const b = await readJson(req);
  if (s.status !== "running" || isClosed(s)) throw new HttpError(409, "This game is not accepting answers");
  const total = s.snapshot.length;

  const teacher = s.pacing === "teacher";
  const pos = teacher ? s.current_index : me.current_index;
  if (b.q_index !== pos || pos < 0 || pos >= total) throw new HttpError(409, "That question is not open");
  const startedAt = teacher ? s.question_started_at : me.question_started_at;
  if (!startedAt) throw new HttpError(409, "That question is not open");

  const real = questionOrder(me, total, st, teacher)[pos];
  const q = s.snapshot[real];
  const opts = optionOrder(me, real, q.options.length, st);
  const limit = limitFor(q, st);
  const { stored, correct } = grade(q, answerToReal(q, b.answer, opts));
  const elapsed = Math.max(0, s.now.getTime() - startedAt.getTime());
  const late = timedOut(limit, elapsed);
  const canChange = teacher && st.allow_change; // student-paced games confirm before sending instead
  // a first answer gets a little slack for a slow network; a change must land before the verdict shows
  const closed = limit !== null && elapsed >= limit * 1000;
  const sql = db();

  const result = await sql.begin(async (tx) => {
    await tx`select id from participants where id = ${me.id} for update`; // one answer at a time per student
    const [old] = await tx`select points, correct from responses
      where participant_id = ${me.id} and q_index = ${real} and attempt = ${me.attempt}`;
    if (old && (!canChange || closed)) {
      return { points: old.points as number, correct: old.correct as boolean | null, kept: true };
    }
    const right = late && correct !== null ? false : correct;
    const points = late ? 0 : score(q, correct, elapsed, limit);
    if (!old) {
      await tx`insert into responses (participant_id, q_index, attempt, answer, correct, time_ms, points)
        values (${me.id}, ${real}, ${me.attempt}, ${tx.json(stored as never)}, ${right}, ${Math.min(elapsed, 2_000_000)}, ${points})`;
      if (teacher) {
        await tx`update participants set score = score + ${points} where id = ${me.id}`;
      } else {
        await tx`update participants set score = score + ${points}, current_index = ${pos + 1},
          question_started_at = null, finished = ${pos + 1 >= total} where id = ${me.id}`;
      }
    } else {
      await tx`update responses set answer = ${tx.json(stored as never)}, correct = ${right},
        time_ms = ${Math.min(elapsed, 2_000_000)}, points = ${points}
        where participant_id = ${me.id} and q_index = ${real} and attempt = ${me.attempt}`;
      await tx`update participants set score = score + ${points - (old.points as number)} where id = ${me.id}`;
    }
    return { points, correct: right, kept: false };
  });

  // a changeable answer says "saved" until the question closes; no hint of right or wrong
  if (canChange && !late && !result.kept) return Response.json({ saved: true });
  return Response.json({
    saved: false,
    correct: result.correct,
    points: result.points,
    timedOut: late,
    correctAnswer: st.show_correct ? shownCorrect(q, opts) : null,
    done: !teacher && pos + 1 >= total,
  });
});
