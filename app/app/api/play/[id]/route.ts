import { db } from "@/lib/db";
import { publicQ } from "@/lib/game";
import { route, uuid } from "@/lib/http";
import { requireParticipant } from "@/lib/participant";
import { isClosed, loadSession, secondsLeft } from "@/lib/session";

export const GET = route(async (_req, p) => {
  const id = uuid(p.id);
  const me = await requireParticipant(id);
  const s = await loadSession(id);
  const sql = db();
  const total = s.snapshot.length;
  const closed = isClosed(s);

  // which question is on this participant's screen
  let index = -1;
  let startedAt: Date | null = null;
  if (s.status === "running" && !closed && !me.finished) {
    if (s.pacing === "teacher") {
      index = s.current_index;
      startedAt = s.question_started_at;
    } else {
      index = me.current_index;
      if (index < total && !me.question_started_at) {
        const [u] = await sql`update participants set question_started_at = now() where id = ${me.id}
          and question_started_at is null returning question_started_at`;
        startedAt = u?.question_started_at ?? s.now;
      } else startedAt = me.question_started_at;
    }
  }

  const [mine] = index >= 0
    ? await sql`select correct, points, answer from responses
        where participant_id = ${me.id} and attempt = ${me.attempt} and q_index = ${index}`
    : [];
  const q = index >= 0 && index < total ? s.snapshot[index] : undefined;
  const [rank] = await sql`select count(*)::int + 1 as rank from participants
    where session_id = ${id} and score > ${me.score}`;
  const board = await sql`select display_name as name, score from participants
    where session_id = ${id} order by score desc, joined_at limit 5`;

  return Response.json({
    session: { title: s.title, kind: s.kind, pacing: s.pacing, status: s.status, closed, total, deadline: s.deadline },
    me: { name: me.display_name, score: me.score, attempt: me.attempt, finished: me.finished, rank: rank.rank },
    index,
    question: q ? publicQ(q) : null,
    secondsLeft: q ? secondsLeft(q, startedAt, s.now) : null,
    // the right answer is only revealed once this participant has answered
    answered: mine ? { correct: mine.correct, points: mine.points, correctAnswer: q?.correct ?? [] } : null,
    leaderboard: board,
  });
});
