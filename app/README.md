# Quizroom (working name)

Next.js 16 + Postgres. Teachers build quizzes and run them live or as homework; students join with a code.

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL (Supabase pooler URL, or the local one below)
node scripts/dev-db.mjs           # local dev DB on :5433 (PGlite), applies ../replica/schema.sql
npm run dev -- -p 3100
BASE=http://localhost:3100 node tests/e2e.mjs
```

Production: create a Supabase project, run `replica/schema.sql` in its SQL editor, set `DATABASE_URL`
(pooler, transaction mode, port 6543) in Vercel. Never expose the connection string to the browser.
