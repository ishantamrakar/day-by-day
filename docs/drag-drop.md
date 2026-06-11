# Drag & Drop

→ [CLAUDE.md](../CLAUDE.md) | [architecture.md](architecture.md)

All drag uses Pointer Events API. No HTML5 drag, no touch hacks. Single module-level `activeDrag` object holds all state. Three systems, distinguished by `activeDrag.dragType`.

---

## 1. Card reorder — `dragType: 'card'`

**Functions:** `setupCardDrag`, `onCardDragMove`, `onCardDragEnd`

Drags entire `.draggable-card` elements between `.col-left` / `.col-right`. Clones the card as a ghost, shows `.card-drop-indicator` (animated green line, only re-renders on slot change). Saves order to `LAYOUT_KEY` on drop.

---

## 2. Task row reorder — `dragType: 'task'`

**Functions:** `setupTaskDrag`, `startTaskDrag`, `onTaskDragMove`, `onTaskDragEnd`

Reorders rows within Top 5 or Distractions list. Item stays in DOM (`position: relative`) and moves via `translateY`. Siblings get `translateY` shifts with a spring transition.

**Two indices — critical distinction:**
- `displayIndex` — position among DOM task items (0-based). All slot math, sibling shifting, and drop logic uses this.
- `stateIndex` — position in `state.goals` / `state.distractions`. May differ from `displayIndex` if completed goals sit earlier in the array. Used only for state mutation and cross-card transition.

**On drop:** Reorder operates on `getActiveGoals()` only, then rebuilds: `state.goals = [...activeGoals, ...completedGoals]`. This keeps completed goals from corrupting slot math.

**Cross-card transition:** If pointer leaves the parent card while `dragType: 'task'`, transitions to `dragType: 'cross'` (see below).

---

## 3. Cross-card drag — `dragType: 'cross'`

**Triggered by:** dragging a Top 5 goal outside its card bounds.
**Also:** `setupSidebarBacklogDrag` — dragging from sidebar backlog rail into Top 5 (separate implementation, similar pattern).

### Flow

1. Pointer leaves Top 5 card → `activeDrag` transitions task → cross
2. Source item is **removed from the DOM entirely** (not hidden — hiding leaves compositor artifacts)
3. Ghost pill follows cursor via `transform: translate()` — pinned at `left:0;top:0`, moved only via transform
4. `overGoals` / `overBacklog` flags updated every pointermove
5. Over backlog card → `.goals-drop-target` highlight + `.backlog-placeholder` slot indicator
6. Re-enter Top 5 card → `.task-reentry-placeholder` (full task-row height, dashed border, pulse animation) at target slot
7. Drop → use **fresh `getBoundingClientRect` hit-test** at pointerup, not just flags (pointermove may not fire on final frame in Safari)
8. Cancel (drop on neither) → item re-inserted before its original `nextSibling`

### State stored on `activeDrag` during cross mode
```
goalIndex, goalData          — what's being dragged (goalIndex = stateIndex)
originalItem                 — the removed DOM element
itemParent, itemNextSibling  — for cancel re-insertion
originalDisplayIndex         — for re-entry drop positioning
crossPlaceholderEl, crossSlot
goalsPlaceholderEl, goalsSlot
overGoals, overBacklog
ghostW, ghostH               — measured once after append, reused each frame
```

### Ghost — do not use backdrop-filter

The ghost **must not** use `backdrop-filter`. Compositing a blur layer and repositioning it via `left`/`top` causes XOR-style paint artifacts — every position the ghost ever occupied stays visible on screen (the Windows 98 icon drag effect). Use a plain opaque background + `box-shadow` instead. Move via `transform: translate()`, never `left`/`top`.

---

## ⚠️ Known Bug — cross-card drop unreliable

**Status:** Unresolved as of last session.

**Symptoms:**
- Ghost still shows a paint trail in some cases
- Drop on backlog does not consistently register
- Re-entry placeholder may not appear

**Most likely root cause — pointer capture:**
`handle.setPointerCapture(e.pointerId)` is called on drag start. On cross-card transition, `handle.releasePointerCapture(e.pointerId)` is called. If this fails silently (element already detached, wrong pointerId, etc.), all subsequent pointer events route to the now-removed handle element. `pointermove` and `pointerup` on `document` never fire.

**Recommended debugging approach for next session:**
1. Add `console.log` at the top of `onTaskDragEnd` — confirm it fires at all during cross-card drop
2. Log `activeDrag.overBacklog`, `e.clientX/Y`, and `backlogCard.getBoundingClientRect()` — confirm coords overlap
3. Try registering the `pointerup` listener on `window` with `{ capture: true }` instead of `document`
4. Try wrapping `releasePointerCapture` in a try/catch and logging the error
5. As a fallback: skip `setPointerCapture` entirely during intra-list drag — it's only needed to keep events on the handle while the pointer moves fast, which isn't required when events are on `document` anyway

---

## CSS classes

| Class | Purpose |
|-------|---------|
| `.card-dragging` | Opacity 0.15 on dragged card |
| `.card-drop-indicator` | Green line showing card drop slot |
| `.task-lifted` | `position:relative; z-index:10; will-change:transform` on dragged row |
| `.task-shifting` | `transition: transform 0.2s spring` on sibling rows |
| `.goals-drop-target` | Green tint on a card that accepts a drop |
| `.backlog-placeholder` | Dashed slot in backlog during cross-card drag |
| `.sidebar-placeholder` | Dashed slot in Top 5 during sidebar→goals drag |
| `.task-reentry-placeholder` | Full-height dashed slot in Top 5 on goal re-entry |
