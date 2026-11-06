// Platform: persistent key/value storage.
//
// PORTING NOTE — this is one of the few files a native build replaces.
// The contract is deliberately minimal so it maps onto any backing store:
//   - keys are opaque strings ('daybyday_*'), values are strings (JSON)
//   - every call is synchronous and total: it never throws, and a failed
//     read is indistinguishable from an absent one (null)
// On React Native, back it with AsyncStorage (async — see the note in
// docs/architecture.md § Porting) or expo-sqlite; on Capacitor, Preferences.
//
// The try/catch on every call is not defensive noise: Safari in private mode
// throws on localStorage.setItem, and a thrown save must never take the app
// down with it.

let storageAvailable = false;
try {
  const k = '__daybyday_test__';
  localStorage.setItem(k, '1');
  if (localStorage.getItem(k) === '1') storageAvailable = true;
  localStorage.removeItem(k);
} catch (e) { /* private mode, disabled cookies, or no localStorage at all */ }

export function isStorageAvailable() { return storageAvailable; }

export function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* quota or private mode */ }
}

export function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* nothing to undo */ }
}

// Every key this app owns, for backup/restore. Enumeration is the one
// operation that isn't a simple get/set, so it lives here rather than
// forcing callers to reach for localStorage directly.
export function storageKeysWithPrefix(prefix) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) out.push(k);
    }
  } catch (e) { /* enumeration unavailable — treat as empty */ }
  return out;
}
