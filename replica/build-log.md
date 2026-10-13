# Build log

| ID | date | status | missing / notes |
| --- | --- | --- | --- |
| S01 landing + join form | 2026-10-13 | done | |
| S02 join (invalid code, taken name, closed game errors) | 2026-10-13 | done | |
| S03 sign up / log in | 2026-10-13 | done | no password reset, no Google sign-in |
| S04 dashboard / library | 2026-10-13 | partial | search yes, folders no |
| S05 quiz editor | 2026-10-13 | partial | 5 question types, no draw-answer, image by link only |
| S06 AI generate | - | not started | needs an LLM API key from the owner |
| S07 session setup | 2026-10-13 | partial | live (teacher or student paced) and homework; classic mode only |
| S08 host lobby | 2026-10-13 | done | |
| S09 host live view | 2026-10-13 | done | answered count, distribution, leaderboard, countdown |
| S10 student game | 2026-10-13 | done | feedback, rank, leaderboard top 5 |
| S11 results | 2026-10-13 | done | per student, per question, CSV |
| S12 sessions list | 2026-10-13 | done | |
| S13 plans | - | not started | no payments yet, see backend |

Harder than expected: Next 16 scaffolds with cacheComponents on, which breaks a fully dynamic app. Turned it off.
Local dev database is PGlite behind a socket (scripts/dev-db.mjs) because the Docker image pull never finished.
Visual states were checked by hand on desktop width only. Mobile (390px) is not checked yet.

## 2026-10-13, launch pass
- S01 landing: rebuilt as the full landing page (hero, problem, how it works, controls, beta note, FAQ, CTA). Claims limited to what exists. No product screenshot yet.
- Nav wrapped at 375px: right-hand links were cut off. Fixed, nothing offscreen now.
- Mobile checked for the home page only. Editor, host and play screens at 390px still unchecked.

## 2026-10-13, the four fixes from fixes.md
- Settings per game (jsonb on game_sessions, migration 20261014000000): timer on/off, extra time 1.5x/2x/3x,
  change answer, shuffle questions, shuffle answers, show right answer, show leaderboard. One panel in the start dialog.
- Change answer: teacher-paced games take re-taps until the question closes and show only "saved" until then
  (no right/wrong hint, score held back). Student-paced games get a "Lock in answer" step instead.
- Shuffle is deterministic per student, so the server maps answers back and reports stay in the quiz's own order.
- Rename (PATCH), duplicate, drag to reorder in the editor. Up and Down buttons stay for keyboard use.
- Not built: extra time per student. Per game only.
- Only desktop width checked for the new panel. Drag and drop was not exercised in a browser, only the handle rendered.

## 2026-10-13, 390px pass and browser tests
- Checked at 390px: home, dashboard with rules panel, editor, host lobby and running, play, report, sessions, account, privacy.
- Fixed: dashboard card pushed the page to 834px with a long quiz title (grid item had no min-width). Editor question
  header overflowed by 4px (Up, Down, Remove did not wrap). Footer and brand link tap targets were 20 to 28px tall.
- Playwright: tests/browser, phone and desktop projects. PW_CDP lets it drive an existing Chrome when the bundled
  Chromium can't be downloaded (it couldn't here, so the runs above used headless Chrome over CDP).
- Not covered: drag and drop reorder, Safari, real devices.
