# Pricing

Read 2026-10-13. Prices move, so recheck before you publish anything.

## What is public

| product | what I could verify | source |
| --- | --- | --- |
| Original, "Basic" | free, no card. Limited question types, up to 20 saved activities, up to 100 students | https://wayground.com/home/plans (read 2026-10-13, via a page-summary tool, so recheck by eye) |
| Original, "School and District" | no price shown, quote only. Unlimited storage and students, all question types, admin dashboard, LMS integrations | same page |
| Review sites for the original | disagree: $59 or $99 per user per month on one, $75 or $125 on another | Capterra and SaaSworthy search snippets, not read on the pages. Treat as unreliable |
| Kahoot | the page I reached lists business plans only ($19 to $79 per month billed annually), not teacher or school plans. Not comparable | https://kahoot360.com/pricing/ (read 2026-10-13) |

Not found: a reachable teacher-plan page for Kahoot, and any price for Blooket (the page returned 403). Don't anchor
on competitors' numbers until someone reads them properly.

## What reviewers said about price and billing

Nothing. 0 of 15 reviews in `reviews.csv` mention price, billing or cancelling. There is no complaint here to fix,
and no evidence either way on what teachers will pay.

## Model

Three tiers at most. Nothing is billed today, and I recommend not building billing until teachers ask.

1. **Free, for teachers.** Today, everything. When limits are needed, set them above the original's free limits
   (20 saved activities, 100 students) because that is the one public lever we have. Keep it free for good, not a trial.
2. **School, flat per school per year.** Shared library and admin view for a whole school. One price per school,
   never per seat, so there is no per-seat jump to complain about. The amount comes from 10 conversations with
   schools, not from this document. These features don't exist yet.
3. **No third tier until a second group of buyers shows up.**

Annual billing would usually come with two months free, but with no price there is nothing to discount yet.

## Billing fixes to bake in once billing exists

- One-click cancel from the account page, no email to a human.
- A renewal email 7 days before charging, with the amount.
- No per-seat pricing, no mid-term price jumps.
- Refund the unused part of an annual plan on request within 30 days.

## Stripe

Nothing to create yet. When a School plan exists: one Product, "Helmroom School", one yearly Price in the currency
you sell in. You create these yourself in your Stripe dashboard.
