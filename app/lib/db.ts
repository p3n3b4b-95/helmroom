import postgres from "postgres";

const g = globalThis as unknown as { __sql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!g.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false so Supabase's transaction pooler (port 6543) works
    // DB_POOL_MAX=1 for the local PGlite dev DB (one connection at a time) and for serverless hosts
    g.__sql = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 5) });
  }
  return g.__sql;
}
