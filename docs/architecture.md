# Architecture

→ [CLAUDE.md](../CLAUDE.md) | [features.md](features.md) | [drag-drop.md](drag-drop.md)

## localStorage Keys

| Key | Contents |
|-----|----------|
| `daybyday_data` | Today's state object |
| `daybyday_history` | Up to 30 archived day objects |
| `daybyday_layout` | Card column order (JSON) |
| `daybyday_backlog` | Persistent backlog array |
| `daybyday_categories` | Categories with all-time `totalHours` |
| `daybyday_sidebar` | `'collapsed'` or `'open'` |
| `daybyday_prefs` | Notification dismissed flag |

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
  _carryover?: [goal]            // temp — set on new day, consumed by modal
}
```

**Backlog** (`daybyday_backlog`): `[{ name, category?, repeatable? }]`

**Categories** (`daybyday_categories`):
```js
[{ id, name, emoji, color, totalHours, vision? }]
```
- 5 defaults: fitness, career, relationships, chores, general
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

**Rendering:**
- `getActiveGoals()` → `progress < 100`; `getCompletedGoals()` → `progress === 100`
- Completed goals go to Done Today card, not the goals list. This matters for drag index math — see [drag-drop.md](drag-drop.md).
- `renderGoals()` iterates `getActiveGoals()`, passing both `realIndex` (state array position) and display number.

**Other:**
- Clock syncs to minute boundary via `msUntilNextMinute`, no seconds.
- Undo: `undoStack`, Cmd/Ctrl+Z. Covers goals, distractions, journal, backlog, quickDone.
- Progress rings: SVG, `stroke-dasharray: 213.63`. Four rings: progress (green), goal hours (mint, max 8h), distraction (rose, max 4h), quick wins (orange, max 4h).
- Public API: `window.DayByDayApp = { getState, getGoals, getDistractions, storageGet, storageSet }`

## index.html structure

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
