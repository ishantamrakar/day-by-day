# Day by Day

> **For Claude:** Update this file and the relevant `docs/` file whenever you add a feature, fix a bug, or restructure code. Stale docs are worse than none.
>
> **Commits are manual.** The maintainer makes every git commit and push themselves. Never run `git commit`, `git push`, `git checkout -b`, or open PRs. When work reaches a commit point, output the exact commands (and commit message) for them to run by hand.
>
> **Workflow (required) — use the pipeline for ALL new work.** Never edit `main` or `develop` directly. For any feature or fix:
> 1. Branch `feature/<name>` off `develop` (give the maintainer the `git checkout` commands to run).
> 2. Do the work; verify with `npm run check` (lint + html-validate + smoke) before handing over.
> 3. Hand over commit commands; the maintainer commits, pushes, and opens a PR into `develop`.
> 4. After it merges to `develop`, a `develop → main` PR ships it (push to `main` auto-deploys to Pages).
>
> Prefer small, verifiable steps each with their own commit point. See [docs/dev-workflow.md](docs/dev-workflow.md).

Finitude-aware daily focus app. Personal tool first, product eventually. Inspired by Oliver Burkeman's *4,000 Weeks* — embrace limits, act imperfectly, focus on what matters.

**Stack:** Vanilla JS, no framework, no build step. Serve via HTTP (`python3 -m http.server 8000`) — `file://` blocks localStorage and Notifications.

```
index.html       — layout & structure
style.css        — all styling (Daily Spark design system)
app.js           — core logic, state, rendering
notifications.js — nudge system, browser notifications
```

## Docs

| File | Contents |
|------|----------|
| [docs/architecture.md](docs/architecture.md) | State shapes, localStorage keys, file internals, key functions |
| [docs/data-model.md](docs/data-model.md) | Unified store schema, store⇄view adapter, future DB design |
| [docs/design-system.md](docs/design-system.md) | Colors, depth/glass system, buttons, typography, guardrails |
| [docs/features.md](docs/features.md) | All implemented features, how each system works |
| [docs/drag-drop.md](docs/drag-drop.md) | Drag & drop deep dive — all three systems, known bugs |
| [docs/roadmap.md](docs/roadmap.md) | Known bugs, backlog, future ideas, product vision |
| [docs/dev-workflow.md](docs/dev-workflow.md) | Branch model (`main`/`develop`/`feature/*`), CI checks, GitHub Pages deploy |

## Philosophy & Tone

The app must feel **calm and encouraging** — never stressful or micromanaging.

- Hours:minutes only, no seconds
- "Hours invested" not "wasted" — encouraging language throughout
- Spacious layouts, never cramped
- Guilt-trip messages are reflective questions, not attacks
