import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import type { Q } from "@/lib/game";
import { HttpError, route, uuid } from "@/lib/http";
import { loadSession } from "@/lib/session";

const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // student names are untrusted: no spreadsheet formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const POST = route(async (req, p) => {
  const t = await requireTeacher();
  const s = await loadSession(uuid(p.id), t.id);
  const sql = db();
  switch (p.action) {
    case "start": {
      if (s.pacing === "teacher") {
        const r = await sql`update game_sessions set status = 'running', current_index = 0, question_started_at = now()
          where id = ${s.id} and status = 'lobby' returning id`;
        if (r.length === 0) throw new HttpError(409, "Already started");
      } else {
        const r = await sql`update game_sessions set status = 'running' where id = ${s.id} and status = 'lobby' returning id`;
        if (r.length === 0) throw new HttpError(409, "Already started");
      }
      return Response.json({ ok: true });
    }
    case "next": {
      if (s.pacing !== "teacher" || s.status !== "running") throw new HttpError(409, "Not running");
      const body = await req.json().catch(() => ({}));
      const expected = typeof body.index === "number" ? body.index : s.current_index;
      // two clicks on Next advance once: the update only matches the index the host saw
      if (expected === s.snapshot.length - 1) {
        await sql`update game_sessions set status = 'ended', ended_at = now()
          where id = ${s.id} and status = 'running' and current_index = ${expected}`;
      } else {
        await sql`update game_sessions set current_index = current_index + 1, question_started_at = now()
          where id = ${s.id} and status = 'running' and current_index = ${expected}`;
      }
      return Response.json({ ok: true });
    }
    case "end": {
      await sql`update game_sessions set status = 'ended', ended_at = now() where id = ${s.id} and status <> 'ended'`;
      return Response.json({ ok: true });
    }
  }
  throw new HttpError(404, "Not found");
});

export const GET = route(async (_req, p) => {
  const t = await requireTeacher();
  const s = await loadSession(uuid(p.id), t.id);
  if (p.action !== "report" && p.action !== "report.csv") throw new HttpError(404, "Not found");
  const sql = db();
  const snap = s.snapshot as Q[];

  const students = await sql`
    select p.id, p.display_name as name, p.score, p.attempt, p.finished,
      count(r.id)::int as answered, count(*) filter (where r.correct)::int as correct
    from participants p left join responses r on r.participant_id = p.id and r.attempt = p.attempt
    where p.session_id = ${s.id} group by p.id order by p.score desc, p.joined_at`;

  const rows = await sql`
    select r.q_index, r.answer, r.correct, r.time_ms
    from responses r join participants p on p.id = r.participant_id
    where p.session_id = ${s.id} and r.attempt = p.attempt`;

  const questions = snap.map((q, i) => {
    const mine = rows.filter((r) => r.q_index === i);
    const scored = mine.filter((r) => r.correct !== null);
    const counts = q.options.map(() => 0);
    if (q.options.length) {
      for (const r of mine) for (const x of Array.isArray(r.answer) ? r.answer : [r.answer]) if (counts[x] !== undefined) counts[x]++;
    }
    return {
      index: i, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct,
      answered: mine.length,
      correct_pct: scored.length ? Math.round((100 * scored.filter((r) => r.correct).length) / scored.length) : null,
      avg_time_s: mine.length ? Math.round(mine.reduce((a, r) => a + r.time_ms, 0) / mine.length / 100) / 10 : null,
      counts,
      texts: q.type === "open" || q.type === "fill" ? mine.map((r) => r.answer).slice(0, 200) : [],
    };
  });

  if (p.action === "report.csv") {
    const head = ["Student", "Score", "Correct", "Answered", "Total questions"];
    const lines = [head, ...students.map((x) => [x.name, x.score, x.correct, x.answered, snap.length])];
    return new Response(lines.map((l) => l.map(csvCell).join(",")).join("\r\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="results.csv"' },
    });
  }
  return Response.json({
    session: { id: s.id, title: s.title, kind: s.kind, status: s.status, code: s.code, total: snap.length, created_at: s.created_at },
    students, questions,
  });
});
