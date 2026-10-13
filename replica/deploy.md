# Deploy checklist: Helmroom

Date: 2026-10-13  Commit: see git log  Go from user: yes (2026-10-13), for a **closed beta**. Public launch: not yet.

I did not deploy. Hosting and database sign-ins are yours, and the preflight has failures. What is ready and what
you do are below.

## Preflight

| check | result |
| --- | --- |
| e2e suite green | **pass**, 29 of 29 (API level, against a local build) |
| browser tests (Playwright) | **pass**, 5 specs x 2 projects (390px phone and 1280px desktop), 10 of 10. Live game, homework with lock-in, wrong code, layout, tap targets |
| no open S1 or S2 bugs | **none known**. 390px checked on home, dashboard, rules panel, editor, host lobby and running, play, report, sessions, account, privacy. Found and fixed: dashboard overflow with a long title (page was 834px wide), editor question header overflowing by 4px. Not tested: real phones, Safari, slow networks |
| parity, all must-haves done | **pass**, 13 of 13, feature score 68.7 |
| rebrand sweep clean | **pass**, exit 0 |
| store listing lints | **pass**, 0 errors. Draft only, there is no store app |
| production build | **pass** |
| privacy policy and terms live | **partial**. Pages exist (/privacy, /terms), written from what the app really stores. Not reviewed by a lawyer, and the contact address is empty until you set `NEXT_PUBLIC_SUPPORT_EMAIL` |
| account deletion works | **pass**. Account page, tested: removes the account, quizzes, games and every student result |
| favicon, titles, OG image | favicon and titles are ours. **No OG image yet** |
| security headers | set: nosniff, frame deny, referrer policy, permissions policy. No CSP yet |

Per the skill, a failure stops the deploy. For a closed beta with a handful of teachers you know, I would accept
the first three rows as known risks. I would not announce publicly until they are fixed.

## Production

| item | status |
| --- | --- |
| separate production database | your Supabase project. Dev is local, so it is separate. **You** confirm it is the one meant for production |
| migrations in the deploy | via your Supabase GitHub link, **unverified**. Check the tables exist (steps below) |
| backups | **check in the Supabase dashboard**. Free projects are not a safe place for data you can't lose, and pause when idle |
| env vars | `DATABASE_URL`, `DB_POOL_MAX=1`, `NEXT_PUBLIC_SUPPORT_EMAIL` (names match `app/.env.example`) |
| Stripe, OAuth, email sending | not used. Note: no email means **no password reset yet** |

## Your steps (about 15 minutes)

1. **Supabase.** Table Editor: you should see 7 tables, and `game_sessions` should have a `settings` column. If not,
   run `supabase/migrations/20261013000000_init.sql` then `20261014000000_session_settings.sql` in the SQL editor.
   Then Project Settings, Database, Connection string, **Transaction pooler** (port 6543). Copy it.
2. **Vercel.** Add New, Project, import `p3n3b4b-95/helmroom`.
   - Root Directory: **app**
   - Framework: Next.js (detected)
   - Environment Variables: `DATABASE_URL` = the pooler string with your password, `DB_POOL_MAX` = `1`,
     `NEXT_PUBLIC_SUPPORT_EMAIL` = the address you will answer.
   - Deploy.
3. **Try it on the `*.vercel.app` URL**: sign up, write a quiz, start a game, join from your phone, answer, read the
   results. Then delete the test account from the Account page.
4. Tell me the result, or any error from the build log, and I'll fix it.

Vercel's Hobby plan is for non-commercial use. If you sell this, you need a paid plan.

## Domain (after you buy it)

Plan on `helmroom.app` (`.com` is taken). In Vercel, Settings, Domains, add it and copy the exact values it shows.

| record | name | value |
| --- | --- | --- |
| A | @ | the IP Vercel shows for the apex domain |
| CNAME | www | `cname.vercel-dns.com` |
| TXT | @ | only if Vercel asks for verification |

Pick one canonical host and let Vercel redirect the other. HTTPS is automatic, check it. Email DNS (SPF, DKIM,
DMARC) is needed only once the app sends email.

## Before you tell anyone outside the beta

- A lawyer reads /privacy and /terms, and the school-data question (COPPA, FERPA, GDPR) is settled.
- Support address on the site and answered.
- Password reset by email (needs an email provider and the DNS above).
- Try it on a real phone, and in Safari.
- Error tracking, uptime check on `/` and `/api/me`, analytics you are happy to put in the privacy policy.
- Trademark rows in `brand.md` run and the domain bought. (The repo is already renamed to `helmroom`.)
- Supabase on a plan with backups, and no idle pausing.

## What to watch in week one

- Vercel function logs for 500s, and Supabase connection counts. Students poll every 1.5 seconds, so a class of 35
  is about 23 requests a second for that game. If the database or function bill complains, raise the poll interval
  in `app/lib/client.ts` (`usePoll`).
- The per-IP throttles live in each server instance's memory. On Vercel they are only a speed bump. Fine for a
  beta, replace with a shared store before real traffic.
- Whether teachers find the rules panel without help. That is the whole pitch.
