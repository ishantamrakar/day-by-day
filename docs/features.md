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
- **Backlog** — unlimited items; promote (→ Top 5) / demote (→ backlog); `fromBacklog: true` flag on promoted goals. The card shows only items in today's focus categories (`state.focusCategoryIds`); with no focus set it shows all. Hidden items get a muted "N more tasks in other life areas" note and stay reachable via the sidebar category expansions (`isBacklogItemVisible` / `backlogVisibleSlotToIndex` in app.js map visible drop slots back to array indices)
- **Day carryover** — archives up to 30 days; incomplete goals carried forward
- **Notifications** — browser + in-app nudges; wisdom messages; guilt-trip nudges
- **Undo** — Cmd/Ctrl+Z for goals, distractions, journal, backlog, quick wins
- **Inline editing** — all text items editable in place (Enter saves, Escape cancels)
- **Modal lock** — while any modal is open the page behind it is inert: no scroll, no clicks, no Cmd+Z (see [design-system.md](design-system.md) § Modals for the rules new modals must follow)
- **Drag & drop** — card reorder + task row reorder + cross-card goal↔backlog (see [drag-drop.md](drag-drop.md))
- **Responsive** — two-col desktop, single-col at 800px
- **Life Areas (Categories)** — 5 defaults + unlimited custom; all-time hours per category
- **Repeatable tasks** — flagged goals/backlog items carry forward automatically; ↻ badge in log row
- **Sidebar** — fixed left rail (52px) + expandable panel (320px); category cards with hours bar, task counts, inline edit
- **Day Transition Modal** — shown on new day: yesterday summary, category insights, focus area picker (max 3), repeatable task checklist
- **Focus Mode** — per-goal fullscreen session (`openFullFocusMode` in app.js): intention → mind check-in → ambient screen (notes, wall clock, focus tools) → exit reflection where a focus-% slider splits wall-clock time into goal hours vs distraction hours (the unfocused share is always logged exactly once: to the typed distraction if one was captured, else the first "5 to Avoid" item, else a generic "Drifted time" entry); sessions saved to `state.focusSessions` and shown in the journal
- **Attention check / Ultra Focus** — a global activity monitor (pointer + keyboard, exposed as `DayByDayApp.activity.getIdleMs()`) watches for interaction app-wide. During a focus session, 60 min without interaction opens a calm "Still working on this?" dialog with a live "no activity for X" counter and four choices: **keep counting** (session becomes 🔥 Ultra Focus — gold accent, badge under the clock, `ultraFocus: true` on the record, 🔥 marker in the journal), **trim that time** (away gap subtracted, session continues), **wrap up with custom hours** (input prefilled with pre-away active time, 0–24h validated, then the normal exit flow), or **scrap the session**. The monitor is designed to later feed the notifications/intelligence systems

## Day Transition Modal

Shown on first load after a new day (or at midnight mid-session). Source data is `state._carryover` set during `loadState()`.

1. **Yesterday summary** — tasks done, hours focused, hours distracted. Distraction pill → red if ≥ 2h.
2. **Category insights** — shown when 2+ categories have data. Flags lagging (<50% of avg) and thriving (>150%) areas.
3. **Focus picker** — all categories shown; up to 3 selectable; pre-selects least-hours cats that have backlog/repeatable work. Selecting a 4th auto-deselects the first.
4. **Repeatable checklist** — repeatable items from `_carryover` + backlog, filtered to selected categories. All pre-checked.
5. **"Start my day →"** — adds checked repeatables to goals, carries non-repeatable carryover in selected cats (up to MAX_GOALS), clears `_carryover`, saves, renders.
6. **"Skip, start fresh"** — clears `_carryover`, closes.

**Invariant:** Modal reads `_carryover`, writes to `state.goals` + `backlog`, then deletes `_carryover`. After close, `_carryover` is gone.

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
