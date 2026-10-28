// UI: the "Done today" card. Completed Top 5 goals and quick wins, each
// group newest first and folded after DONE_VISIBLE rows.
//
// DOM. Not portable.
//
// Ordering and the fold arithmetic come from js/core/done-today.js. Rows edit
// through an index into the live state arrays, which is why the core hands
// back { item, index } pairs instead of a bare reversed copy.

import { formatHours } from '../core/format.js';
import { newestFirst, collapsedCounts, makeQuickDone } from '../core/done-today.js';
import { pulseBlobEvent } from './blobs.js';
import { makeInlineHoursEditor } from './time-ring.js';

let _ctx = null;
export function configure(c) {
  _ctx = c;
  if (ctx.addQuickBtn) ctx.addQuickBtn.addEventListener('click', () => ctx.openLogDoneModal());
  if (ctx.quickInputEl) ctx.quickInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addQuickDone(); });
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

const DONE_VISIBLE = 3; // items shown before collapse
const doneExpanded = { goals: false, quick: false };

const DELETE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';

export function renderDone() {
  const doneListEl = ctx.doneListEl;
  if (!doneListEl) return;
  doneListEl.innerHTML = '';

  const state = ctx.state;
  const completedGoals = ctx.getCompletedGoals();
  const quickItems = state.quickDone || [];
  const total = completedGoals.length + quickItems.length;

  if (ctx.doneSubtitle) {
    ctx.doneSubtitle.textContent = total === 0
      ? 'Nothing yet — go get one'
      : `${total} thing${total !== 1 ? 's' : ''} done`;
  }

  if (total === 0) return;

  if (completedGoals.length > 0) {
    doneListEl.appendChild(createDoneGroup({
      label: 'From Top 5',
      entries: newestFirst(completedGoals, state.goals),
      expandKey: 'goals',
      createItem: ({ item, index }, i) => createDoneGoalItem(item, index, i === 0),
    }));
  }

  if (quickItems.length > 0) {
    doneListEl.appendChild(createDoneGroup({
      label: 'Quick wins',
      entries: newestFirst(quickItems),
      expandKey: 'quick',
      createItem: ({ item, index }, i) => createDoneQuickItem(item, index, i === 0),
    }));
  }
}

function createDoneGroup({ label, entries, expandKey, createItem }) {
  const group = document.createElement('div');
  group.className = 'done-group';

  const header = document.createElement('div');
  header.className = 'done-group-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'done-group-label';
  labelEl.textContent = label;

  const countEl = document.createElement('span');
  countEl.className = 'done-group-count';
  countEl.textContent = entries.length;

  header.append(labelEl, countEl);
  group.appendChild(header);

  const list = document.createElement('div');
  list.className = 'done-group-list';

  const isExpanded = doneExpanded[expandKey];
  const { shown, overflow } = collapsedCounts(entries.length, isExpanded, DONE_VISIBLE);

  entries.slice(0, shown).forEach((entry, i) => {
    list.appendChild(createItem(entry, i));
  });

  group.appendChild(list);

  if (overflow > 0) {
    const toggle = document.createElement('button');
    toggle.className = 'done-expand-btn';

    if (!isExpanded) {
      toggle.textContent = `+ ${overflow} more`;
      toggle.addEventListener('click', () => {
        doneExpanded[expandKey] = true;
        renderDone();
      });
    } else {
      toggle.textContent = 'Show less';
      toggle.classList.add('done-expand-btn--open');
      toggle.addEventListener('click', () => {
        doneExpanded[expandKey] = false;
        renderDone();
      });
    }

    group.appendChild(toggle);
  }

  return group;
}

