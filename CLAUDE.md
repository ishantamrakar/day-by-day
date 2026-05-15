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
- Cards: goals, done (always visible), summary (SVG progress rings), distractions, journal (wins + lessons), backlog, encouragement
- Each card has `data-card-id` attribute and `draggable-card` class for drag-and-drop reordering
- Inline SVG favicon (green circle with white "D")
- Script load order matters: `app.js` first, then `notifications.js`
- Sections: storage warning, header+clock, carryover banner, nudge banner, main two-col, notification prompt, footer

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

### app.js
- IIFE with `'use strict'`
- **Constants:** `STORAGE_KEY = 'daybyday_data'`, `HISTORY_KEY = 'daybyday_history'`, `LAYOUT_KEY = 'daybyday_layout'`, `BACKLOG_KEY = 'daybyday_backlog'`, `RING_CIRCUMFERENCE = 2 * Math.PI * 34`
- **Storage:** `storageGet(key)` / `storageSet(key, value)` — wraps localStorage with try/catch
- **State shape:** `{ date, goals: [{name, hours, progress, prevHours?, fromBacklog?}], distractions: [{name, hours}], successes: [string], failures: [string], quickDone: [{name, hours}] }`
- **Backlog shape:** `[{name}]` — stored separately under `BACKLOG_KEY`, survives day rollovers
- **Clock:** Syncs to exact system minute boundary using `msUntilNextMinute`, ticks every 60s. No seconds displayed.
- **Date:** `getTodayString()` uses local date (getFullYear/getMonth/getDate), NOT UTC
- **Day carryover:** On new day, archives previous day to history (max 30 entries), carries forward incomplete goals (progress < 100%) as `_carryover` array. User can accept or dismiss via banner.
- **Active vs completed goals:** `getActiveGoals()` returns goals with progress < 100; `getCompletedGoals()` returns goals with progress = 100. Completed goals feed into the Done Today card, not a separate completed card.
- **Goal completion flow:** When slider hits 100, a `.task-completing` animation plays (350ms), then `render()` — goal moves to Done Today automatically.
- **Done Today card:** `renderDone()` — always visible. Two groups: "From Top 5" (completed goals) and "Quick wins" (manually added `state.quickDone` items). Each group shows top 3, collapses the rest behind a `+ N more` toggle. Expand state lives in `doneExpanded` (in-memory, resets on reload). Only the newest item animates in (`.done-item-entering`). Quick win hours are a clickable badge — click to edit inline, Enter/blur commits and badge snaps back.
- **Promote/demote:** Promote adds `fromBacklog: true` flag to the goal. Goals with this flag show a `↓ Backlog` demote button (fades in on hover) that moves the goal back to backlog.
- **Inline editing:** `makeEditable(spanEl, onSave)` — click any task name, backlog item, or journal entry to edit. Enter saves, Escape cancels.
- **Progress slider fill:** `updateSliderFill(slider)` — dynamic gradient background
- **Progress rings:** SVG circles, `stroke-dasharray: 213.63`. Four rings: avg progress (green), goal hours (mint, max 8h), distraction hours (rose, max 4h), quick wins hours (orange, max 4h). All goals including completed count toward rings.
- **Summary breakdown:** Per-goal bar chart. Completed goals show strikethrough name and distinct bar color.
- **Dynamic encouragement:** `updateEncouragement(ap, gh, dh)` — priority: all goals done > some done > distraction-heavy > standard states.
- **Drag & drop (pointer events):**
  - `setupCardDrag(card)` — ghost clone on pointerdown, `.card-drop-indicator` shown only when slot changes (prevents animation stutter). Saves layout to localStorage.
  - `setupTaskDrag(item, list, type)` — ghost clone, `.task-drop-indicator` between rows. Splices state array on drop, clamps index, calls `render()`.
  - `activeDrag` holds all drag state; `dragType: 'card' | 'task'` distinguishes them.
- **Backlog:** `renderBacklog()` / `createBacklogElement()`. Promote button shown when active goals < MAX_GOALS. Demote button shown on goals with `fromBacklog: true`.
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
- **Background (Focus):** #F8F9FA (Soft Paper White)
- **Surface (Card/Task):** #FFFFFF (Pure White)
- **Accent (Celebration):** #40916C (Mint Leaf Green)
- **Text (Main/Headlines):** #1B4332 (Dark Evergreen)
- **Text (Subtle/Muted):** #6C757D (Slate Gray)

### 2. Semantic Ring & Section Colors
These are defined as CSS custom properties and must be used consistently — the same color token appears on the ring, the row background, the hours badge, and any related button.

| Token | Value | Used for |
|-------|-------|---------|
| `--ring-distraction` | `#F4A0A0` | "5 to Avoid" rows, number badges, add button, distraction hours ring |
| `--ring-distraction-light` | `#fef2f2` | "5 to Avoid" row backgrounds, distraction icon background |
| `--ring-quick` | `#FF9F1C` | Quick wins hours ring, quick wins hours badge |
| `--ring-quick-light` | `#fff5e6` | Quick wins hours badge background |

Progress ring → `--primary` `#2D6A4F`
Goal hours ring → `--accent` `#40916C`
Distraction hours ring → `--ring-distraction` `#F4A0A0` (rose/pink)
Quick wins hours ring → `--ring-quick` `#FF9F1C` (orange)

### 3. Card Background Conventions
- **Most cards:** `--surface` plain white
- **Done Today:** `--surface` plain white (neutral — hosts both green and orange row tints)
- **Today's Progress:** `linear-gradient(160deg, #e8e8e8 0%, #ffffff 60%)` — neutral gray gradient, compatible with all four ring colors
- **Encouragement:** `linear-gradient(135deg, #2D6A4F, #40916C)` white text
- **Backlog:** `--surface` plain white

### 4. Design Guardrails
- **Typography:** Plus Jakarta Sans. Fallback: system-ui, -apple-system, sans-serif.
- **Border Radii:** 16px cards, 12px inner elements/buttons, 8px small items.
- **Shadows:** Soft diffused only. Three levels: `--shadow-sm`, `--shadow`, `--shadow-hover`.
- **Micro-interactions:** Buttons scale on hover (1.02) and active (0.98). Delete/demote buttons fade in on task hover. Drag handles appear on row/card hover.
- **Layout:** Two-column CSS Grid (1fr 1fr). Progress Rings (SVG). Generous spacing (24-28px gaps).

### 5. Implementation Rules
- When generating CSS, use the exact hex codes or CSS custom properties above.
- Do NOT use `indigo-600`, `purple-500`, or any color outside this palette.
- Card gradients: only the two approved gradients above. No green gradients on cards that contain orange/rose elements.
- All new semantic colors must be defined as CSS custom properties in `:root` before use.
- Derived colors (light backgrounds, glows, borders) use `rgba()` of the base hex.

## Known Constraints

- **file:// protocol:** localStorage and Notification API may be blocked. Must serve via HTTP.
- **Git in sandbox:** `.git/*.lock` files can't be deleted from the sandbox VM. Run git commands locally.
- **Browser notifications:** May not work in all browsers/contexts. In-app nudges are the reliable fallback.
- **No backend:** All data is local to the browser. No sync, no accounts, no server.

## Current State (v0.6)

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
- **Full SDLC/CI/CD template** — GitHub feature branches, pre-commit hooks, CI on PR, free-tier cloud hosting

## Future Ideas (Not Yet Built)
- Weekly/monthly progress views from archived history
- Export data as JSON or CSV
- Custom notification frequency settings
- Goal categories or tags
- Streak tracking
- Dark mode
