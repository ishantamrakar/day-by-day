# Architecture

→ [CLAUDE.md](../CLAUDE.md) | [features.md](features.md) | [drag-drop.md](drag-drop.md)

## Module map — where to find things

**Refactor in progress.** `app.js` is being split into three layers. Code not
yet moved still lives in `app.js`; new code belongs in a module.

```
app.js              entry module — boot, wiring, window.DayByDayApp
js/
  core/       portable domain logic. NO DOM, NO browser APIs.
              A native (iOS/Android) build reuses these verbatim.
  platform/   the only files that touch browser APIs.
              Swapped per target; everything else imports from here.
  ui/         DOM rendering and interaction. Rewritten for native.
```

**The dependency rule:** `core/` never imports from `ui/` or `platform/` —
dependencies point inward. This is enforced by ESLint (`js/core/**` has no
browser globals and restricted imports), not by convention, because a
documented-only boundary decays. If lint rejects a browser call in `core/`,
the fix is to move that call into `platform/` and pass the result in.

A ✅ module has moved; an arrow means the code still lives in `app.js` under
that section header and is headed for the named file.

| Need to change… | Look in |
|---|---|
| How data is persisted | ✅ `js/platform/storage.js` |
| Hours/colour formatting | ✅ `js/core/format.js` |
| Growth stages, milestones, baselining | ✅ `js/core/growth.js` |
| Daily intentions rules (reading, input parsing, selection filter) | ✅ `js/core/intentions.js` |
| Intention fields under the focus pickers (`makeIntentionFields`) | ✅ `js/ui/intentions.js` |
| Dates, `dayHasWork`, `findLastActiveDay`, default state | ✅ `js/core/day.js` |
| Storage key names, `STORE_VERSION` | ✅ `js/core/keys.js` |
| Loading/saving state, categories, history, building carryover (`buildCarryover`) | ✅ `js/core/state.js` |
| Consuming carryover: rescue to backlog, banner accept, delete-scrub | ✅ `js/core/carryover.js` |
| Legacy carryover banner | ✅ `js/ui/carryover.js` |
| Store shape, entities, hydrate/sync adapter | ✅ `js/core/store.js` |
| Which colours the blobs wear | ✅ `js/core/blob-colors.js` |
| Blob motion, drift, swirl pulses | ✅ `js/ui/blobs.js` |
| Backup export/import rules | ✅ `js/core/backup.js` |
| Time-add ring, chip dials, inline hours editor | ✅ `js/ui/time-ring.js` |
| Day transition (morning review) modal | ✅ `js/ui/day-transition.js` |
| Drag & drop (all three systems) | ✅ `js/ui/drag.js`, see [drag-drop.md](drag-drop.md) |
| Focus mode screens (sheet + fullscreen session) | ✅ `js/ui/focus-mode.js` |
| Sidebar rail/panel, category cards, growth toasts | ✅ `js/ui/sidebar.js` |
| Category/quick-add/new-area/task-detail modals | ✅ `js/ui/modals.js` |
| Settings dialog, backup UI, focus editor | ✅ `js/ui/settings.js` |
| Category colour palette, emoji→colour | ✅ `js/core/palette.js` |
| Overnight session retirement, snapshot read/write | ✅ `js/core/sessions.js` |
| Done Today card (completed Top 5, quick wins) | ✅ `js/ui/done-today.js` |
| Done Today ordering, fold counts, quick-win record | ✅ `js/core/done-today.js` |
| Journal card (focus sessions, wins & lessons) | ✅ `js/ui/journal.js` |
| Session detail text, newest-first session order | ✅ `js/core/journal.js` |
| Backlog card (rows, promote/delete, hidden-items note, add input) | ✅ `js/ui/backlog.js` |
| Adding Top 5 goals and distractions (inputs, + buttons) | ✅ `js/ui/tasks.js` |
| Top 5 goal rows and distraction rows (`renderGoals`, `renderDistractions`) | ✅ `js/ui/tasks.js` |
| Click-to-edit text (`makeEditable`), progress slider fill (`updateSliderFill`) | ✅ `js/ui/editable.js` |
| Summary card (figures, four rings, breakdown bars, encouragement line) | ✅ `js/ui/summary.js` |
| Summary maths (hour totals, average progress, ring fractions and caps) | ✅ `js/core/summary.js` |
| Backlog visibility (focus filter, General as inbox, visible slot → index) | ✅ `js/core/backlog.js` |
| Nudge banner (show, dismiss, timers, "All 5 goals set") | ✅ `js/ui/nudges.js` |
| Nudge messages, focus-check message, nudge intervals | ✅ `js/core/nudges.js` |

