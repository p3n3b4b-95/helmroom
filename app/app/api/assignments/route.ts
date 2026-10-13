import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const t = await requireTeacher();
  const rows = await db()`
    select s.id, s.title, s.code, s.kind, s.status, s.deadline, s.attempts_allowed, s.created_at,
      (select count(*)::int from participants p where p.session_id = s.id) as players,
      (s.status = 'ended' or (s.deadline is not null and s.deadline <= now())) as closed
    from game_sessions s where s.host_id = ${t.id} order by s.created_at desc limit 100`;
  return Response.json({ sessions: rows });
});
