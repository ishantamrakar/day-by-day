// UI: all three drag & drop systems.
//
// DOM + Pointer Events — the least portable code in the app, and deliberately
// so. A native build would express these with Gesture Handler / Reanimated
// rather than porting any of this; no effort is spent making it translatable.
// See docs/drag-drop.md for how the three systems differ and what breaks them.
//
//   1. Card drag       — reordering the dashboard's cards between columns
//   2. Task reorder    — lift-in-place with sibling shifting, inside a list
//   3. Backlog → Top 5 — two entry points (sidebar rows, backlog card rows)
//
// (2) and (3) look similar but are not interchangeable: they differ in what
// starts a drag, what the source list means, and what a drop commits. They are
// kept separate on purpose.

import { formatHours } from '../core/format.js';

let _ctx = null;
export function configure(ctx) { _ctx = ctx; }

// Read through the context on every access rather than destructuring once at
// module load: these must never be captured, or a drag after a day rollover
// would mutate the previous day's arrays.
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

let activeDrag = null; // { ghost, source, list, type, startX, startY, origRect }

export function setupCardDrag(card) {
  const handle = card.querySelector('.card-drag-handle');
  if (!handle) return;

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    startCardDrag(e, card);
  });
}

function startCardDrag(e, card) {
  const rect = card.getBoundingClientRect();

  const ghost = card.cloneNode(true);
  ghost.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    opacity: 0.85;
    pointer-events: none;
    z-index: 9999;
    transform: scale(1.02) rotate(1deg);
    box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    transition: transform 0.1s ease;
    border-radius: 16px;
  `;
  document.body.appendChild(ghost);

  card.classList.add('card-dragging');

  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  activeDrag = { ghost, card, offsetX, offsetY, type: 'card' };

  document.addEventListener('pointermove', onCardDragMove);
  document.addEventListener('pointerup', onCardDragEnd, { once: true });
}

function onCardDragMove(e) {
  if (!activeDrag || activeDrag.type !== 'card') return;
  const { ghost, card, offsetX, offsetY } = activeDrag;

  const x = e.clientX - offsetX;
  const y = e.clientY - offsetY;
  ghost.style.left = x + 'px';
  ghost.style.top = y + 'px';

  const midX = e.clientX;
  const midY = e.clientY;

  // Find which col + insertBefore the cursor is over
  let newCol = null;
  let newInsertBefore = null;

  const cols = Array.from(document.querySelectorAll('.col'));
  for (const col of cols) {
    const colRect = col.getBoundingClientRect();
    if (midX < colRect.left || midX > colRect.right) continue;

    const siblings = Array.from(col.querySelectorAll('.draggable-card:not(.card-dragging)'));
    for (const sib of siblings) {
      const sibRect = sib.getBoundingClientRect();
      if (midY < sibRect.top + sibRect.height / 2) {
        newInsertBefore = sib;
        break;
      }
    }
    newCol = col;
    break;
  }

  // Only move/recreate the indicator when the slot actually changes
  const slotChanged = newCol !== activeDrag.targetCol || newInsertBefore !== activeDrag.insertBefore;
  if (slotChanged) {
    document.querySelectorAll('.card-drop-indicator').forEach(el => el.remove());

    if (newCol) {
      const indicator = document.createElement('div');
      indicator.className = 'card-drop-indicator';
      if (newInsertBefore) {
        newCol.insertBefore(indicator, newInsertBefore);
      } else {
        newCol.appendChild(indicator);
      }
    }

    activeDrag.targetCol = newCol;
    activeDrag.insertBefore = newInsertBefore;
  }
}

function onCardDragEnd(e) {
  document.removeEventListener('pointermove', onCardDragMove);
  if (!activeDrag || activeDrag.type !== 'card') { activeDrag = null; return; }

  const { ghost, card, targetCol, insertBefore } = activeDrag;
  ghost.remove();
  document.querySelectorAll('.card-drop-indicator').forEach(el => el.remove());
  card.classList.remove('card-dragging');

  if (targetCol) {
    if (insertBefore) {
      targetCol.insertBefore(card, insertBefore);
    } else {
      targetCol.appendChild(card);
    }
  }

  ctx.saveCardLayout();
  activeDrag = null;
}

// =========================================================
// TASK REORDER — lift-in-place with sibling shifting
// =========================================================
export function setupTaskDrag(item, list, type) {
  const handle = item.querySelector('.task-drag-handle');
  if (!handle) return;

  handle.addEventListener('pointerdown', e => {
    if (e.target.tagName === 'INPUT') return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startTaskDrag(e, item, list, type);
  });
}

function startTaskDrag(e, item, list, type) {
  const rect  = item.getBoundingClientRect();
  const itemH = rect.height;
  const gap   = parseFloat(getComputedStyle(list).gap) || 10;
  const step  = itemH + gap;

  const allItems = Array.from(list.querySelectorAll('.task-item'));
  const siblings = allItems.filter(el => el !== item);

  // displayIndex = position among DOM items (0-based); used for all slot math
  const displayIndex = allItems.indexOf(item);
  // stateIndex = index in state.goals / state.distractions array
  const stateIndex = parseInt(item.dataset.goalIndex ?? item.dataset.distIndex ?? -1);

  item.classList.add('task-lifted');
  siblings.forEach(s => s.classList.add('task-shifting'));

  const pointerOffsetY = e.clientY - rect.top;
  const listRect   = list.getBoundingClientRect();
  const naturalTop = rect.top - listRect.top;
  const minTop = 0;
  const maxTop = listRect.height - itemH;

  // The card that owns this list — used to detect when drag exits card bounds
  const parentCard = list.closest('.card');

  activeDrag = { item, list, type, siblings, step, displayIndex, stateIndex,
                 draggingIndex: displayIndex, currentSlot: displayIndex,
                 pointerOffsetY, naturalTop, listTop: listRect.top, minTop, maxTop,
                 dragType: 'task', parentCard };

  document.addEventListener('pointermove', onTaskDragMove);
  document.addEventListener('pointerup',   onTaskDragEnd, { once: true });
}

function onTaskDragMove(e) {
  if (!activeDrag) return;

  // ── Cross-card ghost mode ──────────────────────────────────
  if (activeDrag.dragType === 'cross') {
    const { ghost, goalData, ghostW, ghostH } = activeDrag;
    ghost.style.transform = `translate(${e.clientX - (ghostW || 200) / 2}px, ${e.clientY - (ghostH || 44) / 2}px)`;

    const backlogCard = document.getElementById('backlog-section');
    const goalsCard   = document.getElementById('goals-section');

    if (activeDrag.crossTarget === 'backlog') {
      const insideBacklog = backlogCard && (() => { const br = backlogCard.getBoundingClientRect(); return e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom; })();
      const insideGoals   = goalsCard   && (() => { const gr = goalsCard.getBoundingClientRect();   return e.clientX >= gr.left && e.clientX <= gr.right && e.clientY >= gr.top && e.clientY <= gr.bottom; })();

      if (insideBacklog) {
        // ── Over backlog card ──
        if (activeDrag.overGoals) { removeGoalsReentryPlaceholder(); }
        activeDrag.overGoals = false;
        activeDrag.overBacklog = true;
        goalsCard && goalsCard.classList.remove('goals-drop-target');
        backlogCard.classList.add('goals-drop-target');
        const step = crossDropStep(ctx.backlogListEl, '.backlog-item');
        const listRect = ctx.backlogListEl.getBoundingClientRect();
        const slot = Math.max(0, Math.round((e.clientY - listRect.top) / step));
        insertCrossPlaceholder(slot, ctx.backlogListEl, '.backlog-item', 'backlog-item backlog-placeholder', goalData.name);

      } else if (insideGoals) {
        // ── Re-entered goals card ──
        if (!activeDrag.overGoals) { removeCrossPlaceholder(); }
        activeDrag.overGoals = true;
        activeDrag.overBacklog = false;
        backlogCard && backlogCard.classList.remove('goals-drop-target');
        goalsCard.classList.add('goals-drop-target');
        // Compute step from a real task row (original item already removed from DOM)
        const refRow = ctx.goalsListEl.querySelector('.task-item:not(.task-reentry-placeholder)');
        const stepH = refRow
          ? refRow.getBoundingClientRect().height + (parseFloat(getComputedStyle(ctx.goalsListEl).gap) || 10)
          : 52;
        const listRect = ctx.goalsListEl.getBoundingClientRect();
        const slot = Math.max(0, Math.round((e.clientY - listRect.top) / stepH));
        insertGoalsReentryPlaceholder(slot, goalData.name);

      } else {
        // ── Over neither card ──
        if (activeDrag.overGoals) { removeGoalsReentryPlaceholder(); }
        if (activeDrag.overBacklog) { removeCrossPlaceholder(); }
        activeDrag.overGoals = false;
        activeDrag.overBacklog = false;
        backlogCard && backlogCard.classList.remove('goals-drop-target');
        goalsCard   && goalsCard.classList.remove('goals-drop-target');
      }
    }
    return;
  }

  // ── Normal within-list reorder mode ───────────────────────
  if (activeDrag.dragType !== 'task') return;
  const { item, list, siblings, step, draggingIndex, pointerOffsetY, naturalTop, minTop, maxTop, parentCard } = activeDrag;

  // Check if pointer has left the parent card — if so, switch to cross-card mode
  if (parentCard && activeDrag.type === 'goal') {
    const cr = parentCard.getBoundingClientRect();
    const outside = e.clientX < cr.left || e.clientX > cr.right || e.clientY < cr.top || e.clientY > cr.bottom;
    if (outside) {
      // Tear down task-lift state
      item.classList.remove('task-lifted');
      item.style.transform = '';
      siblings.forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });

      // Get data for the goal being dragged (use stateIndex to address state.goals correctly)
      const goalData = ctx.state.goals[activeDrag.stateIndex];
      if (!goalData) { activeDrag = null; return; }

      // Release pointer capture from handle so events route globally during cross-drag
      const handle = item.querySelector('.task-drag-handle');
      try { if (handle) handle.releasePointerCapture(e.pointerId); } catch(_) {}

      // Remove the item from the DOM entirely — hiding/collapsing leaves compositor
      // layer artifacts that trail across the screen during pointer movement
      const itemParent = item.parentNode;
      const itemNextSibling = item.nextSibling;
      if (itemParent) itemParent.removeChild(item);

      // Build ghost — no backdrop-filter (causes compositing trail); plain opaque pill
      const cat = ctx.getCategoryById(goalData.category || 'general');
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'pointer-events:none',
        'z-index:9999',
        'display:flex',
        'align-items:center',
        'gap:8px',
        'background:#ffffff',
        'border:1.5px solid rgba(45,106,79,0.25)',
        'border-radius:12px',
        'padding:10px 16px',
        'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
        'font-family:var(--font,system-ui)',
        'font-size:0.85rem',
        'font-weight:600',
        'color:#1B4332',
        'max-width:260px',
        'white-space:nowrap',
        'will-change:transform',
      ].join(';');
      ghost.innerHTML = `<span style="font-size:1rem;flex-shrink:0">${cat.emoji}</span><span style="overflow:hidden;text-overflow:ellipsis">${goalData.name}</span>`;
      document.body.appendChild(ghost);
      const gw = ghost.offsetWidth || 200;
      const gh = ghost.offsetHeight || 44;
      ghost.style.transform = `translate(${e.clientX - gw / 2}px, ${e.clientY - gh / 2}px)`;

      // Transition activeDrag to cross mode
      activeDrag = {
        dragType: 'cross',
        crossTarget: 'backlog',
        ghost,
        ghostW: gw,
        ghostH: gh,
        goalData,
        goalIndex: activeDrag.stateIndex,
        originalItem: item,
        originalList: list,
        originalDisplayIndex: activeDrag.displayIndex,
        itemParent,
        itemNextSibling,
        crossPlaceholderEl: null,
        crossSlot: -1,
        goalsPlaceholderEl: null,
        goalsSlot: -1,
        overGoals: false,
        overBacklog: false,
      };
      return;
    }
  }

  const rawTop = (e.clientY - pointerOffsetY) - (activeDrag.listTop + naturalTop);
  const desiredTop = Math.max(minTop - naturalTop, Math.min(maxTop - naturalTop, rawTop));
  item.style.transform = `translateY(${desiredTop}px)`;

  const slotsMoved = Math.round(desiredTop / step);
  const newSlot = Math.max(0, Math.min(draggingIndex + slotsMoved, siblings.length));

  if (newSlot !== activeDrag.currentSlot) {
    activeDrag.currentSlot = newSlot;

    siblings.forEach((sib, i) => {
      const origFull = i < draggingIndex ? i : i + 1;
      if (origFull >= newSlot && origFull < draggingIndex) {
        sib.style.transform = `translateY(${step}px)`;
      } else if (origFull > draggingIndex && origFull <= newSlot) {
        sib.style.transform = `translateY(-${step}px)`;
      } else {
        sib.style.transform = '';
      }
    });
  }
}

function crossDropStep(listEl, selector) {
  const rows = Array.from(listEl.querySelectorAll(selector + ':not(.backlog-placeholder):not(.sidebar-placeholder)'));
  if (!rows.length) return 48;
  return rows[0].getBoundingClientRect().height + (parseFloat(getComputedStyle(listEl).gap) || 8);
}

function insertCrossPlaceholder(slot, listEl, selector, className, label) {
  if (!activeDrag) return;
  if (!activeDrag.crossPlaceholderEl) {
    activeDrag.crossPlaceholderEl = document.createElement('div');
    activeDrag.crossPlaceholderEl.className = className;
    activeDrag.crossPlaceholderEl.textContent = label;
  }
  const rows = Array.from(listEl.querySelectorAll(selector + ':not(.backlog-placeholder):not(.sidebar-placeholder)'));
  const clamped = Math.max(0, Math.min(slot, rows.length));
  if (clamped !== activeDrag.crossSlot) {
    activeDrag.crossSlot = clamped;
    clamped >= rows.length
      ? listEl.appendChild(activeDrag.crossPlaceholderEl)
      : listEl.insertBefore(activeDrag.crossPlaceholderEl, rows[clamped]);
  }
}

function removeCrossPlaceholder() {
  if (!activeDrag || !activeDrag.crossPlaceholderEl) return;
  if (activeDrag.crossPlaceholderEl.parentNode) activeDrag.crossPlaceholderEl.parentNode.removeChild(activeDrag.crossPlaceholderEl);
  activeDrag.crossPlaceholderEl = null;
  activeDrag.crossSlot = -1;
}

function insertGoalsReentryPlaceholder(slot, label) {
  if (!activeDrag) return;
  if (!activeDrag.goalsPlaceholderEl) {
    const ph = document.createElement('div');
    ph.className = 'task-item task-reentry-placeholder';
    // Match the height of a real task row (item is removed from DOM, so all rows are real)
    const refItem = ctx.goalsListEl.querySelector('.task-item:not(.task-reentry-placeholder)');
    if (refItem) ph.style.height = refItem.getBoundingClientRect().height + 'px';
    ph.innerHTML = `<span class="task-reentry-name">${label}</span>`;
    activeDrag.goalsPlaceholderEl = ph;
  }
  const rows = Array.from(ctx.goalsListEl.querySelectorAll('.task-item:not(.task-reentry-placeholder)'));
  const clamped = Math.max(0, Math.min(slot, rows.length));
  if (clamped !== activeDrag.goalsSlot) {
    activeDrag.goalsSlot = clamped;
    clamped >= rows.length
      ? ctx.goalsListEl.appendChild(activeDrag.goalsPlaceholderEl)
      : ctx.goalsListEl.insertBefore(activeDrag.goalsPlaceholderEl, rows[clamped]);
  }
}

function removeGoalsReentryPlaceholder() {
  if (!activeDrag || !activeDrag.goalsPlaceholderEl) return;
  if (activeDrag.goalsPlaceholderEl.parentNode) activeDrag.goalsPlaceholderEl.parentNode.removeChild(activeDrag.goalsPlaceholderEl);
  activeDrag.goalsPlaceholderEl = null;
  activeDrag.goalsSlot = -1;
}

function onTaskDragEnd(e) {
  document.removeEventListener('pointermove', onTaskDragMove);

  if (!activeDrag) return;

  // ── Cross-card drop ────────────────────────────────────────
  if (activeDrag.dragType === 'cross') {
    const { ghost, goalData, goalIndex, crossSlot, goalsSlot, originalItem, originalDisplayIndex, itemParent, itemNextSibling } = activeDrag;
    ghost.remove();

    const backlogCard = document.getElementById('backlog-section');
    const goalsCard   = document.getElementById('goals-section');
    removeCrossPlaceholder();
    removeGoalsReentryPlaceholder();
    if (backlogCard) backlogCard.classList.remove('goals-drop-target');
    if (goalsCard)   goalsCard.classList.remove('goals-drop-target');

    // Use actual drop coordinates — don't rely solely on flags (pointermove may not fire on final frame)
    function hitTest(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
    const droppedOnBacklog = hitTest(backlogCard);
    const droppedOnGoals   = hitTest(goalsCard);

    if (droppedOnBacklog && goalData) {
      // ── Drop onto backlog ──
      const g = ctx.state.goals[goalIndex];
      if (g) {
        const newItem = {
          name: g.name, category: g.category || null, repeatable: g.repeatable || false,
          hours: g.hours || 0, progress: g.progress || 0,
        };
        const slot = activeDrag.crossSlot >= 0 ? ctx.backlogVisibleSlotToIndex(activeDrag.crossSlot) : ctx.backlog.length;
        ctx.backlog.splice(Math.min(slot, ctx.backlog.length), 0, newItem);
        ctx.state.goals.splice(goalIndex, 1);
        ctx.saveState(); ctx.saveBacklog(); ctx.render(); ctx.renderSidebar();
      }
    } else if (droppedOnGoals && goalData) {
      // ── Drop back onto Top 5 ──
      const targetSlot = goalsSlot >= 0 ? goalsSlot : originalDisplayIndex;
      const activeGoals = ctx.getActiveGoals();
      const completedGoals = ctx.getCompletedGoals();
      const [moved] = activeGoals.splice(originalDisplayIndex, 1);
      activeGoals.splice(Math.min(targetSlot, activeGoals.length), 0, moved);
      ctx.state.goals = [...activeGoals, ...completedGoals];
      ctx.saveState(); ctx.render();
    } else {
      // ── Cancelled: restore item to its original DOM position ──
      if (itemParent && originalItem) {
        if (itemNextSibling && itemNextSibling.parentNode === itemParent) {
          itemParent.insertBefore(originalItem, itemNextSibling);
        } else {
          itemParent.appendChild(originalItem);
        }
      }
      Array.from(ctx.goalsListEl.querySelectorAll('.task-shifting')).forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });
    }

    activeDrag = null;
    return;
  }

  // ── Normal within-list reorder ─────────────────────────────
  if (activeDrag.dragType !== 'task') { activeDrag = null; return; }

  const { item, list, type, siblings, displayIndex, stateIndex, currentSlot } = activeDrag;

  item.classList.remove('task-lifted');
  item.style.transform = '';
  siblings.forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });

  if (currentSlot !== displayIndex) {
    if (type === 'goal') {
      // Reorder within active goals only, then rebuild state.goals preserving completed goals
      const activeGoals = ctx.getActiveGoals();
      const completedGoals = ctx.getCompletedGoals();
      const [moved] = activeGoals.splice(displayIndex, 1);
      activeGoals.splice(Math.min(currentSlot, activeGoals.length), 0, moved);
      ctx.state.goals = [...activeGoals, ...completedGoals];
    } else {
      const arr = ctx.state.distractions;
      const [moved] = arr.splice(stateIndex, 1);
      arr.splice(Math.min(currentSlot, arr.length), 0, moved);
    }
    ctx.saveState();
  }

  activeDrag = null;
  ctx.render();
}

// =========================================================
// SIDEBAR BACKLOG → TOP 5 DRAG
// =========================================================
export function setupSidebarBacklogDrag(dragEl, backlogItem) {
  dragEl.addEventListener('pointerdown', e => {
    // The row's own buttons must stay clickable: capturing the pointer here
    // would swallow their click entirely.
    if (e.target.closest('.sidebar-detail-actions')) return;
    e.preventDefault();
    e.stopPropagation();
    dragEl.setPointerCapture(e.pointerId);

    const goalsCard = document.getElementById('goals-section');
    if (!goalsCard) return;

    // Ghost card follows the cursor
    const cat = ctx.getCategoryById(backlogItem.category || 'general');
    const ghost = document.createElement('div');
    ghost.className = 'sidebar-drag-ghost';
    ghost.innerHTML = `<span class="sidebar-drag-ghost-emoji">${cat.emoji}</span><span class="sidebar-drag-ghost-name">${backlogItem.name}</span>`;
    document.body.appendChild(ghost);

    // Placeholder slot state — only active while inside the goals card
    let placeholder = null;   // the fake task-item row inserted into goalsListEl
    let currentSlot = -1;     // which index slot the placeholder is sitting at (-1 = not in list)

    function getStep() {
      const items = Array.from(ctx.goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
      if (!items.length) return 52; // fallback height
      const r = items[0].getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(ctx.goalsListEl).gap) || 10;
      return r.height + gap;
    }

    function insertPlaceholder(slot) {
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'task-item sidebar-placeholder';
        placeholder.textContent = backlogItem.name;
      }
      const items = Array.from(ctx.goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
      const clampedSlot = Math.max(0, Math.min(slot, items.length));
      if (clampedSlot !== currentSlot) {
        currentSlot = clampedSlot;
        if (clampedSlot >= items.length) {
          ctx.goalsListEl.appendChild(placeholder);
        } else {
          ctx.goalsListEl.insertBefore(placeholder, items[clampedSlot]);
        }
      }
    }

    function removePlaceholder() {
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      placeholder = null;
      currentSlot = -1;
    }

    const move = ev => {
      ghost.style.left = (ev.clientX - ghost.offsetWidth / 2) + 'px';
      ghost.style.top = (ev.clientY - ghost.offsetHeight / 2) + 'px';

      const gr = goalsCard.getBoundingClientRect();
      const inside = ev.clientX >= gr.left && ev.clientX <= gr.right &&
                     ev.clientY >= gr.top  && ev.clientY <= gr.bottom;

      if (inside) {
        if (ctx.getActiveGoals().length >= ctx.MAX_GOALS) {
          // Full — just highlight with outline, no placeholder
          goalsCard.classList.add('goals-drop-target');
          removePlaceholder();
        } else {
          goalsCard.classList.add('goals-drop-target');
          // Compute slot from pointer Y relative to the list
          const listRect = ctx.goalsListEl.getBoundingClientRect();
          const step = getStep();
          const relY = ev.clientY - listRect.top;
          const slot = Math.max(0, Math.round(relY / step));
          insertPlaceholder(slot);
        }
      } else {
        goalsCard.classList.remove('goals-drop-target');
        removePlaceholder();
      }
    };

    const up = ev => {
      document.removeEventListener('pointermove', move);
      ghost.remove();
      goalsCard.classList.remove('goals-drop-target');

      const gr = goalsCard.getBoundingClientRect();
      const dropped = ev.clientX >= gr.left && ev.clientX <= gr.right &&
                      ev.clientY >= gr.top  && ev.clientY <= gr.bottom;

      const insertAt = currentSlot; // capture before removePlaceholder resets it
      removePlaceholder();

      if (dropped) {
        if (ctx.getActiveGoals().length >= ctx.MAX_GOALS) {
          goalsCard.classList.add('goals-drop-full');
          setTimeout(() => goalsCard.classList.remove('goals-drop-full'), 600);
        } else {
          const bi = ctx.backlog.findIndex(b => b.name === backlogItem.name && (b.category || 'general') === (backlogItem.category || 'general'));
          if (bi !== -1) ctx.backlog.splice(bi, 1);
          // Insert at the slot position within active goals
          const activeGoals = ctx.getActiveGoals();
          const clampedSlot = Math.max(0, Math.min(insertAt < 0 ? activeGoals.length : insertAt, activeGoals.length));
          // Find the real state.goals index to insert before
          const newGoal = { name: backlogItem.name, hours: backlogItem.hours || 0, progress: backlogItem.progress || 0, category: backlogItem.category || null, repeatable: backlogItem.repeatable || false, fromBacklog: true };
          if (clampedSlot >= activeGoals.length) {
            // Append after last active goal — find the real index of the last active goal
            const lastActive = activeGoals[activeGoals.length - 1];
            const insertIdx = lastActive ? ctx.state.goals.indexOf(lastActive) + 1 : ctx.state.goals.length;
            ctx.state.goals.splice(insertIdx, 0, newGoal);
          } else {
            const targetGoal = activeGoals[clampedSlot];
            const insertIdx = ctx.state.goals.indexOf(targetGoal);
            ctx.state.goals.splice(insertIdx, 0, newGoal);
          }
          ctx.saveBacklog();
          ctx.saveState();
          ctx.render();
          ctx.renderSidebar();
        }
      }
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  });
}

// =========================================================
// BACKLOG CARD → TOP 5 drag  (mirrors sidebar backlog drag)
// =========================================================
export function setupBacklogItemDrag(dragEl, item, index) {
  dragEl.addEventListener('pointerdown', e => {
    // Only trigger on the drag handle, not the whole row
    if (!e.target.closest('.backlog-drag-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    dragEl.setPointerCapture(e.pointerId);

    const goalsCard = document.getElementById('goals-section');
    if (!goalsCard) return;

    const cat = ctx.getCategoryById(item.category || 'general');
    const ghost = document.createElement('div');
    ghost.className = 'sidebar-drag-ghost';
    ghost.innerHTML = `<span class="sidebar-drag-ghost-emoji">${cat.emoji}</span><span class="sidebar-drag-ghost-name">${item.name}</span>`;
    document.body.appendChild(ghost);

    let placeholder = null;
    let currentSlot = -1;

    function getStep() {
      const items = Array.from(ctx.goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
      if (!items.length) return 52;
      const r = items[0].getBoundingClientRect();
      return r.height + (parseFloat(getComputedStyle(ctx.goalsListEl).gap) || 10);
    }

    function insertPlaceholder(slot) {
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'task-item sidebar-placeholder';
        placeholder.textContent = item.name;
      }
      const rows = Array.from(ctx.goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
      const clamped = Math.max(0, Math.min(slot, rows.length));
      if (clamped !== currentSlot) {
        currentSlot = clamped;
        clamped >= rows.length ? ctx.goalsListEl.appendChild(placeholder) : ctx.goalsListEl.insertBefore(placeholder, rows[clamped]);
      }
    }

    function removePlaceholder() {
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      placeholder = null; currentSlot = -1;
    }

    const move = ev => {
      ghost.style.left = (ev.clientX - ghost.offsetWidth / 2) + 'px';
      ghost.style.top  = (ev.clientY - ghost.offsetHeight / 2) + 'px';
      const gr = goalsCard.getBoundingClientRect();
      const inside = ev.clientX >= gr.left && ev.clientX <= gr.right && ev.clientY >= gr.top && ev.clientY <= gr.bottom;
      if (inside) {
        goalsCard.classList.add('goals-drop-target');
        if (ctx.getActiveGoals().length < ctx.MAX_GOALS) {
          const listRect = ctx.goalsListEl.getBoundingClientRect();
          const slot = Math.max(0, Math.round((ev.clientY - listRect.top) / getStep()));
          insertPlaceholder(slot);
        } else {
          removePlaceholder();
        }
      } else {
        goalsCard.classList.remove('goals-drop-target');
        removePlaceholder();
      }
    };

    const up = ev => {
      document.removeEventListener('pointermove', move);
      ghost.remove();
      goalsCard.classList.remove('goals-drop-target');
      const gr = goalsCard.getBoundingClientRect();
      const dropped = ev.clientX >= gr.left && ev.clientX <= gr.right && ev.clientY >= gr.top && ev.clientY <= gr.bottom;
      const insertAt = currentSlot;
      removePlaceholder();

      if (dropped) {
        if (ctx.getActiveGoals().length >= ctx.MAX_GOALS) {
          goalsCard.classList.add('goals-drop-full');
          setTimeout(() => goalsCard.classList.remove('goals-drop-full'), 600);
        } else {
          ctx.backlog.splice(index, 1);
          const activeGoals = ctx.getActiveGoals();
          const clamped = Math.max(0, Math.min(insertAt < 0 ? activeGoals.length : insertAt, activeGoals.length));
          const newGoal = { name: item.name, hours: item.hours || 0, progress: item.progress || 0, category: item.category || null, repeatable: item.repeatable || false, fromBacklog: true };
          if (clamped >= activeGoals.length) {
            const last = activeGoals[activeGoals.length - 1];
            ctx.state.goals.splice(last ? ctx.state.goals.indexOf(last) + 1 : ctx.state.goals.length, 0, newGoal);
          } else {
            ctx.state.goals.splice(ctx.state.goals.indexOf(activeGoals[clamped]), 0, newGoal);
          }
          ctx.saveBacklog(); ctx.saveState(); ctx.render(); ctx.renderSidebar();
        }
      }
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  });
}