**Core modules take their data as arguments.** `pendingGrowthMilestones(cats)`,
`intentionsAllMetToday(state, categories)` and friends never read module state,
so they stay portable *and* directly unit-testable in Node with no browser:

```
node --input-type=module -e "import {getGrowthStage} from './js/core/growth.js'; console.log(getGrowthStage(24))"
```

`app.js` keeps same-named thin wrappers that bind them to the live `state` /
`categories`, so call sites are unchanged.

### The injected-context pattern

The larger UI modules need many things from `app.js` — `js/ui/drag.js` needs
16. Passing those as parameters would mean 16-argument calls, so they arrive as
one object via `configure(ctx)`.

`state` and `backlog` are declared as **getters** on that object, never plain
values, because `app.js` reassigns those bindings (rollover replaces `state`;
`backlog` is rehydrated at boot). A captured value would silently go stale —
a drag would mutate yesterday's array. `js/ui/drag.js` goes further and reads
through a Proxy, so no destructuring can accidentally capture one.

**Init order inside a module matters.** A `configure(ctx)` module has three
moments it could read injected state, and only one is right: module load is
too early (`ctx` is not set yet — and a `try/catch` there will hide it), while
an `initX()` called from boot may be too late if anything renders before it.
`js/ui/sidebar.js` reads its collapsed preference in `configure()` for exactly
this reason: reading it in `initSidebar()` let the boot render see the sidebar
as open and silently consume a pending growth milestone.

`npm run check:configure-tdz` guards a related hazard: a `configure({...})`
object literal is evaluated where it appears, so passing a `const`/`let`
declared further down (e.g. one destructured from another module) throws
"Cannot access X before initialization" at boot. Function declarations hoist
and are fine; the fix for the rest is a getter. `npm run check:state-sync`
guards the matching hazard in `app.js`: every
reassignment of `state`/`backlog` must be followed by `CoreState.setState`/
`setBacklog`, or js/core keeps a stale object. That check exists because this
refactor shipped exactly that bug in the "Reset day" path.

### Dependency injection at the composition root

`js/core/state.js` and `js/core/store.js` need persistence but must not import
`js/platform` (dependencies point inward — ESLint rejects it). They declare
what they need instead:

```js
CoreState.configureStorage({ get: storageGet, set: storageSet });
CoreStore.configureStorage({ get: storageGet, set: storageSet });
```

`app.js` is the **composition root** — the one place that knows both halves and
wires them together, before any core function that persists is called. A native
build calls the same two functions with an AsyncStorage-backed shim and every
core module is reused untouched. It also makes core runnable headless: the
rollover and store-reconcile logic can be exercised in Node with an in-memory
object as storage, no browser involved.

### Why accessors, not exported bindings

`state` and `backlog` are *reassigned* — a day rollover replaces the whole
state object, and `backlog` is rebuilt from the store at boot. An importer of
an exported `let` gets a live view it cannot reassign, and code that captured
the old value would keep it. So core owns them behind `getState()`/`setState()`.
`app.js` mirrors them into local `let`s (so ~400 existing reads are unchanged)
and calls `CoreState.setState`/`setBacklog` at the two reassignment sites, which
is the one thing that keeps the two views from diverging.

Property mutation (`state.goals.push(...)`) needs no accessor and is used
freely; only whole-object replacement has to go through the setter.

## Serving (and the file:// trap)

`app.js` is an ES module, so the app **must** be served over HTTP:

```
python3 -m http.server 8000   # from the directory containing index.html
```

Opening `index.html` directly fails with *"Access to script … has been blocked
by CORS policy"* and a blank page. This changed when the module split landed —
before that, `app.js` was a classic script and `file://` happened to work.

