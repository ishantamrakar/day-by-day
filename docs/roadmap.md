# Roadmap

→ [CLAUDE.md](../CLAUDE.md)

## Known Bugs

- **`totalHours` not retroactive** — only reflects hours logged after categories feature was added. No backfill.

**Removed (2026-11):** browser notifications. The permission flow worked but notifications didn't appear in some browsers, so the Notification API code, the "Enable Notifications" prompt and the `daybyday_prefs` dismissed flag were removed. The in-app nudge banner stays. OS notifications come back with the native builds (see Product Vision), where each platform's notification system is reliable.

**Closed (2026-10):** cross-card drag (ghost paint trail, goal→backlog drop not registering). An automated pass (5 goal→backlog drops at two drag speeds) succeeded 5/5 with no ghost trail and no console errors, and the maintainer has not seen it in real daily use since. Most likely fixed incidentally by the blob re-raster perf work in PR #7 — no targeted fix was made, so if it reappears, start from the pointer-capture diagnosis kept in [drag-drop.md](drag-drop.md).

**Fixed (2026-08):** `saveCategories()` wrote only the legacy `daybyday_categories` key, never the unified store — so `store.categories[].totalHours` in localStorage stayed stale until some unrelated action happened to call `saveStore()`. In-memory reads were correct (the two share one array), which is why it went unnoticed. Caught by the new `test-hours.mjs` regression suite the day it was written.

**Fixed (2026-07):** the "category hours on carryover" double-count family. Audit found and fixed four accumulator leaks: quick-done hour edits didn't accumulate their delta; changing a quick-done's category left its hours in the old category's total; the focus-session save accumulated uncapped hours when the 24h/day goal cap truncated the gain; and `prevHours` reset each rollover instead of accumulating across multi-day carries. Goal-card hour edits were already correct (delta-based).

## Backlog

**Near-term**
- Category hours imbalance in Day Transition Modal — needs more data to be useful, will improve with daily use
- Standalone repeatable task templates — currently repeatables must be tied to a goal or backlog item

**Medium**
- Surface common pitfalls from journal history — "last time you worked on X, you noted Y"

**Larger**
- Task snowball visualization — compounding progress shown as a growing metaphor (fire, sun)
- Weekly/monthly views from archive history
- ~~Export data as JSON~~ — shipped 2026-07 (Settings → Data); CSV still open
- Streak tracking per life area
- Dark mode — will live in Settings → Appearance
- Custom nudge frequency

**Big swings (separate projects)**
- Agentic notification framework — fine-tuned model (Qwen + GRPO via [ART](https://github.com/OpenPipe/ART)) for context-aware nudges
- Full SDLC template — feature branches, pre-commit hooks, CI, free-tier hosting

## Product Vision

This is not task management. It's **finitude-aware focus** — helping you feel the weight of limited time gently, not anxiously.

> **The concrete how-and-when plan for going product** — gates, stages, and standing rules — lives in [product-plan.md](product-plan.md).

**Phases:**
1. **Now** — vanilla web app, self-use, rapid iteration. No infra, no accounts.
2. **PWA** — offline, home screen install. Still no backend. (Web push deliberately skipped — browser notifications were unreliable and were removed 2026-11.)
3. **Native iOS/macOS** — SwiftUI, iCloud sync, real OS notifications (the nudge messages in `js/core/nudges.js` are the starting content). The glass design language maps directly to visionOS/iOS 26.
4. **Multi-platform** — subscription for sync + AI nudges.

**Architectural decisions that matter for the future:**
- State shape `{ date, goals, distractions, successes, failures, quickDone }` is portable — keep it clean
- `totalHours` is a running accumulator by design — store as a field when porting to a backend, don't recompute
- No DOM-coupled logic — business logic lives in `js/core/`, which ESLint keeps free of DOM and browser APIs, so a React Native or SwiftUI port reuses or transliterates it (see architecture.md § Porting)
- The Day Transition Modal will eventually suggest tasks based on momentum, not just hours imbalance

**Open questions:**
- Goal ordering: drag-only, or smarter signal (time-of-day, streak, effort estimate)?
- Monetization: one-time purchase (aligns with finitude philosophy) vs subscription?
- How much journal/history can feed an on-device model without a backend?
