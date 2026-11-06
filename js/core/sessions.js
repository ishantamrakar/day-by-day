// Core: focus-session records, and what to do with one left running overnight.
//
// PORTABLE — no DOM, no browser APIs. Storage is injected.
//
// A session left running past midnight belongs to the day it STARTED on, not
// the one you wake up in. Neither discarding it (hours genuinely worked) nor
// crediting it to today (hours nobody worked) is honest, so it is retired onto
// its own day, capped.
//
// THE CAP IS THE POINT. An untended clock reads as 14h when the real work was
// maybe two, and the true figure is unknowable. We record a deliberately
// conservative OVERNIGHT_CREDIT_HOURS and flag the record `unattended` so the
// journal can show it as an estimate. Erring low is the only honest direction:
// overstating hours is the one outcome that would make the whole log
// untrustworthy — see docs/features.md § Focus Mode.

import { HISTORY_KEY, FOCUS_SNAPSHOT_KEY } from './keys.js';
import { getTodayString } from './day.js';

export const OVERNIGHT_CREDIT_HOURS = 1;

let storageGet = () => null;
let storageSet = () => {};
let storageRemove = () => {};

export function configureStorage({ get, set, remove }) {
  storageGet = get;
  storageSet = set;
  storageRemove = remove;
}

// How much of an unattended session to credit: elapsed time from its start to
// the end of the day it began on, capped. Returns 0 when there is nothing to
// credit, which callers treat as "drop it".
export function unattendedHours(snap, now = Date.now()) {
  if (!snap || !snap.sessionStartTime || !snap.date) return 0;
  const endOfDay = new Date(`${snap.date}T23:59:59`).getTime();
  const ranMs = Math.max(0, Math.min(endOfDay, now) - snap.sessionStartTime);
  return Math.min(OVERNIGHT_CREDIT_HOURS, Math.round(ranMs / 36000) / 100);
}

// The session record written for an unattended session. Shared by both
// retirement paths (reloaded-next-day and live-at-midnight) so the two can't
// drift into recording different shapes for the same situation.
export function makeUnattendedSession(snap, hours) {
  return {
    timestamp: snap.sessionStartTime,
    goalName: snap.goalName,
    category: snap.category || 'general',
    totalMins: Math.round(hours * 60),
    focusPct: 100,
    focusMins: Math.round(hours * 60),
    distractMins: 0,
    isWin: false,
    ultraFocus: !!snap.ultraFocus,
    unattended: true, // hours are a conservative estimate, not measured
    intention: snap.sessionIntention || null,
    entryTag: snap.sessionEntryTag || null,
    entryNote: snap.sessionEntryNote || null,
    midNotes: Array.isArray(snap.sessionNotes) ? snap.sessionNotes.slice() : [],
    exitTag: null,
    exitNote: null,
  };
}

// Add the credited hours to a goal on the given day, capped at 24h. Returns
// the actual gain, which the caller feeds to category totals (the cap can make
// it smaller than `hours`).
export function creditGoalHours(day, goalName, hours) {
  const goal = (day.goals || []).find(g => g && g.name === goalName);
  if (!goal) return 0;
  const before = goal.hours || 0;
  goal.hours = Math.round(Math.min(24, before + hours) * 100) / 100;
  return goal.hours - before;
}

// Path 1: the tab was reloaded on a later day and found a stale snapshot.
// Attach the session to its own day in history.
export function retireStaleFocusSession(snap, { loadHistory }, now = Date.now()) {
  if (!snap || !snap.sessionStartTime || !snap.date) return false;
  if (snap.date >= getTodayString(new Date(now))) return false;
  const hours = unattendedHours(snap, now);
  if (hours <= 0) return false;

  try {
    const h = loadHistory();
    const day = h.find(d => d && d.date === snap.date);
    // No archived day to attach to (history trimmed past 30 days, or the
    // rollover never ran) — drop it rather than inventing a day.
    if (!day) return false;

    creditGoalHours(day, snap.goalName, hours);
    day.focusSessions = day.focusSessions || [];
    day.focusSessions.push(makeUnattendedSession(snap, hours));
    storageSet(HISTORY_KEY, JSON.stringify(h));
    return true;
  } catch (e) { return false; }
}

// Path 2: the tab was open as midnight passed. Write the session straight into
// `prevDay` — the state object about to be archived — so the hours settle on
// the day they were worked. Returns the goal-hours gain for category totals.
//
// Reads the snapshot rather than any live session state: the snapshot is the
// session's serialised truth, kept current on every meaningful change.
export function retireSessionIntoDay(prevDay, snap, now = Date.now()) {
  if (!snap || !snap.sessionStartTime || !prevDay || snap.date !== prevDay.date) return 0;
  const hours = unattendedHours(snap, now);
  if (hours <= 0) return 0;
  const gain = creditGoalHours(prevDay, snap.goalName, hours);
  prevDay.focusSessions = prevDay.focusSessions || [];
  prevDay.focusSessions.push(makeUnattendedSession(snap, hours));
  return gain;
}

export function readSnapshot() {
  const raw = storageGet(FOCUS_SNAPSHOT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function writeSnapshot(snap) {
  storageSet(FOCUS_SNAPSHOT_KEY, JSON.stringify(snap));
}

export function clearSnapshot() {
  storageRemove(FOCUS_SNAPSHOT_KEY);
}
