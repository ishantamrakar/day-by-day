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
- **Sidebar** — fixed left rail (52px) + expandable panel (320px, total width 372px); category cards with hours bar, task counts, inline edit
- **Today's focus editor** — pencil button on the sidebar's "Today's focus" section header (header always renders; with no focus set it shows a muted "None set" hint) opens a picker (`openEditFocusModal`, same chips + up-to-3 rule as the day-transition modal). Covers a skipped day-start modal or a mid-day change of plan; saving updates `state.focusCategoryIds`, the backlog card filter, sidebar focus split, and blob colors. Zero selected = no filter
- **Day Transition Modal** — shown on new day: yesterday summary, category insights, focus area picker (max 3), repeatable task checklist
- **Time-add ring** (`makeTimeAddRing` in app.js) — the goal's ⚡ opens a modal whose centrepiece is a dial showing **only what this interaction is about to log**, starting at zero. **Staged, not live:** nothing reaches the task until "Add" is pressed, so dismissing the modal (×, Escape, backdrop) adds nothing.
  - **One full turn = 1 hour.** Whole hours collect as pips beneath the ring, so a 3h log doesn't read as a bare circle. The centre shows the running total (`1h 30m`), the footer button spells out the commit (`Add 1h 30m`) and is disabled at zero.
  - **Preset chips carry mini dials** filled to their fraction of an hour — `15m` is a quarter-filled circle. Multi-hour presets draw one extra inner ring per hour, so `+2h` doesn't render identically to `+1h`.
  - **Drag the ring to scrub**, forwards or back, snapped to 5-minute steps; crossing the top boundary steps a whole hour either way. Drag accumulates into an unsnapped `dragRaw` — snapping each pointermove would round every sub-step delta to zero and the drag would never move. Keyboard: arrows ±5m, Shift+arrow ±1h, Home to zero.
  - **Two actions:** "Focus Mode" (secondary) and "Add *N*" (primary). Entering focus mode commits any staged time first, so choosing to focus never silently discards taps.
  - The pill above reads `2h logged today` — the task's existing total, deliberately worded to not compete with the ring's "to add".
- **Focus Mode** — per-goal fullscreen session (`openFullFocusMode` in app.js): intention → mind check-in → ambient screen (notes, wall clock, focus tools) → exit reflection where a focus-% slider splits wall-clock time into goal hours vs distraction hours (the unfocused share is always logged exactly once: to the typed distraction if one was captured, else the first "5 to Avoid" item, else a generic "Drifted time" entry); sessions saved to `state.focusSessions` and shown in the journal. Mid-session notes save on Enter (Shift+Enter for a newline) as timestamped bullets. A running session is snapshotted to localStorage (`daybyday_focus_session`) — if the tab crashes or reloads, a same-day prompt offers to resume it (notes, ultra state, and start time intact), wrap it up on the reflection screen, or discard it
- **Overnight sessions close themselves** — a session left running past midnight belongs to the day it started on, not the one you wake up in. Two paths cover it: with the tab open, `closeFocusSessionForRollover()` (called from `checkForNewDay` *before* `archiveDay`) tears the overlay down and writes the session into the outgoing day; after a reload, `retireStaleFocusSession()` finds the stale snapshot and appends it to that day in history. Both credit `OVERNIGHT_CREDIT_HOURS` (1h) at most — an untended clock reads as 14h when the real work was maybe two, and since the true figure is unknowable, understating is the only honest direction. The session is flagged `unattended: true` and shows a `~` in the journal marking the hours as an estimate. Without this the exit handler, which closes over `state.goals[index]`, would log last night's hours against a goal on the *fresh* day
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
7. **Left unfinished** — lists yesterday's incomplete tasks by name (emoji, name, `%` progress, carried hours), with a note that any not started today wait in the backlog. Completed tasks are excluded; the whole section is hidden when nothing was left over. Rendered *above* the focus picker: it's a review of yesterday, unfiltered.
8. **Waiting in backlog** — existing backlog items surfaced alongside the leftovers, so shelved work isn't invisible on a fresh morning. Rendered *below* the focus picker and filtered to the selected areas (`updateBacklogWaiting()`, re-run on every chip click like the repeatable checklist), so it only shows what's relevant to today's plan. Shares a two-column **planning row** (`.day-modal-planning-row`) with the intention fields — both are readings of the same chip selection, so they sit side by side rather than stacked. The grid uses `auto-fit`/`minmax`, so when one column hides itself the other spans the full width, and both columns hiding collapses the row. Excludes repeatables (already in the checklist above) and anything by that name already listed in Left unfinished. Hidden when nothing matches — including when no focus is selected. Styled in a cool neutral rather than the leftover amber: parked work is a calm reminder, not something urgent.
9. **"Start my day →"** — adds checked repeatables to goals, carries non-repeatable carryover in selected cats (up to MAX_GOALS), then `rescueCarryoverToBacklog()` sweeps the remainder into the backlog, saves, renders.
10. **"Start fresh"** — carries nothing into Top 5, but still rescues every unfinished task to the backlog before closing. (Renamed from "Skip, start fresh" — it no longer discards anything.)

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

