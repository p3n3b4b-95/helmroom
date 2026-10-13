import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/auth";
import { route } from "@/lib/http";

export const POST = route(async () => {
  const jar = await cookies();
  const token = jar.get("sid")?.value;
  if (token) await db()`delete from auth_sessions where token_hash = ${sha256(token)}`;
  jar.delete("sid");
  return Response.json({ ok: true });
});
