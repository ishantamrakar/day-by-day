# Day by Day

A browser-based daily focus app that helps you track your top 5 goals and 5 distractions to avoid. Inspired by Oliver Burkeman's "4,000 Weeks" — embrace finitude, act imperfectly, focus on what matters.

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
index.html    — Structure and layout
style.css     — All styling (Daily Spark design system)
app.js        — Core logic, state management, rendering
notifications.js — Nudge system, browser notifications, wisdom messages
```

Serves from any static file server. Recommended: `python3 -m http.server 8000` (file:// protocol blocks localStorage and Notification API).

## Tech Stack

- **Storage:** localStorage with availability testing at boot. Shows warning banner if unavailable.
- **Notifications:** Browser Notification API (permission-gated) + always-on in-app nudge banners
- **Font:** Plus Jakarta Sans from Google Fonts
- **No dependencies.** No npm, no CDN libraries, no build tools.

## File Details

### index.html
- Two-column CSS Grid layout (`col-left`, `col-right`)
- Cards: goals, completed (hidden until first goal hits 100%), summary (SVG progress rings), distractions, journal (wins + lessons), backlog, encouragement
- Each card has `data-card-id` attribute and `draggable-card` class for drag-and-drop reordering
- Inline SVG favicon (green circle with white "D")
- Script load order matters: `app.js` first, then `notifications.js`
- Sections: storage warning, header+clock, carryover banner, nudge banner, main two-col, notification prompt, footer

### style.css
- All colors defined as CSS custom properties matching the palette below
- Two-column grid: `.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }`
- Responsive breakpoint at 800px stacks to single column
- Card drag: `.card-drag-handle` (opacity transition on hover), `.card-dragging` (opacity 0.15), `.card-drop-indicator` (animated green line between cards)
- Task drag: `.task-drag-handle` (⋮⋮ handle, fades in on row hover), `.task-dragging`, `.task-drop-indicator`
- Inline edit: `.inline-edit-input` with green focus glow
- Progress slider: dynamic gradient background set via JS (`updateSliderFill`)
- Task completion: `.task-complete` with accent-light background and strikethrough; `.task-completing` keyframe animation
- Completed card: `.card-completed` green gradient, `.task-check-badge`, `.btn-uncomplete`, `.completed-hours`
- Backlog card: `.card-backlog`, `.backlog-item`, `.backlog-name`, `.btn-promote`
- Encouragement card: `background: linear-gradient(135deg, #2D6A4F, #40916C)` with white text

### app.js
- IIFE with `'use strict'`
- **Constants:** `STORAGE_KEY = 'daybyday_data'`, `HISTORY_KEY = 'daybyday_history'`, `LAYOUT_KEY = 'daybyday_layout'`, `BACKLOG_KEY = 'daybyday_backlog'`, `RING_CIRCUMFERENCE = 2 * Math.PI * 34`
- **Storage:** `storageGet(key)` / `storageSet(key, value)` — wraps localStorage with try/catch
- **State shape:** `{ date, goals: [{name, hours, progress, prevHours?}], distractions: [{name, hours}], successes: [string], failures: [string] }`
- **Backlog shape:** `[{name}]` — stored separately under `BACKLOG_KEY`, survives day rollovers, loaded into `backlog` variable
- **Clock:** Syncs to exact system minute boundary using `msUntilNextMinute` calculation, then ticks every 60s. No seconds displayed.
- **Date:** `getTodayString()` uses local date (getFullYear/getMonth/getDate), NOT UTC
- **Day carryover:** On new day, archives previous day to history (max 30 entries), carries forward incomplete goals (progress < 100%) as `_carryover` array. User can accept or dismiss via banner.
- **Active vs completed goals:** `getActiveGoals()` returns goals with progress < 100; `getCompletedGoals()` returns goals with progress = 100. `renderGoals()` renders active goals into `#goals-list` and completed goals into `#completed-list` inside `#completed-section` (hidden when empty).
- **Goal completion flow:** When slider hits 100, a `.task-completing` animation plays on the item (350ms), then `render()` is called — the goal moves to the completed card automatically.
- **Reopen completed goal:** "Reopen" button sets progress back to 95 and saves — goal returns to active list on next render.
- **Inline editing:** `makeEditable(spanEl, onSave)` — click any task name, backlog item, or journal entry to edit. Enter saves, Escape cancels.
- **Progress slider fill:** `updateSliderFill(slider)` — applies `linear-gradient(to right, #2D6A4F 0%, #40916C ${pct}%, rgba(45,106,79,0.1) ${pct}%)` for visual fill
- **Progress rings:** SVG circles with `stroke-dasharray: 213.63` and animated `stroke-dashoffset`. Three rings: avg progress, goal hours (max 8h), distraction hours (max 4h). All goals (active + completed) count toward rings.
- **Summary breakdown:** Per-goal bar chart. Completed goals show strikethrough name and a distinct green bar color.
- **Dynamic encouragement:** `updateEncouragement(ap, gh, dh)` — priority order: all goals done > some goals done > distraction-heavy > standard states.
- **Drag & drop (pointer events, not HTML5 drag API):**
  - `setupCardDrag(card)` — attaches pointerdown to the card's `.card-drag-handle`. On drag: creates a fixed-position ghost clone, shows `.card-drop-indicator` lines between sibling cards as cursor moves, inserts card on pointerup. Saves layout to localStorage.
  - `setupTaskDrag(item, list, type)` — attaches pointerdown to the task's `.task-drag-handle`. On drag: creates ghost clone, shows `.task-drop-indicator` between rows. On drop: splices state array to match new visual order, clamps index to array bounds, calls `render()`.
  - Task items store their state-array index in `dataset.goalIndex` (goals) or `dataset.distIndex` (distractions) so drag-end knows what to splice.
  - `activeDrag` object holds all drag state; `dragType: 'card' | 'task'` distinguishes the two systems.
- **Backlog:** `renderBacklog()` / `createBacklogElement(item, index)`. "↑ Promote" button only shown when active goal count < MAX_GOALS — moves item to `state.goals`, removes from `backlog`, saves both.
- **Undo:** `undoStack` (array). Cmd+Z/Ctrl+Z pops last entry. Supports type: `'goal'`, `'distraction'`, `'successes'`, `'failures'`, `'backlog'`.
- **Public API:** `window.DayByDayApp = { getState, getGoals, getDistractions, storageGet, storageSet }` — used by notifications.js

### notifications.js
- IIFE with `'use strict'`
- **Timers:** Motivational nudge every 25 min, guilt-trip check every 40 min
- **In-app nudges always start** regardless of browser notification permission
- **Nudge banner stays visible** until user clicks dismiss. New messages replace current text (no auto-hide).
- **15 wisdom messages** from 4,000 Weeks philosophy + **10 motivational messages**
- **Guilt-trip system:** `getGuiltTripMessage()` compares distraction hours vs goal progress, generates messages like "You've spent Xh on Y. Meanwhile, Z is at N%."
- **Browser notifications:** Separate from in-app nudges. Permission prompt shown once (3s delay), dismissed state saved to `daybyday_prefs` in localStorage. Test notification sent on grant.
- **Public API:** `window.DayByDayNotifications = { onGoalsUpdated, showNudge, sendNotification, getWisdom }`
- **Init timing:** `setTimeout(init, 50)` to ensure app.js has loaded first

## UI & Design System

Strictly adhere to the "Daily Spark" design system for all UI generation. Do not use Claude's default purples/ambers or standard generic gradients.

### 1. Color Palette (The "Growth & Energy" Scheme)
- **Primary (Action/Growth):** #2D6A4F (Deep Forest Green)
- **Secondary (Motivation/Energy):** #FF9F1C (Bright Tiger Orange)
- **Background (Focus):** #F8F9FA (Soft Paper White)
- **Surface (Card/Task):** #FFFFFF (Pure White)
- **Accent (Celebration):** #40916C (Mint Leaf Green)
- **Text (Main/Headlines):** #1B4332 (Dark Evergreen)
- **Text (Subtle/Muted):** #6C757D (Slate Gray)

### 2. Design Guardrails
- **Typography:** Plus Jakarta Sans (loaded from Google Fonts). Fallback: system-ui, -apple-system, sans-serif.
- **Border Radii:** 16px for cards, 12px for inner elements and buttons, 8px for small items.
- **Shadows:** Only soft, diffused shadows. No harsh borders. Three levels: `--shadow-sm`, `--shadow`, `--shadow-hover`.
- **Micro-interactions:** Buttons scale on hover (1.02) and active (0.98). Delete buttons fade in on task hover. Drag handles appear on row/card hover.
- **Layout:** Two-column CSS Grid (1fr 1fr). Progress Rings (SVG) not bars. Generous spacing (24-28px gaps).

### 3. Implementation Rules
- When generating CSS or Tailwind, use these specific hex codes.
- Do NOT use `indigo-600` or `purple-500` under any circumstances.
- If a component needs a gradient, use #2D6A4F to #40916C only.
- All colors must be defined as CSS custom properties in `:root`.
- Derived colors (light backgrounds, glows, borders) use rgba() of the primary/secondary hex values.

## Known Constraints

- **file:// protocol:** localStorage and Notification API may be blocked. Must serve via HTTP.
- **Git in sandbox:** `.git/*.lock` files can't be deleted from the sandbox VM. Run git commands locally.
- **Browser notifications:** May not work in all browsers/contexts. In-app nudges are the reliable fallback.
- **No backend:** All data is local to the browser. No sync, no accounts, no server.

## Current State (v0.5)

All features implemented:
- Live clock (synced to system, no seconds)
- Top 5 active goals with hour logging + progress slider + task-level drag reorder
- Goal completion flow — goals hitting 100% animate out and move to a separate "Completed Today" card
- Completed card with checkmark badges, hours display, and "Reopen" button to move goals back to active
- 5 distractions to avoid with hour logging + task-level drag reorder
- Daily summary with 3 progress rings (counts all goals including completed)
- Journal (wins + lessons)
- Backlog card — unlimited queued items, "↑ Promote" moves items to active goals when slots are open
- Day carryover with archive (max 30 days history)
- Browser + in-app notifications with wisdom messages
- Guilt-trip nudges based on distraction vs goal comparison
- Smooth pointer-event drag-and-drop for card reordering (persisted) with live drop indicators
- Smooth pointer-event drag-and-drop for task row reordering within goals and distractions lists
- Undo (Cmd+Z / Ctrl+Z) for goals, distractions, journal entries, and backlog items
- Auto new-day detection without browser refresh
- Inline editing for all text items (goals, distractions, journal, backlog)
- Carried-over goals show "Xh prev" badge instead of pre-filled hours
- Responsive layout (two-col desktop, single-col mobile at 800px)
- Tab favicon

## Known Bugs (Confirmed)

- **Browser notifications not working** — permission flow runs but notifications don't appear in some browsers. In-app nudge banner is the reliable fallback.

## Backlog (Prioritized)

### Quick Wins
- **Ranked priority ordering** — explicit priority rank for goals (not just drag order)

### Medium Complexity
- **Journal mood tracking** — track sentiment of wins/lessons over time; show visual mood assessment tied to overall work progress
- **Common pitfalls from history** — surface patterns from previous days' journal entries ("last time you worked on X, you noted Y")

### Higher Complexity
- **Distraction anomaly intervention** — detect unusual distraction spike and prompt a reflection, check-in, or short meditation session
- **Task snowball visualization** — visually growing representation of compounding progress (tasks feeding a growing fire/sun metaphor)

### Big Swings (Separate Projects)
- **Agentic notification framework** — run on a Qwen model fine-tuned with GRPO (via [ART](https://github.com/OpenPipe/ART)) to generate context-aware, oracle-quality nudges
- **Full SDLC/CI/CD template** — GitHub feature branches, pre-commit hooks, CI on PR, free-tier cloud hosting; a reusable template for shipping production-ready projects quickly

## Future Ideas (Not Yet Built)
- Weekly/monthly progress views from archived history
- Export data as JSON or CSV
- Custom notification frequency settings
- Goal categories or tags
- Streak tracking
- Dark mode
