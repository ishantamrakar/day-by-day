// UI: the backlog card. Rows for every backlog item in today's focus areas
// (plus General), a muted note counting the hidden rest, and the add input.
//
// DOM. Not portable.
//
// Which rows are shown comes from js/core/backlog.js. Rows edit through an
// index into the full backlog array, not the visible subset, so a hidden
// item never shifts what a click acts on.

import { isBacklogItemVisible, backlogItemToGoal } from '../core/backlog.js';

let _ctx = null;
export function configure(c) {
  _ctx = c;
  const { addBacklogBtn, backlogInputEl } = c;
  if (addBacklogBtn) addBacklogBtn.addEventListener('click', addBacklogItem);
  if (backlogInputEl) backlogInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addBacklogItem(); });
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

export function renderBacklog() {
  const backlogListEl = ctx.backlogListEl;
  if (!backlogListEl) return;
  backlogListEl.innerHTML = '';
  let hiddenCount = 0;
  ctx.backlog.forEach((item, i) => {
    if (!isBacklogItemVisible(item, ctx.state.focusCategoryIds)) {
      hiddenCount++;
      return;
    }
    backlogListEl.appendChild(createBacklogElement(item, i));
  });
  if (hiddenCount > 0) {
    const note = document.createElement('div');
    note.className = 'backlog-hidden-note';
    note.textContent = hiddenCount === 1
      ? '1 more task in other life areas — find it in the sidebar'
      : `${hiddenCount} more tasks in other life areas — find them in the sidebar`;
    backlogListEl.appendChild(note);
  }
  ctx.updateAddButtonVisibility();
}

function createBacklogElement(item, index) {
  const row = document.createElement('div');
  row.className = 'backlog-item';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'task-drag-handle backlog-drag-handle';
  dragHandle.title = 'Drag to Top 5';
  dragHandle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,60ZM108,128a16,16,0,1,1-16-16A16,16,0,0,1,108,128Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,128ZM108,196a16,16,0,1,1-16-16A16,16,0,0,1,108,196Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,196Z"/></svg>';

  const name = document.createElement('span');
  name.className = 'backlog-name';
  name.textContent = item.name;
  ctx.makeEditable(name, newVal => { ctx.backlog[index].name = newVal; ctx.saveBacklog(); });

  const actions = document.createElement('div');
  actions.className = 'backlog-actions';

  // Category pill
  const catPill = ctx.createCategoryPill(item.category, newId => {
    ctx.backlog[index].category = newId;
    ctx.saveBacklog();
    ctx.renderSidebar();
    renderBacklog();
  });
  actions.appendChild(catPill);

  const activeCount = ctx.getActiveGoals().length;
  if (activeCount < ctx.MAX_GOALS) {
    const promoteBtn = document.createElement('button');
    promoteBtn.className = 'btn-promote';
    promoteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,106.34l-96-96a8,8,0,0,0-11.32,0l-96,96a8,8,0,0,0,11.32,11.32L120,29.31V216a8,8,0,0,0,16,0V29.31l82.34,88.35a8,8,0,0,0,11.32-11.32Z"/></svg> Promote';
    promoteBtn.title = 'Move to active goals';
    promoteBtn.addEventListener('click', () => {
      if (ctx.getActiveGoals().length >= ctx.MAX_GOALS) return;
      ctx.state.goals.push(backlogItemToGoal(item));
      ctx.backlog.splice(index, 1);
      ctx.saveState(); ctx.saveBacklog(); ctx.render();
      if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
    });
    actions.appendChild(promoteBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-delete';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', () => {
    ctx.undoStack.push({ type: 'backlog', item: ctx.backlog[index], index });
    ctx.backlog.splice(index, 1); ctx.saveBacklog(); renderBacklog();
  });

  actions.appendChild(deleteBtn);
  row.append(dragHandle, name, actions);
  ctx.setupBacklogItemDrag(row, item, index);
  return row;
}

function addBacklogItem() {
  const backlogInputEl = ctx.backlogInputEl;
  if (!backlogInputEl) return;
  const n = backlogInputEl.value.trim();
  if (!n) return;
  // Stamp 'general' explicitly: an undefined category defaults to General in
  // isBacklogItemVisible, and General items are always shown, so a freshly
  // typed task can never be filtered out of the card the instant it's added.
  ctx.backlog.push({ name: n, category: 'general' });
  backlogInputEl.value = '';
  ctx.saveBacklog(); renderBacklog();
}
