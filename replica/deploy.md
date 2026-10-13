# Deploy checklist: Helmroom on GitHub Pages and Supabase

Date: 2026-10-13. Go from user: yes, for a **closed beta**. Public launch: not yet.

Nothing is live. The site builds, the database functions and the browser tests pass against a local stand-in, and
the publish workflow is in the repo. The last steps use your Supabase and GitHub accounts, so they're yours.

## How it is built

A static site (`app/out`) published to `https://p3n3b4b-95.github.io/helmroom/` by `.github/workflows/pages.yml`.
No server. The browser calls Supabase directly: teachers sign in with Supabase Auth, students with anonymous
sign-in, and all rules live in 15 SQL functions behind locked tables.

## Your steps

### 1. Supabase

1. **Run the migrations.** Your GitHub link should apply `supabase/migrations/` on push. Check Table Editor: you
   want `quizzes`, `questions`, `game_sessions`, `participants`, `responses`, `join_failures`, and **no** `users`
   table. If not, paste the three files in order into the SQL editor.
   The last migration **drops the earlier tables**. They held no real data, but if you ran games on them, export first.
2. **Authentication > Sign In / Providers:** turn on **Allow anonymous sign-ins** (students need it).
3. **Authentication > Sign In / Providers > Email:** for the beta, turn **Confirm email** off, or teachers must click
   a link before they can log in. (The built-in email sender is limited to a few messages an hour.)
4. **Authentication > Rate Limits:** raise the anonymous sign-in limit. The default is 30 per hour **per IP**, and a
   school shares one IP, so the 31st student would be refused. Try 500 per hour.
5. **Authentication > URL Configuration:** Site URL `https://p3n3b4b-95.github.io/helmroom/`, and add the redirect
   URL `https://p3n3b4b-95.github.io/helmroom/account/` (password reset links land there).
6. **Project Settings > API:** note the **Project URL** and the **anon public** key. Both are safe to be public.
   **Never** use or share the `service_role` key.

### 2. GitHub

1. Repo **Settings > Pages > Source: GitHub Actions**.
2. Repo **Settings > Secrets and variables > Actions > Variables**: add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SUPPORT_EMAIL` (an address you will answer).
3. **Actions > Pages > Run workflow.** The site appears at the URL above in a minute or two.

Both values in step 2 are public, so you can paste them to me and I'll set them and start the run.

### 3. Try it

Sign up, write a quiz, start a game, join from a phone, answer, read the results, then delete the test account from
the Account page.

## Preflight

| check | result |
| --- | --- |
| database functions over HTTP (`npm run test:api`) | **pass**, 29 of 29, against the local stand-in |
| browser tests, 390px phone and 1280px desktop | **pass**, 10 of 10, against the built static site |
| parity: all must-haves | **pass**, 13 of 13 |
| rebrand sweep | **pass** (re-run before each release) |
| production build | **pass**, static export |
| privacy and terms pages | exist, written from what is stored. **Not reviewed by a lawyer** |
| account deletion | **pass**, removes the account and everything under it |
| tables locked | **pass**, direct table reads return nothing |
| tested against real Supabase | **no.** The stand-in speaks the same auth and RPC protocol, but real Supabase is the final check |

## Known differences and risks

- **Not yet run on a real Supabase project.** First thing to do after step 3 is the live-game flow on your phone.
  Expect small things (a setting name, a rate limit), not a redesign.
- **Anonymous users pile up** in Authentication > Users. Harmless, but delete old ones now and then
  (`delete from auth.users where is_anonymous and created_at < now() - interval '30 days'`).
- **Polling.** Each student asks the database every 1.5 seconds, so a class of 35 is about 23 requests a second for
  that game. Fine for a beta. If Supabase complains, raise the interval in `app/lib/client.ts` (`usePoll`).
- **Free Supabase projects pause** when idle and have no backups you can rely on.
- **Wrong-code throttle** is 10 per minute per anonymous user, and Supabase's per-IP sign-in limit is the outer
  brake. Fine for a beta.
- **The anon key is public**, so security rests on the functions. They check who is asking on every call, and the
  tests cover teacher against teacher and student against teacher. Any change to the SQL needs `npm run test:api`.

## Before you tell anyone outside the beta

- A lawyer reads /privacy and /terms, and the school-data question (COPPA, FERPA, GDPR) is settled.
- Support address on the site and answered.
- Error tracking and an uptime check (Pages has none), and analytics you can put in the privacy policy.
- Trademark rows in `brand.md` run, a domain if you want one (`helmroom.app`, set as the custom domain in Pages).
- Supabase on a plan with backups and no idle pausing.
- Real phones and Safari.