function createDoneGoalItem(goal, index, isLatest) {
  const row = document.createElement('div');
  row.className = 'done-item done-item-goal' + (isLatest ? ' done-item-entering' : '');
  if (isLatest) requestAnimationFrame(() => row.classList.remove('done-item-entering'));

  // Category emoji badge — static, no edit from done list
  const cat = ctx.getCategoryById(goal.category || 'general');
  const catBadge = document.createElement('span');
  catBadge.className = 'done-item-cat-badge';
  catBadge.textContent = cat.emoji || '●';
  catBadge.title = cat.name;
  catBadge.style.setProperty('--badge-color', cat.color);

  const name = document.createElement('span');
  name.className = 'done-item-name';
  name.textContent = goal.name;

  const meta = document.createElement('span');
  meta.className = 'done-item-meta';
  meta.textContent = goal.hours > 0 ? `${goal.hours}h` : '';

  const reopenBtn = document.createElement('button');
  reopenBtn.className = 'btn-uncomplete';
  reopenBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h31.39L181.19,69.8a80,80,0,1,0,1.67,114.1,8,8,0,0,1,11.16,11.46A96,96,0,1,1,207.07,73.93L224,90.51V48a8,8,0,0,1,16,0Z"/></svg> Reopen';
  reopenBtn.addEventListener('click', () => {
    ctx.state.goals[index].progress = 95;
    ctx.saveState(); ctx.render();
  });

  const del = document.createElement('button');
  del.className = 'task-delete';
  del.innerHTML = DELETE_ICON;
  del.addEventListener('click', () => { ctx.permanentlyDeleteGoal(index); });

  row.append(catBadge, name, meta, reopenBtn, del);
  return row;
}

function createDoneQuickItem(item, index, isLatest) {
  const row = document.createElement('div');
  row.className = 'done-item done-item-quick' + (isLatest ? ' done-item-entering' : '');
  if (isLatest) requestAnimationFrame(() => row.classList.remove('done-item-entering'));

  // Category pill — clickable to assign/change the life area (reuses the same
  // unified picker as distractions/backlog), so quick tasks can be categorized.
  const catPill = ctx.createCategoryPill(item.category, newId => {
    // Logged hours follow the item to its new category — otherwise they
    // stay counted under the old one and totals drift.
    const prevCat = item.category || 'general';
    const nextCat = newId || 'general';
    if (prevCat !== nextCat && item.hours > 0) {
      ctx.accumulateCategoryHours(prevCat, -item.hours);
      ctx.accumulateCategoryHours(nextCat, item.hours);
    }
    ctx.state.quickDone[index].category = newId;
    item.category = newId;
    ctx.saveState();
    ctx.renderSidebar();
  });
  catPill.classList.add('done-item-cat-pill');
  row.appendChild(catPill);

  const name = document.createElement('span');
  name.className = 'done-item-name';
  name.textContent = item.name;
  ctx.makeEditable(name, newVal => { ctx.state.quickDone[index].name = newVal; ctx.saveState(); });

  // Hours: show badge if set, otherwise show inline input
  const hoursBadge = document.createElement('span');
  hoursBadge.className = 'done-item-meta done-hours-badge';
  hoursBadge.title = 'Click to edit hours';

  function renderHoursBadge() {
    hoursBadge.textContent = formatHours(item.hours);
    hoursBadge.classList.toggle('done-hours-badge--empty', !(item.hours > 0));
  }
  renderHoursBadge();

  makeInlineHoursEditor(hoursBadge, {
    getValue: () => item.hours,
    onCommit: (v, prev, delta) => {
      ctx.state.quickDone[index].hours = v;
      item.hours = v;
      ctx.saveState();
      // Keep category totals in sync with the edit (creation already
      // accumulated the original hours).
      ctx.accumulateCategoryHours(item.category || 'general', delta);
      ctx.renderSummary();
    },
    render: renderHoursBadge,
  });

  const del = document.createElement('button');
  del.className = 'task-delete';
  del.innerHTML = DELETE_ICON;
  del.addEventListener('click', () => {
    const state = ctx.state;
    ctx.undoStack.push({ type: 'quickDone', item: state.quickDone[index], index });
    state.quickDone.splice(index, 1); ctx.saveState(); renderDone();
  });

  row.append(name, hoursBadge, del);
  return row;
}

export function addQuickDone(name, hours, catId) {
  const quickInputEl = ctx.quickInputEl;
  const n = name !== undefined ? name : (quickInputEl ? quickInputEl.value.trim() : '');
  if (!n) return;
  ctx.state.quickDone.push(makeQuickDone(n, hours, catId));
  if (quickInputEl && name === undefined) quickInputEl.value = '';
  doneExpanded.quick = false;
  ctx.saveState(); renderDone();
  pulseBlobEvent('add');
}
