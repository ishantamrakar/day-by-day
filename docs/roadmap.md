# Roadmap

→ [CLAUDE.md](../CLAUDE.md)

## Known Bugs

- **`totalHours` not retroactive** — only reflects hours logged after categories feature was added. No backfill.

**Found during the 2026-10/11 module split.** The extraction sessions were
pure moves, so they recorded these instead of fixing them. Product decisions
the maintainer made on the ambiguous ones are marked **Decision**.

*Deliberate behaviour: not a bug*
- Distraction hours count toward the life area's `totalHours`. **Decision:** intended; documented in features.md § Life Areas.

*Remove*
- **Legacy carryover banner** (`js/ui/carryover.js`). It's superseded by the Day Transition modal, effectively unreachable (it needs a non-empty `_carryover` and a saved day with no goals, which contradict each other), and its accept can create duplicate goals. **Decision:** remove it entirely; the modal is the only carryover flow.

*UX*
- **Undoing a goal delete doesn't restore its `_carryover` entry.** The delete scrubs one same-named leftover; Cmd+Z brings the goal back but not the leftover. Harmless today (the restored goal is in Top 5, and rescue skips names already there), but the two are no longer symmetric. Found 2026-11.
- **Demoting a goal can't be undone.** **Decision:** make Cmd+Z restore it to Top 5 at its old position with hours and progress. The demote handler also calls `renderSidebar()` redundantly right after `render()`.
- **Top 5 fills while the add-goal modal is open:** confirming silently does nothing and the typed text stays put.
- **"All 1 goals done."** The encouragement line doesn't pluralize.
- **`makeEditable` saves after Escape or an unchanged edit.** Nothing visible goes wrong; it's a needless storage write.

*Code consistency (not bugs)*
- `makeEditable` reaches modules two ways: `js/ui/tasks.js` and `js/ui/done-today.js` import it directly, while Backlog and Journal get it through `configure()`. Pick one.
- The encouragement-message choice is pure logic still sitting in `js/ui/summary.js`; it could move to `js/core/summary.js`.

**Fixed (2026-11):** the ~350 ms after a slider hits 100. The completing row is still drawn but no longer an active goal, so drag's screen positions and `getActiveGoals()` disagreed: dragging the row below it moved the *next* goal instead. The delayed re-render also tore down any drag or inline rename in progress, losing the edit. Drag now finds the moved goal by identity and skips completing rows, and the re-render waits for drags and editors. (Delete, slider and rename targeting were checked and were already correct; the original report blamed those.) Guarded by "Top 5: the moment a goal completes" in `scripts/test-backlog.mjs`.

**Fixed (2026-11):** goals added with Enter were stored with `category: null`, while the + button and backlog adds stored `'general'`. Every read already treated null as General, so nothing looked different; the Enter path now stores `'general'` too. Existing null values are left alone. Guarded in `scripts/test-backlog.mjs`.

**Fixed (2026-11):** deleting a goal scrubbed *every* `_carryover` entry with its name, so two leftovers sharing a name both vanished. Only one is removed now (`withoutOneGoalNamed`). Guarded in `scripts/test-day-logic.mjs`.

**Fixed (2026-11):** `checkForNewDay()` (tab open past midnight) built `_carryover` with its own inline copy of `buildCarryover`, so the two rollover paths could drift apart. It now calls the shared function. Verified by mutation: breaking `buildCarryover` used to fail only the reopen suite; now both day-boundary suites fail (9 and 6 checks).

**Fixed (2026-11):** a task's `prevHours` (its "Xh prev" history) was lost whenever it went through the backlog: rescue at rollover, any promote or demote, and repeatables pre-loaded by "Start my day". Backlog items didn't store the field at all. The store now persists it on backlog entities, and all six promote/demote copies go through `goalToBacklogItem` / `backlogItemToGoal` (`js/core/backlog.js`). Category totals were never affected. Guarded in `scripts/test-day-logic.mjs`, including a promote → demote → reload round trip.

**Fixed (2026-11):** deleting a focus session kept its hours on the goal and the area and couldn't be undone. Per the maintainer's decision, delete now hands the hours back and Cmd+Z restores the session and both totals. Sessions now record `goalHoursAdded` so the amount is exact. Guarded by "Hours: focus-session delete and undo" in `scripts/test-hours.mjs`.

**Fixed (2026-11):** deleting a quick win, an active goal or a completed goal left its hours in the life area's `totalHours`, since hours were added on create but never taken out on delete. Delete now subtracts today's hours and undo re-adds exactly what was taken. Guarded by the "Hours: deletes and undo" suite in `scripts/test-hours.mjs`.

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