**The consequence worth knowing:** `file://` and `http://localhost:8000` are
distinct origins, each with its own localStorage. Data written while opening
the file directly is not visible from the server. It is not lost — recover it
by loading the old origin, exporting (gear → Export), and importing at the new
one. The backup format is every `daybyday_*` key verbatim, so the round trip is
exact.

## Porting to iOS / Android

The layering above exists so a native port is a port, not a rewrite:

- **`js/core/` moves unchanged.** It is already free of DOM and browser APIs,
  verified by lint rather than by inspection.
- **`js/platform/` is reimplemented** per target. `storage.js` is the main one:
  its contract is synchronous, total (never throws), string-keyed and
  string-valued. On React Native, back it with AsyncStorage — note that
  AsyncStorage is **async**, so that port either wraps it in an in-memory cache
  hydrated at boot, or the core's save calls become async. This is the single
  biggest decision a native port faces.
- **`js/ui/` is rewritten.** Drag & drop in particular is pointer-event based
  and deliberately web-only; a native build would use Gesture Handler /
  Reanimated instead. No effort is spent making it portable.

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
| `daybyday_prefs` | *Retired 2026-11* — held the notification-prompt dismissed flag. No longer read or written; may linger in older browsers' storage (and so in their backups), harmlessly |
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

**Backlog** (`daybyday_backlog`): `[{ name, category?, repeatable?, hours?, progress? }]` — `addBacklogItem()` (`js/ui/backlog.js`) stamps `category: 'general'` on entry; a missing `category` is also treated as General. General items bypass the focus filter (see [features.md](features.md) § Backlog).

**Categories** (`daybyday_categories`):
```js
[{ id, name, emoji, color, totalHours, vision?, seenStage? }]
```
- 5 defaults: fitness, career, relationships, chores, general
- `seenStage` — last growth stage acknowledged by the milestone toast (see [features.md](features.md) § Growth stages). Baselined at boot by `baselineGrowthStages()` so existing hours never toast.
- Custom ids start with `custom_`
- `totalHours` is a **running accumulator** — never recomputed from history, only `+= delta` via `accumulateCategoryHours()`. This is intentional for performance; preserve this when porting to a backend.

## app.js internals

`app.js` is the entry ES module and the composition root. Its body is still one
IIFE in `'use strict'`. What it does, top to bottom:

