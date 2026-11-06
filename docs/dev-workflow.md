# Dev Workflow

→ [CLAUDE.md](../CLAUDE.md) | [architecture.md](architecture.md)

How we branch, check, and ship. The **app** stays a no-build vanilla-JS project — everything here is dev tooling and runs in CI, never ships to users.

## Branches

| Branch | Role |
|--------|------|
| `main` | Production. Auto-deploys to GitHub Pages on every push. Protected — changes land via PR only. |
| `develop` | Integration branch. PRs target this. |
| `feature/*` | Short-lived, branched off `develop`. |

Flow: `feature/x` → PR into `develop` → (after verify) `develop` → PR into `main` → auto-deploy.

```bash
git checkout develop && git pull
git checkout -b feature/my-thing
# …work…
git push -u origin feature/my-thing      # open PR into develop
```

## Checks (CI runs these on every PR)

No build. Pure static checks — see `.github/workflows/ci.yml`.

| Command | What it does |
|---------|--------------|
| `npm run lint` | ESLint (`eslint.config.js`) — errors only: undefined vars, dupe keys, unreachable code. Intentionally permissive. |
| `npm run validate:html` | `html-validate` on `index.html`. |
| `npm run test:smoke` | Serves the app, loads it headless, asserts no console errors and that `window.DayByDayApp` exists (`scripts/smoke-test.mjs`). |
| `npm run check` | All three — the fast local loop. |
| `npm run test:regression` | The data-integrity suites below (`scripts/run-regression.mjs`). |
| `npm run check:all` | Everything: `check` + `test:regression`. What CI and the deploy gate run. |

### Regression suites

These guard **data integrity** — the invariants where a regression silently loses or corrupts logged work. UI-level behaviour is deliberately *not* covered: those breaks are visible and recoverable, and flaky UI tests get ignored. Each drives the app through its own UI in a headless browser, so it exercises the same code paths a user does.

| Suite | Guards |
|-------|--------|
| `test-backlog.mjs` | New entries stay visible (General is never filtered away); hours + progress survive the Top 5 ↔ backlog round trip, including across a reload. |
| `test-rollover.mjs` | The `rescueCarryoverToBacklog()` invariant — no unfinished task is ever dropped, on either modal exit. Completed tasks aren't rescued. |
| `test-hours.mjs` | The time ring is *staged* (dismissing adds nothing); `totalHours` gains exactly what was committed and never double-counts. This accumulator is never recomputed from history, so corruption is permanent. |
| `test-growth.mjs` | Pre-existing hours don't fire milestone toasts; a milestone crossed while the sidebar is collapsed waits, unconsumed. Also guards the boot-order dependency: `baselineGrowthStages()` must run after `store.categories` is wired. |
| `test-day-logic.mjs` | What survives a new day, on both rollover paths (reload on a later date, and the tab left open across midnight via Playwright's fake clock): `_carryover` contents (progress kept, `prevHours` cumulative, done one-offs dropped, done repeatables reset), 1-day and multi-day gaps, intentions and focus areas resetting, `totalHours` never double-counted, the summary walking back past an idle day, the delete-scrub of `_carryover`, and the modal coming back after a reload before it was answered. Written before the day-logic extraction and kept unchanged through it. |
| `test-shared-time.mjs` | Sharing one focus session's time across tasks: the split arithmetic (shares total 100%, hours total exactly the session), bringing a task in mid-session, the exit split, each task and life area credited its share, one journal entry, and delete/undo handing every share back. |
| `test-checkpoints.mjs` | Focus checkpoints: the rules (when to ask, when Ultra turns on, trimming, confirmed time, overnight credit) checked directly, then on a fake clock: steady work turns Ultra on with no question; mouse movement isn't a checkpoint; the question comes an hour after the last checkpoint and trimming keeps only confirmed time; the first click after a sleep asks instead of bridging the gap; the exit line; crash wrap-up and resume; overnight retirement counted to the last checkpoint and credited to the life area. |

`scripts/harness.mjs` holds the shared browser/server setup and helpers (`addGoal`, `getBacklog`, `getCategoryHours`, …). New suites go in `scripts/test-*.mjs` and get added to the list in `run-regression.mjs`, which runs **all** suites and reports every failure rather than stopping at the first.

Run locally first:

```bash
npm install                          # one-time, dev tooling only
npx playwright install chromium      # one-time, for the smoke test
npm run check
```

The app itself still needs no install — `npm run serve` (or `python3 -m http.server 8000`) and open `localhost:8000`.

## Deploy

`.github/workflows/deploy.yml` uploads the repo root to GitHub Pages on push to `main`. No build step — static files as-is. Pages source must be set to **GitHub Actions** in repo settings.

**Deploy is gated.** The workflow runs `npm run check:all` in a `verify` job and the `deploy` job `needs:` it — nothing ships unless lint, HTML validation, the smoke test, and all regression suites are green. The gate lives *inside* the deploy workflow rather than trusting that CI ran, because this workflow fires on any push to `main` — including a direct push or an admin merge that bypassed the PR.

CI also runs on push to `main` (not just PRs into it) for the same reason, and both workflows cache the Playwright Chromium download, which is most of their runtime.
