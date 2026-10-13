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
