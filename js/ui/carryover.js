// UI: the legacy carryover banner — "you left these unfinished, bring them
// back?". Superseded by the day-transition modal (js/ui/day-transition.js)
// but still wired: boot shows it when the modal is skipped.
//
// DOM. Not portable. The rules for what each button does with the carryover
// live in js/core/carryover.js; both buttons end in rescueCarryoverToBacklog()
// so neither can drop unfinished work.

import { bannerAcceptGoals } from '../core/carryover.js';

// Injected app context. `state` is a GETTER on the caller's side: app.js
// replaces the whole state object at rollover, so a captured value would go
// stale. Listeners are attached here, at configure time, which is where
// app.js used to attach them during boot.
let _ctx = null;
export function configure(c) {
  _ctx = c;
  const { carryoverAccept, carryoverDismiss } = c;
  if (carryoverAccept) carryoverAccept.addEventListener('click', acceptCarryover);
  if (carryoverDismiss) carryoverDismiss.addEventListener('click', dismissCarryover);
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

export function showCarryoverIfNeeded() {
  const { carryoverBanner, carryoverList } = ctx;
  const state = ctx.state;
  if (!state._carryover || state._carryover.length === 0) {
    if (carryoverBanner) carryoverBanner.classList.add('hidden');
    return;
  }
  carryoverList.innerHTML = '';
  state._carryover.forEach(g => {
    const li = document.createElement('li');
    const hrs = g.prevHours > 0 ? ` — ${g.prevHours}h invested` : '';
    li.textContent = `${g.name} (${g.progress}% done${hrs})`;
    carryoverList.appendChild(li);
  });
  carryoverBanner.classList.remove('hidden');
}

function acceptCarryover() {
  const state = ctx.state;
  bannerAcceptGoals(state._carryover, state.goals.length, ctx.MAX_GOALS)
    .forEach(g => state.goals.push(g));
  ctx.rescueCarryoverToBacklog();
  ctx.saveState();
  ctx.carryoverBanner.classList.add('hidden');
  ctx.render();
}

function dismissCarryover() {
  ctx.rescueCarryoverToBacklog();
  ctx.saveState();
  ctx.carryoverBanner.classList.add('hidden');
  ctx.render();
}