- Two zones: **rail** (`--sidebar-rail-w`, 52px, always visible) + **panel** (`--sidebar-panel-w`, 320px, toggle via hamburger). Total `--sidebar-w` is 372px; widen that one var and the panel and content offset follow.
- Rail: hamburger + one emoji button per category → opens quick-add modal
- Panel: category cards showing the growth marker, progress-to-next-stage bar, `N active · N done · N backlog`

### Daily intentions

Optionally, "I'd like to give this area about N hours today" — set when picking focus areas, shown as a quiet pipe on the sidebar card.

- Set in **both** focus pickers (the day-transition modal and the sidebar's pencil editor) via `makeIntentionFields()`, so a morning plan can be adjusted mid-day. Rows appear only for currently-selected areas and follow the selection live. In the day-transition modal the fields are a column of the planning row, paired with "Waiting in backlog"; in the sidebar editor they still sit directly under the chips.
- **Every intention is optional.** No default, no suggestion — leave a row blank and that card simply shows today's hours with no bar.
- **Whole hours only** — `step="1"` drives the spinner arrows and the input handler rounds typed values, since `step` alone doesn't constrain typing. An intention is a rough gesture at the day, not a schedule.
- Stored in `state.focusIntentions` (`{catId: hours}`), which rides along with the day's state, so a Tuesday intention never leaks into Wednesday. No store version bump: an absent key means no intentions. Deselecting an area drops its intention (`collect()` filters to the current selection).
- **Meeting them all earns one quiet toast.** When every intention set for today has been met, the sidebar shows a `✓` toast (`intentionsAllMetToday()`), sharing the growth toast's slot and live-hold mechanics but with its own timer handle so the two can't cancel each other. It sits *behind* a growth milestone in precedence — crossing a stage is rarer, and two stacked toasts would be a pile-up; the intentions toast simply appears on the next render instead. Fires at most once a day: `state._intentionsMetSeen` rides the day's state, so it resets at rollover with no cleanup. Skips archived areas, whose intentions would otherwise be permanently unmeetable and block the toast forever. With **no** intentions set there is no toast — there was no bar to clear.
- **The bar never signals shortfall.** It fills toward the intention and stops where it stops — no red, no "behind", no percent-of-target. A day that fell short looks exactly like a day still in progress. Meeting it adds a quiet ✓, nothing more. This is the tone rule applied literally: a target you can fail is precisely what *4,000 Weeks* argues against, so the visual carries the information without the judgment.

### Sidebar card anatomy

A focused card is a two-column body (`sidebar-cat-body`): a content column and a narrow **growth chamber** on the right.

- **All-time hours in the title row**, same `sidebar-hours-total` span (and so the same weight and colour) as every other card. Focused cards used to blank this row, on the reasoning that each bar carries its own caption — but those captions are *today's* figure and the climb to the next stage, so the all-time total was missing from exactly the cards you look at most. Today's hours aren't repeated here: the intention pipe's caption already carries them.
- **Two stacked pipes**, each captioned beneath it (`barContainerLabel`): today's intention progress on top (solid, 5px), the long-term stage climb below (thin, 2px, dimmed). They read as one instrument — today above, the slow climb beneath.
- **The chamber** (a 34px square — `flex-basis` and `min-height` matched, with the hairline and its padding moved onto the content column so the chamber's own box stays square under the global `box-sizing: border-box`) is the growth plant's dedicated home, with its `×N` day count. Leaves the bars ~165px on desktop, ~201px on mobile. **Focused cards only** — on the other areas it would be five more things to scan for no decision it informs.
- **Tinted to its own life area.** A focused card sets `--cat-color-rgb` from `cat.color` (via `hexToRgb`) and washes its background in it at 0.07, with the border and lift shadow picking up the same hue. The tint layers *over* an opaque white base rather than replacing it — the rail sits on the drifting blob background, and a translucent colour alone would let the blobs read through and shift as they move. `hexToRgb` assumes `#rrggbb`, so an unparseable colour leaves the variable unset and the CSS `var()` fallback (app green) takes over. Non-focused cards are never tinted: colouring all of them would turn the rail into a colour chart and cost the focused ones their distinction.
- Non-focused cards keep the original single-bar layout unchanged.

### Growth stages

Every **24h** invested in a life area (`HOURS_PER_STAGE`) advances its plant one stage: `·` bare soil → 🌱 → 🌿 → ☘️ → 🪴 → 🌳 → 🌲. Past the last stage the art holds and a `×N` day count appears beside it, so long-running areas keep visibly climbing.

- **The bar measures the climb to the next stage (0→24h), not size against other areas.** Absolute by design: a category's bar never shrinks because a different one grew. Relative standing is carried by the stage art instead — a 🌲 beside a 🌱 reads at a glance. (`MAX_SCALE_HOURS` and the old relative scale are gone.)
- `getGrowthStage(totalHours)` → `{ daysDone, art, label, isMaxArt, intoStage, pctToNext, hoursToNext }`. Bar container gets a tooltip with time into the stage and time to the next.
- **Milestone toast** — crossing a stage shows a quiet toast at the top of the sidebar panel *the next time it's open*. Never interrupts: growth reached while collapsed waits, unacknowledged, until the user looks. Collapsing removes it. Fires for **any** life area, focused or not — the toast never depended on the focus split.
- **Growth reached with the panel closed opens it.** The rail stays visible while the panel is collapsed, so its emoji buttons are the normal way to log time to an area that *isn't* in today's focus — and that path could mature a plant with nothing on screen to mark it. When a milestone lands mid-session with the panel shut, `renderSidebar()` calls `setSidebarOpen(true, { persist: false })` and returns, re-entering with the panel open so the toast renders normally. `persist: false` because the app is reacting to an event and must not rewrite the user's remembered sidebar preference. Two guards: `_sidebarBooted` keeps a milestone left over from a previous visit from springing the panel open at load (it still waits for the next manual open), and mobile is excluded — a drawer opening itself over the content would be intrusive.
- **The toast is held live for `GROWTH_TOAST_MS` (8s), not acknowledged on the spot.** It used to be marked seen in the same `renderSidebar()` pass that built it, which meant it never survived: logging hours runs `renderSidebar()` twice (once from `accumulateCategoryHours`, once from the `render()` that follows), and the second pass found nothing pending and dropped the toast in the same tick. `_liveGrowthToast` keeps it up across re-renders until a timer retires it; `cat.seenStage` is still persisted the moment the milestone is detected, so closing the tab mid-toast doesn't re-fire it. The entrance animation is gated on `_growthToastPainted` so rebuilding the element each render doesn't replay it.
- `cat.seenStage` (persisted with the category) is the last stage acknowledged. `baselineGrowthStages()` runs at boot — after `store.categories` is wired, so it sees real totals — and initializes `seenStage` for any category missing it, so **pre-existing hours never fire a toast** on first run.
- Card click → expand detail (Active / Done Today / Backlog sections)
- Backlog rows in the detail carry a **↑ promote** and **× delete** button (fade in on hover; always semi-visible on touch). Dragging to Top 5 still works but is undiscoverable on its own, so both actions are now explicit. Promote respects `MAX_GOALS` — disabled with a tooltip when Top 5 is full — and carries hours/progress like every other promote path. Delete pushes to `undoStack` (Cmd/Ctrl+Z restores it, and undo now re-renders the sidebar too). `setupSidebarBacklogDrag` ignores pointerdown originating in `.sidebar-detail-actions`, or its pointer capture would swallow the button clicks.
- Pencil edit (fades in on hover) → inline form: emoji picker + name input
- `sidebarCollapsed` persisted to localStorage; `expandedCatId` is session-only

### Mobile (≤800px)

The sidebar stops being a column beside the content and becomes a **drawer over it** — at 390px the old always-on rail plus open panel left ~90px for the app.

- The 52px rail is hidden entirely; `#main-content` gets the full width back (no left padding reservation).
- A round **FAB** (bottom-right, thumb-reachable, clears the iOS home indicator via `env(safe-area-inset-bottom)`) opens the drawer. It fades out while open, since the scrim and × take over.
- The panel slides in via `transform` at 300px / `max-width: 88vw`, over a dimmed **scrim**. Closes on: scrim tap, the panel's ×, or Escape. The × is display:none on desktop and only appears here.
- The panel gets a **solid** `--bg` background on mobile — the desktop glass gradient is designed to sit on the app background and is unreadable floating over content.
- Collapsed state is `visibility: hidden` + `pointer-events: none`, so nothing in the off-canvas drawer is tabbable or tappable.
- **The drawer always starts closed on a phone**, ignoring a saved `open` preference — restoring it would bury the app behind a drawer on load. Mobile drawer toggles pass `persist: false`, so opening the drawer on a phone never rewrites the desktop preference.
- `setSidebarOpen(open, { persist })` is the single path for every open/close (rail button, FAB, scrim, ×, Escape, resize), so the scrim, the FAB's `aria-expanded`, and the growth toast can't drift apart. A resize across the breakpoint closes the drawer and clears the scrim.
- Quick-add lives inside the drawer: tap a category card there (the rail's one-tap emoji buttons are a desktop affordance).
- Opening sidebar: `#main-content` gets `.sidebar-open` → padding-left transitions, content slides right