**Wiring.**
- Injects storage into core: `CoreState` / `CoreStore` / `CoreSessions` / `CoreBackup` `.configureStorage(...)`, before anything persists (see § Dependency injection at the composition root).
- Boots state: `CoreState.initState()` returns the previous day when it detected a rollover (`_prevDayForModal`); `state` / `backlog` are mirrored into local `let`s; the unified store is built by `CoreStore.migrateToStore()` and shares the live `categories` array; `baselineGrowthStages()` runs once the categories are store-backed.
- Calls each UI module's `configure(ctx)` in turn (Sidebar, Modals, Carryover, FocusMode, DoneToday, Backlog, Journal, Summary, Tasks, Drag, Settings, DayTransition, Intentions, blob colour source). `state` / `backlog` / `categories` are always passed as getters (§ The injected-context pattern).
- Thin wrappers that bind core rules to the live data, so call sites stay short: `getCategoryById`, `activeCategories`, `pendingGrowthMilestones`, `intentionsAllMetToday`, `getIntentionFor`, `isBacklogItemVisible`, `backlogVisibleSlotToIndex`, `findLastActiveDay`, `rescueCarryoverToBacklog`, plus the store bindings (`syncDayToStore`, `hydrateDayType`, …). Several are function declarations rather than consts on purpose: they hoist, so a `configure()` call higher up can pass them by value (`npm run check:configure-tdz`).
- Persistence: `saveState()` (store sync + legacy `daybyday_data`), `saveBacklog()`, `saveCategories()` (legacy key + store).
- Category lifecycle: `archiveCategory` / `restoreCategory` / `deleteCategory` (tombstone: `deleted: true`, live backlog items and today's active goals move to General) and `accumulateCategoryHours(catId, delta)`, the **only place `totalHours` is mutated**.
- `render()` is the orchestrator: it calls each card module's render function in turn. `getActiveGoals()` → `progress < 100`, `getCompletedGoals()` → `progress >= 100`; completed goals render in Done Today, not the goals list, which matters for drag index math (see [drag-drop.md](drag-drop.md)). `updateAddButtonVisibility()` hides the add rows at `MAX_GOALS` / `MAX_DISTRACTIONS`.
- `permanentlyDeleteGoal(index)` pushes to the undo stack, then scrubs the goal from `state.goals`, `_carryover` and `_prevDayForModal`.
- The "Reset day" button, kept here because it reassigns `state` (`npm run check:state-sync`).
- Clock: `updateClock()` syncs to the minute boundary via `msUntilNextMinute`, no seconds.

**Undo.** `undoStack` plus a document `keydown` listener for Cmd/Ctrl+Z. Covers goals, distractions, journal (successes / failures), backlog and quick wins. Ignored while a modal is open. Card modules push onto the same `undoStack`, which they receive through `configure()`.

**Card layout.** `saveCardLayout()` / `restoreCardLayout()` persist each column's card order under `daybyday_layout`; `initCardDragHandles()` attaches `setupCardDrag` (from `js/ui/drag.js`) to every `.draggable-card`.

**Modal lock.** `isModalOpen()` / `isFocusFullscreenOpen()` and one body `MutationObserver` that toggles `modal-open` and `focus-fullscreen-open` on `<html>` and calls `DayByDayBlobs.setOccluded()`. See [design-system.md](design-system.md) § Modals.

**Activity monitor.** Document-level `pointerdown` / `keydown` / throttled `pointermove` listeners (capture phase) keep `lastActivityTime` fresh; `markActivity` / `getIdleMs` / `getLastActivity` are passed to focus mode and exposed on `DayByDayApp.activity`. Consumed today by focus mode's idle check (60 min → "Still working on this?" dialog, `FOCUS_IDLE_THRESHOLD_MS`); intended to feed notifications/intelligence later. Returning to the tab is deliberately not activity — only real interaction is.

**New-day detection.** `checkForNewDay()` runs every 60s at the minute boundary. On a date change it closes any running focus session into the outgoing day (`closeFocusSessionForRollover`, *before* archiving), archives it, builds the fresh state with `_carryover`, and opens the day-transition modal on the last day that had work (`findLastActiveDay`). The boot path does the same through `initState()`.

**`window.DayByDayApp`.** `{ getState, getGoals, getDistractions, getStore, storageGet, storageSet, activity }`. Read by the smoke and regression scripts; no module in `js/` depends on it.

**Boot.** Restore card layout → `render()` → day-transition modal or legacy carryover banner → card drag handles → crashed-focus-session check → `initSidebar()` → `initNudges()`.

## Module internals worth knowing

Notes on code that used to live in `app.js`, kept here because they explain *why*. Each names its file.

**Storage** (`js/platform/storage.js`): `storageGet(key)` / `storageSet(key, value)` — localStorage wrapped in try/catch.

**Categories:**
- `loadCategories()` (`js/core/state.js`) — merges saved + defaults at boot; saved values win.
- `createCategoryPill()` (`js/ui/modals.js`) — tracks `currentCatId` in closure so the picker always shows the current value.
- `openTaskContextPicker(anchor, catId, repeatable, onConfirm, { showRepeatable })` (`js/ui/modals.js`) — the **single** category/context modal for every task-like row. `showRepeatable: false` gives a category-only picker (used by backlog + distractions); default shows the repeatable toggle (Top 5 goals). There is no separate popover picker.
- `makeTimeAddRing({ presets, onChange })` (`js/ui/time-ring.js`) → `{ el, getHours, setHours, reset }` — the reusable staged time picker (ring + preset dial chips). The caller owns the commit, so it drops into anywhere time gets logged. Constants: `TIME_RING_MAX` (12h ceiling per pass), `TIME_RING_STEP` (drag and arrow-key snap). `makeChipDial(hours)` builds a preset's mini dial. Replaced `makeTimeAddPills`, which applied time live on every tap.

**Shared UI helpers** (added to kill duplication — reuse these, don't reimplement):
- `formatHours(h, emptyLabel='+ hrs')` (`js/core/format.js`) — the one h/m pill formatter. For minutes pass `formatHours(mins / 60, '0m')`.
- `makeInlineHoursEditor(pillEl, { getValue, onCommit, render })` (`js/ui/time-ring.js`) — click-to-edit hours widget (0–24, 0.25 step; blur/Enter commit, Escape cancel). Used by the goal card, focus modal, and done badge.
- `makeEditable(spanEl, onSave)` (`js/ui/editable.js`) — click-to-edit text (Enter/blur commit, Escape cancel, empty keeps the old text). The Top 5, distraction, backlog, journal and Done Today rows all use it.
- `updateSliderFill(slider)` (`js/ui/editable.js`) — paints a range input's track up to the thumb.

**Day transition:**
- `getTodayString()` (`js/core/day.js`) — local date `YYYY-MM-DD`, never UTC.
- `loadState(archiveDay)` (`js/core/state.js`) — detects a new day on boot → archives the stored day → builds fresh state with `_carryover` (`buildCarryover`) and returns the previous day, which `initState()` hands to app.js as `_prevDayForModal`.
- `archiveDay()` (`js/core/state.js`) — pushes snapshot to history (max 30). Does not touch `totalHours`. The snapshot carries `focusSessions` (added so a session retired at rollover isn't dropped the moment it's recorded); days archived before that change simply have no key, and every reader defaults it to `[]`.
- `dayHasWork(d)` (`js/core/day.js`) — true if a day has any goal hours/progress, quick wins, distraction hours, or successes. Distinguishes a real working day from one where the app was merely opened.
- Demote/promote preserve `hours` + `progress` both ways, so a shelved task resumes where it left off.
- `rescueCarryoverToBacklog()` (app.js wrapper over `rescueItems()` in `js/core/carryover.js`) — **the only place `_carryover` may be cleared.** Moves every leftover unfinished task into `backlog` (skipping ones already in Top 5 or already in the backlog), then deletes `_carryover`. Returns the count rescued. All four exit paths (day-modal "Start my day" / "Start fresh", legacy banner accept / dismiss) call it, so unfinished work can never be silently dropped. Not filtered by focus categories — see [features.md](features.md) § Unfinished task rollover.
- `findLastActiveDay(fallback)` → `{ day, gapDays, idleDays }` — app.js binding over `findLastActiveDay(history, today, fallback)` in `js/core/day.js`. Walks history backwards for the most recent day passing `dayHasWork()`. **The day-transition modal must use this, not the raw stored state:** an idle day still gets saved and archived, so `_prevDayForModal` alone would summarise a blank day after any skipped stretch. Both the boot path and `checkForNewDay()` route through it.

**Rendering:** `renderGoals()` (`js/ui/tasks.js`) iterates `getActiveGoals()`, passing both `realIndex` (state array position) and display number.

**Background blobs** (`js/ui/blobs.js`; performance-critical — see [design-system.md](design-system.md) § Depth & Glass):
- Markup is `.blob-layer > .blob-drift > .blob`. JS owns the wrapper's `transform`; CSS swirl keyframes own the inner blob's. Splitting them keeps `filter: blur(60px)` **static**, so it rasterizes once instead of every frame.
- `_driftStep(s)` advances one blob's physics; `_writeBlob(i)` writes `translate3d()` to its wrapper. Never write `left`/`top` here — they trigger layout and force a full-screen blur re-raster.
- `_startDrift()` / `_stopDrift()` are the **only** owners of `_rafId`; the `_rafId !== null` guard in `_startDrift` makes a duplicated (uncancellable) rAF chain impossible. Call these, never `_driftTick()` directly.
- Three gates stop the loop: `_driftPaused` (swirl playing), `_driftHidden` (`document.hidden` or focus fullscreen open, via `_refreshDriftGate`), and `_reduceMotion` (`prefers-reduced-motion`).
- Physics runs at `DRIFT_FPS = 24`, not per frame. Per-step constants are scaled by `_STEP_SCALE = 60 / DRIFT_FPS` so motion matches the original 60fps feel — change `DRIFT_FPS` and the scaling follows automatically.
- `DayByDayBlobs.setOccluded(bool)` (exported from `js/ui/blobs.js`) is called from app.js's body `MutationObserver` when a `.focus-fullscreen-overlay` is added/removed, covering every `overlay.remove()` path without touching them.

**Progress rings:** SVG, `stroke-dasharray: 213.63`. Four rings: progress (green), goal hours (mint, max 8h), distraction (rose, max 4h), quick wins (orange, max 4h). The caps and fractions are in `js/core/summary.js` (`ringFractions`); painting them is `renderSummary()` in `js/ui/summary.js`, which also holds `RING_CIRCUMFERENCE = 2π × 34`.

**Focus session records** (`js/ui/focus-mode.js`; `state.focusSessions[]`, mirrored to `store.sessions`): `{ timestamp, goalName, goalIndex, category, totalMins, focusPct, focusMins, distractMins, isWin, ultraFocus, intention, entryTag, entryNote, midNotes[], exitTag, exitNote }`. `ultraFocus` is true when the user chose to keep counting after an hour-plus idle stretch; the idle dialog can also override `totalMins` (custom hours) or advance `sessionStartTime` (trim). `midNotes` entries are `{ text, at }` (epoch ms) — records saved before timestamps hold plain strings, and all renderers tolerate both. In-progress sessions snapshot to `daybyday_focus_session` (`persistSnapshot`/`clearSnapshot` in `openFullFocusMode`); `checkForCrashedFocusSession()` at boot offers Resume / Wrap up / Discard for same-day snapshots and drops stale ones.

## index.html structure

- `<body>` opens with `#blob-layer`, holding the three `.blob-drift > .blob` pairs, before `#app`
- `#app` → `<aside id="life-sidebar">` + `<div id="main-content">`
- Sidebar is `position: fixed` — not in the grid
- `#main-content` padding-left: `calc(var(--sidebar-rail-w) + 40px)` → `calc(var(--sidebar-w) + 40px)` when `.sidebar-open`. Sidebar geometry lives in three `:root` vars — `--sidebar-w` (372px), `--sidebar-rail-w` (52px), and `--sidebar-panel-w` (derived) — so the panel and this offset follow the one width instead of being three magic numbers edited in lockstep.
- Two-column CSS Grid inside `#main-content`: `col-left`, `col-right`
- Cards have `data-card-id` + `draggable-card` for reordering
- Scripts: a single `<script type="module" src="app.js">` (auto-deferred, runs after parse). Everything else is imported from it.
- `carryover-banner` still exists in HTML but is superseded by the Day Transition Modal. Its rendering and accept/dismiss handlers live in `js/ui/carryover.js`; boot calls `showCarryoverIfNeeded()` only when the modal is skipped

## Nudges (js/core/nudges.js, js/ui/nudges.js)

- Motivational nudge every 25 min, guilt-trip check every 40 min (`NUDGE_INTERVAL_MS`, `GUILT_CHECK_INTERVAL_MS` in core)
- Nudge banner stays until dismissed; new messages replace current text
- 15 wisdom messages (4,000 Weeks) + 10 motivational messages, both in `js/core/nudges.js`. `buildGuiltTripMessage(goals, dists)` takes the day's data as arguments and returns `null` when there is nothing to reflect on; the 40-min timer then shows a wisdom line instead
- **No browser (OS) notifications.** Removed 2026-11: the Notification API never delivered reliably, and real notifications are planned for the native macOS/iOS/Android builds instead (roadmap.md § Product Vision). The global keeps its `DayByDayNotifications` name so callers didn't change
- Public API: `window.DayByDayNotifications = { onGoalsUpdated, showNudge, getWisdom }`, published by `initNudges()`. Callers in `js/ui/` still go through the global, guarded by `if (window.DayByDayNotifications)`
- `initNudges({ getGoals, getDistractions })` is the last call of app.js boot, so the global is absent during the boot render (as it was when the nudges lived in a classic script loaded after app.js). It starts the timers 50 ms later and shows the first nudge 1.5 s after that
