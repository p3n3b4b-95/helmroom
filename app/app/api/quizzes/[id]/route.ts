import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { parseQuiz } from "@/lib/game";
import { HttpError, readJson, route, uuid } from "@/lib/http";

async function load(id: string, owner: string) {
  const sql = db();
  const [z] = await sql`select id, title, subject from quizzes where id = ${id} and owner_id = ${owner}`;
  if (!z) throw new HttpError(404, "Quiz not found");
  const questions = await sql`select type, prompt, image_url, options, correct, points, time_limit_s
    from questions where quiz_id = ${id} order by position`;
  return { ...z, questions };
}

export const GET = route(async (_req, p) => {
  const t = await requireTeacher();
  return Response.json(await load(uuid(p.id), t.id));
});

export const PUT = route(async (req, p) => {
  const t = await requireTeacher();
  const id = uuid(p.id);
  const quiz = parseQuiz(await readJson(req));
  await db().begin(async (tx) => {
    const r = await tx`update quizzes set title = ${quiz.title}, subject = ${quiz.subject}, updated_at = now()
      where id = ${id} and owner_id = ${t.id} returning id`;
    if (r.length === 0) throw new HttpError(404, "Quiz not found");
    await tx`delete from questions where quiz_id = ${id}`;
    for (const [i, q] of quiz.questions.entries()) {
      await tx`insert into questions (quiz_id, position, type, prompt, image_url, options, correct, points, time_limit_s)
        values (${id}, ${i}, ${q.type}, ${q.prompt}, ${q.image_url}, ${tx.json(q.options)}, ${tx.json(q.correct)}, ${q.points}, ${q.time_limit_s})`;
    }
  });
  return Response.json({ id });
});

export const DELETE = route(async (_req, p) => {
  const t = await requireTeacher();
  const r = await db()`delete from quizzes where id = ${uuid(p.id)} and owner_id = ${t.id} returning id`;
  if (r.length === 0) throw new HttpError(404, "Quiz not found");
  return Response.json({ ok: true });
});

// rename without touching the questions
export const PATCH = route(async (req, p) => {
  const t = await requireTeacher();
  const b = await readJson(req);
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  if (!title) throw new HttpError(400, "Give the quiz a title");
  const r = await db()`update quizzes set title = ${title}, updated_at = now()
    where id = ${uuid(p.id)} and owner_id = ${t.id} returning id, title`;
  if (r.length === 0) throw new HttpError(404, "Quiz not found");
  return Response.json(r[0]);
});
