# Product Phase Plan

→ [CLAUDE.md](../CLAUDE.md) | [roadmap.md](roadmap.md) § Product Vision | [data-model.md](data-model.md)

*Written 2026-07. How and when Day by Day goes from personal tool to product. The decision to stay vanilla JS until Stage 2 is deliberate (see "Framework decision" below).*

## What "product phase" actually means

The switch isn't a feature — it's the moment someone who isn't the maintainer depends on the app: their data, their daily habit. That flips every default:

- Data loss goes from "annoying" to unacceptable
- UI churn goes from "rapid iteration" to breaking someone's muscle memory
- A bug is no longer a note in roadmap.md — it's someone's lost journal entry

So the phases below are separated by **gates, not dates**. The calendar never forces a transition; the gates do.

## The gates — enter product phase when ALL of these are true

| # | Gate | Why it matters |
|---|------|----------------|
| G1 | **Personal proof** — 60+ days of genuine daily use; the day-transition modal has real history behind it | If the maintainer's own streak doesn't hold, nobody else's will |
| G2 | **Data integrity clean** — the Known Bugs that touch data (category `totalHours` double-count on carryover, no-backfill) are fixed or consciously accepted; zero data-loss incidents in the last 30 days | Users forgive UI bugs, never lost data |
| G3 | **Data safety shipped** — JSON export/import exists; the unified store has run 30+ clean days and the legacy backup keys are retired | Export is both a trust feature and the future migration tool |
| G4 | **External pull** — at least ~3 people have asked to use it *unprompted* after seeing it | Ship to pull, don't push. If nobody asks, staying personal is success, not failure |
| G5 | **Honest time budget** — product means support, onboarding, infra. Decide the weekly hours it's worth *before* strangers depend on it | The finitude philosophy applies to the maintainer too |

## Stage 0 — Hardening (now → gates; still 100% personal)

Everything here pays off even if the product phase never happens.

1. **Fix the data-integrity bugs** (roadmap.md Known Bugs): carryover double-count in `archiveDay()`, decide on `totalHours` backfill.
2. **JSON export/import** — one button each; exports the unified store verbatim. Doubles as backup against "Clear browsing data" and becomes the account-migration path in Stage 2.
3. **Retire legacy keys** once the store has a clean month (data-model.md already plans this).
4. **Split `app.js` into native ES modules** (`store.js`, `focus.js`, `sidebar.js`, `drag.js`, …). `<script type="module">` keeps the no-build-step property. This is the agreed alternative to a framework rewrite.
5. **Formalize the verification scripts** — the ad-hoc Playwright scripts (idle check, crash recovery, backlog filter, distraction hours) become `scripts/test-*.mjs` wired into `npm run check`, so the safety net exists before outside users do.
6. **Day-rollover edge cases** — multi-tab open at midnight, timezone changes, laptop-asleep-across-midnight.

**Exit:** G1–G3 all true. **Target window:** through ~Sep 2026, alongside daily use — but gates rule, not the calendar.

## Stage 1 — Private beta as a PWA (first product step)

Roadmap Phase 2. Goal: **5–15 trusted users, still zero backend, zero accounts.** Their data lives in their browser exactly like yours does.

- `manifest.json` + service worker: installable, offline-capable (cache-first static shell — trivial since there's no API)
- Multi-tab safety (`storage` event listener or a single-tab lock) — the first thing real users hit that the maintainer never does
- **First-run experience** — empty states and a gentle intro; today the app assumes the maintainer's knowledge
- Store **migration runner** keyed on `store.version` — beta users will cross schema changes
- In-app feedback link (mailto or GitHub issue link is enough)
- Distribution: GitHub Pages already deploys `main`; beta users just get the URL

**Success metric:** ≥5 people still using it after 3 weeks, unprompted.
**Decision point after:** if retention is real and people ask for *sync* — proceed to Stage 2. If not, the app stays a great personal tool + PWA, and that's a fine terminal state.
**Effort guess:** 2–4 weeks part-time.

## Stage 2 — Accounts + sync (the real product line)

Only entered on demonstrated Stage-1 pull. This is the expensive door.

- **Backend:** managed platform (e.g. Supabase) over hand-rolled — the table schema is already designed in data-model.md § Future database schema
- **Auth:** magic-link email (calm, passwordless — fits the philosophy)
- **Sync model:** local-first. localStorage stays the working copy; server reconciles. Last-write-wins per entity is acceptable at this scale — a single user on two devices, not collaboration
- **Migration:** Stage-0 export/import becomes "import my existing data into my account"
- **Privacy stance decided up front:** journal entries and session reflections are intimate. Minimum: encryption at rest + a written policy. Consider E2E-encrypting journal text — a real differentiator for this kind of app
- **Framework decision reopens here** (and only here): sync introduces loading/error/conflict UI state, which is where declarative rendering earns its cost. If adopted, do the framework and data-layer migrations together — Preact/Svelte before React for footprint. Never rewrite twice
- **Never break local-only mode:** an account must stay optional forever. Free local, paid sync is the natural split

**Effort guess:** 1–2 months part-time + ongoing ops. First real money cost (domain, email, hosting past free tier).

## Stage 3 — Monetization + native (roadmap Phases 3–4)

- **Pricing:** one-time purchase aligns with the finitude philosophy; sync's recurring cost argues subscription. Likely hybrid: free local-only forever, modest subscription for sync + AI nudges
- **Native SwiftUI port** (roadmap Phase 3) only once the web product proves retention — the "no DOM-coupled logic" rule in roadmap.md is what keeps this port feasible
- **AI nudges** (the agentic notification framework big-swing) become the paid differentiator; they need the session/journal corpus that Stages 1–2 accumulate — the activity monitor and `sessions` data are already designed to feed it

## Standing rules (every stage)

1. The app must always work with zero account and zero network.
2. Export is always available, always complete.
3. Store schema changes ship with a forward-only, tested migration.
4. Every product decision is filtered through the tone rule: **does this add anxiety?** If yes, redesign it.

## Timeline sketch (gates rule; dates are orientation only)

| When | What |
|------|------|
| Jul–Sep 2026 | Stage 0 hardening alongside daily use |
| ~Oct 2026 | Gate check G1–G5 |
| Q4 2026 | Stage 1 PWA private beta (if gates pass) |
| Early 2027 | Stage 2 go/no-go, based on beta retention + sync demand |
