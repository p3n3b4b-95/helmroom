import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { publicQ } from "@/lib/game";
import { route, uuid } from "@/lib/http";
import { isClosed, loadSession, secondsLeft, tally } from "@/lib/session";
import { limitFor, withDefaults } from "@/lib/settings";

export const GET = route(async (_req, p) => {
  const t = await requireTeacher();
  const s = await loadSession(uuid(p.id), t.id);
  const sql = db();
  const st = withDefaults(s.settings);
  const total = s.snapshot.length;
  const live = s.pacing === "teacher" && s.status === "running" && s.current_index >= 0;
  const cur = live ? s.snapshot[s.current_index] : undefined;

  const players = await sql`
    select p.display_name as name, p.score, p.finished, p.attempt,
      (select count(*)::int from responses r where r.participant_id = p.id and r.attempt = p.attempt) as answered,
      exists (select 1 from responses r where r.participant_id = p.id and r.attempt = p.attempt
              and r.q_index = ${s.current_index}) as answered_current
    from participants p where p.session_id = ${s.id} order by p.score desc, p.joined_at limit 500`;

  const answers = cur
    ? await sql`select r.answer from responses r join participants p on p.id = r.participant_id
        where p.session_id = ${s.id} and r.q_index = ${s.current_index} and r.attempt = p.attempt`
    : [];

  return Response.json({
    session: {
      id: s.id, code: s.code, title: s.title, kind: s.kind, pacing: s.pacing, status: s.status,
      closed: isClosed(s), deadline: s.deadline, attempts_allowed: s.attempts_allowed,
      current_index: s.current_index, total,
    },
    question: cur ? { ...publicQ(cur), correct: cur.correct } : null,
    secondsLeft: live && cur ? secondsLeft(limitFor(cur, st), s.question_started_at, s.now) : null,
    settings: st,
    ...tally(cur, answers.map((a) => a.answer)),
    players,
  });
});
