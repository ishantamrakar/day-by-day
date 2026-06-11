# Roadmap

→ [CLAUDE.md](../CLAUDE.md)

## Known Bugs

- **Cross-card drag broken** — goal→backlog drop unreliable, ghost trail. Full diagnosis in [drag-drop.md](drag-drop.md).
- **Browser notifications** — permission flow works but notifications don't appear in some browsers. In-app nudge is the reliable fallback.
- **`totalHours` not retroactive** — only reflects hours logged after categories feature was added. No backfill.
- **Category hours on carryover** — if a carried-over goal's hours are edited, `totalHours` may double-count. `archiveDay()` doesn't touch `totalHours`.

## Backlog

**Near-term**
- Category hours imbalance in Day Transition Modal — needs more data to be useful, will improve with daily use
- Standalone repeatable task templates — currently repeatables must be tied to a goal or backlog item

**Medium**
- Surface common pitfalls from journal history — "last time you worked on X, you noted Y"

**Larger**
- Task snowball visualization — compounding progress shown as a growing metaphor (fire, sun)
- Weekly/monthly views from archive history
- Export data as JSON/CSV
- Streak tracking per life area
- Dark mode
- Custom notification frequency

**Big swings (separate projects)**
- Agentic notification framework — fine-tuned model (Qwen + GRPO via [ART](https://github.com/OpenPipe/ART)) for context-aware nudges
- Full SDLC template — feature branches, pre-commit hooks, CI, free-tier hosting

## Product Vision

This is not task management. It's **finitude-aware focus** — helping you feel the weight of limited time gently, not anxiously.

**Phases:**
1. **Now** — vanilla web app, self-use, rapid iteration. No infra, no accounts.
2. **PWA** — offline, home screen install, working push notifications. Still no backend.
3. **Native iOS/macOS** — SwiftUI, iCloud sync. The glass design language maps directly to visionOS/iOS 26.
4. **Multi-platform** — subscription for sync + AI nudges.

**Architectural decisions that matter for the future:**
- State shape `{ date, goals, distractions, successes, failures, quickDone }` is portable — keep it clean
- `totalHours` is a running accumulator by design — store as a field when porting to a backend, don't recompute
- No DOM-coupled logic — business logic in functions makes porting to React/SwiftUI easier
- The Day Transition Modal will eventually suggest tasks based on momentum, not just hours imbalance

**Open questions:**
- Goal ordering: drag-only, or smarter signal (time-of-day, streak, effort estimate)?
- Monetization: one-time purchase (aligns with finitude philosophy) vs subscription?
- How much journal/history can feed an on-device model without a backend?
