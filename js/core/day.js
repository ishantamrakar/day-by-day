// Core: dates and what counts as a day's work.
//
// PORTABLE — no DOM, no browser APIs.

// Local calendar date as YYYY-MM-DD. Deliberately local, not UTC: "today" is
// the user's day, and a UTC date would roll over mid-evening west of Greenwich.
export function getTodayString(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// A blank day, ready to be filled.
export function getDefaultState(date = getTodayString()) {
  return {
    date,
    goals: [], distractions: [], successes: [], failures: [],
    quickDone: [], focusSessions: [],
  };
}

// Did anything actually happen on this day? Tells a real working day apart
// from one where the app was merely opened — which still gets saved and
// archived, and would otherwise masquerade as "the previous day" in the
// morning summary.
export function dayHasWork(d) {
  if (!d) return false;
  const goals = d.goals || [];
  return goals.some(g => (g.hours || 0) > 0 || (g.progress || 0) > 0) ||
         (d.quickDone || []).length > 0 ||
         (d.distractions || []).some(x => (x.hours || 0) > 0) ||
         (d.successes || []).length > 0 ||
         // A focus session counts even when its goal is gone — a session
         // retired at rollover may be the only record the day left behind.
         (d.focusSessions || []).length > 0;
}
