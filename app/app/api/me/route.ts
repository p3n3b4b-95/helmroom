import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getTeacher } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";

export const GET = route(async () => Response.json({ user: await getTeacher() }));

// Deletes the account. Quizzes, games, students and answers go with it (all cascade from users).
export const DELETE = route(async (req) => {
  const t = await getTeacher();
  if (!t) throw new HttpError(401, "Log in first");
  const b = await readJson(req);
  if (typeof b.confirm !== "string" || b.confirm.trim().toLowerCase() !== t.email.toLowerCase()) {
    throw new HttpError(400, "Type your email address to confirm");
  }
  await db()`delete from users where id = ${t.id}`;
  (await cookies()).delete("sid");
  return Response.json({ ok: true });
});
