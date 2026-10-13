import { db } from "@/lib/db";
import { publicQ } from "@/lib/game";
import { answerToShown, optionOrder, questionOrder, shownCorrect } from "@/lib/play";
import { route, uuid } from "@/lib/http";
import { requireParticipant } from "@/lib/participant";
import { isClosed, loadSession, secondsLeft } from "@/lib/session";
import { limitFor, withDefaults } from "@/lib/settings";

export const GET = route(async (_req, p) => {
  const id = uuid(p.id);
  const me = await requireParticipant(id);
  const s = await loadSession(id);
  const st = withDefaults(s.settings);
  const sql = db();
  const total = s.snapshot.length;
  const closed = isClosed(s);
  const teacher = s.pacing === "teacher";

  // pos is what the student counts ("question 3 of 10"); real is the question's place in the snapshot
  let pos = -1;
  let startedAt: Date | null = null;
  if (s.status === "running" && !closed && !me.finished) {
    if (teacher) {
      pos = s.current_index;
      startedAt = s.question_started_at;
    } else {
      pos = me.current_index;
      if (pos < total && !me.question_started_at) {
        const [u] = await sql`update participants set question_started_at = now() where id = ${me.id}
          and question_started_at is null returning question_started_at`;
        startedAt = u?.question_started_at ?? s.now;
      } else startedAt = me.question_started_at;
    }
  }
  const order = questionOrder(me, total, st, teacher);
  const real = pos >= 0 && pos < total ? order[pos] : -1;
  const q = real >= 0 ? s.snapshot[real] : undefined;
  const limit = q ? limitFor(q, st) : null;
  const left = q ? secondsLeft(limit, startedAt, s.now) : null;
  const opts = q ? optionOrder(me, real, q.options.length, st) : [];

  const [mine] = real >= 0
    ? await sql`select correct, points, answer from responses
        where participant_id = ${me.id} and attempt = ${me.attempt} and q_index = ${real}`
    : [];

  // while a changeable answer is still open, say "saved" and nothing about right or wrong
  const open = teacher && !!q && (limit === null || (left ?? 0) > 0);
  const hold = !!mine && st.allow_change && open;
  let answered = null;
  if (mine && q) {
    const shown = answerToShown(q, mine.answer, opts);
    answered = hold
      ? { saved: true, answer: shown }
      : { saved: false, correct: mine.correct, points: mine.points, answer: shown,
          correctAnswer: st.show_correct ? shownCorrect(q, opts) : null };
  }

  const [rank] = await sql`select count(*)::int + 1 as rank from participants
    where session_id = ${id} and score > ${me.score}`;
  const board = st.show_leaderboard
    ? await sql`select display_name as name, score from participants
        where session_id = ${id} order by score desc, joined_at limit 5`
    : [];

  return Response.json({
    session: {
      title: s.title, kind: s.kind, pacing: s.pacing, status: s.status, closed, total, deadline: s.deadline,
      allow_change: st.allow_change, show_leaderboard: st.show_leaderboard,
    },
    me: {
      name: me.display_name,
      score: me.score - (hold ? mine.points : 0),
      attempt: me.attempt, finished: me.finished,
      rank: st.show_leaderboard && !hold ? rank.rank : null,
    },
    index: pos,
    question: q ? { ...publicQ(q), options: opts.map((j) => q.options[j]), time_limit_s: limit } : null,
    secondsLeft: left,
    timerOff: st.timer === "off",
    answered,
    leaderboard: board,
  });
});
