// Core: which backlog items the backlog card shows.
//
// PORTABLE — no DOM, no browser APIs. The card itself lives in js/ui/backlog.js;
// only the visibility rules live here.
//
// The backlog card only shows items from today's focus categories (picked in
// the day-start modal). With no focus set (e.g. modal skipped) it shows all.
// Hidden items stay reachable via the sidebar category expansions.
// General is the backlog's inbox — items land there before they're filed into
// a life area, so today's focus filter must never hide them.
export function isBacklogItemVisible(item, focusCategoryIds) {
  const focusIds = focusCategoryIds || [];
  const cat = item.category || 'general';
  return cat === 'general' || focusIds.length === 0 || focusIds.includes(cat);
}

// Map a slot among the *visible* backlog rows to an index in the full
// backlog array (hidden items make the two diverge).
export function backlogVisibleSlotToIndex(slot, backlog, focusCategoryIds) {
  let seen = 0;
  for (let i = 0; i < backlog.length; i++) {
    if (!isBacklogItemVisible(backlog[i], focusCategoryIds)) continue;
    if (seen === slot) return i;
    seen++;
  }
  return backlog.length;
}

// The shapes a task takes crossing between Top 5 and the backlog. Every
// promote/demote path builds its copy here, so a field can't go missing on
// one route: hours and progress let a shelved task resume where it left off,
// and prevHours keeps its "Xh prev" history (earlier days' hours). prevHours
// is only written when there is some, so untouched items keep their shape.
export function goalToBacklogItem(g) {
  const item = {
    name: g.name, category: g.category || null, repeatable: g.repeatable || false,
    hours: g.hours || 0, progress: g.progress || 0,
  };
  if (g.prevHours > 0) item.prevHours = g.prevHours;
  return item;
}

export function backlogItemToGoal(item) {
  const goal = {
    name: item.name, hours: item.hours || 0, progress: item.progress || 0,
    category: item.category || null, repeatable: item.repeatable || false,
    fromBacklog: true,
  };
  if (item.prevHours > 0) goal.prevHours = item.prevHours;
  return goal;
}
