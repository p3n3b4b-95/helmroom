# Brand: Helmroom

Angle (from `fixes.md`, option 1, thin evidence): for teachers who can't turn off shuffle, rename a quiz or reorder
questions without hunting, one place to edit anything and set every rule. Calm mode is one of its settings.

## Name

20 candidates, cut by: not close to the original or to Quizizz, Quizlet, Kahoot in sound or meaning; short; says
something about control. Dropped: names with a "-ly" twin, "quiz-" compounds (too close to the category leaders),
names with live App Store matches (Holdfast, Chalkline, Plumbline, Tallyroom).

| candidate | why |
| --- | --- |
| **Helmroom** (pick) | the helm is where you steer: the teacher runs the room |
| Paceroom (backup) | pace is the timer and calm-mode story, narrower than "control" |
| Gaugeroom | measuring, leans to reports rather than control |
| Ruleroom | says rules, but reads strict |
| Cueroom | .app and .io are taken |

## Checks, run 2026-10-13 (screening only, not legal clearance)

Registry RDAP, checked against known-registered controls (google.app, github.io, wikipedia.org all returned 200; a
random string returned 404). A 404 means not registered today. It does not mean you can buy it at list price.

| check | Helmroom | Paceroom | Gaugeroom | Ruleroom | Cueroom |
| --- | --- | --- | --- | --- | --- |
| .com | taken (registered, owner unknown) | taken, parked for sale | taken | taken | taken, for sale |
| .app | not registered | not registered | not registered | not registered | taken |
| .io | not registered | not registered | not registered | not registered | taken |
| .org | not registered | not registered | not registered | not registered | taken |
| GitHub user | free | free | free | free | free |
| App Store name search (iTunes search API) | no match | no match | no match | no match | no match |
| Web search "name + quiz/classroom/app" | nothing found | nothing found | nothing found | nothing found | nothing found |
| US trademark (tmsearch.uspto.gov, classes 9, 42, 41) | **to run** | to run | to run | to run | to run |
| EU (EUIPO eSearch / TMview) | **to run** | | | | |
| Canada (CIPO) | **to run** | | | | |
| WIPO Global Brand Database | **to run** | | | | |
| Google Play search | **to run** | | | | |
| X, Instagram, TikTok handles | **to run** | | | | |

`.co` was dropped: my lookup endpoint returned 404 for a registered domain (google.co), so that result is unusable.
The web searches were run through a search tool, which does not prove nothing exists.

Do before paying for anything: run the "to run" rows for Helmroom, then have a trademark lawyer do a real search.
Note `helmroom.com` is registered by someone, so the .com is unavailable unless they sell. Plan on `helmroom.app`.

## Palette

Primary hue moved from the placeholder blue to a deep teal. The original's colours were never measured (no
screenshots were saved), so `brand.json` has no colours to sweep for. If you want that check, screenshot their public
home page and give me the hex values.

| role | value | note |
| --- | --- | --- |
| accent | #0b6b63 | 6.37:1 on white, AA |
| on-accent | #ffffff | |
| answer 1 to 4 | #b3261e, #1a56c4, #8a5a00, #1f6f43 | each 5.9 to 6.6:1 with white text, AA |

Contrast: 14 pairs, 0 AA failures (`replica/design/tokens.json`, applied in `app/app/globals.css`).

## Logo brief

- Idea: a ship's wheel reduced to a dial. Teacher at the helm of the class.
- Mark: wordmark "Helmroom", with a small dial symbol as the favicon.
- Works at 16px (dial only, 2 colours) and as a 1024px app icon with no transparency.
- Deliverables: SVG, 1024x1024 icon, favicon set, 1200x630 social image.
- Must not resemble the original's mark. I never looked at their logo, so put it next to the drafts and check by eye.

## Voice

Plain. Steady. Teacher-first.

| word | does | does not |
| --- | --- | --- |
| plain | short sentences, ordinary words | not casual or jokey |
| steady | calm, no exclamation marks, no countdown panic | not cold |
| teacher-first | the teacher is the subject: "you set", "your class" | not bossy |

| do | don't |
| --- | --- |
| "Write your first quiz. It takes a few minutes." | "Let's get started on your amazing journey!" |
| "Time ran out" | "Too slow!" |
| "Right" / "Not this time" | "Correct!!!" / "Wrong!" |
| "Your teacher will start the game soon." | "Hang tight, the fun starts soon!" |
| "Students join with a code. No accounts." | "Frictionless, account-free onboarding" |

Rewritten in the app (all fresh): home headline "Run the quiz your way", home sub-line, teacher sign-up link,
page description, dashboard empty states, lobby and waiting messages, answer feedback ("Right", "Not this time",
"Time ran out", "Got it"), host start and end labels.

## Sweep

`python3 sweep.py . --config replica/brand.json` is clean: no "Wayground", "Quizizz", or their domains in code,
file names or config. Fixed one leftover (`supabase/config.toml` project id).

Still carrying the original's name, left for you to decide:
- The GitHub repo is called `replica-wayground`, so the name is visible in the URL. Rename it (GitHub redirects the
  old URL) before the repo is public or a domain points at anything. Renaming may disturb the Supabase GitHub link,
  so re-check the integration after.
- `replica/` holds the research and names the original on purpose. Keep it out of anything public and out of the
  deployed site (the sweep skips it by design).
