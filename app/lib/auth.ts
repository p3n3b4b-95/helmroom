import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { HttpError } from "./http";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `s1$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const got = scryptSync(pw, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(got, expected);
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function cookieOpts(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

export async function startTeacherSession(userId: string) {
  const token = newToken();
  await db()`insert into auth_sessions (token_hash, user_id, expires_at)
             values (${sha256(token)}, ${userId}, now() + interval '30 days')`;
  (await cookies()).set("sid", token, cookieOpts(THIRTY_DAYS));
}

export type Teacher = { id: string; email: string; name: string };

export async function getTeacher(): Promise<Teacher | null> {
  const token = (await cookies()).get("sid")?.value;
  if (!token) return null;
  const [u] = await db()<Teacher[]>`
    select u.id, u.email, u.name from auth_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  return u ?? null;
}

export async function requireTeacher(): Promise<Teacher> {
  const t = await getTeacher();
  if (!t) throw new HttpError(401, "Log in first");
  return t;
}
