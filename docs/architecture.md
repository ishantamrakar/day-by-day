# Architecture

→ [CLAUDE.md](../CLAUDE.md) | [features.md](features.md) | [drag-drop.md](drag-drop.md)

## localStorage Keys

| Key | Contents |
|-----|----------|
| `daybyday_store` | **Unified store (source of truth, Phase 3).** See [data-model.md](data-model.md). |
| `daybyday_data` | Today's state object — legacy, still written as a backup |
| `daybyday_history` | Up to 30 archived day objects |
| `daybyday_layout` | Card column order (JSON) |
| `daybyday_backlog` | Persistent backlog array |
| `daybyday_categories` | Categories with all-time `totalHours` |
| `daybyday_sidebar` | `'collapsed'` or `'open'` |
| `daybyday_prefs` | Notification dismissed flag |
| `daybyday_focus_session` | In-progress focus session snapshot (crash recovery) — written while a session runs, cleared on every deliberate close; same-day snapshots trigger a resume prompt on load |

## Data model

The **unified store** (`daybyday_store`) is the source of truth; `state.goals` /
`state.distractions` / `state.quickDone` / `backlog` / `state.focusSessions` are
live views over it (each carries its entity id as `_eid`). Full schema, the
store⇄view adapter, and the future DB design: **[data-model.md](data-model.md)**.
The legacy state shapes below are still written as a backup and still drive
day-rollover detection in `loadState()`.

## State Shapes

**Daily state** (`daybyday_data`):
```js
{
  date: 'YYYY-MM-DD',
  goals: [{ name, hours, progress, prevHours?, fromBacklog?, category?, repeatable? }],
  distractions: [{ name, hours, category? }],
  successes: [string],
  failures: [string],
  quickDone: [{ name, hours }],
  focusCategoryIds?: [string],   // set by Day Transition Modal
  focusIntentions?: { [catId]: hours },  // optional per-area time intention for TODAY only
  _carryover?: [goal]            // temp — set on new day, consumed by modal
}
```

**Backlog** (`daybyday_backlog`): `[{ name, category?, repeatable?, hours?, progress? }]` — `addBacklogItem()` stamps `category: 'general'` on entry; a missing `category` is also treated as General. General items bypass the focus filter (see [features.md](features.md) § Backlog).

**Categories** (`daybyday_categories`):
```js
[{ id, name, emoji, color, totalHours, vision?, seenStage? }]
```
- 5 defaults: fitness, career, relationships, chores, general
- `seenStage` — last growth stage acknowledged by the milestone toast (see [features.md](features.md) § Growth stages). Baselined at boot by `baselineGrowthStages()` so existing hours never toast.
- Custom ids start with `custom_`
- `totalHours` is a **running accumulator** — never recomputed from history, only `+= delta` via `accumulateCategoryHours()`. This is intentional for performance; preserve this when porting to a backend.

## app.js internals

IIFE, `'use strict'`. Key constants: `STORAGE_KEY`, `HISTORY_KEY`, `LAYOUT_KEY`, `BACKLOG_KEY`, `CATEGORIES_KEY`, `SIDEBAR_KEY`, `RING_CIRCUMFERENCE = 2π × 34`.

**Storage:** `storageGet(key)` / `storageSet(key, value)` — localStorage wrapped in try/catch.

**Categories:**
- `loadCategories()` — merges saved + defaults at boot. `{ ...def, ...saved }` so saved values win.
- `getCategoryById(id)` — always returns something; falls back to `general`.
- `accumulateCategoryHours(catId, delta)` — **only place `totalHours` is mutated.** Called on every hours-input change.
- `createCategoryPill()` — tracks `currentCatId` in closure so picker always shows current value.
- `makeTimeAddRing({ presets, onChange })` → `{ el, getHours, setHours, reset }` — the reusable staged time picker (ring + preset dial chips). The caller owns the commit, so it drops into anywhere time gets logged. Constants: `TIME_RING_MAX` (12h ceiling per pass), `TIME_RING_STEP` (5-minute drag snap). `makeChipDial(hours)` builds a preset's mini dial. Replaced `makeTimeAddPills`, which applied time live on every tap.
- `openTaskContextPicker(anchor, catId, repeatable, onConfirm, { showRepeatable })` — the **single** category/context modal for every task-like row. `showRepeatable: false` gives a category-only picker (used by backlog + distractions); default shows the repeatable toggle (Top 5 goals). There is no separate popover picker.

