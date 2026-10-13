# Architecture: working name "Quizroom" (a rebuild of Wayground's core loop)

Name is a placeholder. `/replica-brand` picks the real one.
Scope: S01-S13 from recon, minus AI generate, team/mastery modes and accommodations in the first slice.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js 16 App Router + TypeScript | one codebase for UI and API routes |
| styling | Tailwind, tokens from replica-design | tokens map straight to CSS variables |
| database | Postgres: Supabase free project in prod (linked to your GitHub), Docker locally | relational fit, partial unique index for join codes; Supabase free tier pauses after about a week idle |
| data access | `postgres` (porsager) with plain SQL | six tables, an ORM is more code than the SQL |
| auth | email + password, scrypt, random session token (hash stored) in httpOnly cookie | no third party, about 60 lines; teachers only, students are anonymous |
| realtime | short polling every 1.5s | works on Vercel, no websocket server, classroom sizes (30-100) |
| payments | none yet | plans page is `/replica-backend` and `/replica-launch` territory |
| email | none yet | needed only for password reset (should) |
| jobs | none | homework expiry is computed on read (deadline < now()) |
| hosting | Vercel + Supabase | boring and cheap at zero users |

One database, one app, no services. ponytail: polling caps out around a few hundred players per session; swap in Supabase Realtime or SSE if that bites.

## Schema

Tables: 7 (users, auth_sessions, quizzes, questions, game_sessions, participants, responses). See `replica/schema.sql`.
Access rules: data-layer checks. Every teacher query filters by `owner_id`/`host_id` taken from the session cookie. Participants authenticate with a per-session token cookie, matched against `participants.token_hash`.

Constraints worth noting:
- `game_sessions_open_code`: partial unique index, a join code is unique among open sessions only, so codes recycle.
- `responses (participant_id, q_index, attempt)` unique: a double submit cannot score twice.
- `participants (session_id, lower(display_name))` unique: no two students share a name in a game.
- `game_sessions.snapshot`: questions are frozen at session start, so editing a quiz never corrupts a run or its report.

## API

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/auth/signup | create teacher, set cookie | anyone | email, password, name | user | F01 |
| POST /api/auth/login | set cookie | anyone | email, password | user | F01 |
| POST /api/auth/logout | clear cookie | teacher | | ok | |
| GET /api/quizzes | my quizzes | teacher | q? | quizzes | F01 |
| POST /api/quizzes | create quiz | teacher | title, subject, questions[] | quiz | F01 |
| GET /api/quizzes/:id | quiz with questions | owner | | quiz | F01 |
| PUT /api/quizzes/:id | replace title and questions | owner | same as create | quiz | F01 |
| DELETE /api/quizzes/:id | delete | owner | | ok | F01 |
| POST /api/quizzes/:id/sessions | start a session | owner | kind, pacing, mode, deadline?, attempts? | session + code | F02, F04 |
| GET /api/sessions/:id | host state: players, answered counts, leaderboard | host | | state | F02 |
| POST /api/sessions/:id/start | lobby to running, show question 0 | host | | state | F02 |
| POST /api/sessions/:id/next | advance question, end after the last | host | | state | F02 |
| POST /api/sessions/:id/end | end now | host | | ok | F02 |
| GET /api/sessions/:id/report | per-student and per-question results | host | | report | F02, F04 |
| GET /api/sessions/:id/report.csv | CSV export | host | | csv | F04 |
| GET /api/assignments | my homework sessions | teacher | | sessions | F04 |
| POST /api/join | join by code, set participant cookie | anyone | code, name | session summary | F03 |
| GET /api/play/:id | participant state (poll) | participant | | state | F03 |
| POST /api/play/:id/answer | submit an answer | participant | q_index, answer | feedback | F03 |

Webhooks in/out: none. Jobs: none.
Private endpoints of the original are not used; all routes above are our own.

## The parts that bite

- time zones: all times `timestamptz`, deadlines entered in the browser's zone and sent as ISO; display in viewer's zone.
- idempotency: answer submission is unique per (participant, q_index, attempt); a retry returns the stored result.
- races: two hosts clicking Next at once. `next` does `update ... where current_index = $expected` and returns the new state either way.
- scoring is server-side only. Client sends the answer, never a score or a time. Time taken comes from `question_started_at` (teacher-paced) or the participant's own first fetch of the question (student-paced).
- cheating: correct answers are never sent to the participant before they answer. The play-state payload strips `correct`.
- join-code guessing: 6 digits means 1M codes, rate limit `/api/join` per IP (in-memory, ponytail: move to Redis when scaled out).
- student privacy: students give a display name only, no email, no account. GDPR/COPPA review before any launch to schools.
- realtime: polling, see above.

## Build order

1. Vertical slice: S03, S04, S05 (mcq only), S07, S08, S09, S10, S02. Tables: users, quizzes, questions, game_sessions, participants, responses. Routes: auth, quizzes, sessions, join, play.
2. Must-haves: remaining question types (poll, fill, open), student-paced and homework with deadline and attempts, S11 report, S12 assignments, leaderboard polish.
3. Should-haves: team, test and mastery modes, image on question, quiz library search, share by link, AI generate (needs an LLM key from you).
4. Fixes from replica-entrepreneur.

## Supabase notes

- Used as plain Postgres only. Auth stays our own (teachers only, anonymous students) so there is no Supabase Auth or RLS to configure. Data-layer checks do the access control, so the anon key must never ship to the browser. Use the server-side connection string only.
- Connection string goes in `DATABASE_URL` (Vercel env vars and `app/.env.local`), never in git. Use the pooler URL (transaction mode, port 6543) on Vercel, and `postgres(url, { prepare: false })`.
- Apply `replica/schema.sql` once in the Supabase SQL editor.
- Free tier: project pauses after inactivity, so a paused project means a dead app until someone unpauses it. Fine for building, not for a launch.
