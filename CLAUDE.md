# Day by Day

A daily focus app being built for personal use first, with the goal of eventually becoming a full product. The current web app is a self-testing ground — the builder is the primary user, using it daily to validate what works before scaling it to others.

**Current form:** Vanilla JS browser app (no framework, no backend).
**End goal:** A polished cross-platform product — likely a native iOS/macOS app or PWA — built on these same philosophical foundations, with a design language refined through real daily use.

Inspired by Oliver Burkeman's "4,000 Weeks" — embrace finitude, act imperfectly, focus on what matters.

## Philosophy & Tone

The app must feel **motivating, calm, and encouraging** — never stressful, anxiety-inducing, or micromanaging. It's a gentle nudge, not a drill sergeant.

- No seconds on clocks (hours:minutes only)
- Use encouraging language ("hours invested" not "wasted", "keep going" not "you're behind")
- Spacious, breathable layouts — never cramped
- Dynamic encouragement that responds to actual progress
- Guilt-trip messages are framed as reflective questions, not attacks

Key insights baked in from 4,000 Weeks:
- We distract because real work will never match the perfect version in our heads
- The future is never guaranteed — only this moment is real
- Perfectionism is procrastination in a nicer outfit
- Taking a leap without overthinking creates the readiness

## Architecture

Vanilla JS, no frameworks, no build step. Three files + one CSS file:

```
index.html       — Structure and layout
style.css        — All styling (Daily Spark design system)
app.js           — Core logic, state management, rendering
notifications.js — Nudge system, browser notifications, wisdom messages
```

