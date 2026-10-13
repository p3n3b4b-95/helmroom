import postgres from "postgres";

const g = globalThis as unknown as { __sql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!g.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false so Supabase's transaction pooler (port 6543) works
    g.__sql = postgres(url, { prepare: false, max: 5 });
  }
  return g.__sql;
}
