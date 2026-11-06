// Core: the unified store — the app's source of truth.
//
// PORTABLE — no DOM, no browser APIs. Storage is injected (see below), which
// is what lets a native build reuse this file unchanged.
//
// The store is one normalized shape that maps cleanly onto a relational
// database, so a future backend port is a translation rather than a redesign.
// See docs/data-model.md for the schema and the target table layout.
//
// Views vs entities: state.goals / state.distractions / state.quickDone /
// backlog are plain arrays the rendering, undo and drag code reads directly.
// Each view object carries its entity id as `_eid`, so hydrate* can build a
// view from the store and sync* can reconcile it back **by identity** rather
// than by position — which is what makes reordering and deletion safe.

import { STORE_KEY, STORE_VERSION, STORAGE_KEY, LAYOUT_KEY } from './keys.js';
import { getTodayString } from './day.js';

// --- Injected persistence ------------------------------------------------
let storageGet = () => null;
let storageSet = () => {};

export function configureStorage({ get, set }) {
  storageGet = get;
  storageSet = set;
}

// --- Entity ids ----------------------------------------------------------
// Time + counter + randomness: unique within a session even when several are
// minted in the same millisecond, and unlikely to collide across devices —
// which matters once sync exists.
let _idSeq = 0;
export function genId() {
  return 'e' + Date.now().toString(36) + (_idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
}

// One shape for every task-like thing, discriminated by `type`.
export function makeEntity(type, src) {
  const now = Date.now();
  const e = {
    id: genId(),
    type,
    name: src.name || '',
    category: src.category || null,
    hours: src.hours || 0,
    createdAt: now,
    updatedAt: now,
  };
  if (type === 'goal') {
    e.progress = src.progress || 0;
    e.repeatable = src.repeatable || false;
    if (src.prevHours != null) e.prevHours = src.prevHours;
    if (src.fromBacklog) e.fromBacklog = true;
    if ((src.progress || 0) >= 100) e.completedAt = now;
  } else if (type === 'backlog') {
    e.repeatable = src.repeatable || false;
    // Progress survives a trip through the backlog so a part-done task can be
    // shelved and resumed where it left off (hours are carried generically).
    e.progress = src.progress || 0;
  }
  return e;
}

// Project an entity into the plain view shape its array expects, carrying _eid.
export function entityToView(e) {
  const v = { _eid: e.id, name: e.name, hours: e.hours || 0, category: e.category || null };
  if (e.type === 'goal') {
    v.progress = e.progress || 0;
    v.repeatable = e.repeatable || false;
    if (e.prevHours != null) v.prevHours = e.prevHours;
    if (e.fromBacklog) v.fromBacklog = true;
  } else if (e.type === 'backlog') {
    v.repeatable = e.repeatable || false;
    v.progress = e.progress || 0;
  }
  return v;
}

// Copy a view's fields onto its entity, in place.
export function applyViewToEntity(e, v, type, now) {
  e.name = v.name;
  e.hours = v.hours || 0;
  e.category = v.category || null;
  if (type === 'goal') {
    e.progress = v.progress || 0;
    e.repeatable = v.repeatable || false;
    if (v.prevHours != null) e.prevHours = v.prevHours; else delete e.prevHours;
    if (v.fromBacklog) e.fromBacklog = true; else delete e.fromBacklog;
    if ((v.progress || 0) >= 100) { if (!e.completedAt) e.completedAt = now; } else delete e.completedAt;
  } else if (type === 'backlog') {
    e.repeatable = v.repeatable || false;
    e.progress = v.progress || 0;
  }
  e.updatedAt = now;
}

// Build the store from the legacy keys. Idempotent: a current-version store
// is returned untouched, so this is safe to call on every boot.
export function migrateToStore({ loadCategories, loadHistory, loadBacklog }) {
  try {
    const existing = storageGet(STORE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed && parsed.version === STORE_VERSION) return parsed;
    }
  } catch (e) { /* unparseable store: rebuild it from the legacy keys below */ }

  const store = {
    version: STORE_VERSION,
    entities: {},
    days: {},
    backlogIds: [],
    categories: loadCategories(),
    sessions: [],
    journal: {},
    history: loadHistory(),
  };

  // Today's state → entities + day membership + sessions + journal.
  let day = getTodayString();
  try {
    const raw = storageGet(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      day = p.date || day;
      const ids = [];
      (p.goals || []).forEach(g => { const e = makeEntity('goal', g); store.entities[e.id] = e; ids.push(e.id); });
      (p.distractions || []).forEach(d => { const e = makeEntity('distraction', d); store.entities[e.id] = e; ids.push(e.id); });
      (p.quickDone || []).forEach(q => { const e = makeEntity('quickDone', q); store.entities[e.id] = e; ids.push(e.id); });
      store.days[day] = ids;
      store.sessions = (p.focusSessions || []).slice();
      store.journal[day] = { successes: (p.successes || []).slice(), failures: (p.failures || []).slice() };
    }
  } catch (e) { /* no legacy day to migrate */ }

  // Backlog → backlog entities (day-less).
  try {
    (loadBacklog() || []).forEach(item => {
      const e = makeEntity('backlog', item);
      store.entities[e.id] = e;
      store.backlogIds.push(e.id);
    });
  } catch (e) { /* no legacy backlog to migrate */ }

  // Layout (card order), if present, preserved verbatim.
  try {
    const rawLayout = storageGet(LAYOUT_KEY);
    if (rawLayout) store.layout = JSON.parse(rawLayout);
  } catch (e) { /* no saved layout */ }

  storageSet(STORE_KEY, JSON.stringify(store));
  return store;
}

