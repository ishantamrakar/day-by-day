# Day by Day

> **For Claude:** Update this file and the relevant `docs/` file whenever you add a feature, fix a bug, or restructure code. Stale docs are worse than none.

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
| [docs/design-system.md](docs/design-system.md) | Colors, depth/glass system, buttons, typography, guardrails |
| [docs/features.md](docs/features.md) | All implemented features, how each system works |
| [docs/drag-drop.md](docs/drag-drop.md) | Drag & drop deep dive — all three systems, known bugs |
| [docs/roadmap.md](docs/roadmap.md) | Known bugs, backlog, future ideas, product vision |

## Philosophy & Tone

The app must feel **calm and encouraging** — never stressful or micromanaging.

- Hours:minutes only, no seconds
- "Hours invested" not "wasted" — encouraging language throughout
- Spacious layouts, never cramped
- Guilt-trip messages are reflective questions, not attacks
