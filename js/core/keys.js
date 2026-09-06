// Core: persistence keys and schema version.
//
// PORTABLE — no DOM, no browser APIs. These are opaque strings; what backs
// them is js/platform/storage.js's problem, not this module's.
//
// Every key is prefixed `daybyday_` — backup/restore enumerates by that
// prefix (see collectExportPayload), so a new key is included in backups
// automatically as long as it keeps the prefix.

export const STORAGE_KEY = 'daybyday_data';        // legacy: today's state object
export const HISTORY_KEY = 'daybyday_history';     // legacy: archived days (max 30)
export const LAYOUT_KEY = 'daybyday_layout';       // card column order
export const BACKLOG_KEY = 'daybyday_backlog';     // legacy: backlog array
export const CATEGORIES_KEY = 'daybyday_categories'; // legacy: categories + totalHours
export const SIDEBAR_KEY = 'daybyday_sidebar';     // 'collapsed' | 'open'

// In-progress focus session. Written while a session runs and cleared on every
// deliberate close, so a value here means the tab crashed or reloaded mid-session.
export const FOCUS_SNAPSHOT_KEY = 'daybyday_focus_session';

// The unified store — the source of truth (see docs/data-model.md). Built from
// the legacy keys above by migrateToStore(); those are still written as a
// one-version backup so the migration stays reversible.
export const STORE_KEY = 'daybyday_store';
export const STORE_VERSION = 2;

// The prefix backup/restore sweeps. Kept here so it can't drift from the keys.
export const KEY_PREFIX = 'daybyday_';
