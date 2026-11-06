// Core: formatting and colour maths.
//
// PORTABLE — no DOM, no browser APIs (enforced by ESLint; see
// docs/architecture.md § Module map). Pure functions only: same input, same
// output, no reads of app state. A native build imports this unchanged.

// Hours as human text. Hours:minutes only, never seconds — the app's tone
// rule: a finitude tracker that counts seconds would feel like a stopwatch.
// `emptyLabel` is what zero renders as, which differs by context ('+ hrs' on
// an empty pill, '0m' in a sentence), so callers pass their own.
export function formatHours(h, emptyLabel = '+ hrs') {
  if (!h || h <= 0) return emptyLabel;
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// "#rrggbb" -> "r,g,b", the form CSS `rgba(var(--x), 0.5)` needs.
// Assumes full 6-digit hex: shorthand (#fff) yields NaNs, so callers that
// accept user-supplied colour must check (see buildCard in the sidebar).
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// Same conversion, emitting a complete rgba() string.
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
