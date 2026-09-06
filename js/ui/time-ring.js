// UI: the staged time picker (ring + preset chips) and the inline hours editor.
//
// DOM — SVG and pointer events. Not portable: a native build would use its own
// gesture and drawing primitives.
//
// SELF-CONTAINED BY DESIGN. Nothing here reads app state. The ring stages a
// value and reports it through onChange; the caller decides when (and whether)
// to commit it. That is what makes "dismiss the modal and nothing is logged"
// true by construction rather than by remembering to undo something --
// see docs/features.md § Focus modal.

import { formatHours } from '../core/format.js';

// Preset quick-add amounts for the time-add pills.
export const DEFAULT_TIME_PRESETS = [
  { label: '+10m', hours: 10 / 60 },
  { label: '+15m', hours: 15 / 60 },
  { label: '+30m', hours: 30 / 60 },
  { label: '+1h',  hours: 1 },
  { label: '+2h',  hours: 2 },
];

// A staged time picker: the ring shows ONLY what this interaction is about
// to add, starting at zero. Chips feed it, dragging the ring scrubs it
// (down as well as up), and nothing reaches the task until the caller
// commits. One full turn = 1 hour; whole hours collect as pips beneath.
const TIME_RING_R = 52;
const TIME_RING_C = 2 * Math.PI * TIME_RING_R;
const TIME_RING_MAX = 12;      // hours — a sane ceiling for one logging pass
const TIME_RING_STEP = 1 / 60; // drag snaps to 1-minute increments

// Preset chips render a mini dial filled to their fraction of an hour, so
// "+15m" reads as a quarter-filled circle at a glance.
export function makeChipDial(hours) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'time-chip-dial');
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');

  // Sub-hour presets fill a single dial to their fraction. Whole hours fill
  // it completely and add one inner ring per extra hour, so +2h doesn't
  // render as an identical full circle to +1h.
  const whole = Math.floor(hours);
  const frac = hours - whole;
  const rings = [];
  for (let i = 0; i < Math.max(1, whole); i++) rings.push({ r: 7 - i * 3, frac: 1 });
  if (frac > 0) {
    if (whole === 0) rings[0] = { r: 7, frac };
    else rings.push({ r: 7 - whole * 3, frac });
  }

  rings.forEach(({ r, frac: f }) => {
    if (r <= 1) return;
    const c = 2 * Math.PI * r;
    const track = document.createElementNS(ns, 'circle');
    track.setAttribute('class', 'time-chip-dial-track');
    track.setAttribute('cx', '9'); track.setAttribute('cy', '9'); track.setAttribute('r', String(r));
    const fill = document.createElementNS(ns, 'circle');
    fill.setAttribute('class', 'time-chip-dial-fill');
    fill.setAttribute('cx', '9'); fill.setAttribute('cy', '9'); fill.setAttribute('r', String(r));
    fill.setAttribute('stroke-dasharray', String(c));
    fill.setAttribute('stroke-dashoffset', String(c * (1 - f)));
    fill.setAttribute('transform', 'rotate(-90 9 9)');
    svg.append(track, fill);
  });
  return svg;
}

