// Core: the "Done today" list. Ordering, the collapse arithmetic, and the
// shape of a quick-win record.
//
// PORTABLE — no DOM, no browser APIs.

// Pairs each item with its index in `source` and returns them newest first.
// The card shows the latest item at the top but edits through an index into
// the live array, so it needs both. `source` differs from `items` when the
// list is a filtered view (completed goals are a subset of state.goals).
export function newestFirst(items, source = items) {
  return items.map(item => ({ item, index: source.indexOf(item) })).reverse();
}

// How many rows a group shows and how many sit past the fold. `overflow` is
// counted against the limit even when expanded: it decides whether the group
// has a toggle at all, not what the toggle currently says.
export function collapsedCounts(total, expanded, limit) {
  return {
    shown: expanded ? total : Math.min(limit, total),
    overflow: total - limit,
  };
}

export function makeQuickDone(name, hours, categoryId) {
  return { name, hours: hours || 0, category: categoryId || null };
}
