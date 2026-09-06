// UI: the drifting background blobs.
//
// DOM + rAF — browser-only by nature, and deliberately not portable: a native
// build would express this with its own animation primitives. The *choice* of
// colours is portable and lives in js/core/blob-colors.js; this file is the
// motion and the painting.
//
// The blobs are ambient. They must never draw attention: motion is slow,
// pauses when the tab is hidden or a fullscreen focus session covers them, and
// stops entirely when the OS asks for reduced motion.

import { getBlobColors } from '../core/blob-colors.js';

// Injected by app.js: returns { focusIds, categories, activeCats,
// getCategoryById, today } — everything the colour picker needs. Injected
// rather than imported so this module never reaches into app state directly.
let _colorSource = null;
export function configureColorSource(fn) { _colorSource = fn; }

// Cache blob elements — all three are real divs now.
// _blobs are the painted blobs (CSS swirl owns their transform);
// _blobDrifts are their zero-size wrappers (JS drift owns those).
const _blobs = [
  document.getElementById('blob1'),
  document.getElementById('blob2'),
  document.getElementById('blob3'),
];
const _blobDrifts = [
  document.getElementById('blob1-drift'),
  document.getElementById('blob2-drift'),
  document.getElementById('blob3-drift'),
];

let _lastBlobColorKey = '';

// Repaint only when the *selection* changes. Without this guard every render
// would recompute and rewrite three custom properties, and the daily shuffle
// would be recomputed constantly for an unchanged answer.
export function applyBlobColors() {
  const src = _colorSource && _colorSource();
  if (!src) return;
  const colorKey = (src.focusIds || []).slice().sort().join(',') || src.today;
  if (colorKey === _lastBlobColorKey) return;
  _lastBlobColorKey = colorKey;
  const [c1, c2, c3] = getBlobColors(src);
  if (_blobs[0]) _blobs[0].style.setProperty('--blob1-color', c1);
  if (_blobs[1]) _blobs[1].style.setProperty('--blob2-color', c2);
  if (_blobs[2]) _blobs[2].style.setProperty('--blob3-color', c3);
}

// ── Blob motion: JS-driven bouncing drift (DVD-logo style) + CSS swirl on events ──
//
// Each blob has a position (px, py) and velocity (vx, vy) in viewport-fraction units.
// A rAF loop updates positions each frame. Speed is ~0.008 vw/frame (~0.48 vw/s at 60fps).
// Blobs bounce off the viewport edges (accounting for their own size).
// When a swirl triggers, the rAF loop pauses and the CSS swirl animation plays.
// When swirl ends, the loop resumes from the blob's current rendered position.

// Physics runs at DRIFT_FPS, not per animation frame. The per-step
// constants below are scaled by (60 / DRIFT_FPS) against the old
// per-frame values so the motion looks exactly as it always has.
const DRIFT_FPS = 24;
const DRIFT_INTERVAL = 1000 / DRIFT_FPS;
const _STEP_SCALE = 60 / DRIFT_FPS; // 2.5

const _blobState = _blobs.map((b, i) => {
  const w = [0.55, 0.50, 0.48][i];
  const h = [0.55, 0.60, 0.48][i];
  const px = Math.random() * (1 - w);
  const py = Math.random() * (1 - h);
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.0004 * _STEP_SCALE; // vw-fraction per step
  // turnRate: how many radians the direction rotates per step — creates arcs.
  // Each blob gets a different rate so they trace different curve radii.
  // Sign alternates so they curve in different directions.
  // turnRate oscillates via a per-blob phase so arcs curve both ways over time,
  // preventing inward spiraling. Each blob has a different oscillation period.
  const turnPeriods = [380, 520, 290].map(p => p / _STEP_SCALE); // steps per oscillation
  const turnAmps    = [0.012, 0.009, 0.014].map(a => a * _STEP_SCALE);
  return { px, py, angle, speed, w, h, frame: Math.floor(Math.random() * turnPeriods[i]), turnPeriod: turnPeriods[i], turnAmp: turnAmps[i] };
});

let _driftPaused = false;   // a swirl is playing
let _driftHidden = false;   // tab hidden, or focus fullscreen is covering us
let _reduceMotion = false;  // user asked the OS for reduced motion
let _focusModeOpen = false;
let _rafId = null;
let _lastStep = 0;

