// Core: what happens to yesterday's unfinished work once today has begun.
//
// PORTABLE — no DOM, no browser APIs, no storage. Every function takes its
// data as arguments and returns what should change; app.js applies it to the
// live state/backlog and persists.
//
// The carryover itself (`state._carryover`) is BUILT at rollover by
// buildCarryover() in js/core/state.js, next to loadState() which calls it.
// This file holds the rules for CONSUMING it.
//
// THE INVARIANT: nothing unfinished may be silently discarded. Every path
// that clears `_carryover` routes through rescueCarryoverToBacklog() in
// app.js, which uses rescueItems() below — anything not already live in
// Top 5 lands in the backlog, so a task survives until the user deliberately
// deletes it. See docs/features.md § Unfinished task rollover.

// Backlog entries for every leftover not already in Top 5 or the backlog.
// The caller appends them in order and then deletes `_carryover`.
//
// Deliberately NOT filtered by today's focus categories: the focus picker
// decides what gets pre-loaded into Top 5, not what is allowed to survive
// the day.
//
// Duplicates are checked against the items already returned as well, so two
// leftovers with the same name yield one backlog entry — the same result as
// pushing one at a time and checking the growing backlog.
export function rescueItems(carryover, goals, backlog) {
  const out = [];
  (carryover || []).forEach(g => {
    if (!g || !g.name) return;
    // Already carried into today's Top 5 — nothing to rescue.
    if (goals.find(eg => eg.name === g.name)) return;
    // Already sitting in the backlog — don't duplicate it.
    if (backlog.find(b => b.name === g.name)) return;
    if (out.find(b => b.name === g.name)) return;
    out.push({
      name: g.name,
      category: g.category || null,
      repeatable: g.repeatable || false,
      hours: g.hours || 0,
      progress: g.progress || 0,
      // Earlier days' hours: the task's "Xh prev" history must survive the
      // rescue (and later promotes — see js/core/backlog.js).
      ...(g.prevHours > 0 ? { prevHours: g.prevHours } : {}),
    });
  });
  return out;
}

// Goals the legacy carryover banner's "accept" adds to Top 5: leftovers in
// order, until `goalCount` reaches `maxGoals`. Hours restart at 0 (they were
// credited yesterday); earlier days' hours ride along as `prevHours`.
export function bannerAcceptGoals(carryover, goalCount, maxGoals) {
  const out = [];
  (carryover || []).forEach(g => {
    if (goalCount + out.length < maxGoals)
      out.push({ name: g.name, hours: 0, progress: g.progress, prevHours: g.prevHours || 0, category: g.category || null, repeatable: g.repeatable || false });
  });
  return out;
}

// A permanently deleted goal must not resurface from a copy of it. Carryover
// entries (and the day snapshot behind the summary modal) are copies, not the
// live goal objects, so they are matched by name — and only ONE is removed:
// two leftovers that share a name are two tasks, and one delete must not wipe
// both.
export function withoutOneGoalNamed(list, name) {
  const i = list.findIndex(g => g.name === name);
  return i === -1 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
}
