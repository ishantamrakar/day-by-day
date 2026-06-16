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
| `npm run check` | All three. |

Run locally first:

```bash
npm install                          # one-time, dev tooling only
npx playwright install chromium      # one-time, for the smoke test
npm run check
```

The app itself still needs no install — `npm run serve` (or `python3 -m http.server 8000`) and open `localhost:8000`.

## Deploy

`.github/workflows/deploy.yml` uploads the repo root to GitHub Pages on push to `main`. No build step — static files as-is. Pages source must be set to **GitHub Actions** in repo settings.
