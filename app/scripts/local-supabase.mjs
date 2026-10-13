// A small stand-in for Supabase on your own machine: Postgres (PGlite) plus the two APIs the app uses,
// auth (sign up, sign in, anonymous sign-in) and rpc calls. Same URLs and JSON as the real thing, so
// the app and its tests run unchanged against it. Not for production: no email, no rate limits.
//
//   node scripts/local-supabase.mjs          -> http://localhost:54321
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const PORT = Number(process.env.PORT ?? 54321);
const SECRET = process.env.JWT_SECRET ?? "local-dev-secret";
const root = new URL("../../supabase/", import.meta.url);

const db = await PGlite.create(process.env.PGDATA ?? ".pgdata-supabase");
const have = await db.query("select to_regclass('auth.users') as t");
if (!have.rows[0].t) {
  await db.exec(readFileSync(new URL("local/auth_shim.sql", root), "utf8"));
  for (const f of readdirSync(new URL("migrations/", root)).sort()) {
    await db.exec(readFileSync(new URL(`migrations/${f}`, root), "utf8"));
  }
  console.log("migrations applied");
}
await db.exec("create table if not exists auth.shim_passwords (user_id uuid primary key references auth.users(id) on delete cascade, hash text not null)");

// function name -> argument names and types, so JSON bodies map onto named arguments
const sigs = new Map();
for (const r of (await db.query(`
  select p.proname, p.proargnames, p.proargtypes::oid[] as t,
         (select array_agg(format_type(x, null)) from unnest(p.proargtypes::oid[]) x) as types
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname !~ '^_'`)).rows) {
  sigs.set(r.proname, { names: r.proargnames ?? [], types: r.types ?? [] });
}

const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (payload) => {
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64(JSON.stringify(payload));
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
};
function verify(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!h || !p || !s) return null;
  const good = createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (good.length !== s.length || !timingSafeEqual(Buffer.from(good), Buffer.from(s))) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return c.exp && c.exp < Date.now() / 1000 ? null : c;
}
const hashPw = (pw) => { const s = randomBytes(16); return `${s.toString("hex")}$${scryptSync(pw, s, 64).toString("hex")}`; };
const checkPw = (pw, stored) => {
  const [s, h] = stored.split("$");
  return timingSafeEqual(scryptSync(pw, Buffer.from(s, "hex"), 64), Buffer.from(h, "hex"));
};

function sessionFor(u) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: "authenticated", role: "authenticated", sub: u.id, email: u.email ?? "", is_anonymous: !!u.is_anonymous, iat: now, exp: now + 3600 };
  const user = { id: u.id, aud: "authenticated", role: "authenticated", email: u.email ?? "", is_anonymous: !!u.is_anonymous,
                 app_metadata: {}, user_metadata: {}, created_at: u.created_at };
  return {
    access_token: sign(claims), token_type: "bearer", expires_in: 3600, expires_at: claims.exp,
    refresh_token: sign({ sub: u.id, kind: "refresh", exp: now + 86400 * 30 }), user,
  };
}

// PGlite runs one thing at a time, so requests take turns
let chain = Promise.resolve();
const turn = (fn) => (chain = chain.then(fn, fn));

const err = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, message: msg });
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const t = Buffer.concat(chunks).toString();
  try { return t ? JSON.parse(t) : {}; } catch { return {}; }
}

