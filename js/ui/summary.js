// UI: the summary card. Hour and progress figures, the four rings, the
// per-goal breakdown bars and the encouragement line under them.
//
// DOM. Not portable.
//
// The arithmetic comes from js/core/summary.js; this module only paints it.

import { totalHours, averageProgress, ringFractions } from '../core/summary.js';

let _ctx = null;
export function configure(c) {
  _ctx = c;
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

// Matches r="34" on the ring circles in index.html.
const RING_CIRCUMFERENCE = 2 * Math.PI * 34;

function setRingProgress(el, frac) {
  if (!el) return;
  el.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, frac)));
}

export function renderSummary() {
  const state = ctx.state;
  const allGoals = state.goals;
  const gh = totalHours(allGoals);
  ctx.totalHoursEl.textContent = gh > 0 ? gh.toFixed(1) + 'h' : '0h';
  const dh = totalHours(state.distractions);
  ctx.distractionHoursEl.textContent = dh > 0 ? dh.toFixed(1) + 'h' : '0h';
  const ap = averageProgress(allGoals);
  ctx.avgProgressEl.textContent = ap + '%';

  const qh = totalHours(state.quickDone || []);
  if (ctx.quickHoursEl) ctx.quickHoursEl.textContent = qh > 0 ? qh.toFixed(1) + 'h' : '0h';

  const rings = ringFractions({ avgProgress: ap, goalHours: gh, distractionHours: dh, quickHours: qh });
  setRingProgress(ctx.ringProgress, rings.progress);
  setRingProgress(ctx.ringHours, rings.hours);
  setRingProgress(ctx.ringDistractionHours, rings.distraction);
  setRingProgress(ctx.ringQuickHours, rings.quick);

  const summaryBreakdownEl = ctx.summaryBreakdownEl;
  summaryBreakdownEl.innerHTML = '';
  allGoals.forEach(g => {
    const row = document.createElement('div'); row.className = 'breakdown-item';
    const n = document.createElement('span'); n.className = 'breakdown-name'; n.textContent = g.name;
    if ((g.progress || 0) >= 100) n.classList.add('breakdown-name-done');
    const h = document.createElement('span'); h.className = 'breakdown-hours'; h.textContent = (g.hours || 0) + 'h';
    const bc = document.createElement('div'); bc.className = 'breakdown-bar-container';
    const b = document.createElement('div'); b.className = 'breakdown-bar'; b.style.width = (g.progress || 0) + '%';
    if ((g.progress || 0) >= 100) b.classList.add('breakdown-bar-done');
    bc.appendChild(b);
    row.append(n, h, bc);
    summaryBreakdownEl.appendChild(row);
  });

  updateEncouragement(ap, gh, dh);
}

function updateEncouragement(ap, gh, dh) {
  const el = document.getElementById('encouragement-text');
  if (!el) return;

  const state = ctx.state;
  const completed = ctx.getCompletedGoals();
  if (completed.length > 0 && completed.length === state.goals.length) {
    const done = completed.length === 1 ? 'Your goal is done.' : `All ${completed.length} goals done.`;
    el.textContent = `${done} You didn't just plan a good day — you lived one. That's rare.`;
    return;
  }

  if (completed.length > 0) {
    el.textContent = `${completed.length} goal${completed.length > 1 ? 's' : ''} completed. The momentum is real. Carry it forward.`;
    return;
  }

  if (dh > 0 && state.distractions.length > 0 && state.goals.length > 0) {
    const td = state.distractions.reduce((m, d) => (d.hours || 0) > (m.hours || 0) ? d : m, state.distractions[0]);
    const tg = state.goals.reduce((m, g) => (g.progress || 0) < (m.progress || 0) ? g : m, state.goals[0]);
    if ((td.hours || 0) > 0 && (tg.progress || 0) < 80) {
      const pp = Math.min(100, (tg.progress || 0) + Math.round((td.hours || 0) * 12));
      el.textContent = `You've spent ${td.hours}h on "${td.name}." That same time on "${tg.name}" could have brought it to ~${pp}%. The work won't be perfect — but done beats imagined.`;
      return;
    }
  }

  if (state.goals.length === 0) el.textContent = "You have roughly 4,000 weeks in a lifetime. This one counts. Start by adding just one goal.";
  else if (gh > 0 && dh === 0) el.textContent = "You're investing in what matters and keeping distractions at bay. This is how days become a life well-spent.";
  else if (ap >= 75) el.textContent = "Over 75% progress. You showed up, did the work, and didn't wait for perfect. That's the whole game.";
  else if (ap >= 40) el.textContent = "Past the halfway mark. The hardest part was starting — you've done that. Keep going.";
  else el.textContent = "The future is never guaranteed — only this moment is real. Every hour on your goals is an hour chosen well.";
}
