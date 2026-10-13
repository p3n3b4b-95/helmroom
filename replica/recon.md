# Recon map: Wayground (web)

Scope: core loop only. Teacher builds a quiz, runs it live or assigns it, students join by code, teacher reads results.
For: ASSUMED, the user's own product for teachers and students. Not confirmed, change if wrong.
Date: 2026-10-13
Evidence: public pages and third-party guides only. No account used. Items I could not confirm are marked UNKNOWN.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing home | https://wayground.com/ | product areas, nav, feature list |
| 2 | plans page | https://wayground.com/home/plans | Basic (free) vs School and District (quote) |
| 3 | help center home | https://help.wayground.com/support/home | 9 categories only, article titles not visible |
| 4 | classroom games | https://wayground.com/home/classroom-games | Playground / Tug of War mode |
| 5 | third-party guides | https://alicekeeler.com/2025/08/05/how-to-use-wayground-formerly-quizizz/ , https://wayground.it.com/?p=29 | host/join flow, pacing, modes. Third party, treat as medium confidence |
| 6 | pricing aggregators | Capterra, SaaSworthy | disagree with each other and with the plans page. Ignored for pricing |

## Core loop

A teacher turns content into a quiz, runs it as a live or self-paced session (or homework with a deadline), and sees per-student and per-question results.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | / | pitch, sign up, enter code | nav, code input, CTAs | n/a |
| S02 | Join | /join | student enters game code | code input, name entry | invalid code, session ended |
| S03 | Sign up / log in | Sign up, Log in | teacher account | email form, SSO buttons | error |
| S04 | Teacher dashboard / library | after login | my activities, search, folders | cards, search, filters | empty, filled |
| S05 | Quiz editor | create or edit | add questions, set type, answers, media | question list, type picker, answer editor | empty, invalid, saved |
| S06 | AI generate | create from topic | draft a quiz from a topic or text | prompt box, preview list | loading, error |
| S07 | Session setup | Start / Assign | pick live or homework, pace, mode, settings | mode cards, toggles, deadline picker | defaults |
| S08 | Host lobby | after start | show join code, players joining | code, player list, start button | 0 players, N players |
| S09 | Host live view | in game | current question, answered count, leaderboard | progress, leaderboard, controls | running, paused, ended |
| S10 | Student game | after join | answer questions, see feedback and score | question card, timer, feedback, score | correct, wrong, timed out, waiting |
| S11 | Results / report | after session | per-question accuracy, per-student scores | table, charts, export | empty, partial |
| S12 | Assignments list | teacher | track homework sessions and deadlines | list, status chips | active, expired |
| S13 | Plans | /home/plans | plan comparison | plan cards | n/a |

## Flows

```
F01 Teacher creates a quiz
    S03 -> S04 -> S05 -> save
    happy path clicks: UNKNOWN (not observed)
    edge: zero questions, question missing a correct answer, media upload fails

F02 Teacher hosts a live game
    S04 -> S07 -> S08 -> S09 -> S11
    edge: student joins late, student disconnects, teacher ends early

F03 Student joins and plays
    S01 or S02 -> name -> S10 -> final score
    edge: wrong code, duplicate name, session already ended (no account needed per guides)

F04 Teacher assigns homework
    S04 -> S07 (homework) -> share code/link -> S12 -> S11
    edge: deadline passes mid-attempt, attempts limit reached

F05 Teacher generates a quiz with AI
    S06 -> S05 (edit) -> save
    edge: bad topic, generation fails, wrong answers in output
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost | default, hover, focus, disabled, loading | all |
| Code input | join code | empty, invalid, valid | S01, S02 |
| Question card | one per question type | unanswered, correct, wrong, timed out | S05, S09, S10 |
| Answer option | single, multi | default, selected, correct, wrong | S10 |
| Timer | countdown | running, low, expired | S09, S10 |
| Leaderboard | live, final | updating | S09, S10, S11 |
| Mode card | per game mode | default, selected | S07 |
| Report table | per student, per question | sorted, filtered | S11 |

## Inferred data model

```
User         id, email, role (teacher), plan
             evidence: S03, plans page   confidence: high
Quiz         id, owner_id, title, subject, visibility, created_at
             evidence: S04, S05          confidence: high
Question     id, quiz_id, position, type, prompt, media, options (json),
             correct (json), points, time_limit
             evidence: S05, third-party guides   confidence: medium (fields guessed)
Session      id, quiz_id, host_id, code, mode (classic|team|test|mastery),
             pacing (teacher|student), kind (live|homework), deadline,
             attempts_allowed, status
             evidence: S07, S08, guides  confidence: medium
Participant  id, session_id, display_name, joined_at, score
             evidence: S02, S09          confidence: medium (no account needed per guides)
Response     id, participant_id, question_id, answer, correct, time_ms, points
             evidence: S10, S11          confidence: guess
```

Relationships: User 1-n Quiz, Quiz 1-n Question, Quiz 1-n Session, Session 1-n Participant, Participant 1-n Response.

## Feature matrix

See `features.csv`. Must: 13, should: 10, could: 8, skip: 6.

## Out of scope (cannot or should not be cloned)

- Wayground's 40M+ standards-aligned resource library and Official Library: content they own.
- Their name, logo, mascot, copy, game art and sound.
- LMS/SSO partner integrations (Canvas, Schoology, Clever, ClassLink, Google Classroom): partner agreements.
- School and district admin tier, Customer Success, professional development.
- Certified Educator programme and the teacher community.
- Hidden or paid behaviour I could not observe from public sources.

## Unknowns

- Full question type list (Wayground says 20+, public sources confirm only multiple choice, poll, fill in the blank, open-ended, drawing).
- Exact scoring formula, power-ups, and leaderboard rules.
- Real click counts for F01.
- Any behaviour behind login. Needs the user's own account, driven by the user, and a check of the account terms first.

## Size

Screens 13, flows 5, entities 6. Hard parts: realtime sessions (join, sync, leaderboard), scoring and anti-cheat, AI question generation, reporting. Size: M for the core loop only (no library, no LMS, no admin tier).
