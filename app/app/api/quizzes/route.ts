import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { parseQuiz } from "@/lib/game";
import { readJson, route } from "@/lib/http";

export const GET = route(async (req) => {
  const t = await requireTeacher();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const rows = await db()`
    select z.id, z.title, z.subject, z.updated_at,
           (select count(*)::int from questions where quiz_id = z.id) as question_count
    from quizzes z
    where z.owner_id = ${t.id} and (${q} = '' or z.title ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"})
    order by z.updated_at desc limit 200`;
  return Response.json({ quizzes: rows });
});

export const POST = route(async (req) => {
  const t = await requireTeacher();
  const quiz = parseQuiz(await readJson(req));
  const sql = db();
  const id = await sql.begin(async (tx) => {
    const [z] = await tx`insert into quizzes (owner_id, title, subject) values (${t.id}, ${quiz.title}, ${quiz.subject}) returning id`;
    for (const [i, q] of quiz.questions.entries()) {
      await tx`insert into questions (quiz_id, position, type, prompt, image_url, options, correct, points, time_limit_s)
        values (${z.id}, ${i}, ${q.type}, ${q.prompt}, ${q.image_url}, ${tx.json(q.options)}, ${tx.json(q.correct)}, ${q.points}, ${q.time_limit_s})`;
    }
    return z.id as string;
  });
  return Response.json({ id }, { status: 201 });
});
