// Local Postgres for development: PGlite behind a TCP socket on :5433, migrations from ../supabase/migrations.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create(process.env.PGDATA ?? ".pgdata");
const { rows } = await db.query("select to_regclass('public.users') as t");
if (!rows[0].t) {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  console.log("migrations applied");
}
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log("dev db on postgresql://postgres:dev@localhost:5433/postgres");
process.on("SIGINT", async () => { await server.stop(); await db.close(); process.exit(0); });
