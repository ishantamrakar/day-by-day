// Core: the app's mutable data and how it is loaded and persisted.
//
// PORTABLE — no DOM, no browser APIs. Storage arrives via js/platform.
//
// WHY ACCESSORS: `state` and `backlog` are *reassigned* (a day rollover
// replaces the whole state object; backlog is rebuilt from the store at boot).
// An ES module can export a binding, but importers get a live read-only view
// they cannot reassign, and a reassignment here would not be visible to code
// that captured the old value. Accessors sidestep that entirely: every reader
// calls getState() and always sees the current object.
//
// Property mutation (state.goals.push(...), cat.totalHours += x) needs no
// accessor and is used freely — it is only whole-object replacement that has
// to go through setState/setBacklog.

import { STORAGE_KEY, BACKLOG_KEY, CATEGORIES_KEY, HISTORY_KEY } from './keys.js';
import { getTodayString, getDefaultState } from './day.js';

// --- Injected persistence ------------------------------------------------
// Core must not reach into js/platform (dependencies point inward, and ESLint
// enforces it), so the storage functions are handed in at boot instead. This
// is what makes the module portable: a native build calls configureStorage()
// with an AsyncStorage-backed shim and everything below is unchanged.
let storageGet = () => null;
let storageSet = () => {};

export function configureStorage({ get, set }) {
  storageGet = get;
  storageSet = set;
}

// --- Default categories -------------------------------------------------
// `general` is the fallback and can never be archived or deleted: every
// uncategorised task lands there, so something must always answer for it.
export const DEFAULT_CATEGORIES = [
  { id: 'fitness',       name: 'Fitness',       emoji: '💪', color: '#3a86ff', totalHours: 0 },
  { id: 'career',        name: 'Career',        emoji: '💼', color: '#2D6A4F', totalHours: 0 },
  { id: 'relationships', name: 'Relationships', emoji: '❤️', color: '#ff6b9d', totalHours: 0 },
  { id: 'chores',        name: 'Chores',        emoji: '🧹', color: '#f4a261', totalHours: 0 },
  { id: 'general',       name: 'General',       emoji: '⚡', color: '#8d99ae', totalHours: 0 },
];

// --- The bindings -------------------------------------------------------
let _state = null;
let _backlog = [];
let _categories = [];
let _store = null;

// Set by loadState() when it detects a new day, consumed once by the boot
// path to decide whether to show the day-transition modal. Returned as an
// explicit result rather than written to a shared variable, so the caller can
// see that loadState has this second output.
let _prevDayForModal = null;

export const getState = () => _state;
export const setState = (s) => { _state = s; };
export const getBacklog = () => _backlog;
export const setBacklog = (b) => { _backlog = b; };
export const getCategories = () => _categories;
export const setCategories = (c) => { _categories = c; };
export const getStore = () => _store;
export const setStore = (s) => { _store = s; };

export const takePrevDayForModal = () => { const d = _prevDayForModal; _prevDayForModal = null; return d; };
export const peekPrevDayForModal = () => _prevDayForModal;

// --- Categories ---------------------------------------------------------
// Saved categories are merged over the defaults rather than replacing them:
// a new default category added in a later release must appear for existing
// users, and a user's totalHours must survive that merge.
export function loadCategories() {
  try {
    const raw = storageGet(CATEGORIES_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const merged = DEFAULT_CATEGORIES.map(def => {
        const hit = saved.find(c => c.id === def.id);
        return hit ? Object.assign({}, def, hit) : def;
      });
      // Categories the user created themselves aren't in DEFAULT_CATEGORIES.
      saved.forEach(c => { if (!merged.find(m => m.id === c.id)) merged.push(c); });
      return merged;
    }
  } catch (e) { /* corrupt JSON: fall back to defaults rather than dying */ }
  return DEFAULT_CATEGORIES.map(c => Object.assign({}, c));
}

// --- Day state ----------------------------------------------------------
// Returns { state, prevDay }: `prevDay` is the day that just ended, non-null
// only when a rollover was detected, and carries the carryover the modal needs.
export function loadState(archiveDay) {
  try {
    const raw = storageGet(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      p.successes = p.successes || [];
      p.failures = p.failures || [];
      p.quickDone = p.quickDone || [];
      if (p.date === getTodayString()) return { state: p, prevDay: null };

      // A new day: archive what just ended and carry the unfinished forward.
      if (archiveDay) archiveDay(p);
      const ns = getDefaultState();
      ns._carryover = buildCarryover(p);
      return { state: ns, prevDay: p };
    }
  } catch (e) { /* corrupt JSON: start today clean rather than blocking boot */ }
  return { state: getDefaultState(), prevDay: null };
}

// Unfinished work from the day that ended, shaped for the transition modal.
// Completed non-repeatables are dropped; repeatables come back reset to 0%.
export function buildCarryover(prev) {
  if (!prev || !prev.goals) return [];
  return prev.goals.map(g => {
    const done = (g.progress || 0) >= 100;
    if (done && !g.repeatable) return null;
    return {
      name: g.name,
      hours: 0,
      progress: done ? 0 : (g.progress || 0),
      // Cumulative across multi-day carries — earlier days' hours must not
      // vanish from the "Xh prev" badge on each rollover.
      prevHours: (g.prevHours || 0) + (g.hours || 0),
      category: g.category || null,
      repeatable: g.repeatable || false,
    };
  }).filter(Boolean);
}

export function loadBacklog() {
  try {
    const raw = storageGet(BACKLOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

// --- History ------------------------------------------------------------
export function loadHistory() {
  try { const r = storageGet(HISTORY_KEY); return r ? JSON.parse(r) : []; } catch (e) { return []; }
}

// Archive a finished day. Idempotent by date: re-archiving the same day is a
// no-op, so a double rollover can't duplicate or overwrite an entry.
export function archiveDay(ds) {
  if (!ds || !ds.date) return;
  try {
    const h = loadHistory();
    if (!h.find(d => d.date === ds.date)) {
      // focusSessions is archived too: a session retired at rollover (see
      // closeFocusSessionForRollover) lands on the outgoing day and would
      // otherwise be dropped here the moment it was recorded.
      h.push({
        date: ds.date,
        goals: ds.goals || [],
        distractions: ds.distractions || [],
        successes: ds.successes || [],
        failures: ds.failures || [],
        focusSessions: ds.focusSessions || [],
      });
      while (h.length > 30) h.shift();
      storageSet(HISTORY_KEY, JSON.stringify(h));
    }
  } catch (e) { /* history is a convenience, never worth failing a save over */ }
}

// Initialise the bindings at boot. Returns the previous day when a rollover
// was detected, so the caller can decide whether to show the modal.
export function initState() {
  _categories = loadCategories();
  const { state, prevDay } = loadState(archiveDay);
  _state = state;
  _prevDayForModal = prevDay;
  _backlog = loadBacklog();
  return prevDay;
}
