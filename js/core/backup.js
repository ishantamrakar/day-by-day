// Core: backup export and import.
//
// PORTABLE — no DOM, no browser APIs. Storage is injected, like the other core
// modules. The *delivery* of the file (a download on web, a share sheet on
// mobile) is the UI layer's problem; everything here is data.
//
// The format is deliberately schema-agnostic: every `daybyday_*` key, verbatim.
// A restore is a byte-for-byte round trip, so old backups keep working across
// store versions — whatever migration the store needs runs on the next boot.
// This is why export must NOT be "smart" about the data it copies.

import { KEY_PREFIX, STORE_KEY, STORAGE_KEY } from './keys.js';

export const EXPORT_FORMAT_VERSION = 1;

let storageGet = () => null;
let storageSet = () => {};
let storageRemove = () => {};
let listKeys = () => [];

export function configureStorage({ get, set, remove, keysWithPrefix }) {
  storageGet = get;
  storageSet = set;
  storageRemove = remove;
  listKeys = keysWithPrefix;
}

export function collectExportPayload({ appVersion, now = new Date() }) {
  const keys = {};
  listKeys(KEY_PREFIX).forEach(k => { keys[k] = storageGet(k); });
  return {
    app: 'day-by-day',
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    keys,
  };
}

// Replaces all app data with the backup. Returns an error string, or null on
// success (the caller reloads so the app boots fresh from the new data).
//
// Validation is deliberately shallow — enough to reject a file that clearly
// isn't ours, not a schema check. A backup from a future version must still
// restore here; the store's own migration handles the rest.
export function applyImportPayload(payload) {
  if (!payload || payload.app !== 'day-by-day'
      || typeof payload.keys !== 'object' || payload.keys === null) {
    return 'That file isn\'t a Day by Day backup.';
  }
  if (!payload.keys[STORE_KEY] && !payload.keys[STORAGE_KEY]) {
    return 'This backup contains no app data.';
  }
  try {
    // Clear first: a restore replaces state rather than merging into it, or a
    // key the backup lacks would survive and contradict the restored data.
    listKeys(KEY_PREFIX).forEach(k => storageRemove(k));
    Object.keys(payload.keys).forEach(k => {
      if (k.indexOf(KEY_PREFIX) === 0 && typeof payload.keys[k] === 'string') {
        storageSet(k, payload.keys[k]);
      }
    });
  } catch (e) {
    return 'Import failed — the browser blocked storage access.';
  }
  return null;
}

// Short human summary, shown before the user confirms a destructive restore.
export function describeBackup(payload) {
  try {
    const store = JSON.parse(payload.keys[STORE_KEY] || 'null');
    if (store && store.entities) {
      const tasks = Object.keys(store.entities).length;
      const sessions = (store.sessions || []).length;
      const cats = (store.categories || []).length;
      return `${tasks} tasks · ${sessions} focus sessions · ${cats} life areas`;
    }
  } catch (e) { /* unreadable store: fall through to the generic label */ }
  return 'summary unavailable';
}
