# Launch Checklist — Twitter / social outreach

→ [CLAUDE.md](../CLAUDE.md) | [product-plan.md](product-plan.md) | [roadmap.md](roadmap.md)

*Written 2026-09. Scope: what must be true before deliberately posting Day by Day
publicly and asking strangers to try it (pursuing gate G4 in product-plan.md).*

## Why this list exists

Everything through today has been "personal tool, ship to pull, don't push"
(product-plan.md). Posting on Twitter/social flips that: it's a deliberate
push for G4 rather than waiting for it. That's a legitimate choice, but it
changes the stakes —

- A stranger's data loss is now a support problem, not a personal shrug.
- There is currently **zero visibility** into whether anyone used the app
  after landing on it (static GitHub Pages page, no analytics).
- Real users arrive with zero context; the app "assumes the maintainer's
  knowledge" (product-plan.md Stage 1).

This list is the minimum to close before posting — not full Stage 1, not
Stage 2. Small and shippable.

## Gate status snapshot (as of 2026-09)

| Gate | Status |
|---|---|
| G1 — 60+ days personal use | Believed done (maintainer-confirmed) |
| G2 — data-integrity bugs fixed/accepted | Believed done — both accumulator bug families fixed (2026-07, 2026-08); remaining `totalHours` no-backfill is accepted, not a corruption risk |
| G3 — export/import shipped, legacy keys retired | **Not done** — export/import shipped 2026-07, but `daybyday_data`/`daybyday_backlog`/`daybyday_categories`/`daybyday_history` are still actively written every save (data-model.md § Legacy keys). Retiring them is not required to post (see below) but is worth tracking |
| G4 — ~3 unprompted asks | This checklist is how we pursue it |
| G5 — honest weekly time budget | Decide before posting — see below |

## Must-do before posting

- [ ] **Basic analytics** — GoatCounter (free, one `<script>` tag, no backend, privacy-respecting — fits the calm/no-anxiety tone) or Plausible/Fathom if a paid option is preferred. Track at minimum: page loads, and one "did they actually use it" event (e.g. first task added, first focus session started). Without this, the post's success is unmeasurable.
- [ ] **First-run experience** — empty states + a short intro for someone who has never seen the app. Today it assumes the maintainer's own knowledge (product-plan.md Stage 1). This is the single biggest cold-audience bounce risk.
- [ ] **Visible export reminder** — a gentle nudge (settings tip or first-run mention) telling people to export their data periodically. This is the only safety net available to strangers until legacy keys / a backend exist.
- [ ] **Day-rollover edge cases spot-checked** — multi-tab open at midnight, timezone changes, laptop-asleep-across-midnight (Stage 0 hardening item 6, still open). Strangers will hit these; the maintainer mostly hasn't.
- [x] **Cross-card drag bug confirmed fixed by hand** — closed 2026-10: passed the automated check and hasn't recurred in the maintainer's daily use (roadmap.md § Known Bugs).
- [ ] **Mobile/responsive pass** — Twitter traffic is majority mobile-web; confirm the app is at least usable (not necessarily install-quality) on a phone browser before linking it publicly.
- [ ] **`npm run check` green on the deployed `main`** — lint + html-validate + smoke, so the version strangers hit is the verified one.

## Decide before posting (not code — judgment calls)

- [ ] **G5: honest time budget.** Decide how many hours/week you're willing to spend on bug reports, "where's my data" questions, and feature requests once real users show up. Write the number down somewhere (even just here) so it's a real decision, not a default.
- [ ] **Feedback channel.** A mailto link or GitHub issue link (Stage 1 already calls for this) — pick one before posting so incoming feedback has somewhere to land instead of scattering across replies/DMs.
- [ ] **What "success" looks like for this post.** Per G4, the target is unprompted asks-to-keep-using-it, not raw traffic or likes. Decide the CTA accordingly (see Pitch notes below) so the post actually measures the right thing.

## Nice-to-have, not blocking

- [ ] PWA install (`manifest.json` + service worker) — makes the app feel more legitimate/sticky for anyone who likes it, but not required for a first post. Can follow shortly after if traction is real.
- [ ] Retire legacy localStorage keys (closes G3 fully) — safe to defer past launch since it's an internal cleanup, not user-facing.
- [ ] Short demo GIF/screen recording — strongly recommended for the post itself (see Pitch notes) but not an app change.

## Pitch notes (for the post itself)

- Lead with the philosophy, not a feature list: finitude-aware, calm-not-guilt-trippy, inspired by *4,000 Weeks*. That's the differentiator in a crowded productivity-app space.
- Lead with "no account, no signup, your data never leaves your browser" — a real advantage, say it explicitly.
- Post as a builder-in-public update ("I built this for myself because every task app made me anxious instead of focused"), not an ad.
- Include a short screen recording (10–15s) — visual tools outperform text descriptions on social.
- Cross-post to where the audience actually is: r/productivity, Hacker News "Show HN" (the no-backend/localStorage-only angle plays well there), and the *4,000 Weeks* / Cal Newport–adjacent crowd specifically.
- CTA should ask for the thing G4 needs — "tell me if you'd keep using this" / DMs open — not just clicks, so the response is actually measurable against the gate.

## After posting

- Watch analytics for return visits (days 3, 7, 14 — not just launch-day traffic), since G4 is about people coming back unprompted, not a traffic spike.
- Log every piece of real feedback somewhere durable (roadmap.md Backlog or a new `docs/feedback-log.md`) rather than letting it live only in Twitter replies/DMs.
- Re-check this list's "must-do" items stayed true — a bug that reappears after launch is now a stranger's problem, not just a personal annoyance.