// Advance one blob by a single physics step. Unchanged from the original
// per-frame maths — only the write target moved to the wrapper.
function _driftStep(s) {
  // Oscillating turn rate — curves left then right over time, no inward spiral
  s.frame++;
  const turnRate = s.turnAmp * Math.sin((s.frame / s.turnPeriod) * Math.PI * 2);
  s.angle += turnRate;
  // Edge repulsion — only kick in very close to boundary, low strength
  const margin = 0.03;
  if (s.px < margin)           s.angle += 0.12 * Math.pow(1 - s.px / margin, 2);
  if (s.px > 1 - s.w - margin) s.angle -= 0.12 * Math.pow(1 - (1 - s.w - s.px) / margin, 2);
  if (s.py < margin)           s.angle += 0.12 * Math.pow(1 - s.py / margin, 2);
  if (s.py > 1 - s.h - margin) s.angle -= 0.12 * Math.pow(1 - (1 - s.h - s.py) / margin, 2);
  s.px += Math.cos(s.angle) * s.speed;
  s.py += Math.sin(s.angle) * s.speed;
  // Last-resort clamp + flip angle inward if a blob somehow escapes
  if (s.px < 0)       { s.px = 0;       s.angle =  Math.abs(Math.cos(s.angle)) > 0.1 ? Math.PI - s.angle : s.angle; }
  if (s.px > 1 - s.w) { s.px = 1 - s.w; s.angle = -Math.PI - s.angle; }
  if (s.py < 0)       { s.py = 0;       s.angle = -s.angle; }
  if (s.py > 1 - s.h) { s.py = 1 - s.h; s.angle = -s.angle; }
}

// Compositor-only write: translate3d on an unpainted wrapper means no
// layout, no repaint, and no re-blur of the (static) blur underneath.
function _writeBlob(i) {
  const s = _blobState[i], d = _blobDrifts[i];
  if (!d) return;
  d.style.transform = 'translate3d(' + (s.px * 100).toFixed(3) + 'vw,' +
                                       (s.py * 100).toFixed(3) + 'vh,0)';
}

function _driftTick(now) {
  _rafId = null;
  if (_driftPaused || _driftHidden || _reduceMotion) return;
  if (!_lastStep || now - _lastStep >= DRIFT_INTERVAL) {
    // Cap catch-up so a long stall can't teleport the blobs.
    const steps = _lastStep ? Math.min(2, Math.max(1, Math.round((now - _lastStep) / DRIFT_INTERVAL))) : 1;
    _lastStep = now;
    for (let i = 0; i < _blobState.length; i++) {
      for (let n = 0; n < steps; n++) _driftStep(_blobState[i]);
      _writeBlob(i);
    }
  }
  _rafId = requestAnimationFrame(_driftTick);
}

// _startDrift/_stopDrift are the ONLY owners of _rafId. The null-check
// makes a duplicated (and therefore uncancellable) rAF chain impossible.
function _startDrift() {
  if (_rafId !== null) return;
  if (_driftPaused || _driftHidden || _reduceMotion) return;
  _lastStep = 0; // resume takes exactly one step — no positional jump
  _rafId = requestAnimationFrame(_driftTick);
}
function _stopDrift() {
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
}

function _refreshDriftGate() {
  _driftHidden = document.hidden || _focusModeOpen;
  if (_driftHidden) _stopDrift(); else _startDrift();
}

document.addEventListener('visibilitychange', _refreshDriftGate);

// Focus fullscreen fully occludes the blobs — stop the loop while it's up.
export const DayByDayBlobs = {
  setOccluded(on) {
    if (_focusModeOpen === on) return;
    _focusModeOpen = on;
    _refreshDriftGate();
  }
};

const _rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
_reduceMotion = _rmQuery.matches;
_rmQuery.addEventListener('change', e => {
  _reduceMotion = e.matches;
  if (_reduceMotion) _stopDrift(); else _startDrift();
});

// Strip CSS drift animations — motion is now fully JS-driven
_blobs.forEach(b => { if (b) { b.style.animation = 'none'; } });
_blobState.forEach((s, i) => _writeBlob(i)); // paint initial positions
_startDrift();

let _swirlTimer = null;
export function pulseBlobEvent(type) {
  if (_reduceMotion) return;
  if (_swirlTimer) { clearTimeout(_swirlTimer); _swirlTimer = null; }

  const dur = type === 'complete' ? 2200 : 1400;
  const swirlType = (type === 'distraction') ? 'add' : type;
  const targets = (type === 'distraction') ? [_blobs[2]] : _blobs;

  // Pause the drift loop for the duration of the swirl. The wrapper keeps
  // the absolute position; the swirl is a relative offset on the inner blob.
  _driftPaused = true;
  _stopDrift();

  _blobs.forEach(b => {
    if (!b) return;
    b.removeAttribute('data-swirl');
    b.style.animation = 'none';
  });
  void document.body.offsetWidth;

  targets.forEach(b => {
    if (!b) return;
    b.style.animation = '';  // re-enable CSS animations for swirl
    b.style.animationDelay = '0s';
    b.setAttribute('data-swirl', swirlType);
  });

  _swirlTimer = setTimeout(() => {
    // Swirl keyframes end back at translate(0,0), and they never touched the
    // drift wrapper — so there is no position to reconcile. Just clear and go.
    _blobs.forEach(b => {
      if (!b) return;
      b.removeAttribute('data-swirl');
      b.style.animation = 'none';
    });
    _driftPaused = false;
    _startDrift();
    _swirlTimer = null;
  }, dur);
}

// Defer color apply until after state loads (state isn't set yet at this point in the IIFE)