// --- hydrate: store → view ----------------------------------------------
export function hydrateDayType(store, day, type) {
  return (store.days[day] || [])
    .map(id => store.entities[id])
    .filter(e => e && e.type === type)
    .map(entityToView);
}

export function hydrateBacklogFromStore(store) {
  return store.backlogIds
    .map(id => store.entities[id])
    .filter(e => e && e.type === 'backlog')
    .map(entityToView);
}

export function hydrateSessionsFromStore(store) {
  return (store.sessions || []).slice();
}

// --- sync: view → store --------------------------------------------------
// Reconcile the store's entities-of-`type` to match `views` exactly: update
// existing (by _eid), mint new ones, drop removed ones. Returns the ordered
// entity ids. Does not touch store.days — the caller rebuilds membership.
export function reconcileType(store, type, views) {
  const now = Date.now();
  const ids = [];
  (views || []).forEach(v => {
    let e = v._eid ? store.entities[v._eid] : null;
    if (!e) { e = makeEntity(type, v); v._eid = e.id; store.entities[e.id] = e; }
    applyViewToEntity(e, v, type, now);
    ids.push(e.id);
  });
  return ids;
}

// Drop entities of the given types that are no longer referenced.
function pruneMissing(store, existingIds, keptIds, types) {
  const kept = new Set(keptIds);
  (existingIds || []).forEach(id => {
    const e = store.entities[id];
    if (e && types.includes(e.type) && !kept.has(id)) delete store.entities[id];
  });
}

// Sync all three day-resident view arrays into the store for `day`. Membership
// is rebuilt as goals → distractions → quickDone; entities of those types no
// longer present are deleted.
export function syncDayToStore(store, day, state) {
  const goalIds = reconcileType(store, 'goal', state.goals);
  const distIds = reconcileType(store, 'distraction', state.distractions || []);
  const quickIds = reconcileType(store, 'quickDone', state.quickDone || []);
  const all = [...goalIds, ...distIds, ...quickIds];
  pruneMissing(store, store.days[day], all, ['goal', 'distraction', 'quickDone']);
  store.days[day] = all;
}

// The backlog is a day-less queue tracked by store.backlogIds. Same reconcile
// as a day type, differing only in where membership is recorded.
export function syncBacklogToStore(store, backlog) {
  const ids = reconcileType(store, 'backlog', backlog);
  pruneMissing(store, store.backlogIds, ids, ['backlog']);
  store.backlogIds = ids;
}

// Focus sessions are append-style records — no entity reconciliation. The
// store holds the canonical array; state.focusSessions mirrors it.
export function syncSessionsToStore(store, state) {
  store.sessions = (state.focusSessions || []).slice();
}

export function saveStore(store) {
  storageSet(STORE_KEY, JSON.stringify(store));
}
