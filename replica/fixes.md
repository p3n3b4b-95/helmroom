# What to fix, and the angle

**Sample: 15 reviews, 2 sources** (10 App Store, 5 TrustRadius), dated 2018 to 2025. The skill asks for 100+ across 3 sources. This is a direction, not a ranking, and every item below is thin or close to it.

Not reachable or not used:
- Capterra: behind a Cloudflare check, not bypassed.
- Reddit: blocked in the browser pane.
- Apple's review RSS feed: returned no entries for this app.
- Google Play, G2, Trustpilot: no page reached.

Also: the App Store page showed only 10 reviews, in no recency order, and 8 of 15 reviews are from 2022 or earlier, before the rebrand. The reviewers are mostly students on the phone app. `feedback.md` auto-sorted a few lines into the wrong themes ("slow readers" as "slow", a vanished question as "sync"). I read them by hand and the lists below correct that.

## 1. What they hate

Reviews count / sources. Quotes are verbatim, linked to the page they were copied from.

| # | problem | reviews | sources |
| --- | --- | --- | --- |
| 1 | Crashes, getting kicked out, and a question that disappears | 4 | 2 |
| 2 | Editing a quiz is clunky: reorder, delete, rename, find features | 3 | 2 |
| 3 | Can't change an answer once tapped, so a misclick is final | 3 | 1 (thin) |
| 4 | Timers too short to read long questions | 2 | 1 (thin) |
| 5 | Teacher settings that hurt: shuffle can't be turned off, wrong answer shown alone | 2 | 1 (thin) |
| 6 | Support never answers, account recovery fails | 1 | 1 (thin) |

1. Crashes (4). "A whole other thing is that it can be insanely buggy with it thinking you tapped a different answer to the one you chose to just completely kicking you out of the game." (app-store, 1*, 2019, https://apps.apple.com/us/app/wayground/id1160249042?see-all=reviews). "Modifying existing quizzes often simply does not work: the system looks up when I try to add new items." (trustradius, 2/10, 2024, https://www.trustradius.com/products/wayground/reviews)
2. Editing (3). "Quizizz has no easily discovered way to change titles of quizzes." (trustradius, 2024, same page). "Sometimes hard to find features / A little complex to design quizzes / More templates available" (trustradius, 8/10, 2022, same page).
3. No second guess (3). "if I miss-tap or miss-read and answer choice its instantly wrong with no way of changing it." (app-store, 1*, 2019).
4. Timers (2). "It is literally impossible to read that fast." (app-store, 1*, 2021).
5. Forced settings (2). "I searched all over to find how to turn off the shuffle." (app-store, 1*, 2020).
6. Support (1, thin). "I got no response... ugh!" (app-store, 1*, 2020).

## 2. What is missing

Asked for by name, all thin (1 review each):
- Build quizzes from a phone: "I would love to be able to create quizzes when I am not near a computer." (app-store, 4*, 2018). The original has since shipped a teacher app, so this is likely solved there.
- More question options: "can we have more options for questions?" (app-store, 4*, 2018).
- A history of scores: "Individual data bank of scores and past assignments." and "Remediation tool." (trustradius, 2022).
- More templates (trustradius, 2022, above).

## 3. What is unsolved

- **Slow readers and anxious students.** Timers and instant, final answers read as stress to two reviewers: "its just too stressful." (app-store, 1*, 2019). Thin, 1 source. The original's own plans page lists accommodations, so check what they cover before claiming a gap.

## Fix plan

Chosen on evidence times how cheap it is. Each is in `features.csv` with `original` = no.

| # | build | size | skill | evidence |
| --- | --- | --- | --- | --- |
| 1 | Change your answer until time is up, setting on by default | S | replica-build | list 1.3, 3 reviews |
| 2 | Timer control: no timer, or extra time, per quiz and per student | S | replica-build | list 1.4, 2 reviews |
| 3 | One settings panel: shuffle questions and answers, hide leaderboard, show or hide the right answer | M | replica-build | list 1.5, 2 reviews, and a 4-star reviewer who hides the leaderboard on purpose |
| 4 | Rename and duplicate quizzes, drag to reorder | S | replica-build | list 1.2, 3 reviews |
| 5 | Resume where you left off and retry a failed answer submit | M | replica-backend | list 1.1, 4 reviews, 2 sources |
| 6 | Password reset by email | M | replica-backend | list 1.6, 1 review |
| 7 | Check the editor and play screens at 390px | S | replica-test | list 1.1, phone complaints |

Pricing: no pricing complaint in this sample. The original's public plans page limits its free plan to 20 saved activities and 100 students, so a free plan above that is a lever for `/replica-launch`. That comes from their plans page, not from reviews.

## The angle

Three options, each tied to a list above. All are thin.

1. **Teacher control.** For teachers who can't turn off shuffle, rename a quiz or reorder questions without hunting, Quizroom puts every rule in one place and lets you edit anything. Evidence: editing 3 reviews across 2 sources, forced settings 2 reviews.
2. **Calm mode.** For teachers whose students freeze under a 20-second timer and a final tap, a mode with generous time and changeable answers. Evidence: timers 2 and no second guess 3, 1 source.
3. **Doesn't break.** For classes that lose a quiz to a crash, answers saved as you go and resume on any device. Evidence: 4 reviews, 2 sources. Hardest to prove, easy to over-promise.

**Recommend 1, with calm mode as one of its settings.** It rests on teacher voices from two sources, it is cheap to build (fixes 1 to 4), and it doesn't promise reliability we can't yet show. Before betting on it, read 30 more teacher reviews or ask 10 teachers.

Rules that carry forward: don't use the original's name in our name, ads or store listing, and don't put these reviewers' words on the landing page. A comparison page is a question for a lawyer in your country.
