// UI: today's Top 5 and distractions lists. The rows of both cards, and the
// add inputs under each.
//
// DOM. Not portable.
//
// Rows edit through an index into the live state array. A Top 5 row's index
// is its position in state.goals, not in the active subset shown, because
// completed goals sit in the Done Today card but stay in the same array.
//
// Typing a name and pressing Enter adds a goal straight away; the + button
// opens the task detail modal (pre-filled with whatever was typed) so a
// category and the repeatable flag can be set first. Both respect MAX_GOALS.

import { formatHours } from '../core/format.js';
import { pulseBlobEvent } from './blobs.js';
import { makeInlineHoursEditor } from './time-ring.js';
import { makeEditable, updateSliderFill } from './editable.js';
import { goalToBacklogItem } from '../core/backlog.js';
import { isDragging } from './drag.js';

let _ctx = null;
export function configure(c) {
  _ctx = c;
  const { addGoalBtn, goalInputEl, addDistractionBtn, distractionInputEl } = c;

  addGoalBtn.addEventListener('click', () => {
    const n = goalInputEl.value.trim();
    if (n) {
      // Name already typed — open splash with name pre-filled
      ctx.openTaskDetailModal({ name: n, category: null, repeatable: false }, (result) => {
        if (ctx.getActiveGoals().length >= ctx.MAX_GOALS) return;
        ctx.state.goals.push({ name: result.name, hours: 0, progress: 0, category: result.category || null, repeatable: result.repeatable });
        goalInputEl.value = '';
        ctx.saveState(); ctx.render(); pulseBlobEvent('add');
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
      });
    } else {
      // Nothing typed — open blank splash
      ctx.openTaskDetailModal({ name: '', category: null, repeatable: false }, (result) => {
        if (!result.name || ctx.getActiveGoals().length >= ctx.MAX_GOALS) return;
        ctx.state.goals.push({ name: result.name, hours: 0, progress: 0, category: result.category || null, repeatable: result.repeatable });
        ctx.saveState(); ctx.render(); pulseBlobEvent('add');
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
      });
    }
  });
  goalInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const n = goalInputEl.value.trim();
      if (!n || ctx.getActiveGoals().length >= ctx.MAX_GOALS) return;
      // Filed under General, like the + button and backlog adds.
      ctx.state.goals.push({ name: n, hours: 0, progress: 0, category: 'general' });
      goalInputEl.value = '';
      ctx.saveState(); ctx.render();
      pulseBlobEvent('add');
      if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
    }
  });
  addDistractionBtn.addEventListener('click', addDistraction);
  distractionInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addDistraction(); });
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

export function addDistraction() {
  const distractionInputEl = ctx.distractionInputEl;
  const n = distractionInputEl.value.trim(); if (!n || ctx.state.distractions.length >= ctx.MAX_DISTRACTIONS) return;
  ctx.state.distractions.push({ name: n, hours: 0 }); distractionInputEl.value = '';
  ctx.saveState(); ctx.render();
  pulseBlobEvent('distraction');
}

export function renderGoals() {
  const goalsListEl = ctx.goalsListEl;
  goalsListEl.innerHTML = '';
  const active = ctx.getActiveGoals();
  active.forEach((goal, i) => {
    const realIndex = ctx.state.goals.indexOf(goal);
    goalsListEl.appendChild(createGoalElement(goal, realIndex, i + 1));
  });
}

