// Core: sharing one focus session's time across several tasks.
//
// PORTABLE — no DOM, no browser APIs.
//
// A session started on one task often covers others. At the end the focused
// time is split by percent; shares are whole percents that always total 100,
// and the hours they turn into always total exactly the session's hours —
// never a stray hundredth gained or lost to rounding.

// Whole numbers in proportion to `weights`, summing exactly to `total`.
// Largest-remainder rounding; ties go to the earlier entry.
function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map(w => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => { if (left > 0) { out[i] += 1; left -= 1; } });
  return out;
}

// 100% split as evenly as whole percents allow: 3 tasks → [34, 33, 33].
export function evenPercents(n) {
  return apportion(100, Array(n).fill(1));
}

// One share moved to `value`; the others absorb the difference in proportion
// to their current shares (evenly if they were all 0), so the total stays 100.
export function rebalancePercents(pcts, index, value) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (pcts.length === 1) return [100];
  const others = pcts.map((p, i) => (i === index ? null : p)).filter(p => p !== null);
  const weights = others.every(p => p === 0) ? others.map(() => 1) : others;
  const spread = apportion(100 - v, weights);
  let k = 0;
  return pcts.map((_, i) => (i === index ? v : spread[k++]));
}

// The session's focused hours turned into one amount per share, in hundredths
// of an hour (how hours are stored), summing exactly to `totalHours`.
export function splitHours(totalHours, pcts) {
  return apportion(Math.round(totalHours * 100), pcts).map(h => h / 100);
}
