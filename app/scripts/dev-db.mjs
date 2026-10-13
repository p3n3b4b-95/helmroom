// Local Postgres for development: PGlite behind a TCP socket on :5433, schema from ../replica/schema.sql.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create(process.env.PGDATA ?? ".pgdata");
const { rows } = await db.query("select to_regclass('public.users') as t");
if (!rows[0].t) {
  await db.exec(readFileSync(new URL("../../replica/schema.sql", import.meta.url), "utf8"));
  console.log("schema applied");
}
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log("dev db on postgresql://postgres:dev@localhost:5433/postgres");
process.on("SIGINT", async () => { await server.stop(); await db.close(); process.exit(0); });
