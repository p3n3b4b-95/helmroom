import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { HttpError, route, uuid } from "@/lib/http";

export const POST = route(async (_req, p) => {
  const t = await requireTeacher();
  const id = uuid(p.id);
  const copy = await db().begin(async (tx) => {
    const [z] = await tx`insert into quizzes (owner_id, title, subject)
      select owner_id, left('Copy of ' || title, 200), subject from quizzes
      where id = ${id} and owner_id = ${t.id} returning id, title`;
    if (!z) throw new HttpError(404, "Quiz not found");
    await tx`insert into questions (quiz_id, position, type, prompt, image_url, options, correct, points, time_limit_s)
      select ${z.id}, position, type, prompt, image_url, options, correct, points, time_limit_s
      from questions where quiz_id = ${id}`;
    return z;
  });
  return Response.json({ id: copy.id, title: copy.title }, { status: 201 });
});