// Returns { el, getHours, setHours, reset } — the caller owns what happens
// on commit, so this works anywhere time gets logged.
export function makeTimeAddRing({ presets = DEFAULT_TIME_PRESETS, onChange } = {}) {
  let pending = 0;

  const wrap = document.createElement('div');
  wrap.className = 'time-ring-wrap';

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'time-ring');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('role', 'slider');
  svg.setAttribute('aria-label', 'Time to add');
  svg.setAttribute('aria-valuemin', '0');
  svg.setAttribute('tabindex', '0');

  const track = document.createElementNS(ns, 'circle');
  track.setAttribute('class', 'time-ring-track');
  track.setAttribute('cx', '64'); track.setAttribute('cy', '64'); track.setAttribute('r', String(TIME_RING_R));

  const fill = document.createElementNS(ns, 'circle');
  fill.setAttribute('class', 'time-ring-fill');
  fill.setAttribute('cx', '64'); fill.setAttribute('cy', '64'); fill.setAttribute('r', String(TIME_RING_R));
  fill.setAttribute('stroke-dasharray', String(TIME_RING_C));
  fill.setAttribute('stroke-dashoffset', String(TIME_RING_C));
  fill.setAttribute('transform', 'rotate(-90 64 64)');

  // Knob sits at the head of the fill — the grab affordance.
  const knob = document.createElementNS(ns, 'circle');
  knob.setAttribute('class', 'time-ring-knob');
  knob.setAttribute('r', '6');

  svg.append(track, fill, knob);

  const centre = document.createElement('div');
  centre.className = 'time-ring-centre';
  const amount = document.createElement('div');
  amount.className = 'time-ring-amount';
  const caption = document.createElement('div');
  caption.className = 'time-ring-caption';
  caption.textContent = 'to add';
  centre.append(amount, caption);

  // One pip per completed hour, so a 3h log doesn't look like a bare ring.
  const pips = document.createElement('div');
  pips.className = 'time-ring-pips';

  const dial = document.createElement('div');
  dial.className = 'time-ring-dial';
  dial.append(svg, centre);
  wrap.append(dial, pips);

  function paint() {
    const whole = Math.floor(pending + 1e-9);
    const frac = pending - whole;
    // A full ring reads better than an empty one at exact hours.
    const shown = pending > 0 && frac === 0 ? 1 : frac;
    fill.setAttribute('stroke-dashoffset', String(TIME_RING_C * (1 - shown)));

    const ang = (shown * 2 * Math.PI) - Math.PI / 2;
    knob.setAttribute('cx', String(64 + TIME_RING_R * Math.cos(ang)));
    knob.setAttribute('cy', String(64 + TIME_RING_R * Math.sin(ang)));

    amount.textContent = pending === 0 ? '0m' : formatHours(pending, '0m');
    wrap.classList.toggle('time-ring-wrap--empty', pending === 0);

    pips.innerHTML = '';
    const pipCount = pending > 0 && frac === 0 ? whole - 1 : whole;
    for (let i = 0; i < pipCount; i++) {
      const p = document.createElement('span');
      p.className = 'time-ring-pip';
      pips.appendChild(p);
    }
    if (pipCount > 0) {
      const lbl = document.createElement('span');
      lbl.className = 'time-ring-pip-label';
      lbl.textContent = `${pipCount}h`;
      pips.appendChild(lbl);
    }

    svg.setAttribute('aria-valuemax', String(TIME_RING_MAX));
    svg.setAttribute('aria-valuenow', String(Math.round(pending * 60)));
    svg.setAttribute('aria-valuetext', pending === 0 ? 'nothing to add' : formatHours(pending, '0m'));
    if (onChange) onChange(pending);
  }

  function setHours(h, { animate = false } = {}) {
    const next = Math.max(0, Math.min(TIME_RING_MAX, Math.round(h * 60) / 60));
    const grew = next > pending;
    pending = next;
    if (!dragging) dragRaw = next;   // chips/keys re-baseline the drag
    paint();
    if (animate && grew) {
      dial.classList.remove('time-ring-dial--bump');
      void dial.offsetWidth; // restart the animation
      dial.classList.add('time-ring-dial--bump');
    }
  }

  // ── Drag to scrub ──
  // Angle maps within the current hour; crossing the top boundary steps a
  // whole hour up or down, so a long drag keeps accumulating.
  // `dragRaw` accumulates the unsnapped value: snapping on every pointermove
  // would round each sub-step delta to zero and the drag would never move.
  let dragging = false, lastAngle = null, dragRaw = 0;
  function angleAt(ev) {
    const r = svg.getBoundingClientRect();
    const x = ev.clientX - (r.left + r.width / 2);
    const y = ev.clientY - (r.top + r.height / 2);
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += 2 * Math.PI;
    return a / (2 * Math.PI);
  }
  function onDown(ev) {
    dragging = true;
    dragRaw = pending;
    lastAngle = angleAt(ev);
    svg.setPointerCapture(ev.pointerId);
    wrap.classList.add('time-ring-wrap--dragging');
    ev.preventDefault();
  }
  function onMove(ev) {
    if (!dragging) return;
    const a = angleAt(ev);
    let d = a - lastAngle;
    if (d > 0.5) d -= 1;        // wrapped backwards past 12 o'clock
    else if (d < -0.5) d += 1;  // wrapped forwards
    lastAngle = a;
    dragRaw = Math.max(0, Math.min(TIME_RING_MAX, dragRaw + d));
    setHours(Math.round(dragRaw / TIME_RING_STEP) * TIME_RING_STEP);
  }
  function onUp(ev) {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('time-ring-wrap--dragging');
    try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
  }
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  svg.addEventListener('keydown', e => {
    const big = e.shiftKey ? 1 : TIME_RING_STEP;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setHours(pending + big); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setHours(pending - big); e.preventDefault(); }
    if (e.key === 'Home') { setHours(0); e.preventDefault(); }
  });

  // ── Preset chips ──
  const chips = document.createElement('div');
  chips.className = 'time-ring-chips';
  presets.forEach(({ label, hours }) => {
    const chip = document.createElement('button');
    chip.className = 'time-ring-chip';
    chip.appendChild(makeChipDial(hours));
    const txt = document.createElement('span');
    txt.textContent = label.replace(/^\+/, '');
    chip.appendChild(txt);
    chip.title = `Add ${label.replace(/^\+/, '')}`;
    chip.addEventListener('click', () => {
      setHours(pending + hours, { animate: true });
      chip.classList.add('focus-time-chip-flash');
      setTimeout(() => chip.classList.remove('focus-time-chip-flash'), 400);
    });
    chips.appendChild(chip);
  });

  const container = document.createElement('div');
  container.className = 'time-ring-section';
  container.append(wrap, chips);

  paint();
  return {
    el: container,
    getHours: () => pending,
    setHours,
    reset: () => setHours(0),
  };
}

// Inline click-to-edit for an hours pill. Shared by the goal card, the focus
// modal, and the done-card badge. The element becomes a number input on click
// (0–24, quarter-hour steps); blur/Enter commit, Escape cancels.
//   getValue() → current hours · onCommit(v, prev, delta) · render() repaints
export function makeInlineHoursEditor(pillEl, { getValue, onCommit, render }) {
  pillEl.addEventListener('click', () => {
    if (pillEl.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'done-hours-input';
    inp.min = '0'; inp.max = '24'; inp.step = '0.25';
    inp.value = getValue() || '';
    inp.placeholder = '0';
    pillEl.textContent = '';
    pillEl.appendChild(inp);
    inp.focus(); inp.select();

    function commit() {
      const prev = getValue() || 0;
      const v = Math.max(0, Math.min(24, parseFloat(inp.value) || 0));
      onCommit(v, prev, v - prev);
      render();
    }
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') render();
    });
  });
}

