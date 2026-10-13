# Helmroom (working name)

A quiz tool where the teacher sets the rules. A static Next.js site that talks straight to Supabase: no server of
its own. It publishes to GitHub Pages.

## How it fits together

- `app/` the site. `next build` writes plain files to `app/out`.
- `supabase/migrations/` the database: tables (locked, no direct access) and 15 functions the site calls.
  Teachers sign in with Supabase Auth, students with anonymous sign-in. Scoring and "never show the right answer
  early" live in the functions, not in the browser.
- `.github/workflows/pages.yml` builds and publishes the site on every push to `main`.

## Run it on your machine

```bash
npm install
npm run db                 # terminal 1: local stand-in for Supabase on :54321 (PGlite, applies the migrations)
npm run build              # reads .env.local (copy .env.example; point it at http://localhost:54321, key "local")
npm run serve              # terminal 2: the built site on :3100
npm run test:api           # the database functions, over HTTP
npm run test:browser       # phone and desktop (npx playwright install chromium first)
```

No Playwright browser? Start any Chrome with `--headless=new --remote-debugging-port=9333` and run
`PW_CDP=http://localhost:9333 npm run test:browser`.

## Put it on github.io

See `replica/deploy.md`.