async function auth(req, res, url, body) {
  const path = url.pathname.replace("/auth/v1", "");
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (path === "/signup" && req.method === "POST") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    if (email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(res, 400, "validation_failed", "Unable to validate email address: invalid format");
      if (typeof body.password !== "string" || body.password.length < 6) return err(res, 422, "weak_password", "Password should be at least 6 characters.");
      const dup = await db.query("select 1 from auth.users where lower(email) = $1", [email]);
      if (dup.rows.length) return err(res, 422, "user_already_exists", "User already registered");
    }
    const u = (await db.query("insert into auth.users (email, is_anonymous) values ($1, $2) returning id, email, is_anonymous, created_at", [email, !email])).rows[0];
    if (email) await db.query("insert into auth.shim_passwords values ($1, $2)", [u.id, hashPw(body.password)]);
    return send(res, 200, sessionFor(u));
  }
  if (path === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const r = await db.query("select u.id, u.email, u.is_anonymous, u.created_at, p.hash from auth.users u join auth.shim_passwords p on p.user_id = u.id where lower(u.email) = $1", [email]);
      if (!r.rows.length || !checkPw(String(body.password ?? ""), r.rows[0].hash)) return err(res, 400, "invalid_credentials", "Invalid login credentials");
      return send(res, 200, sessionFor(r.rows[0]));
    }
    if (grant === "refresh_token") {
      const c = verify(body.refresh_token);
      if (!c || c.kind !== "refresh") return err(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      const r = await db.query("select id, email, is_anonymous, created_at from auth.users where id = $1", [c.sub]);
      return r.rows.length ? send(res, 200, sessionFor(r.rows[0])) : err(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
    }
  }
  const c = verify(bearer);
  if (path === "/user" && req.method === "GET") {
    if (!c) return err(res, 401, "bad_jwt", "invalid JWT");
    const r = await db.query("select id, email, is_anonymous, created_at from auth.users where id = $1", [c.sub]);
    return r.rows.length ? send(res, 200, sessionFor(r.rows[0]).user) : err(res, 401, "user_not_found", "User from sub claim in JWT does not exist");
  }
  if (path === "/user" && req.method === "PUT") {
    if (!c) return err(res, 401, "bad_jwt", "invalid JWT");
    if (typeof body.password === "string") {
      if (body.password.length < 6) return err(res, 422, "weak_password", "Password should be at least 6 characters.");
      await db.query("insert into auth.shim_passwords values ($1, $2) on conflict (user_id) do update set hash = excluded.hash", [c.sub, hashPw(body.password)]);
    }
    const r = await db.query("select id, email, is_anonymous, created_at from auth.users where id = $1", [c.sub]);
    return send(res, 200, sessionFor(r.rows[0]).user);
  }
  if (path === "/logout") return send(res, 204);
  if (path === "/recover") return send(res, 200, {});
  return err(res, 404, "not_found", "Not found");
}

async function rpc(req, res, fn, body) {
  const sig = sigs.get(fn);
  if (!sig) return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` });
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const claims = verify(bearer);
  const role = claims?.role === "authenticated" ? "authenticated" : "anon";
  const args = []; const parts = [];
  sig.names.forEach((n, i) => {
    if (!(n in body)) return;
    const v = body[n];
    args.push(v === null ? null : sig.types[i] === "jsonb" ? JSON.stringify(v) : String(v));
    parts.push(`${n} => $${args.length}::${sig.types[i]}`);
  });
  try {
    const out = await db.transaction(async (tx) => {
      await tx.query(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role: "anon" })]);
      return tx.query(`select public.${fn}(${parts.join(", ")}) as r`, args);
    });
    return send(res, 200, out.rows[0]?.r ?? null);
  } catch (e) {
    const denied = e.code === "42501";
    return send(res, denied ? (role === "anon" ? 401 : 403) : 400, { code: e.code ?? "P0001", message: e.message, details: null, hint: null });
  }
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile",
    });
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = req.method === "GET" ? {} : await readBody(req);
  await turn(async () => {
    try {
      if (url.pathname.startsWith("/auth/v1/")) return await auth(req, res, url, body);
      const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (m && req.method === "POST") return await rpc(req, res, m[1], body);
      return send(res, 404, { message: "Not found" });
    } catch (e) {
      console.error(e);
      return send(res, 500, { message: "Something went wrong" });
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`local supabase on http://localhost:${PORT}`));

process.on("SIGINT", async () => { await db.close(); process.exit(0); });
