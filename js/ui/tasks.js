// UI: adding tasks to today's Top 5 and distractions lists, from the inputs
// under each card.
//
// DOM. Not portable.
//
// Typing a name and pressing Enter adds a goal straight away; the + button
// opens the task detail modal (pre-filled with whatever was typed) so a
// category and the repeatable flag can be set first. Both respect MAX_GOALS.

import { pulseBlobEvent } from './blobs.js';

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
      ctx.state.goals.push({ name: n, hours: 0, progress: 0 });
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

export function addGoal() {
  const goalInputEl = ctx.goalInputEl;
  const n = goalInputEl.value.trim();
  if (!n || ctx.getActiveGoals().length >= ctx.MAX_GOALS) return;
  ctx.state.goals.push({ name: n, hours: 0, progress: 0 }); goalInputEl.value = '';
  ctx.saveState(); ctx.render();
  pulseBlobEvent('add');
  if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(ctx.state.goals);
}

export function addDistraction() {
  const distractionInputEl = ctx.distractionInputEl;
  const n = distractionInputEl.value.trim(); if (!n || ctx.state.distractions.length >= ctx.MAX_DISTRACTIONS) return;
  ctx.state.distractions.push({ name: n, hours: 0 }); distractionInputEl.value = '';
  ctx.saveState(); ctx.render();
  pulseBlobEvent('distraction');
}