**Shared UI helpers** (added to kill duplication — reuse these, don't reimplement):
- `formatHours(h, emptyLabel='+ hrs')` — the one h/m pill formatter. For minutes pass `formatHours(mins / 60, '0m')`.
- `makeInlineHoursEditor(pillEl, { getValue, onCommit, render })` — click-to-edit hours widget (0–24, 0.25 step; blur/Enter commit, Escape cancel). Used by the goal card, focus modal, and done badge.
- `makeTimeAddPills(onAdd, presets=DEFAULT_TIME_PRESETS)` — row of +10m/…/+2h chips; `onAdd(deltaHours)` owns clamp/save/accumulate/sync.

**Day transition:**
- `getTodayString()` — local date `YYYY-MM-DD`, never UTC.
- `loadState()` — detects new day on boot → `archiveDay()` → sets `_prevDayForModal` → builds fresh state with `_carryover`.
- `checkForNewDay()` — runs every 60s at the minute boundary. Same logic for mid-session day change.
- `archiveDay()` — pushes snapshot to history (max 30). Does not touch `totalHours`.
- `dayHasWork(d)` — true if a day has any goal hours/progress, quick wins, distraction hours, or successes. Distinguishes a real working day from one where the app was merely opened.
- Demote/promote preserve `hours` + `progress` both ways, so a shelved task resumes where it left off.
- `rescueCarryoverToBacklog()` — **the only place `_carryover` may be cleared.** Moves every leftover unfinished task into `backlog` (skipping ones already in Top 5 or already in the backlog), then deletes `_carryover`. Returns the count rescued. All four exit paths (day-modal "Start my day" / "Start fresh", legacy banner accept / dismiss) call it, so unfinished work can never be silently dropped. Not filtered by focus categories — see [features.md](features.md) § Unfinished task rollover.
- `findLastActiveDay(fallback)` → `{ day, gapDays, idleDays }` — walks history backwards for the most recent day passing `dayHasWork()`. **The day-transition modal must use this, not the raw stored state:** an idle day still gets saved and archived, so `_prevDayForModal` alone would summarise a blank day after any skipped stretch. Both the boot path and `checkForNewDay()` route through it.

**Rendering:**
- `getActiveGoals()` → `progress < 100`; `getCompletedGoals()` → `progress === 100`
- Completed goals go to Done Today card, not the goals list. This matters for drag index math — see [drag-drop.md](drag-drop.md).
- `renderGoals()` iterates `getActiveGoals()`, passing both `realIndex` (state array position) and display number.

**Background blobs (performance-critical — see [design-system.md](design-system.md) § Depth & Glass):**
- Markup is `.blob-layer > .blob-drift > .blob`. JS owns the wrapper's `transform`; CSS swirl keyframes own the inner blob's. Splitting them keeps `filter: blur(60px)` **static**, so it rasterizes once instead of every frame.
- `_driftStep(s)` advances one blob's physics; `_writeBlob(i)` writes `translate3d()` to its wrapper. Never write `left`/`top` here — they trigger layout and force a full-screen blur re-raster.
- `_startDrift()` / `_stopDrift()` are the **only** owners of `_rafId`; the `_rafId !== null` guard in `_startDrift` makes a duplicated (uncancellable) rAF chain impossible. Call these, never `_driftTick()` directly.
- Three gates stop the loop: `_driftPaused` (swirl playing), `_driftHidden` (`document.hidden` or focus fullscreen open, via `_refreshDriftGate`), and `_reduceMotion` (`prefers-reduced-motion`).
- Physics runs at `DRIFT_FPS = 24`, not per frame. Per-step constants are scaled by `_STEP_SCALE = 60 / DRIFT_FPS` so motion matches the original 60fps feel — change `DRIFT_FPS` and the scaling follows automatically.
- `window.DayByDayBlobs.setOccluded(bool)` is called from the body `MutationObserver` when a `.focus-fullscreen-overlay` is added/removed, covering every `overlay.remove()` path without touching them.

**Other:**
- Clock syncs to minute boundary via `msUntilNextMinute`, no seconds.
- Undo: `undoStack`, Cmd/Ctrl+Z. Covers goals, distractions, journal, backlog, quickDone.
- Progress rings: SVG, `stroke-dasharray: 213.63`. Four rings: progress (green), goal hours (mint, max 8h), distraction (rose, max 4h), quick wins (orange, max 4h).
- Public API: `window.DayByDayApp = { getState, getGoals, getDistractions, getStore, storageGet, storageSet, activity }`
- Activity monitor: document-level `pointerdown`/`keydown`/throttled `pointermove` listeners (capture phase) keep `lastActivityTime` fresh; `DayByDayApp.activity.getIdleMs()` / `.getLastActivity()` expose it. Consumed today by focus mode's idle check (60 min → "Still working on this?" dialog, `FOCUS_IDLE_THRESHOLD_MS`); intended to feed notifications/intelligence later. Returning to the tab is deliberately not activity — only real interaction is.
- Focus session records (`state.focusSessions[]`, mirrored to `store.sessions`): `{ timestamp, goalName, goalIndex, category, totalMins, focusPct, focusMins, distractMins, isWin, ultraFocus, intention, entryTag, entryNote, midNotes[], exitTag, exitNote }`. `ultraFocus` is true when the user chose to keep counting after an hour-plus idle stretch; the idle dialog can also override `totalMins` (custom hours) or advance `sessionStartTime` (trim). `midNotes` entries are `{ text, at }` (epoch ms) — records saved before timestamps hold plain strings, and all renderers tolerate both. In-progress sessions snapshot to `daybyday_focus_session` (`persistSnapshot`/`clearSnapshot` in `openFullFocusMode`); `checkForCrashedFocusSession()` at boot offers Resume / Wrap up / Discard for same-day snapshots and drops stale ones.

## index.html structure

- `<body>` opens with `#blob-layer`, holding the three `.blob-drift > .blob` pairs, before `#app`
- `#app` → `<aside id="life-sidebar">` + `<div id="main-content">`
- Sidebar is `position: fixed` — not in the grid
- `#main-content` padding-left: `calc(52px + 40px)` → `calc(320px + 40px)` when `.sidebar-open`
- Two-column CSS Grid inside `#main-content`: `col-left`, `col-right`
- Cards have `data-card-id` + `draggable-card` for reordering
- Script order: `app.js` first, then `notifications.js`
- `carryover-banner` still exists in HTML but is superseded by the Day Transition Modal

## notifications.js

- Motivational nudge every 25 min, guilt-trip check every 40 min
- Nudge banner stays until dismissed; new messages replace current text
- 15 wisdom messages (4,000 Weeks) + 10 motivational messages
- Browser notification permission prompted once (3s delay after load)
- Public API: `window.DayByDayNotifications = { onGoalsUpdated, showNudge, sendNotification, getWisdom }`
- `setTimeout(init, 50)` — waits for app.js to finish loading
