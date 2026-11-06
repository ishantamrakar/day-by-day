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
