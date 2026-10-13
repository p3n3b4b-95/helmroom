import { db } from "@/lib/db";
import { hashPassword, startTeacherSession } from "@/lib/auth";
import { HttpError, rateLimit, readJson, route } from "@/lib/http";

export const POST = route(async (req) => {
  rateLimit(req, "signup", 10);
  const b = await readJson(req);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new HttpError(400, "Enter a valid email");
  if (password.length < 8 || password.length > 200) throw new HttpError(400, "Password needs 8 or more characters");
  try {
    const [u] = await db()`insert into users (email, name, password_hash)
      values (${email}, ${name}, ${hashPassword(password)}) returning id, email, name`;
    await startTeacherSession(u.id);
    return Response.json({ id: u.id, email: u.email, name: u.name }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "That email already has an account");
    throw e;
  }
});
