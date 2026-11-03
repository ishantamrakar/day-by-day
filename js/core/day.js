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

// The summary modal should reflect the last day you actually WORKED, not
// simply the last day the app was open. Skipping days (or opening the app
// and doing nothing) leaves empty days in between; walk back through history
// to find the most recent real one, falling back to `fallback` when there is
// no such day. Returns { day, gapDays, idleDays }.
//
// `history` is the archived days (any order), `today` is YYYY-MM-DD.
export function findLastActiveDay(history, today, fallback) {
  const candidates = history.filter(d => d && d.date && d.date < today);
  if (fallback && fallback.date && !candidates.find(d => d.date === fallback.date)) {
    candidates.push(fallback);
  }
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const active = candidates.filter(dayHasWork);
  const day = active.length ? active[active.length - 1] : fallback;
  if (!day || !day.date) return { day: fallback, gapDays: 0, idleDays: 0 };

  const dayMs = 1000 * 60 * 60 * 24;
  const gapDays = Math.round(
    (new Date(today + 'T12:00:00') - new Date(day.date + 'T12:00:00')) / dayMs
  );
  // Days between that last active day and today where nothing was logged.
  const idleDays = Math.max(0, gapDays - 1);
  return { day, gapDays, idleDays };
}
