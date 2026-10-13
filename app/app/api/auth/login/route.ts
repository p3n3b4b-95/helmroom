import { db } from "@/lib/db";
import { startTeacherSession, verifyPassword } from "@/lib/auth";
import { HttpError, rateLimit, readJson, route } from "@/lib/http";

export const POST = route(async (req) => {
  rateLimit(req, "login", 20);
  const b = await readJson(req);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const [u] = await db()`select id, email, name, password_hash from users where lower(email) = ${email}`;
  if (!u || !verifyPassword(password, u.password_hash)) throw new HttpError(401, "Wrong email or password");
  await startTeacherSession(u.id);
  return Response.json({ id: u.id, email: u.email, name: u.name });
});
