// Core: which three colours the background blobs wear.
//
// PORTABLE — no DOM, no browser APIs. The animation that consumes these lives
// in js/ui/blobs.js; only the selection rules are here.
//
// The blobs are ambient, not informational: they echo what you chose to focus
// on without ever asking to be read. Hence the daily-stable shuffle — the
// background should look settled for a day, not reshuffle on every render.

import { hexToRgba } from './format.js';

const FALLBACKS = ['#2D6A4F', '#40916C', '#FF9F1C'];

// A deterministic shuffle seeded by the date, so the ordering is stable for a
// whole day and changes on its own overnight. Math.sin as a cheap hash: no
// randomness source needed, and it gives the same answer on every platform.
function dailyShuffle(list, dateStr, saltMultiplier = 1) {
  const dateNum = parseInt(String(dateStr).replace(/-/g, ''), 10);
  return list.slice().sort((a, b) => {
    const ha = Math.sin(dateNum + a.id.length * saltMultiplier) * 10000;
    const hb = Math.sin(dateNum + b.id.length * saltMultiplier) * 10000;
    return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
  });
}

// Dark or washed-out colours need more opacity to read against the pale
// background, so alpha is computed from the colour rather than fixed.
export function blobAlpha(hex) {
  const h = (hex || FALLBACKS[0]).replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;   // perceived luminance
  const sat = Math.max(r, g, b) - Math.min(r, g, b); // saturation proxy
  const base = 0.38;
  const lumBoost = lum < 0.35 ? 0.20 : lum < 0.55 ? 0.10 : 0;
  const satPenalty = sat < 0.2 ? -0.08 : 0; // greys stay subtle
  return Math.min(0.55, Math.max(0.30, base + lumBoost + satPenalty));
}

// Pick the three source categories: today's focus areas when set, padded (and
// otherwise replaced) by a daily-stable shuffle of the rest.
export function pickBlobSources({ focusIds, categories, activeCats, getCategoryById, today }) {
  const focus = focusIds || [];
  if (focus.length >= 3) {
    return focus.slice(0, 3).map(id => getCategoryById(id));
  }
  if (focus.length > 0) {
    const used = new Set(focus);
    const rest = activeCats.filter(c => !used.has(c.id));
    return [...focus.map(id => getCategoryById(id)), ...dailyShuffle(rest, today)].slice(0, 3);
  }
  // Nothing focused: prefer non-general areas for variety — 'general' is grey
  // and simply blends into the background.
  const pool = activeCats.filter(c => c.id !== 'general');
  return dailyShuffle(pool.length >= 3 ? pool : categories, today, 7).slice(0, 3);
}

// The three rgba() strings the blob layer paints.
export function getBlobColors(opts) {
  const sources = pickBlobSources(opts);
  while (sources.length < 3) sources.push({ color: FALLBACKS[0] });
  return [0, 1, 2].map(i =>
    hexToRgba(sources[i].color || FALLBACKS[i], blobAlpha(sources[i].color)));
}