Serves from any static file server. Recommended: `python3 -m http.server 8000` (file:// protocol blocks localStorage and Notification API).

## Tech Stack

- **Storage:** localStorage with availability testing at boot. Shows warning banner if unavailable.
- **Notifications:** Browser Notification API (permission-gated) + always-on in-app nudge banners
- **Font:** Plus Jakarta Sans from Google Fonts
- **No dependencies.** No npm, no CDN libraries, no build tools.

## localStorage Keys

| Key | Contents |
|-----|----------|
| `daybyday_data` | Today's state object (date, goals, distractions, journal, quickDone) |
| `daybyday_history` | Array of up to 30 archived day objects |
| `daybyday_layout` | Card column order saved as JSON |
| `daybyday_backlog` | Persistent backlog array (survives day rollover) |
| `daybyday_categories` | Categories array with all-time totalHours per category |
| `daybyday_sidebar` | `'collapsed'` or `'open'` — sidebar toggle state |
| `daybyday_prefs` | Notification permission dismissed flag |

## File Details

### index.html
- Top-level layout: `#app` contains `<aside id="life-sidebar">` + `<div id="main-content">`
- The sidebar is `position: fixed` left overlay — it does NOT live inside the two-col grid
- `#main-content` has `padding-left: calc(52px + 40px)` normally; gains class `sidebar-open` when expanded, which transitions padding-left to `calc(320px + 40px)` to push content right
- Two-column CSS Grid inside `#main-content` (`col-left`, `col-right`)
- Cards: goals, done (always visible), summary (SVG progress rings), distractions, journal (wins + lessons), backlog, encouragement
- Each card has `data-card-id` attribute and `draggable-card` class for drag-and-drop reordering
- Inline SVG favicon (green circle with white "D")
- Script load order matters: `app.js` first, then `notifications.js`
- Sections: storage warning, header+clock, carryover banner (legacy, mostly hidden now), nudge banner, main two-col, notification prompt, footer
- The `carryover-banner` element still exists in HTML but is superseded by the Day Transition Modal on new-day detection

### style.css
- All colors defined as CSS custom properties in `:root` — see Color Palette section
- Two-column grid: `.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }`
- Responsive breakpoint at 800px stacks to single column
- Card drag: `.card-drag-handle` (opacity transition on hover), `.card-dragging` (opacity 0.15), `.card-drop-indicator` (animated green line, grows from center on slot change only)
- Task drag: `.task-drag-handle` (⋮⋮ handle, fades in on row hover), `.task-dragging`, `.task-drop-indicator`
- Inline edit: `.inline-edit-input` with green focus glow
- Progress slider: dynamic gradient background set via JS (`updateSliderFill`)
- Task completion: `.task-completing` keyframe animation (goal animates out, moves to Done Today)
- Done Today card: `.card-done` (white surface), `.done-group` sections with `.done-group-header`, `.done-item-goal` (green tint), `.done-item-quick` (orange tint), `.done-expand-btn` for collapse/expand, `.done-hours-badge` (clickable orange pill on quick items), `.done-item-meta` (green pill on goal items)
- Backlog card: `.card-backlog`, `.backlog-item`, `.backlog-name`, `.btn-promote` (gray), `.btn-demote` (gray, fades in on hover)
- Encouragement card: `background: linear-gradient(135deg, #2D6A4F, #40916C)` with white text
- Summary card: `background: linear-gradient(160deg, #e8e8e8 0%, #ffffff 60%)` — neutral gradient compatible with all four ring colors
- Sidebar: `.life-sidebar` is `position: fixed; left: 0; height: 100vh; z-index: 100`. Collapsed = 52px, expanded = 320px with box-shadow overlay. `#main-content.sidebar-open` uses `transition: padding-left` to push content right
- Day Transition Modal: `.day-modal-overlay` / `.day-modal` — full-screen blur overlay, max-width 520px centered card

### app.js
- IIFE with `'use strict'`
- **Constants:** `STORAGE_KEY`, `HISTORY_KEY`, `LAYOUT_KEY`, `BACKLOG_KEY`, `CATEGORIES_KEY`, `SIDEBAR_KEY`, `RING_CIRCUMFERENCE = 2 * Math.PI * 34`
- **Storage:** `storageGet(key)` / `storageSet(key, value)` — wraps localStorage with try/catch

#### State shapes

**Daily state** (`STORAGE_KEY`):
```js
{
  date: 'YYYY-MM-DD',
  goals: [{
    name, hours, progress,      // core fields
    prevHours?,                 // hours from previous day (carried over)
    fromBacklog?,               // true if promoted from backlog
    category?,                  // category id string, null = 'general'
    repeatable?                 // bool — carries forward to next day if not done
  }],
  distractions: [{ name, hours, category? }],
  successes: [string],
  failures: [string],
  quickDone: [{ name, hours }],
  _carryover?: [goal-like objects]  // temp: set on new day, consumed by Day Transition Modal
}
```

**Backlog** (`BACKLOG_KEY`) — persists across day rollovers:
```js
[{ name, category?, repeatable? }]
```

**Categories** (`CATEGORIES_KEY`) — persists indefinitely, accumulates all-time hours:
```js
[{
  id,           // stable string key (e.g. 'career', 'custom_1234567890')
  name,         // display name (editable)
  emoji,        // single emoji (editable)
  color,        // hex color string
  totalHours,   // all-time accumulated hours (never reset, only += delta)
  vision?       // optional long-form user text about this life area
}]
```

**Default categories:** fitness, career, relationships, chores, general. `general` is the fallback for any goal without a category.

#### Categories system

- `loadCategories()` — merges saved data with `DEFAULT_CATEGORIES` at boot. Custom categories (id starts with `custom_`) are appended after defaults. Spread order: `{ ...def, ...saved }` so saved `totalHours`/`emoji`/`name` always win.
- `saveCategories()` — persists full categories array to `CATEGORIES_KEY`.
- `getCategoryById(id)` — returns category or falls back to `general`. Never returns undefined.
- `accumulateCategoryHours(catId, delta)` — called on every hours-input change event. Adds `delta` (can be negative) to `cat.totalHours`, clamps to 0, saves, re-renders sidebar. This is the **only** place totalHours is mutated. It is NOT recalculated from state on load — it's a running total. This means: if hours are edited down, the total decreases correctly; but history-archived days do not contribute to the total retroactively.
- `createCategoryPill(catId, onCategorySelect, getRepeatable, setRepeatable)` — returns a button showing the category emoji. Tracks `currentCatId` as a `let` inside the closure so re-opening the picker always shows the correct current selection (not stale creation-time value). When `getRepeatable`/`setRepeatable` are provided (goals only), opens `openTaskContextPicker` with both category + repeatable controls. Otherwise opens `openCategoryPicker` (category only).
- **Category pill is on the bottom log row** of each goal item, next to the hours/progress inputs. The `↻` repeat icon (`.task-repeat-badge`) is also in the log row, shown/hidden via `.hidden` class.

#### Sidebar

- `initSidebar()` — sets initial collapsed state, wires hamburger toggle button. **The hamburger button (`#sidebar-expand-btn`) is the single toggle — it both opens AND closes.** No separate close button is shown.
- `sidebarCollapsed` (bool) + `expandedCatId` (string|null) are the two sidebar state variables. Only `sidebarCollapsed` is persisted to localStorage.
- `renderSidebar()` — fully rebuilds the sidebar categories list on every call. Counts `todayActive`, `todayCompleted`, `todayBacklog` per category from current `state.goals` and `backlog`. Shows `N active · N done · N backlog` beneath each card.
- **Sidebar layout (two zones):**
  - **Rail** (always visible, 52px): hamburger button + one emoji button per category. Emoji buttons open `openQuickAddModal(cat)` — a floating modal to add a task directly to that category's Top 5 or Backlog.
  - **Panel** (visible when expanded, 268px): category cards + "New area" button.
- **Sidebar category card** shows: emoji, name, all-time hours, optional ✓N done badge, progress bar (scaled to `max(maxTotalHours, 40h)`), task counts.
- **Pencil edit button** fades in on card hover (`opacity: 0` → `1`). Clicking it (with `stopPropagation`) calls `openCatInlineEdit(cat, card, top, editBtn)` which replaces the top row with an inline edit form: emoji picker button + name input + Save + ✕. Emoji button opens `.sidebar-emoji-picker-pop` (20-emoji grid, `position: fixed`). Enter saves, Escape cancels.
- **Click anywhere else on card** toggles `expandedCatId`. When expanded, the card shows a detail panel with three sections: Active (green tint), Done Today (mint strikethrough), Backlog (gray). Empty state shows "No tasks here yet."
- **Sidebar/content interaction:** When sidebar opens, `#main-content` gains `.sidebar-open` class → `padding-left` transitions from `calc(52px + 40px)` to `calc(320px + 40px)`. Main content shrinks and slides right — sidebar overlays nothing.

#### Day transition & new-day detection

- `getTodayString()` — local date as `YYYY-MM-DD`, never UTC.
- `loadState()` — on boot, if saved date ≠ today: calls `archiveDay()`, sets `_prevDayForModal` module-level variable, builds fresh state with `_carryover` (incomplete goals), returns it.
- `checkForNewDay()` — runs every 60s synced to the minute boundary. Same logic: detects date change mid-session, archives, resets state, calls `showDayTransitionModal(prev)`.
- `archiveDay(ds)` — pushes day snapshot `{ date, goals, distractions, successes, failures }` to history array (max 30 entries, oldest shifted off). Does NOT include `_carryover`. Does NOT modify `categories.totalHours` — hours accumulate in real-time via `accumulateCategoryHours`, not at archive time.
- Boot sequence: `render()` → if `_prevDayForModal` show Day Transition Modal, else fall back to legacy `showCarryoverIfNeeded()`.

#### Day Transition Modal (`showDayTransitionModal(prev)`)

Replaces the old carryover banner. Shown on first load after a new day, or at midnight mid-session.

**Sections:**

1. **Yesterday's summary** — stat pills (tasks done, hours focused, hours distracted). Distraction pill turns red if ≥ 2h. Completed goal list with category emoji + hours. Distraction warning message if ≥ 2h threshold.

2. **Category insights** — only shown when 2+ categories have all-time data. Identifies lagging categories (totalHours < 50% of average) and thriving ones (> 150%). Generates a one-line nudge suggesting balance.

3. **Focus area picker** — grid of all categories. Pre-selects up to 3 with the least all-time hours that have backlog or repeatable tasks. Selecting a 4th auto-deselects the first. Selection stored in a local `Set<id>`.

4. **Repeatable task checklist** — hidden if no matches. Pulls repeatable items from `state._carryover` (carried-forward incomplete repeatable goals) + `backlog` (items with `repeatable: true`), filtered to selected focus categories. All pre-checked. User can uncheck any.

5. **Actions:**
   - **"Start my day →"** — adds checked repeatable tasks to `state.goals` (removes them from backlog if backlog-sourced), carries over non-repeatable carryover goals whose category is in the selected focus set (up to MAX_GOALS), deletes `_carryover`, saves, renders, closes.
   - **"Skip, start fresh"** — deletes `_carryover`, closes. No tasks added.

**Critical invariant:** The modal reads from `state._carryover` which was set during `loadState()`/`checkForNewDay()`. It writes directly to `state.goals` and `backlog` before calling `saveState()`/`saveBacklog()`. After the modal closes, `_carryover` is gone from state.

#### Other key functions

- **Clock:** Syncs to exact system minute boundary using `msUntilNextMinute`, ticks every 60s. No seconds.
- **Active vs completed goals:** `getActiveGoals()` → progress < 100; `getCompletedGoals()` → progress = 100. Completed goals appear in Done Today, not a separate card.
- **Goal completion flow:** Slider hits 100 → `.task-completing` animation (350ms) → `render()`. Goal moves to Done Today automatically.
- **Done Today card:** `renderDone()` — two groups (From Top 5 / Quick wins), top 3 visible, `+ N more` toggle. `doneExpanded` is in-memory only (resets on reload). Newest item gets `.done-item-entering` animation. Quick win hours badge is clickable inline editor.
- **Promote/demote:** Promote adds `fromBacklog: true`. Demote button fades in on hover, moves goal back to backlog.
- **Inline editing:** `makeEditable(spanEl, onSave)` — Enter saves, Escape cancels.
- **Progress rings:** SVG circles, `stroke-dasharray: 213.63`. Four rings: avg progress (green), goal hours (mint, max 8h), distraction hours (rose, max 4h), quick wins hours (orange, max 4h).
- **Drag & drop (pointer events):** `setupCardDrag` (card reorder, saves to `LAYOUT_KEY`) + `setupTaskDrag` (task row reorder within list). `activeDrag` holds all state; `dragType: 'card' | 'task'` distinguishes them.
- **Undo:** `undoStack`. Cmd+Z/Ctrl+Z. Supports: `'goal'`, `'distraction'`, `'successes'`, `'failures'`, `'backlog'`, `'quickDone'`.
- **Public API:** `window.DayByDayApp = { getState, getGoals, getDistractions, storageGet, storageSet }`

### notifications.js
- IIFE with `'use strict'`
- **Timers:** Motivational nudge every 25 min, guilt-trip check every 40 min
- **In-app nudges always start** regardless of browser notification permission
- **Nudge banner stays visible** until user clicks dismiss. New messages replace current text (no auto-hide).
- **15 wisdom messages** from 4,000 Weeks philosophy + **10 motivational messages**
- **Guilt-trip system:** `getGuiltTripMessage()` compares distraction hours vs goal progress
- **Browser notifications:** Permission prompt shown once (3s delay), dismissed state saved to `daybyday_prefs`. Test notification sent on grant.
- **Public API:** `window.DayByDayNotifications = { onGoalsUpdated, showNudge, sendNotification, getWisdom }`
- **Init timing:** `setTimeout(init, 50)` to ensure app.js has loaded first

## UI & Design System

Strictly adhere to the "Daily Spark" design system. Do not use Claude's default purples/ambers or standard generic gradients.

### 1. Color Palette (The "Growth & Energy" Scheme)
- **Primary (Action/Growth):** #2D6A4F (Deep Forest Green)
- **Secondary (Tiger Orange):** #FF9F1C — used only for quick wins UI elements
- **Background (Focus):** #EEF2EE (Soft green-tinted base — chosen to give frosted glass contrast)
- **Surface (Card):** `rgba(255,255,255,0.72)` — frosted glass surface with `backdrop-filter: blur(20px) saturate(1.6)`
- **Surface (Solid fallback):** `#FFFFFF` — used for inputs, inline edit fields where transparency looks wrong
- **Accent (Celebration):** #40916C (Mint Leaf Green)
- **Text (Main/Headlines):** #1B4332 (Dark Evergreen)
- **Text (Subtle/Muted):** #6C757D (Slate Gray)

### 2. Semantic Ring & Section Colors
These are defined as CSS custom properties and must be used consistently — the same color token appears on the ring, the row background, the hours badge, and any related button.

| Token | Value | Used for |
|-------|-------|---------|
| `--ring-distraction` | `#F4A0A0` | "5 to Avoid" rows, number badges, distraction hours ring |
| `--ring-distraction-light` | `#fef2f2` | "5 to Avoid" row backgrounds, distraction icon background |
| `--ring-quick` | `#FF9F1C` | Quick wins hours ring, quick wins hours badge |
| `--ring-quick-light` | `#fff5e6` | Quick wins hours badge background |

Progress ring → `--primary` `#2D6A4F`
Goal hours ring → `--accent` `#40916C`
Distraction hours ring → `--ring-distraction` `#F4A0A0` (rose/pink)
Quick wins hours ring → `--ring-quick` `#FF9F1C` (orange)

### 3. Spatial / 3D Depth System

The app uses a layered depth system inspired by Apple's visionOS / iOS 26 liquid glass aesthetic.

#### Background
- Body background: `#EEF2EE` base with three `radial-gradient` blobs (green x2, orange x1) rendered via `body::before`, `body::after`, and `#blob3` div
- Blobs are animated independently on 22s/28s/34s cycles via `blobDrift1/2/3` keyframes — slow, organic drift with slight scale breathing
- `background-attachment: fixed` is NOT used — blobs are `position: fixed` elements with `filter: blur(60px)` for smooth performance

#### Cards (`.card`)
- `background: rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(1.6)`
- Asymmetric border: `rgba(255,255,255,0.65)` top/left, `rgba(0,0,0,0.06)` bottom, `rgba(0,0,0,0.04)` right — simulates top-left light source
- Three-layer shadow: tight contact + mid diffuse + distant colored glow + `inset 0 1px 0` top highlight
- Hover: `translateY(-2px)` with shadow deepening

#### Task rows / backlog items / journal entries
- `background: rgba(255,255,255,0.82)` — more opaque than card so they read as floating inside it
- Same asymmetric border + inner highlight treatment at smaller scale
- Hover: `translateY(-1px)`

#### Card icon badges (`.card-icon`)
- 44×44px with same border + shadow treatment — look like small raised chips

### 4. Button System (Liquid Glass)

All buttons use the same core technique: **muted solid color base + glass sheen gradient overlay**.

```css
background:
  linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.1) 100%),
  <base-color>;
```

The gradient fades from a white highlight at top → slight darken at bottom, simulating light hitting a curved glass surface. `backdrop-filter: blur(12px)` applies on the base `.btn` class.

| Variant | Base color | Used for |
|---------|-----------|---------|
| `.btn-primary` | `#4a8c6e` (muted forest green) | Add goal, add quick win, carryover accept, enable notifications |
| `.btn-secondary-orange` | `#c87d20` (muted amber) | Quick wins secondary actions |
| `.btn-distraction` | `#a85058` (muted rose) | Add distraction |
| `.btn-ghost` | `rgba(140,148,156,0.25)` + white gradient | Neutral/secondary: Start Fresh, Archive, Maybe Later |

- **Add buttons** are icon-only (no text), 42×42px square
- **Hover:** lifts `translateY(-1px)`, shadow deepens, base color brightens ~10%
- **Active:** presses `translateY(1px)`, shadow compresses

#### Small pill buttons
`.done-expand-btn`, `.btn-uncomplete`, `.btn-promote`, `.btn-demote` share a pill style:
- `background: rgba(150,155,160,0.18)` + `backdrop-filter: blur(8px)`
- Gray border, inner highlight, 20px border-radius
- Hover tint: green for promote/reopen/expand, orange for demote

#### Delete buttons (`.task-delete`)
- Icon-only (`×` SVG), glass pill, opacity 0 → fades in on parent row hover
- Hover: red tint `rgba(217,83,79,0.12)`

### 5. Icons
- **Drag handles** (cards + task rows): Phosphor `DotsSixVertical` inline SVG — 6-dot grid, 16px cards / 14px tasks
- **Card header icons**: Phosphor inline SVGs — unique per card (Target, CheckCircle, ChartBar, ProhibitInset, NotePencil, ListBullets)
- **No emojis anywhere** — all icons are inline SVGs
- **Icon-only buttons** use inline SVG from Phosphor (plus sign for add, X for delete, arrows for promote/demote)

> **Pending:** Replace Phosphor card icons with 3dicons.co "Dynamic Color" 3D PNG renders (CC0 license). Download manually: search `target`, `check`, `chart`, `prohibit`, `notebook`, `list` at 3dicons.co, save as `icons/goal.png`, `icons/done.png`, `icons/progress.png`, `icons/distraction.png`, `icons/journal.png`, `icons/backlog.png`.

### 6. Card Background Conventions
- **Most cards:** `rgba(255,255,255,0.72)` frosted glass
- **Done Today:** same frosted glass (neutral — hosts both green and orange row tints)
- **Today's Progress:** `linear-gradient(160deg, rgba(232,232,232,0.75) 0%, rgba(255,255,255,0.65) 60%)` — frosted neutral gradient
- **Encouragement:** `linear-gradient(135deg, #2D6A4F, #40916C)` white text — solid, no glass
- **Backlog:** frosted glass

### 7. Glass Text Technique

Used on the app title and clock. Makes bold text feel translucent and spatial — letterforms are solid weight but light passes through them.

```css
background: linear-gradient(160deg, rgba(27,67,50,0.9) 0%, rgba(45,106,79,0.65) 50%, rgba(64,145,108,0.5) 100%);
-webkit-background-clip: text;
background-clip: text;
-webkit-text-fill-color: transparent;
filter: drop-shadow(0 1px 0 rgba(255,255,255,0.7)) drop-shadow(0 2px 6px rgba(45,106,79,0.18));
```

- Use font-weight 800 — the effect only reads at heavy weights, thin text disappears
- The white `drop-shadow` above simulates a light-hit highlight on the top edge of the letters
- The colored `drop-shadow` below gives depth/lift
- Do NOT combine with `text-shadow` — incompatible with `background-clip: text`
- Use for headings and display text only — never body copy

### 8. Design Guardrails
- **Typography:** Plus Jakarta Sans. Fallback: system-ui, -apple-system, sans-serif.
- **Border Radii:** 16px cards, 12px inner elements/buttons, 8px small items, 20px pills.
- **Shadows:** Always layered (2–3 layers). Never single flat shadow. Always include `inset 0 1px 0 rgba(255,255,255,x)` top highlight on raised elements.
- **Micro-interactions:** Buttons lift on hover (`translateY(-1px)`), press on active (`translateY(1px)`). Delete/demote buttons fade in on task hover. Drag handles appear on row/card hover.
- **Layout:** Two-column CSS Grid (1fr 1fr). Progress Rings (SVG). Generous spacing (24-28px gaps).
- **No Apple SDK:** Apple has no official web Liquid Glass SDK. Our implementation is pure CSS (`backdrop-filter` + layered shadows + gradient sheen). Community libs exist (`liquid-glass-js`, `liquid-glass-component-kit`) but are not used — our approach is lighter and fits the no-dependency constraint.

### 8. Implementation Rules
- When generating CSS, use the exact hex codes or CSS custom properties above.
- Do NOT use `indigo-600`, `purple-500`, or any color outside this palette.
- New buttons must follow the liquid glass pattern: solid muted base + `linear-gradient` sheen overlay + asymmetric border + layered shadow.
- All new semantic colors must be defined as CSS custom properties in `:root` before use.
- Derived colors (light backgrounds, glows, borders) use `rgba()` of the base hex.
- Task rows, backlog items, journal entries inside cards must use solid/near-solid backgrounds (`rgba(255,255,255,0.82)`) — never fully transparent, or they double-blur and look muddy.

## Known Constraints

- **file:// protocol:** localStorage and Notification API may be blocked. Must serve via HTTP.
- **Git in sandbox:** `.git/*.lock` files can't be deleted from the sandbox VM. Run git commands locally.
- **Browser notifications:** May not work in all browsers/contexts. In-app nudges are the reliable fallback.
- **No backend:** All data is local to the browser. No sync, no accounts, no server.

## Current State (v0.9)

All features implemented:
- Live clock (synced to system, no seconds)
- Top 5 active goals with hour logging + progress slider + task-level drag reorder
- Goal completion flow — goals hitting 100% animate into the Done Today card
- Done Today card — always visible, two collapsible groups (From Top 5 / Quick wins), top 3 shown by default with `+ N more` expand toggle, entrance animation on newest item only
- Quick wins — manually log ad-hoc completed tasks with optional hours; hours badge clickable to edit inline
- 5 distractions to avoid with hour logging + task-level drag reorder
- Daily summary with 4 progress rings: avg progress (green), goal hours (mint), distraction hours (rose), quick wins hours (orange)
- Journal (wins + lessons)
- Backlog card — unlimited queued items; promote adds `fromBacklog: true` flag; demote button appears on promoted goals to return them to backlog
- Day carryover with archive (max 30 days history)
- Browser + in-app notifications with wisdom messages
- Guilt-trip nudges based on distraction vs goal comparison
- Smooth pointer-event drag-and-drop for cards (drop indicator animates only on slot change, grows from center)
- Smooth pointer-event drag-and-drop for task rows
- Undo (Cmd+Z / Ctrl+Z) for goals, distractions, journal, backlog, quick wins
- Auto new-day detection without browser refresh
- Inline editing for all text items
- Carried-over goals show "Xh prev" badge
- Responsive layout (two-col desktop, single-col mobile at 800px)
- Tab favicon
- Ranked priority ordering — explicit rank badges on goals (#1–#5)
- Journal mood tracking — sentiment tracking on wins/lessons with visual mood assessment
- **Life Areas (Categories)** — 5 default + unlimited custom; each goal/backlog item tagged with a category; all-time hours tracked per category
- **Repeatable tasks** — goals/backlog items can be flagged repeatable; ↻ emoji shown in log row; carries forward through Day Transition Modal
- **Fixed left sidebar** — rail (52px) always visible; expands to 320px, pushing main content right via `padding-left` transition; hamburger button is the single open/close toggle
- **Sidebar category cards** — show all-time hours bar, today's active/done/backlog counts; click to expand task detail; hover reveals pencil edit (emoji + name); rail emoji buttons open quick-add modal
- **Day Transition Modal** — replaces carryover banner; shows yesterday's summary stats, distraction warning, category balance insights, focus area picker (max 3), repeatable task checklist, "Start my day" commit action

## Known Bugs (Confirmed)

- **Browser notifications not working** — permission flow runs but notifications don't appear in some browsers. In-app nudge banner is the reliable fallback.
- **`totalHours` is not retroactive** — hours accumulated before the categories feature existed are not backfilled. The all-time total only reflects hours logged after categories were introduced.
- **Category hours on history archive** — `archiveDay()` snapshots goals as-is but does not recalculate `totalHours` at archive time. Hours are accumulated in real-time via `accumulateCategoryHours`; editing hours on a goal from a previous day's carryover would double-count if re-logged.

## Backlog (Prioritized)

### Near-term
- **Day Transition Modal — category hours imbalance** needs real data before it's useful. Will become more valuable as `totalHours` accumulates over weeks of use.
- **Repeatable tasks from categories with no backlog** — currently the modal only suggests repeatable items found in `_carryover` or `backlog`. Standalone repeatable templates (not tied to a specific in-progress task) are not yet supported.

### Medium Complexity
- **Common pitfalls from history** — surface patterns from previous days' journal entries ("last time you worked on X, you noted Y")

### Higher Complexity
- **Task snowball visualization** — visually growing representation of compounding progress (tasks feeding a growing fire/sun metaphor)

### Big Swings (Separate Projects)
- **Agentic notification framework** — run on a Qwen model fine-tuned with GRPO (via [ART](https://github.com/OpenPipe/ART)) to generate context-aware, oracle-quality nudges
- **Full SDLC/CI/CD template** — GitHub feature branches, pre-commit hooks, CI on PR, free-tier cloud hosting

## Future Ideas (Not Yet Built)
- Weekly/monthly progress views from archived history
- Export data as JSON or CSV
- Custom notification frequency settings
- Streak tracking per life area
- Dark mode
- Standalone repeatable task templates (not tied to a one-off goal)

## Product Vision (Forward Thinking)

This is a personal tool being built toward a real product. Keep this context in mind when making architectural or design decisions.

### What this app is really about
Not task management — there are a thousand of those. This is about **finitude-aware focus**: the idea that you have limited time and attention, and the app should help you feel that weight gently, not anxiously. Every design and feature decision should reinforce this.

### Path to product
1. **Phase 1 (now):** Vanilla web app, self-use, rapid iteration. No infra, no accounts, no sync. Optimize for feel and philosophy.
2. **Phase 2:** PWA with offline support, home screen install, push notifications that actually work. Still no backend — localStorage + service worker.
3. **Phase 3:** Native iOS/macOS app (Swift/SwiftUI). The liquid glass design language we've built will translate directly — we're building in the right aesthetic direction now. Data sync via iCloud.
4. **Phase 4:** Multi-platform, potential monetization. Subscription for cross-device sync and AI-powered nudges.

### Design decisions to make now that will matter later
- **Keep state shape clean** — the `{ date, goals, distractions, successes, failures, quickDone }` shape is portable. Categories live in a separate key. Both should remain clean for any future storage backend (iCloud, Supabase, etc.).
- **`totalHours` is a running accumulator, not a derived value** — this is intentional for performance. When porting to a backend, it should be stored as a field, not recomputed from history on every load.
- **No DOM-coupled logic** — all business logic lives in functions, not tied to specific element IDs. This makes porting to React/SwiftUI easier.
- **The notification system** is a placeholder for something much smarter — the agentic nudge framework (ART/GRPO) is the real end-game here.
- **Design language is already production-grade** — the spatial/glass system we've built maps well to visionOS and iOS 26 native components. Don't regress it.
- **The Day Transition Modal** is the first step toward daily planning intelligence. The focus area picker + repeatable checklist will become more powerful as history accumulates — eventually it should suggest tasks based on momentum, not just hours imbalance.

### Open questions to resolve before scaling
- Should goals be ordered by drag only, or is there a smarter priority signal (time-of-day, streak, estimated effort)?
- What's the right monetization model — one-time purchase (aligns with finitude philosophy) vs subscription (recurring nudges/sync)?
- How much of the journal/history data can feed an on-device model for personalized nudges without a backend?
