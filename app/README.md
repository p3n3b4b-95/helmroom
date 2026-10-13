# Helmroom (working name)

Next.js 16 + Postgres. Teachers build quizzes and run them live or as homework; students join with a code.

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL (Supabase pooler URL, or the local one below)
node scripts/dev-db.mjs           # local dev DB on :5433 (PGlite), applies ../replica/schema.sql
npm run dev -- -p 3100
npm run build && npm run start -- -p 3100
BASE=http://localhost:3100 npm run test:api       # API checks (wait a minute between runs: wrong codes are throttled)
npx playwright install chromium && npm run test:browser   # phone (390px) and desktop projects
```

No Playwright browser? Start any Chrome with `--remote-debugging-port=9333 --headless=new` and run
`PW_CDP=http://localhost:9333 npm run test:browser`.

Production: create a Supabase project, run `replica/schema.sql` in its SQL editor, set `DATABASE_URL`
(pooler, transaction mode, port 6543) in Vercel. Never expose the connection string to the browser.
