// Core: the numbers behind the summary card. Hour totals, average progress,
// and how full each of the four rings is.
//
// PORTABLE — no DOM, no browser APIs.

// A ring is full at this many hours; more than that leaves it full.
export const GOAL_HOURS_RING_MAX = 8;
export const DISTRACTION_HOURS_RING_MAX = 4;
export const QUICK_HOURS_RING_MAX = 4;

// Sum of `hours` over goals, distractions or quick wins. Missing hours count 0.
export function totalHours(items) {
  return items.reduce((s, x) => s + (x.hours || 0), 0);
}

// Mean progress over every goal of the day, completed ones included, rounded
// to a whole percent. 0 when there are no goals.
export function averageProgress(goals) {
  return goals.length > 0
    ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length)
    : 0;
}

// Fill fraction for each ring. The progress ring takes the rounded average,
// so it moves in whole-percent steps like the number shown beside it.
export function ringFractions({ avgProgress, goalHours, distractionHours, quickHours }) {
  return {
    progress: avgProgress / 100,
    hours: Math.min(goalHours / GOAL_HOURS_RING_MAX, 1),
    distraction: Math.min(distractionHours / DISTRACTION_HOURS_RING_MAX, 1),
    quick: Math.min(quickHours / QUICK_HOURS_RING_MAX, 1),
  };
}