function createGoalElement(goal, index, displayNumber) {
  const item = document.createElement('div');
  item.className = 'task-item';
  item.dataset.goalIndex = index;

  const topRow = document.createElement('div');
  topRow.className = 'task-top-row';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'task-drag-handle';
  dragHandle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,60ZM108,128a16,16,0,1,1-16-16A16,16,0,0,1,108,128Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,128ZM108,196a16,16,0,1,1-16-16A16,16,0,0,1,108,196Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,196Z"/></svg>';
  dragHandle.title = 'Drag to reorder';

  const number = document.createElement('span');
  number.className = 'task-number';
  number.textContent = displayNumber;

  const name = document.createElement('span');
  name.className = 'task-name';
  name.textContent = goal.name;
  makeEditable(name, newVal => { ctx.state.goals[index].name = newVal; ctx.saveState(); });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-delete';
  deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  deleteBtn.title = 'Remove';
  deleteBtn.addEventListener('click', () => { ctx.permanentlyDeleteGoal(index); });

  const focusBtn = document.createElement('button');
  focusBtn.className = 'task-focus-btn';
  focusBtn.title = 'Focus on this task';
  focusBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-144a56,56,0,1,0,56,56A56.06,56.06,0,0,0,128,72Zm0,96a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg>';
  focusBtn.addEventListener('click', e => { e.stopPropagation(); ctx.openFocusModal(goal, index); });

  const trailing = [];
  if (goal.prevHours > 0) {
    const badge = document.createElement('span');
    badge.className = 'prev-hours-badge';
    badge.title = 'Hours invested in previous sessions';
    badge.textContent = `${goal.prevHours}h prev`;
    trailing.push(badge);
  }

  // Demote button — shown on all goals (fade-in on hover), not just fromBacklog
  const demoteBtn = document.createElement('button');
  demoteBtn.className = 'btn-demote' + (goal.fromBacklog ? '' : ' btn-demote-any');
  demoteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,149.66l-96,96a8,8,0,0,1-11.32,0l-96-96a8,8,0,0,1,11.32-11.32L120,226.69V40a8,8,0,0,1,16,0V226.69l82.34-88.35a8,8,0,0,1,11.32,11.32Z"/></svg> Backlog';
  demoteBtn.title = 'Move to backlog';
  demoteBtn.addEventListener('click', () => {
    ctx.backlog.push(goalToBacklogItem(ctx.state.goals[index]));
    ctx.state.goals.splice(index, 1);
    ctx.saveState(); ctx.saveBacklog(); ctx.render(); ctx.renderSidebar();
  });
  trailing.push(demoteBtn);
  trailing.push(focusBtn);
  trailing.push(deleteBtn);
  topRow.append(dragHandle, number, name, ...trailing);

  const logRow = document.createElement('div');
  logRow.className = 'task-logging-row';

  // Hours pill — clickable to edit inline, matches done-card badge style
  const hoursPill = document.createElement('span');
  hoursPill.className = 'goal-hours-pill';
  hoursPill.dataset.goalIndex = index;

  function renderHoursPill() {
    const h = ctx.state.goals[index].hours || 0;
    hoursPill.textContent = formatHours(h);
    hoursPill.classList.toggle('goal-hours-pill--empty', h === 0);
  }
  renderHoursPill();

  makeInlineHoursEditor(hoursPill, {
    getValue: () => ctx.state.goals[index].hours,
    onCommit: (v, prev, delta) => {
      ctx.state.goals[index].hours = v;
      ctx.saveState();
      ctx.accumulateCategoryHours(ctx.state.goals[index].category || 'general', delta);
      ctx.renderSummary();
    },
    render: renderHoursPill,
  });

  const pg = document.createElement('div'); pg.className = 'log-group';
  const pl = document.createElement('label'); pl.textContent = 'Progress';
  const ps = document.createElement('input');
  ps.type = 'range'; ps.className = 'progress-slider'; ps.min = '0'; ps.max = '100'; ps.step = '5';
  ps.value = goal.progress || 0;
  updateSliderFill(ps);
  const pv = document.createElement('span');
  pv.className = 'progress-value'; pv.textContent = (goal.progress || 0) + '%';
  ps.addEventListener('input', () => {
    const val = parseInt(ps.value);
    pv.textContent = val + '%';
    ctx.state.goals[index].progress = val;
    updateSliderFill(ps);
    ctx.saveState();
    if (val >= 100) {
      item.classList.add('task-completing');
      pulseBlobEvent('complete');
      // Let the completion animation play, then re-render — but never under
      // a drag or an open inline editor, which the rebuild would tear down
      // (losing the edit). Those finish first; then the row leaves Top 5.
      setTimeout(function settle() {
        if (isDragging() || ctx.goalsListEl.querySelector('.inline-edit-input, .done-hours-input')) {
          setTimeout(settle, 200);
          return;
        }
        ctx.render();
      }, 350);
    } else {
      ctx.renderSummary();
    }
  });
  pg.append(pl, ps, pv);

  // Repeat icon — sits in log row, only visible when repeatable
  const repeatIcon = document.createElement('span');
  repeatIcon.className = 'task-repeat-badge' + (goal.repeatable ? '' : ' hidden');
  repeatIcon.title = 'Repeatable — carries forward if not done';
  repeatIcon.textContent = '↻';

  // Category + repeatable pill — opens context popover with both controls
  const catPill = ctx.createCategoryPill(
    goal.category,
    newId => { ctx.state.goals[index].category = newId; ctx.saveState(); ctx.renderSidebar(); },
    () => ctx.state.goals[index].repeatable || false,
    newVal => {
      ctx.state.goals[index].repeatable = newVal;
      ctx.saveState();
      repeatIcon.classList.toggle('hidden', !newVal);
    }
  );

  logRow.append(hoursPill, pg, repeatIcon, catPill);
  item.append(topRow, logRow);

  // Task-level drag & drop — reorder within Top 5, or drag out to backlog
  ctx.setupTaskDrag(item, ctx.goalsListEl, 'goal');

  return item;
}

