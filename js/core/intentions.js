// Core: daily intentions — the optional "I'd like to give this area about N
// hours today", set when picking focus areas.
//
// PORTABLE — no DOM, no browser APIs. The UI that renders these rows lives in
// js/ui; only the rules live here.
//
// Deliberately soft: intentions ride the day's state (a Tuesday intention
// never leaks into Wednesday), every one is optional, and nothing in the UI
// ever reports falling short. An unmet intention looks exactly like mid-morning
// progress — see docs/features.md § Daily intentions.

export const MAX_INTENTION_HOURS = 24;

// Hours logged today per category — goals plus quick wins, the same two
// sources the sidebar cards count.
export function hoursByCategoryToday(state) {
  const out = {};
  ((state && state.goals) || []).forEach(g => {
    if ((g.hours || 0) > 0) {
      const id = g.category || 'general';
      out[id] = (out[id] || 0) + g.hours;
    }
  });
  ((state && state.quickDone) || []).forEach(q => {
    if ((q.hours || 0) > 0) {
      const id = q.category || 'general';
      out[id] = (out[id] || 0) + q.hours;
    }
  });
  return out;
}

// Every intention set for today has been met. Returns null unless the day
// actually has intentions — with none set there is no bar to clear, and
// congratulating someone for meeting nothing would be hollow.
//
// Archived areas are skipped: an intention set before archiving would
// otherwise be permanently unmeetable and silently block the toast forever.
export function intentionsAllMetToday(state, categories) {
  const intentions = (state && state.focusIntentions) || {};
  const ids = Object.keys(intentions).filter(id => {
    const cat = (categories || []).find(c => c.id === id);
    return typeof intentions[id] === 'number' && intentions[id] > 0
      && cat && !cat.archived && !cat.deleted;
  });
  if (ids.length === 0) return null;
  const today = hoursByCategoryToday(state);
  if (!ids.every(id => (today[id] || 0) >= intentions[id])) return null;
  const total = ids.reduce((sum, id) => sum + intentions[id], 0);
  return { count: ids.length, total };
}

// Today's intentions, keyed by category id. Absent on a fresh day: a new day
// starts from getDefaultState(), which has no focusIntentions at all.
export function getIntentions(state) {
  return state.focusIntentions || {};
}

// The intention for one area, or null when none is set. Zero and junk read as
// "no intention", never as a target of nothing.
export function getIntentionFor(state, catId) {
  const v = getIntentions(state)[catId];
  return typeof v === 'number' && v > 0 ? v : null;
}

// What a typed intention field means. Blank, non-numeric and non-positive
// input clears the intention (null); anything else is clamped to
// 0..MAX_INTENTION_HOURS and rounded to whole hours. An intention is a rough
// gesture at the day, not a schedule — half hours invite a precision the
// number doesn't have.
export function parseIntentionInput(raw) {
  const v = parseFloat(raw);
  if (!raw.trim() || isNaN(v) || v <= 0) return null;
  return Math.round(Math.min(MAX_INTENTION_HOURS, Math.max(0, v)));
}

// Only keep intentions for areas still selected — deselecting an area
// shouldn't leave an orphaned target behind.
export function keepSelectedIntentions(draft, selectedIds) {
  const ids = new Set(selectedIds);
  const out = {};
  Object.keys(draft).forEach(id => { if (ids.has(id)) out[id] = draft[id]; });
  return out;
}
