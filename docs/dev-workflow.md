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
| `npm run test:regression` | The four data-integrity suites below (`scripts/run-regression.mjs`). |
| `npm run check:all` | Everything: `check` + `test:regression`. What CI and the deploy gate run. |

### Regression suites

These guard **data integrity** — the invariants where a regression silently loses or corrupts logged work. UI-level behaviour is deliberately *not* covered: those breaks are visible and recoverable, and flaky UI tests get ignored. Each drives the app through its own UI in a headless browser, so it exercises the same code paths a user does.

| Suite | Guards |
|-------|--------|
| `test-backlog.mjs` | New entries stay visible (General is never filtered away); hours + progress survive the Top 5 ↔ backlog round trip, including across a reload. |
| `test-rollover.mjs` | The `rescueCarryoverToBacklog()` invariant — no unfinished task is ever dropped, on either modal exit. Completed tasks aren't rescued. |
| `test-hours.mjs` | The time ring is *staged* (dismissing adds nothing); `totalHours` gains exactly what was committed and never double-counts. This accumulator is never recomputed from history, so corruption is permanent. |
| `test-growth.mjs` | Pre-existing hours don't fire milestone toasts; a milestone crossed while the sidebar is collapsed waits, unconsumed. Also guards the boot-order dependency: `baselineGrowthStages()` must run after `store.categories` is wired. |

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
