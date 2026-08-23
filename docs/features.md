# Features

→ [CLAUDE.md](../CLAUDE.md) | [architecture.md](architecture.md) | [drag-drop.md](drag-drop.md)

## Implemented (v0.9)

- Live clock — synced to system minute boundary, no seconds
- **Top 5 goals** — hour logging, progress slider, rank badges (#1–#5), intra-list drag reorder
- **Goal completion** — slider hits 100% → `.task-completing` animation → moves to Done Today
- **Done Today** — two groups (Top 5 / Quick wins), top 3 visible, `+ N more` toggle, entrance animation on newest item
- **Quick wins** — ad-hoc completed tasks with optional hours; hours badge is inline-editable; clickable category pill assigns/changes the life area (reuses the shared `createCategoryPill` picker)
- **5 Distractions** — hour logging, drag reorder
- **Summary rings** — 4 SVG rings: avg progress (green), goal hours (mint), distraction hours (rose), quick wins hours (orange)
- **Journal** — wins + lessons, mood/sentiment tracking
- **Backlog** — unlimited items; promote (→ Top 5) / demote (→ backlog); `fromBacklog: true` flag on promoted goals. **Hours and progress survive the round trip** — shelve a part-done task and resume exactly where you left off. All four demote paths (Backlog button, cross-card drag, `rescueCarryoverToBacklog`) and all three promote paths (Promote button, backlog-card drag, sidebar drag) carry `hours` + `progress`; backlog entities persist `progress` in the store. Category totals are unaffected — they accumulate on hours-editor deltas only, so a round trip can't double-count. The card shows items in today's focus categories (`state.focusCategoryIds`) **plus everything in General**; with no focus set it shows all. General is the backlog's inbox — newly typed items are stamped `category: 'general'` and are never hidden by the focus filter, so a task can't vanish the moment it's entered. File it into a life area via the category picker whenever you like. Hidden items get a muted "N more tasks in other life areas" note and stay reachable via the sidebar category expansions (`isBacklogItemVisible` / `backlogVisibleSlotToIndex` in app.js map visible drop slots back to array indices)
- **Day carryover** — archives up to 30 days; incomplete goals carried forward
- **Notifications** — browser + in-app nudges; wisdom messages; guilt-trip nudges
- **Undo** — Cmd/Ctrl+Z for goals, distractions, journal, backlog, quick wins
- **Inline editing** — all text items editable in place (Enter saves, Escape cancels)
- **Modal lock** — while any modal is open the page behind it is inert: no scroll, no clicks, no Cmd+Z (see [design-system.md](design-system.md) § Modals for the rules new modals must follow)
- **Drag & drop** — card reorder + task row reorder + cross-card goal↔backlog (see [drag-drop.md](drag-drop.md))
- **Responsive** — two-col desktop, single-col at 800px
- **Life Areas (Categories)** — 5 defaults + unlimited custom; all-time hours per category
- **Archive a life area** — "Archive this area" at the bottom of an expanded sidebar card sets `archived: true` (never deletes): the area disappears from the rail, cards, every picker (`activeCategories()` helper), blob colors, and today's focus, while `totalHours` and all history keep resolving via `getCategoryById`. A muted "Archived" section at the panel bottom lists archived areas with their hours and a one-click Restore. `general` is the fallback category and can't be archived
- **Delete a life area** — trash icon on an Archived row (archive first = cooling-off), behind an inline confirm. Deletion is a **tombstone** (`deleted: true`, never removed from the array): past sessions/journal/history keep resolving the real name/emoji/color via `getCategoryById`, and the `DEFAULT_CATEGORIES` merge in `loadCategories()` can't resurrect it. Only live references move to General — backlog items (else unreachable) and today's *active* goals (future logging must not flow into a deleted area); completed items and all past records stay untouched. Deleted areas free their color for reuse; archived ones keep holding theirs
- **Repeatable tasks** — flagged goals/backlog items carry forward automatically; ↻ badge in log row
- **Sidebar** — fixed left rail (52px) + expandable panel (320px); category cards with hours bar, task counts, inline edit
- **Today's focus editor** — pencil button on the sidebar's "Today's focus" section header (header always renders; with no focus set it shows a muted "None set" hint) opens a picker (`openEditFocusModal`, same chips + up-to-3 rule as the day-transition modal). Covers a skipped day-start modal or a mid-day change of plan; saving updates `state.focusCategoryIds`, the backlog card filter, sidebar focus split, and blob colors. Zero selected = no filter
- **Day Transition Modal** — shown on new day: yesterday summary, category insights, focus area picker (max 3), repeatable task checklist
- **Focus Mode** — per-goal fullscreen session (`openFullFocusMode` in app.js): intention → mind check-in → ambient screen (notes, wall clock, focus tools) → exit reflection where a focus-% slider splits wall-clock time into goal hours vs distraction hours (the unfocused share is always logged exactly once: to the typed distraction if one was captured, else the first "5 to Avoid" item, else a generic "Drifted time" entry); sessions saved to `state.focusSessions` and shown in the journal. Mid-session notes save on Enter (Shift+Enter for a newline) as timestamped bullets. A running session is snapshotted to localStorage (`daybyday_focus_session`) — if the tab crashes or reloads, a same-day prompt offers to resume it (notes, ultra state, and start time intact), wrap it up on the reflection screen, or discard it
- **Settings** — gear pinned to the bottom of the sidebar rail → glass modal (`openSettingsModal` in app.js, reuses cat-modal shell). Sections: **Data** (export backup = all `daybyday_*` localStorage keys verbatim as JSON, import with an in-modal confirm showing backup date + contents summary, then reload) and **About**. Future app-level options (theme color, blob animation, notification frequency) each get their own section block here — settings never scatter elsewhere
- **Category hours integrity** — `totalHours` is a running accumulator kept honest everywhere hours change: goal/quick-done hour edits accumulate deltas, changing a quick-done's category moves its hours between category totals, focus-session saves accumulate the capped goal-hours gain, and `prevHours` accumulates across multi-day carryovers
- **Attention check / Ultra Focus** — a global activity monitor (pointer + keyboard, exposed as `DayByDayApp.activity.getIdleMs()`) watches for interaction app-wide. During a focus session, 60 min without interaction opens a calm "Still working on this?" dialog with a live "no activity for X" counter and four choices: **keep counting** (session becomes 🔥 Ultra Focus — gold accent, badge under the clock, `ultraFocus: true` on the record, 🔥 marker in the journal), **trim that time** (away gap subtracted, session continues), **wrap up with custom hours** (input prefilled with pre-away active time, 0–24h validated, then the normal exit flow), or **scrap the session**. The monitor is designed to later feed the notifications/intelligence systems

## Day Transition Modal

Shown on first load after a new day (or at midnight mid-session). Source data is `state._carryover` set during `loadState()`.

1. **Last active day summary** — tasks done, hours focused, hours distracted. Distraction pill → red if ≥ 2h. This summarises the last day you actually *worked*, not simply the last day the app was open: `findLastActiveDay()` walks back through history for the most recent day passing `dayHasWork()` (any goal hours/progress, quick wins, distraction hours, or successes). Without this, skipping days — or opening the app and logging nothing — saves an empty day that would otherwise be summarised as a blank "yesterday".
2. **Gap note** — when returning after ≥1 missed day, a quiet amber note states how long it's been ("That was 4 days ago…"). Singular phrasing for exactly one day. Never shown on a normal consecutive day.
3. **Return encouragement** — after a gap, a reflective line in the insights block leading with "Good luck today." Drawn from `RETURN_NOTES`, picked by a date-derived seed so it stays stable if the modal is reopened the same day. Tone follows the *4,000 Weeks* idea that missed days aren't a debt — you can't do everything, so choose a few things and let the rest go. Never guilt-trips.
4. **Category insights** — shown when 2+ categories have data. Flags lagging (<50% of avg) and thriving (>150%) areas.
5. **Focus picker** — all categories shown; up to 3 selectable; pre-selects least-hours cats that have backlog/repeatable work. Selecting a 4th auto-deselects the first.
6. **Repeatable checklist** — repeatable items from `_carryover` + backlog, filtered to selected categories. All pre-checked.
7. **Left unfinished** — lists yesterday's incomplete tasks by name (emoji, name, `%` progress, carried hours), with a note that any not started today wait in the backlog. Completed tasks are excluded; the whole section is hidden when nothing was left over. This is the only place leftover work is surfaced — the app has no time-of-day / end-of-day awareness by design.
8. **"Start my day →"** — adds checked repeatables to goals, carries non-repeatable carryover in selected cats (up to MAX_GOALS), then `rescueCarryoverToBacklog()` sweeps the remainder into the backlog, saves, renders.
9. **"Start fresh"** — carries nothing into Top 5, but still rescues every unfinished task to the backlog before closing. (Renamed from "Skip, start fresh" — it no longer discards anything.)

**Invariant:** Modal reads `_carryover`, writes to `state.goals` + `backlog`, then clears `_carryover` **via `rescueCarryoverToBacklog()`**. After close, `_carryover` is gone and every unfinished task is either in Top 5 or the backlog — never dropped.

### Unfinished task rollover

Unfinished Top 5 tasks used to be lost on three paths: "Skip, start fresh" discarded them outright; "Start my day" silently dropped any task whose category wasn't in today's focus; and Top 5 overflow had nowhere to go. `rescueCarryoverToBacklog()` is now the **single** exit for `_carryover` — every path routes through it, and anything not already live in Top 5 (and not already in the backlog) is appended there.

Deliberately **not** filtered by focus categories: the focus picker decides what gets pre-loaded into Top 5, not what is allowed to survive the day. A task now disappears only when the user explicitly deletes it.

## Categories System

- `loadCategories()` — merges saved + defaults. `{ ...def, ...saved }` so user edits always win.
- `accumulateCategoryHours(catId, delta)` — the **only** place `totalHours` mutates. Called live on every hours change. Not recalculated from history.
- Category pill lives in the **bottom log row** of each goal, next to hours/progress inputs.
- `createCategoryPill()` tracks `currentCatId` in closure — picker always reflects current state.

## Sidebar

- Two zones: **rail** (52px, always visible) + **panel** (268px, toggle via hamburger)
- Rail: hamburger + one emoji button per category → opens quick-add modal
- Panel: category cards showing all-time hours bar, `N active · N done · N backlog`
- Card click → expand detail (Active / Done Today / Backlog sections)
- Pencil edit (fades in on hover) → inline form: emoji picker + name input
- `sidebarCollapsed` persisted to localStorage; `expandedCatId` is session-only
- Opening sidebar: `#main-content` gets `.sidebar-open` → padding-left transitions, content slides right