export function renderDistractions() {
  const distractionsListEl = ctx.distractionsListEl;
  distractionsListEl.innerHTML = '';
  ctx.state.distractions.forEach((d, i) => {
    const el = createDistractionElement(d, i);
    distractionsListEl.appendChild(el);
    ctx.setupTaskDrag(el, distractionsListEl, 'distraction');
  });
}

function createDistractionElement(dist, index) {
  const item = document.createElement('div');
  item.className = 'task-item distraction';
  item.dataset.distIndex = index;

  const topRow = document.createElement('div');
  topRow.className = 'task-top-row';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'task-drag-handle';
  dragHandle.textContent = '☰';

  const number = document.createElement('span');
  number.className = 'task-number';
  number.textContent = index + 1;

  const name = document.createElement('span');
  name.className = 'task-name';
  name.textContent = dist.name;
  makeEditable(name, newVal => { ctx.state.distractions[index].name = newVal; ctx.saveState(); });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-delete';
  deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  deleteBtn.title = 'Remove';
  deleteBtn.addEventListener('click', () => {
    ctx.undoStack.push({ type: 'distraction', item: ctx.state.distractions[index], index });
    ctx.state.distractions.splice(index, 1); ctx.saveState(); ctx.render();
  });

  topRow.append(dragHandle, number, name, deleteBtn);

  const logRow = document.createElement('div');
  logRow.className = 'task-logging-row';
  const hg = document.createElement('div'); hg.className = 'log-group';
  const hl = document.createElement('label'); hl.textContent = 'Hours spent';
  const hi = document.createElement('input');
  hi.type = 'number'; hi.className = 'hours-input'; hi.min = '0'; hi.max = '24'; hi.step = '0.25';
  hi.value = dist.hours || 0;
  hi.addEventListener('change', () => {
    const prev = ctx.state.distractions[index].hours || 0;
    let v = Math.max(0, Math.min(24, parseFloat(hi.value) || 0));
    hi.value = v;
    const delta = v - prev;
    ctx.state.distractions[index].hours = v;
    ctx.saveState();
    ctx.accumulateCategoryHours(ctx.state.distractions[index].category || 'general', delta);
    ctx.renderSummary();
  });
  hg.append(hl, hi);

  // Category pill for distractions
  const catPill = ctx.createCategoryPill(dist.category, newId => {
    ctx.state.distractions[index].category = newId;
    ctx.saveState();
    ctx.renderSidebar();
  });

  logRow.append(hg, catPill);

  item.append(topRow, logRow);
  return item;
}
