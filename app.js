// === Day by Day — Core Application Logic ===

(function () {
  'use strict';

  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const STORAGE_KEY = 'daybyday_data';
  const HISTORY_KEY = 'daybyday_history';
  const LAYOUT_KEY = 'daybyday_layout';
  const BACKLOG_KEY = 'daybyday_backlog';
  const CATEGORIES_KEY = 'daybyday_categories';
  const SIDEBAR_KEY = 'daybyday_sidebar';
  // In-progress focus session snapshot — lets a crashed/reloaded tab offer
  // to resume the session instead of silently losing it.
  const FOCUS_SNAPSHOT_KEY = 'daybyday_focus_session';
  // Unified store (Phase 3). Built from the legacy keys above by migrateToStore();
  // legacy keys are kept as a one-version backup so migration is reversible.
  const STORE_KEY = 'daybyday_store';
  const STORE_VERSION = 2;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34;

  // --- Default categories ---
  const DEFAULT_CATEGORIES = [
    { id: 'fitness',       name: 'Fitness',       emoji: '💪', color: '#3a86ff', totalHours: 0 },
    { id: 'career',        name: 'Career',        emoji: '💼', color: '#2D6A4F', totalHours: 0 },
    { id: 'relationships', name: 'Relationships', emoji: '❤️', color: '#ff6b9d', totalHours: 0 },
    { id: 'chores',        name: 'Chores',        emoji: '🧹', color: '#f4a261', totalHours: 0 },
    { id: 'general',       name: 'General',       emoji: '⚡', color: '#8d99ae', totalHours: 0 },
  ];

  // --- Emoji → color mapping ---
  const EMOJI_COLORS = {
    // Default category emojis
    '💪': '#3a86ff', '💼': '#2D6A4F', '❤️': '#e63946', '🧹': '#f4a261', '⚡': '#8d99ae',
    // Picker emojis
    '🎯': '#e63946', '📚': '#3a86ff', '🎨': '#f72585', '💡': '#f9c74f', '🏃': '#43aa8b',
    '🧘': '#9b5de5', '💰': '#f4a261', '🌱': '#40916c', '🔧': '#6c757d', '🎵': '#7b2d8b',
    '✈️': '#00bbf9', '🍎': '#e63946', '🧠': '#9b5de5', '🤝': '#f4a261', '🏠': '#457b9d',
    // Common extras
    '🏋️': '#3a86ff', '🚴': '#43aa8b', '🧗': '#f4a261', '⚽': '#2D6A4F', '🎾': '#f9c74f',
    '🎸': '#7b2d8b', '🎹': '#9b5de5', '🎤': '#f72585', '🎬': '#e63946', '📷': '#6c757d',
    '💻': '#457b9d', '📝': '#3a86ff', '🔬': '#00bbf9', '🌍': '#40916c', '🌊': '#00bbf9',
    '🔥': '#fb5607', '⭐': '#f9c74f', '🌟': '#f9c74f', '🏆': '#f4a261', '🎓': '#3a86ff',
    '👨‍👩‍👧': '#f72585', '👫': '#f72585', '🐾': '#f4a261', '🌺': '#f72585', '🍃': '#40916c',
  };

  // Curated swatches shown in both category modals — ordered for visual appeal
  const COLOR_SWATCHES = [
    '#e63946','#f72585','#7b2d8b','#9b5de5','#3a86ff','#00bbf9','#00f5d4',
    '#40916c','#2D6A4F','#43aa8b','#f9c74f','#f4a261','#fb5607','#457b9d','#6c757d',
  ];

  // Appends a rainbow "custom color" button to a container.
  // Clicking opens a small positioned popover with a visible <input type="color">,
  // a live preview swatch, and Cancel / OK buttons.
  // onPick(hex) is called only when OK is confirmed.
  function appendColorPickerSwatch(container, currentColor, onPick, extraClass) {
    const btn = document.createElement('button');
    btn.className = 'cat-modal-swatch swatch-rainbow' + (extraClass ? ' ' + extraClass : '');
    btn.title = 'Custom color';
    btn.type = 'button';

    btn.addEventListener('click', e => {
      e.stopPropagation();
      // Remove any existing custom picker popover
      document.querySelectorAll('.custom-color-pop').forEach(p => p.remove());

      let pendingColor = currentColor || '#40916c';

      const pop = document.createElement('div');
      pop.className = 'custom-color-pop';

      const title = document.createElement('div');
      title.className = 'custom-color-pop-title';
      title.textContent = 'Custom color';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = pendingColor;
      colorInput.className = 'custom-color-input';

      const preview = document.createElement('div');
      preview.className = 'custom-color-preview';
      const previewSwatch = document.createElement('span');
      previewSwatch.className = 'custom-color-preview-swatch';
      previewSwatch.style.background = pendingColor;
      const previewHex = document.createElement('span');
      previewHex.className = 'custom-color-preview-hex';
      previewHex.textContent = pendingColor;
      preview.append(previewSwatch, previewHex);

      colorInput.addEventListener('input', () => {
        pendingColor = colorInput.value;
        previewSwatch.style.background = pendingColor;
        previewHex.textContent = pendingColor;
      });

      const actions = document.createElement('div');
      actions.className = 'custom-color-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-ghost';
      cancelBtn.style.fontSize = '0.75rem';
      cancelBtn.style.padding = '5px 10px';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', e => { e.stopPropagation(); pop.remove(); });

      const okBtn = document.createElement('button');
      okBtn.className = 'btn btn-primary';
      okBtn.style.fontSize = '0.75rem';
      okBtn.style.padding = '5px 10px';
      okBtn.textContent = 'OK';
      okBtn.type = 'button';
      okBtn.addEventListener('click', e => {
        e.stopPropagation();
        onPick(pendingColor);
        pop.remove();
      });

      actions.append(cancelBtn, okBtn);
      pop.append(title, colorInput, preview, actions);
      document.body.appendChild(pop);

      // Position near the trigger button
      const r = btn.getBoundingClientRect();
      const popW = 180;
      let left = r.left;
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      pop.style.left = left + 'px';
      pop.style.top = (r.bottom + 6) + 'px';

      // Close on outside click
      setTimeout(() => {
        const close = ev => {
          if (!pop.contains(ev.target) && ev.target !== btn) {
            pop.remove();
            document.removeEventListener('pointerdown', close, true);
          }
        };
        document.addEventListener('pointerdown', close, true);
      }, 50);
    });

    container.appendChild(btn);
  }

  function emojiToColor(emoji) {
    if (!emoji) return COLOR_SWATCHES[0];
    const direct = EMOJI_COLORS[emoji.trim()];
    if (direct) return direct;
    // Hash fallback — derive hue from codepoints, use fixed s/l for pleasing output
    let hash = 0;
    for (const cp of emoji) hash = (hash * 31 + (cp.codePointAt(0) || 0)) & 0xfffffff;
    const hue = hash % 360;
    // Convert HSL → hex
    const h = hue / 360, s = 0.6, l = 0.48;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const toHex = t => {
      const c = Math.round(255 * (t < 1/6 ? p + (q-p)*6*t : t < 1/2 ? q : t < 2/3 ? p + (q-p)*(2/3-t)*6 : p));
      return c.toString(16).padStart(2, '0');
    };
    return `#${toHex(h+1/3)}${toHex(h)}${toHex(h-1/3 < 0 ? h-1/3+1 : h-1/3)}`;
  }

  // --- Storage ---
  let storageAvailable = false;
  try {
    const k = '__daybyday_test__';
    localStorage.setItem(k, '1');
    if (localStorage.getItem(k) === '1') storageAvailable = true;
    localStorage.removeItem(k);
  } catch (e) {}

  // =========================================================
  // BLOB CONTROLLER — time-of-day drift + event pulses
  // =========================================================
  // Convert a hex color to rgba(r,g,b,a) string.
  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Pick 3 colors for the blobs: from today's focus categories if set,
  // otherwise a stable daily-random shuffle of all categories.
  function getBlobColors() {
    const focus = state.focusCategoryIds || [];
    let sources = [];

    if (focus.length >= 3) {
      sources = focus.slice(0, 3).map(id => getCategoryById(id));
    } else if (focus.length > 0) {
      // Pad with non-focus categories
      const used = new Set(focus);
      const rest = activeCategories().filter(c => !used.has(c.id));
      // Stable daily shuffle for the padding: seed with today's date string
      const dateNum = parseInt(getTodayString().replace(/-/g, ''), 10);
      const shuffled = rest.slice().sort((a, b) => {
        const ha = Math.sin(dateNum + a.id.length) * 10000;
        const hb = Math.sin(dateNum + b.id.length) * 10000;
        return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
      });
      sources = [...focus.map(id => getCategoryById(id)), ...shuffled].slice(0, 3);
    } else {
      // No focus set — stable daily shuffle of all categories
      // Prefer non-general categories for visual variety; 'general' (gray) blends into background
      const dateNum = parseInt(getTodayString().replace(/-/g, ''), 10);
      const pool = activeCategories().filter(c => c.id !== 'general');
      const sorted = (pool.length >= 3 ? pool : categories).slice().sort((a, b) => {
        const ha = Math.sin(dateNum + a.id.length * 7) * 10000;
        const hb = Math.sin(dateNum + b.id.length * 7) * 10000;
        return (ha - Math.floor(ha)) - (hb - Math.floor(hb));
      });
      sources = sorted.slice(0, 3);
    }

    // Fallback if categories aren't loaded yet
    while (sources.length < 3) sources.push({ color: '#2D6A4F' });

    // Compute a visibility-adjusted alpha: dark or desaturated colors need more
    // opacity to show against the pale #EEF2EE background.
    function blobAlpha(hex) {
      const h = (hex || '#2D6A4F').replace('#', '');
      const r = parseInt(h.substring(0, 2), 16) / 255;
      const g = parseInt(h.substring(2, 4), 16) / 255;
      const b = parseInt(h.substring(4, 6), 16) / 255;
      // Perceived luminance (0 = black, 1 = white)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Saturation proxy: max channel - min channel
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Low luminance or low saturation → bump alpha so the blob reads clearly
      const base = 0.38;
      const lumBoost  = lum < 0.35 ? 0.20 : lum < 0.55 ? 0.10 : 0;
      const satPenalty = sat < 0.2  ? -0.08 : 0; // grays stay subtle
      return Math.min(0.55, Math.max(0.30, base + lumBoost + satPenalty));
    }

    return [
      hexToRgba(sources[0].color || '#2D6A4F', blobAlpha(sources[0].color)),
      hexToRgba(sources[1].color || '#40916C', blobAlpha(sources[1].color)),
      hexToRgba(sources[2].color || '#FF9F1C', blobAlpha(sources[2].color)),
    ];
  }

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
  function applyBlobColors() {
    if (!state || !categories) return;
    const colorKey = (state.focusCategoryIds || []).slice().sort().join(',') || getTodayString();
    if (colorKey === _lastBlobColorKey) return;
    _lastBlobColorKey = colorKey;
    const [c1, c2, c3] = getBlobColors();
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
  window.DayByDayBlobs = {
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
  function pulseBlobEvent(type) {
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
  setTimeout(applyBlobColors, 0);

  function storageGet(key) {
    if (!storageAvailable) return null;
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    if (!storageAvailable) return;
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function storageRemove(key) {
    if (!storageAvailable) return;
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // =========================================================
  // UNIFIED STORE (Phase 3, step 1)
  //
  // One normalized shape every part of the app will read/write:
  //   store = {
  //     version,
  //     entities: { [id]: Entity },        // every task-like thing, by id
  //     days:     { [YYYY-MM-DD]: [id] },  // ordered membership per day
  //     backlogIds: [id],                  // backlog (day-less queue)
  //     categories: [ {id,name,emoji,color,totalHours,vision?} ],
  //     sessions:  [ Session ],            // focus sessions
  //     journal:   { [date]: { successes:[], failures:[] } },
  //     history:   [ archived day snapshot ],   // kept verbatim for now
  //     layout?: ...
  //   }
  //   Entity = { id, type:'goal'|'distraction'|'quickDone'|'backlog',
  //              name, category, hours, progress?, repeatable?, prevHours?,
  //              fromBacklog?, createdAt, updatedAt, completedAt? }
  //
  // This step ONLY builds + persists the store from the legacy keys; the app
  // still reads from the legacy state/backlog/categories. Legacy keys are left
  // untouched as a one-version backup, so the migration is reversible.
  // =========================================================
  let _idSeq = 0;
  function genId() {
    return 'e' + Date.now().toString(36) + (_idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function makeEntity(type, src) {
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
    }
    return e;
  }

  // Build the unified store from the legacy localStorage keys. Idempotent:
  // if a current-version store already exists, returns it untouched.
  function migrateToStore() {
    try {
      const existing = storageGet(STORE_KEY);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed && parsed.version === STORE_VERSION) return parsed;
      }
    } catch (e) {}

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
    } catch (e) {}

    // Backlog → backlog entities (day-less).
    try {
      (loadBacklog() || []).forEach(item => {
        const e = makeEntity('backlog', item);
        store.entities[e.id] = e;
        store.backlogIds.push(e.id);
      });
    } catch (e) {}

    // Layout (card order), if present, preserved verbatim.
    try {
      const rawLayout = storageGet(LAYOUT_KEY);
      if (rawLayout) store.layout = JSON.parse(rawLayout);
    } catch (e) {}

    storageSet(STORE_KEY, JSON.stringify(store));
    return store;
  }

  // ---- Store <-> state adapter (Phase 3) ----
  // The store is the source of truth; state.goals / state.distractions /
  // state.quickDone / backlog are live views over it so the existing
  // rendering/undo/drag code keeps working unchanged. hydrate* builds the view
  // from the store; sync* writes the view back into the store. Each view object
  // carries its entity id (_eid) so we reconcile by identity.

  // Project an entity into the plain view shape its array expects, carrying _eid.
  function entityToView(e) {
    const v = { _eid: e.id, name: e.name, hours: e.hours || 0, category: e.category || null };
    if (e.type === 'goal') {
      v.progress = e.progress || 0;
      v.repeatable = e.repeatable || false;
      if (e.prevHours != null) v.prevHours = e.prevHours;
      if (e.fromBacklog) v.fromBacklog = true;
    } else if (e.type === 'backlog') {
      v.repeatable = e.repeatable || false;
    }
    return v;
  }

  // Copy a view's fields onto its entity (in place).
  function applyViewToEntity(e, v, type, now) {
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
    }
    e.updatedAt = now;
  }

  // Build a view array from a day's entities of a given type, in stored order.
  function hydrateDayType(day, type) {
    return (store.days[day] || [])
      .map(id => store.entities[id])
      .filter(e => e && e.type === type)
      .map(entityToView);
  }

  // Reconcile the store's entities-of-`type` to match `views` exactly: update
  // existing (by _eid), mint new ones, drop removed ones. Returns the ordered
  // entity ids. Does not touch store.days — the caller rebuilds day membership.
  function reconcileType(type, views) {
    const now = Date.now();
    const ids = [];
    views.forEach(v => {
      let e = v._eid ? store.entities[v._eid] : null;
      if (!e) { e = makeEntity(type, v); v._eid = e.id; store.entities[e.id] = e; }
      applyViewToEntity(e, v, type, now);
      ids.push(e.id);
    });
    return ids;
  }

  // Sync all three day-resident view arrays into the store for `day`. The day's
  // membership is rebuilt as goals → distractions → quickDone; entities of those
  // types no longer present are deleted.
  function syncDayToStore(day) {
    const goalIds = reconcileType('goal', state.goals);
    const distIds = reconcileType('distraction', state.distractions || []);
    const quickIds = reconcileType('quickDone', state.quickDone || []);
    const kept = new Set([...goalIds, ...distIds, ...quickIds]);
    (store.days[day] || []).forEach(id => {
      const e = store.entities[id];
      if (e && (e.type === 'goal' || e.type === 'distraction' || e.type === 'quickDone') && !kept.has(id)) {
        delete store.entities[id];
      }
    });
    store.days[day] = [...goalIds, ...distIds, ...quickIds];
  }

  // Backlog is a day-less queue tracked by store.backlogIds.
  function hydrateBacklogFromStore() {
    return store.backlogIds
      .map(id => store.entities[id])
      .filter(e => e && e.type === 'backlog')
      .map(entityToView);
  }

  function syncBacklogToStore() {
    const now = Date.now();
    const ids = [];
    backlog.forEach(v => {
      let e = v._eid ? store.entities[v._eid] : null;
      if (!e) { e = makeEntity('backlog', v); v._eid = e.id; store.entities[e.id] = e; }
      applyViewToEntity(e, v, 'backlog', now);
      ids.push(e.id);
    });
    const kept = new Set(ids);
    store.backlogIds.forEach(id => {
      const e = store.entities[id];
      if (e && e.type === 'backlog' && !kept.has(id)) delete store.entities[id];
    });
    store.backlogIds = ids;
  }

  // Focus sessions are append-style records (no entity reconciliation). The
  // store holds the canonical array; state.focusSessions mirrors it.
  function hydrateSessionsFromStore() {
    return (store.sessions || []).slice();
  }

  function syncSessionsToStore() {
    store.sessions = (state.focusSessions || []).slice();
  }

  function saveStore() { storageSet(STORE_KEY, JSON.stringify(store)); }

  // --- Categories ---
  let categories = loadCategories();

  function loadCategories() {
    try {
      const raw = storageGet(CATEGORIES_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const merged = DEFAULT_CATEGORIES.map(def => {
          const found = saved.find(c => c.id === def.id);
          // Keep saved totalHours/vision/emoji; fall back to defaults for missing fields
          return found ? { ...def, ...found } : { ...def };
        });
        saved.forEach(c => {
          if (!merged.find(m => m.id === c.id)) merged.push(c);
        });
        return merged;
      }
    } catch (e) {}
    return DEFAULT_CATEGORIES.map(c => ({ ...c }));
  }

  function saveCategories() { storageSet(CATEGORIES_KEY, JSON.stringify(categories)); }

  function getCategoryById(id) {
    // Archived categories still resolve — past sessions/journal/pills keep
    // rendering their emoji, name, and color.
    return categories.find(c => c.id === id) || categories.find(c => c.id === 'general');
  }

  // Categories offered in pickers / shown as sidebar cards. Archiving hides
  // an area from daily UI but never deletes it: totalHours and history stay,
  // and it can be restored from the sidebar's Archived section.
  function activeCategories() {
    return categories.filter(c => !c.archived && !c.deleted);
  }

  function archiveCategory(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat || cat.id === 'general') return; // general is the fallback — never archived
    cat.archived = true;
    // Drop it from today's focus if it was focused
    if (state.focusCategoryIds && state.focusCategoryIds.includes(id)) {
      state.focusCategoryIds = state.focusCategoryIds.filter(c => c !== id);
      saveState();
    }
    saveCategories();
    renderSidebar();
    renderBacklog();
    applyBlobColors();
  }

  function restoreCategory(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    delete cat.archived;
    saveCategories();
    renderSidebar();
    renderBacklog();
    applyBlobColors();
  }

  // Permanent delete — only reachable from the Archived section, behind an
  // inline confirm. The category becomes a TOMBSTONE (`deleted: true`), never
  // removed from the array: past sessions, journal entries, and history keep
  // resolving its real name/emoji/color via getCategoryById, and the
  // DEFAULT_CATEGORIES merge in loadCategories() can't resurrect it. Only
  // live, still-actionable references move to General: backlog items (they'd
  // become unreachable behind a card that no longer renders) and today's
  // active goals (future logging must not flow into a deleted area).
  // Completed items and all past records stay untouched.
  function deleteCategory(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat || cat.id === 'general') return;
    cat.deleted = true;
    cat.archived = true;

    let backlogTouched = false;
    backlog.forEach(b => {
      if ((b.category || 'general') === id) { b.category = 'general'; backlogTouched = true; }
    });
    let stateTouched = false;
    (state.goals || []).forEach(g => {
      if ((g.category || 'general') === id && (g.progress || 0) < 100) {
        g.category = 'general';
        stateTouched = true;
      }
    });
    if (state.focusCategoryIds && state.focusCategoryIds.includes(id)) {
      state.focusCategoryIds = state.focusCategoryIds.filter(c => c !== id);
      stateTouched = true;
    }

    if (backlogTouched) saveBacklog();
    if (stateTouched) saveState();
    saveCategories();
    renderSidebar();
    renderBacklog();
    render();
    applyBlobColors();
  }

  function getCategoryColor(id) {
    const cat = getCategoryById(id);
    return cat ? cat.color : '#8d99ae';
  }

  // Format a duration in hours as a calm h/m pill (no seconds). Shared by every
  // hours pill in the app. `emptyLabel` is shown when the value is zero/falsy.
  // For a duration in whole minutes, pass formatHours(mins / 60, '0m').
  function formatHours(h, emptyLabel = '+ hrs') {
    if (!h || h <= 0) return emptyLabel;
    if (h < 1) return `${Math.round(h * 60)}m`;
    const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  // Preset quick-add amounts for the time-add pills.
  const DEFAULT_TIME_PRESETS = [
    { label: '+10m', hours: 10 / 60 },
    { label: '+15m', hours: 15 / 60 },
    { label: '+30m', hours: 30 / 60 },
    { label: '+1h',  hours: 1 },
    { label: '+2h',  hours: 2 },
  ];

  // Build a row of preset time-add chips (+10m, +15m, …). Each click calls
  // onAdd(deltaHours) — the caller owns the clamp/save/accumulate/sync — then
  // the chip flashes. Returns the container element.
  function makeTimeAddPills(onAdd, presets = DEFAULT_TIME_PRESETS) {
    const chips = document.createElement('div');
    chips.className = 'focus-modal-chips';
    presets.forEach(({ label, hours }) => {
      const chip = document.createElement('button');
      chip.className = 'focus-time-chip';
      chip.textContent = label;
      chip.addEventListener('click', () => {
        onAdd(hours);
        chip.classList.add('focus-time-chip-flash');
        setTimeout(() => chip.classList.remove('focus-time-chip-flash'), 400);
      });
      chips.appendChild(chip);
    });
    return chips;
  }

  // Inline click-to-edit for an hours pill. Shared by the goal card, the focus
  // modal, and the done-card badge. The element becomes a number input on click
  // (0–24, quarter-hour steps); blur/Enter commit, Escape cancels.
  //   getValue() → current hours · onCommit(v, prev, delta) · render() repaints
  function makeInlineHoursEditor(pillEl, { getValue, onCommit, render }) {
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

  // Accumulate hours into category totals — called when hours change on a task
  function accumulateCategoryHours(catId, delta) {
    if (!catId || delta === 0) return;
    const cat = getCategoryById(catId);
    if (!cat) return;
    cat.totalHours = Math.max(0, (cat.totalHours || 0) + delta);
    saveCategories();
    renderSidebar();
  }

  // --- Sidebar state ---
  let sidebarCollapsed = (() => {
    try { const r = storageGet(SIDEBAR_KEY); return r === 'collapsed'; } catch (e) { return false; }
  })();
  let expandedCatId = null; // which sidebar card is currently expanded
  let archivedSectionOpen = false; // Archived areas list — collapsed by default

  // --- State ---
  // Declared before loadState() runs: loadState assigns _prevDayForModal when it
  // detects a new day, so the binding must already exist (else a TDZ error here
  // silently aborts carryover + the boot transition modal).
  let _prevDayForModal = null; // set when new day detected, consumed by modal
  let state = loadState();
  let backlog = loadBacklog();

  // --- Unified store (Phase 3) ---
  // Built once at boot from the legacy keys. The store is the source of truth;
  // goals, distractions, quickDone and backlog are read/written through the
  // adapter above. Sessions still use the legacy path for now.
  let store = migrateToStore();

  // Share one categories array between the store and the module so totalHours
  // updates (via accumulateCategoryHours) stay reflected in the store.
  store.categories = categories;

  // Make the view arrays live over the store for the active day. If the store
  // already has this day (normal same-day boot), the store wins; otherwise (e.g.
  // a fresh new-day state with _carryover) keep the loaded data and let the
  // first save sync it in.
  if (store.days[state.date]) {
    state.goals = hydrateDayType(state.date, 'goal');
    state.distractions = hydrateDayType(state.date, 'distraction');
    state.quickDone = hydrateDayType(state.date, 'quickDone');
    state.focusSessions = hydrateSessionsFromStore();
  } else {
    syncDayToStore(state.date);
    syncSessionsToStore();
  }
  backlog = hydrateBacklogFromStore();
  saveStore();

  // --- Undo stack ---
  const undoStack = [];

  // --- DOM ---
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');
  const goalsListEl = document.getElementById('goals-list');
  const distractionsListEl = document.getElementById('distractions-list');
  const goalInputEl = document.getElementById('goal-input');
  const addGoalBtn = document.getElementById('add-goal-btn');
  const distractionInputEl = document.getElementById('distraction-input');
  const addDistractionBtn = document.getElementById('add-distraction-btn');
  const addGoalRow = document.getElementById('add-goal-row');
  const addDistractionRow = document.getElementById('add-distraction-row');
  const totalHoursEl = document.getElementById('total-hours');
  const avgProgressEl = document.getElementById('avg-progress');
  const distractionHoursEl = document.getElementById('distraction-hours');
  const summaryBreakdownEl = document.getElementById('summary-breakdown');
  const resetDayBtn = document.getElementById('reset-day-btn');
  const ringProgress = document.getElementById('ring-progress');
  const ringHours = document.getElementById('ring-hours');
  const ringDistractionHours = document.getElementById('ring-distraction-hours');
  const ringQuickHours = document.getElementById('ring-quick-hours');
  const quickHoursEl = document.getElementById('quick-hours');
  const successesListEl = document.getElementById('successes-list');
  const failuresListEl = document.getElementById('failures-list');
  const successInputEl = document.getElementById('success-input');
  const failureInputEl = document.getElementById('failure-input');
  const addSuccessBtn = document.getElementById('add-success-btn');
  const addFailureBtn = document.getElementById('add-failure-btn');
  const carryoverBanner = document.getElementById('carryover-banner');
  const carryoverList = document.getElementById('carryover-list');
  const carryoverAccept = document.getElementById('carryover-accept');
  const carryoverDismiss = document.getElementById('carryover-dismiss');
  const storageWarning = document.getElementById('storage-warning');
  const backlogListEl = document.getElementById('backlog-list');
  const backlogInputEl = document.getElementById('backlog-input');
  const addBacklogBtn = document.getElementById('add-backlog-btn');
  const doneListEl = document.getElementById('done-list');
  const doneSubtitle = document.getElementById('done-subtitle');
  const quickInputEl = document.getElementById('quick-input');
  const addQuickBtn = document.getElementById('add-quick-btn');
  const lifeSidebar = document.getElementById('life-sidebar');
  const sidebarCloseBtn = document.getElementById('sidebar-close');
  const sidebarExpandBtn = document.getElementById('sidebar-expand-btn');
  const sidebarCategoriesEl = document.getElementById('sidebar-categories');
  const sidebarCatDots = document.getElementById('sidebar-cat-dots');
  const addCategoryBtn = document.getElementById('add-category-btn');

  // =========================================================
  // CLOCK
  // =========================================================
  function updateClock() {
    const now = new Date();
    const h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    timeEl.textContent = `${h % 12 || 12}:${m} ${ampm}`;
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  updateClock();
  const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  setTimeout(() => { updateClock(); setInterval(updateClock, 60000); }, msUntilNextMinute);

  // =========================================================
  // SIDEBAR
  // =========================================================
  function initSidebar() {
    if (sidebarCollapsed) lifeSidebar.classList.add('collapsed');
    else document.getElementById('main-content').classList.add('sidebar-open');
    renderSidebar();

    if (sidebarExpandBtn) {
      sidebarExpandBtn.addEventListener('click', () => {
        sidebarCollapsed = !sidebarCollapsed;
        lifeSidebar.classList.toggle('collapsed', sidebarCollapsed);
        document.getElementById('main-content').classList.toggle('sidebar-open', !sidebarCollapsed);
        storageSet(SIDEBAR_KEY, sidebarCollapsed ? 'collapsed' : 'open');
      });
    }

    addCategoryBtn.addEventListener('click', () => openNewCategoryModal(null));
  }

  function renderSidebar() {
    if (!sidebarCategoriesEl) return;
    sidebarCategoriesEl.innerHTML = '';
    if (sidebarCatDots) sidebarCatDots.innerHTML = '';

    // Count active, completed, and backlogged goals per category today
    const todayActive = {};
    const todayCompleted = {};
    const todayBacklog = {};
    const todayHours = {};
    state.goals.forEach(g => {
      const id = g.category || 'general';
      if ((g.progress || 0) >= 100) todayCompleted[id] = (todayCompleted[id] || 0) + 1;
      else todayActive[id] = (todayActive[id] || 0) + 1;
      if ((g.hours || 0) > 0) todayHours[id] = (todayHours[id] || 0) + (g.hours || 0);
    });
    (state.quickDone || []).forEach(q => {
      const id = q.category || 'general';
      if ((q.hours || 0) > 0) todayHours[id] = (todayHours[id] || 0) + (q.hours || 0);
    });
    backlog.forEach(b => {
      const id = b.category || 'general';
      todayBacklog[id] = (todayBacklog[id] || 0) + 1;
    });

    const liveCats = activeCategories();
    const archivedCats = categories.filter(c => c.archived && !c.deleted);

    const MAX_SCALE_HOURS = 40;
    const maxHours = Math.max(...liveCats.map(c => c.totalHours || 0), MAX_SCALE_HOURS);

    // Split into today's focus vs the rest (rest sorted by totalHours asc)
    const focusIds = new Set(state.focusCategoryIds || []);
    const focusCats = liveCats.filter(c => focusIds.has(c.id));
    const restCats = liveCats
      .filter(c => !focusIds.has(c.id))
      .sort((a, b) => (a.totalHours || 0) - (b.totalHours || 0));

    // Rail emoji buttons — keep original order
    liveCats.forEach(cat => {
      if (sidebarCatDots) {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'sidebar-emoji-btn';
        emojiBtn.textContent = cat.emoji || '●';
        emojiBtn.title = cat.name;
        emojiBtn.style.setProperty('--cat-color', cat.color);
        emojiBtn.addEventListener('click', () => openQuickAddModal(cat));
        sidebarCatDots.appendChild(emojiBtn);
      }
    });

    function buildCard(cat, isFocused) {
      const card = document.createElement('div');
      card.className = 'sidebar-cat-card' + (isFocused ? ' sidebar-cat-focused' : '');

      const top = document.createElement('div');
      top.className = 'sidebar-cat-top';

      const emojiEl = document.createElement('span');
      emojiEl.className = 'sidebar-cat-emoji';
      emojiEl.textContent = cat.emoji || '●';

      const nameEl = document.createElement('span');
      nameEl.className = 'sidebar-cat-name';
      nameEl.textContent = cat.name;

      const hoursEl = document.createElement('span');
      hoursEl.className = 'sidebar-cat-hours';
      const todayH = todayHours[cat.id] || 0;
      const totalH = cat.totalHours || 0;
      if (todayH > 0) {
        hoursEl.innerHTML = `<span class="sidebar-hours-today">${todayH.toFixed(1)}h</span><span class="sidebar-hours-sep"> | </span><span class="sidebar-hours-total">${totalH.toFixed(1)}h</span>`;
      } else if (isFocused) {
        hoursEl.innerHTML = `<span class="sidebar-hours-today sidebar-hours-today-zero">0h</span><span class="sidebar-hours-sep"> | </span><span class="sidebar-hours-total">${totalH > 0 ? totalH.toFixed(1) + 'h' : '—'}</span>`;
      } else {
        hoursEl.textContent = totalH > 0 ? `${totalH.toFixed(1)}h` : '—';
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'sidebar-cat-edit-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>';
      editBtn.addEventListener('click', e => {
        e.stopPropagation();
        openCatInlineEdit(cat, card, top, editBtn);
      });

      top.append(emojiEl, nameEl, hoursEl);

      const completed = todayCompleted[cat.id] || 0;
      if (completed > 0) {
        const compBadge = document.createElement('span');
        compBadge.className = 'sidebar-cat-completed';
        compBadge.textContent = `✓${completed}`;
        top.appendChild(compBadge);
      }
      top.appendChild(editBtn);

      const barContainer = document.createElement('div');
      barContainer.className = 'sidebar-cat-bar-container';
      const bar = document.createElement('div');
      bar.className = 'sidebar-cat-bar';
      bar.style.background = `linear-gradient(90deg, ${cat.color}cc, ${cat.color}88)`;
      bar.style.width = Math.min(100, ((cat.totalHours || 0) / maxHours) * 100) + '%';
      barContainer.appendChild(bar);

      const active = todayActive[cat.id] || 0;
      const backlogged = todayBacklog[cat.id] || 0;
      const parts = [];
      if (active > 0) parts.push(`${active} active`);
      if (completed > 0) parts.push(`${completed} done`);
      if (backlogged > 0) parts.push(`${backlogged} backlog`);
      const countEl = document.createElement('div');
      countEl.className = 'sidebar-cat-task-count';
      countEl.textContent = parts.join(' · ');

      card.append(top, barContainer, countEl);

      const isExpanded = expandedCatId === cat.id;
      if (isExpanded) {
        card.classList.add('sidebar-cat-expanded');
        const detail = document.createElement('div');
        detail.className = 'sidebar-cat-detail';

        const activeGoals = state.goals.filter(g => (g.category || 'general') === cat.id && (g.progress || 0) < 100);
        const doneGoals   = state.goals.filter(g => (g.category || 'general') === cat.id && (g.progress || 0) >= 100);
        const backlogItems = backlog.filter(b => (b.category || 'general') === cat.id);

        function addSection(label, items, itemClass, draggable) {
          if (!items.length) return;
          const sec = document.createElement('div');
          sec.className = 'sidebar-detail-section';
          const secLabel = document.createElement('div');
          secLabel.className = 'sidebar-detail-label';
          secLabel.textContent = label;
          sec.appendChild(secLabel);
          items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'sidebar-detail-item ' + itemClass;
            if (draggable) {
              const handle = document.createElement('span');
              handle.className = 'sidebar-backlog-drag-handle';
              handle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M104,60A12,12,0,1,1,92,48,12,12,0,0,1,104,60Zm60,0a12,12,0,1,1-12-12A12,12,0,0,1,164,60ZM104,128a12,12,0,1,1-12-12A12,12,0,0,1,104,128Zm60,0a12,12,0,1,1-12-12A12,12,0,0,1,164,128ZM104,196a12,12,0,1,1-12-12A12,12,0,0,1,104,196Zm60,0a12,12,0,1,1-12-12A12,12,0,0,1,164,196Z"/></svg>';
              const nameSpan = document.createElement('span');
              nameSpan.className = 'sidebar-backlog-item-name';
              nameSpan.textContent = item.name;
              row.append(handle, nameSpan);
              setupSidebarBacklogDrag(row, item);
            } else {
              row.textContent = item.name;
            }
            sec.appendChild(row);
          });
          detail.appendChild(sec);
        }

        addSection('Active', activeGoals, 'sidebar-detail-active', false);
        addSection('Done Today', doneGoals, 'sidebar-detail-done', false);
        addSection('Backlog', backlogItems, 'sidebar-detail-backlog', true);

        if (!activeGoals.length && !doneGoals.length && !backlogItems.length) {
          const empty = document.createElement('div');
          empty.className = 'sidebar-detail-empty';
          empty.textContent = 'No tasks here yet';
          detail.appendChild(empty);
        }

        // Quiet archive action — hides the area from daily UI, keeps its
        // hours and history. Restorable from the Archived section below.
        if (cat.id !== 'general') {
          const archiveBtn = document.createElement('button');
          archiveBtn.className = 'sidebar-archive-btn';
          archiveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M224,48H32A16,16,0,0,0,16,64V88a16,16,0,0,0,16,16v96a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V104a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm-16,152H48V104H208ZM224,88H32V64H224V88ZM96,136a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,136Z"/></svg> Archive this area';
          archiveBtn.title = 'Hide from daily view — hours and history are kept';
          archiveBtn.addEventListener('click', e => {
            e.stopPropagation();
            archiveCategory(cat.id);
          });
          detail.appendChild(archiveBtn);
        }

        card.appendChild(detail);
      }

      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        expandedCatId = expandedCatId === cat.id ? null : cat.id;
        renderSidebar();
      });

      return card;
    }

    // ── Today's focus section ──
    // Header always renders, with an edit pencil on the right — set focus
    // if the day-start modal was skipped, or change it mid-day.
    const focusHeader = document.createElement('div');
    focusHeader.className = 'sidebar-section-header sidebar-focus-header';
    const focusHeaderText = document.createElement('span');
    focusHeaderText.textContent = "Today's focus";
    const editFocusBtn = document.createElement('button');
    editFocusBtn.className = 'sidebar-focus-edit-btn';
    editFocusBtn.title = "Change today's focus areas";
    editFocusBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>';
    editFocusBtn.addEventListener('click', openEditFocusModal);
    focusHeader.append(focusHeaderText, editFocusBtn);
    sidebarCategoriesEl.appendChild(focusHeader);

    if (focusCats.length > 0) {
      focusCats.forEach(cat => sidebarCategoriesEl.appendChild(buildCard(cat, true)));

      const divider = document.createElement('div');
      divider.className = 'sidebar-section-divider';
      const dividerText = document.createElement('p');
      dividerText.className = 'sidebar-section-divider-text';
      dividerText.textContent = 'You chose to go deep on these areas today. The rest are standing by — progress compounds when you focus.';
      divider.appendChild(dividerText);
      sidebarCategoriesEl.appendChild(divider);

      const restHeader = document.createElement('div');
      restHeader.className = 'sidebar-section-header sidebar-section-header--muted';
      restHeader.textContent = 'Other areas';
      sidebarCategoriesEl.appendChild(restHeader);

      restCats.forEach(cat => sidebarCategoriesEl.appendChild(buildCard(cat, false)));
    } else {
      // No focus set — gentle hint under the header, then all cards
      const noneHint = document.createElement('p');
      noneHint.className = 'sidebar-focus-none';
      noneHint.textContent = 'None set — tap the pencil to pick up to 3 areas.';
      sidebarCategoriesEl.appendChild(noneHint);
      [...liveCats].sort((a, b) => (a.totalHours || 0) - (b.totalHours || 0))
        .forEach(cat => sidebarCategoriesEl.appendChild(buildCard(cat, false)));
    }

    // ── Archived areas — collapsed by default; hours kept, one click to restore ──
    if (archivedCats.length > 0) {
      const archHeader = document.createElement('button');
      archHeader.className = 'sidebar-section-header sidebar-section-header--muted sidebar-archived-toggle';
      archHeader.innerHTML = `<span>Archived (${archivedCats.length})</span><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor" style="transform: rotate(${archivedSectionOpen ? 180 : 0}deg)"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>`;
      archHeader.addEventListener('click', () => {
        archivedSectionOpen = !archivedSectionOpen;
        renderSidebar();
      });
      sidebarCategoriesEl.appendChild(archHeader);

      if (archivedSectionOpen) archivedCats.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'sidebar-archived-row';

        function renderNormal() {
          row.innerHTML = '';
          row.classList.remove('sidebar-archived-row--confirm');
          const label = document.createElement('span');
          label.className = 'sidebar-archived-label';
          label.textContent = `${cat.emoji || '●'} ${cat.name}`;
          const hours = document.createElement('span');
          hours.className = 'sidebar-archived-hours';
          hours.textContent = (cat.totalHours || 0) > 0 ? `${(cat.totalHours).toFixed(0)}h` : '';
          const restoreBtn = document.createElement('button');
          restoreBtn.className = 'sidebar-restore-btn';
          restoreBtn.textContent = 'Restore';
          restoreBtn.title = 'Bring this area back into daily view';
          restoreBtn.addEventListener('click', () => restoreCategory(cat.id));
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'sidebar-archived-delete-btn';
          deleteBtn.title = 'Delete forever';
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>';
          deleteBtn.addEventListener('click', renderConfirm);
          row.append(label, hours, restoreBtn, deleteBtn);
        }

        // Inline confirm — delete is the one destructive action here.
        function renderConfirm() {
          row.innerHTML = '';
          row.classList.add('sidebar-archived-row--confirm');
          const q = document.createElement('span');
          q.className = 'sidebar-archived-label';
          q.textContent = `Delete ${cat.name} forever? Past entries keep its name.`;
          const yesBtn = document.createElement('button');
          yesBtn.className = 'sidebar-restore-btn sidebar-delete-confirm-btn';
          yesBtn.textContent = 'Delete';
          yesBtn.addEventListener('click', () => deleteCategory(cat.id));
          const noBtn = document.createElement('button');
          noBtn.className = 'sidebar-restore-btn';
          noBtn.textContent = 'Keep';
          noBtn.addEventListener('click', renderNormal);
          const btnRow = document.createElement('div');
          btnRow.className = 'sidebar-archived-confirm-actions';
          btnRow.append(yesBtn, noBtn);
          row.append(q, btnRow);
        }

        renderNormal();
        sidebarCategoriesEl.appendChild(row);
      });
    }
  }

  // =========================================================
  // INLINE CATEGORY EDIT — replaces card top row on pencil click
  // =========================================================
  function openCatInlineEdit(cat, card, top, editBtn) {
    // Swap the top row for an edit row
    const editRow = document.createElement('div');
    editRow.className = 'sidebar-cat-edit-row';

    // Emoji button — clicking cycles through a small inline emoji picker
    const emojiBtn = document.createElement('button');
    emojiBtn.className = 'sidebar-cat-edit-emoji';
    emojiBtn.textContent = cat.emoji || '●';
    emojiBtn.title = 'Change emoji';

    // Simple inline emoji grid popover
    emojiBtn.addEventListener('click', e => {
      e.stopPropagation();
      const existing = document.querySelector('.sidebar-emoji-picker-pop');
      if (existing) { existing.remove(); return; }
      const EMOJIS = ['💪','💼','❤️','🧹','⚡','🎯','📚','🎨','💡','🏃','🧘','💰','🌱','🔧','🎵','✈️','🍎','🧠','🤝','🏠'];
      const pop = document.createElement('div');
      pop.className = 'sidebar-emoji-picker-pop';
      EMOJIS.forEach(em => {
        const btn = document.createElement('button');
        btn.className = 'sidebar-emoji-pick-btn';
        btn.textContent = em;
        btn.addEventListener('click', e => {
          e.stopPropagation();
          emojiBtn.textContent = em;
          pop.remove();
        });
        pop.appendChild(btn);
      });
      document.body.appendChild(pop);
      const r = emojiBtn.getBoundingClientRect();
      pop.style.left = r.left + 'px';
      pop.style.top = (r.bottom + 6) + 'px';
      setTimeout(() => {
        const close = ev => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
        document.addEventListener('pointerdown', close, true);
      }, 50);
    });

    const nameInput = document.createElement('input');
    nameInput.className = 'sidebar-cat-edit-input';
    nameInput.value = cat.name;
    nameInput.maxLength = 30;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary sidebar-cat-edit-save';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost sidebar-cat-edit-cancel';
    cancelBtn.textContent = '✕';

    // Color dot — shows current color, click to open popover
    let editColor = cat.color || emojiToColor(cat.emoji);
    const colorDot = document.createElement('button');
    colorDot.className = 'sidebar-color-dot';
    colorDot.style.background = editColor;
    colorDot.title = 'Change color';

    editRow.append(emojiBtn, nameInput, colorDot, saveBtn, cancelBtn);

    // Popover — shown when colorDot is clicked
    let colorPop = null;
    function openColorPop() {
      if (colorPop) { colorPop.remove(); colorPop = null; return; }
      colorPop = document.createElement('div');
      colorPop.className = 'sidebar-color-pop';
      // Deleted areas free their color; archived ones keep holding it
      const usedByOthers = new Set(categories.filter(c => c.id !== cat.id && !c.deleted).map(c => c.color).filter(Boolean));
      COLOR_SWATCHES.forEach(color => {
        const taken = usedByOthers.has(color);
        const sw = document.createElement('button');
        sw.className = 'cat-modal-swatch sidebar-swatch-sm' + (color === editColor ? ' selected' : '') + (taken ? ' swatch-taken' : '');
        sw.style.background = color;
        sw.title = taken ? 'Already used by another life area' : '';
        sw.disabled = taken;
        sw.addEventListener('click', e => {
          e.stopPropagation();
          if (taken) return;
          editColor = color;
          colorDot.style.background = color;
          colorPop.remove(); colorPop = null;
          // Also sync if emoji just changed
          const suggested = emojiToColor(emojiBtn.textContent.trim());
          if (color !== suggested) colorDot.title = 'Change color'; // user override
        });
        colorPop.appendChild(sw);
      });
      // Custom color picker
      appendColorPickerSwatch(colorPop, editColor, hex => {
        editColor = hex;
        colorDot.style.background = hex;
        // Close the palette popover after OK — color is committed
        if (colorPop) { colorPop.remove(); colorPop = null; }
      }, 'sidebar-swatch-sm');

      colorDot.insertAdjacentElement('afterend', colorPop);
      setTimeout(() => {
        const close = ev => {
          if (colorPop && !colorPop.contains(ev.target) && ev.target !== colorDot) {
            colorPop.remove(); colorPop = null;
            document.removeEventListener('pointerdown', close, true);
          }
        };
        document.addEventListener('pointerdown', close, true);
      }, 50);
    }
    colorDot.addEventListener('click', e => { e.stopPropagation(); openColorPop(); });

    // Auto-update color dot when emoji changes in the picker
    const emojiObserver = new MutationObserver(() => {
      const suggested = emojiToColor(emojiBtn.textContent.trim());
      editColor = suggested;
      colorDot.style.background = suggested;
      if (colorPop) { colorPop.remove(); colorPop = null; }
    });
    emojiObserver.observe(emojiBtn, { childList: true, characterData: true, subtree: true });

    function confirmEdit() {
      const newName = nameInput.value.trim();
      if (!newName) { nameInput.focus(); return; }
      emojiObserver.disconnect();
      cat.emoji = emojiBtn.textContent;
      cat.name = newName;
      cat.color = editColor;
      saveCategories();
      renderSidebar();
    }

    function cancelEdit() {
      emojiObserver.disconnect();
      if (colorPop) { colorPop.remove(); colorPop = null; }
      editRow.replaceWith(top);
      editBtn.style.display = '';
    }

    saveBtn.addEventListener('click', e => { e.stopPropagation(); confirmEdit(); });
    cancelBtn.addEventListener('click', e => { e.stopPropagation(); cancelEdit(); });
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    });

    top.replaceWith(editRow);
    editBtn.style.display = 'none';
    nameInput.focus();
    nameInput.select();
  }

  // =========================================================
  // QUICK-ADD MODAL (opened from sidebar emoji buttons)
  // =========================================================
  let activeQuickAdd = null;

  function closeQuickAdd() {
    if (activeQuickAdd) { activeQuickAdd.remove(); activeQuickAdd = null; }
  }

  function openQuickAddModal(cat) {
    closeQuickAdd();
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay quick-add-modal-overlay';
    activeQuickAdd = overlay;

    const modal = document.createElement('div');
    modal.className = 'quick-add-modal';

    // Header with category badge
    const header = document.createElement('div');
    header.className = 'quick-add-header';

    const badge = document.createElement('div');
    badge.className = 'quick-add-cat-badge';
    badge.textContent = cat.emoji || '●';
    badge.style.background = cat.color + '22';
    badge.style.border = `1.5px solid ${cat.color}44`;

    const titleBlock = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'quick-add-title';
    title.textContent = `Add to ${cat.name}`;
    const subtitle = document.createElement('div');
    subtitle.className = 'quick-add-subtitle';
    subtitle.textContent = 'Goes straight to Today\'s Top 5 or Backlog';
    titleBlock.append(title, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cat-modal-close';
    closeBtn.style.marginLeft = 'auto';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', closeQuickAdd);
    header.append(badge, titleBlock, closeBtn);

    // Task name input
    const inputRow = document.createElement('div');
    inputRow.className = 'quick-add-input-row';
    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.className = 'quick-add-input';
    taskInput.placeholder = 'What do you want to work on?';
    taskInput.maxLength = 100;
    inputRow.appendChild(taskInput);

    // Destination: Top 5 or Backlog
    const destRow = document.createElement('div');
    destRow.className = 'quick-add-dest-row';
    let dest = 'top5';

    const makeChip = (label, icon, value) => {
      const chip = document.createElement('button');
      chip.className = 'quick-add-dest-chip' + (value === dest ? ' active' : '');
      chip.innerHTML = `${icon} ${label}`;
      chip.addEventListener('click', () => {
        dest = value;
        destRow.querySelectorAll('.quick-add-dest-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
      return chip;
    };
    destRow.append(
      makeChip("Today's Top 5", '🎯', 'top5'),
      makeChip('Backlog', '🗂️', 'backlog')
    );

    // Repeatable toggle
    const repeatRow = document.createElement('div');
    repeatRow.className = 'quick-add-repeat-row';
    const repeatLabelBlock = document.createElement('label');
    repeatLabelBlock.className = 'quick-add-repeat-label';
    repeatLabelBlock.htmlFor = 'quick-repeat-toggle';
    repeatLabelBlock.innerHTML = 'Repeatable task <span class="quick-add-repeat-sub">Carries forward to tomorrow if not done</span>';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'quick-repeat-toggle';
    const toggleTrack = document.createElement('span');
    toggleTrack.className = 'toggle-track';
    toggleSwitch.append(toggleInput, toggleTrack);
    repeatRow.append(repeatLabelBlock, toggleSwitch);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'quick-add-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeQuickAdd);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = 'Add Task';
    actions.append(cancelBtn, addBtn);

    function confirmAdd() {
      const name = taskInput.value.trim();
      if (!name) { taskInput.focus({ preventScroll: true }); return; }
      const repeatable = toggleInput.checked;

      if (dest === 'top5' && getActiveGoals().length < MAX_GOALS) {
        state.goals.push({ name, hours: 0, progress: 0, category: cat.id, repeatable });
        saveState(); render();
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
      } else {
        // Goes to backlog if Top 5 is full or backlog was chosen
        backlog.push({ name, category: cat.id, repeatable });
        saveBacklog(); renderBacklog();
        if (dest === 'top5') {
          // Let user know it went to backlog
          subtitle.textContent = 'Top 5 is full — added to Backlog instead';
          subtitle.style.color = '#c87d20';
          setTimeout(closeQuickAdd, 1200);
          return;
        }
      }
      closeQuickAdd();
    }

    addBtn.addEventListener('click', confirmAdd);
    taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); } if (e.key === 'Escape') closeQuickAdd(); });

    modal.append(header, inputRow, destRow, repeatRow, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeQuickAdd(); });
    setTimeout(() => taskInput.focus({ preventScroll: true }), 60);
  }

  // =========================================================
  // CATEGORY PICKER (emoji-only pill popover)
  // =========================================================
  let activePicker = null;

  function closePicker() {
    if (activePicker) { activePicker.remove(); activePicker = null; }
    document.removeEventListener('pointerdown', onPickerOutsideClick, true);
  }

  function onPickerOutsideClick(e) {
    if (activePicker && !activePicker.contains(e.target)) closePicker();
    // Don't close if clicking inside the new-area modal
    if (e.target.closest && e.target.closest('.cat-modal-overlay')) return;
  }


  // =========================================================
  // NEW AREA MODAL — full splash dialog
  // =========================================================
  let activeModal = null;

  function closeModal() {
    if (activeModal) { activeModal.remove(); activeModal = null; }
  }

  function openNewCategoryModal(onSelect) {
    closeModal();

    const DEFAULT_EMOJI = '🌟';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cat-modal-overlay';
    activeModal = overlay;

    const modal = document.createElement('div');
    modal.className = 'cat-modal';

    // Header
    const mHeader = document.createElement('div');
    mHeader.className = 'cat-modal-header';
    const mTitle = document.createElement('h2');
    mTitle.className = 'cat-modal-title';
    mTitle.textContent = 'New Life Area';
    const mClose = document.createElement('button');
    mClose.className = 'cat-modal-close';
    mClose.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    mClose.addEventListener('click', closeModal);
    mHeader.append(mTitle, mClose);

    // Emoji picker row
    const emojiSection = document.createElement('div');
    emojiSection.className = 'cat-modal-section';
    const emojiLabel = document.createElement('label');
    emojiLabel.className = 'cat-modal-label';
    emojiLabel.textContent = 'Choose an emoji';

    // Big emoji display button
    const emojiDisplay = document.createElement('button');
    emojiDisplay.className = 'cat-modal-emoji-display';
    emojiDisplay.textContent = DEFAULT_EMOJI;
    emojiDisplay.title = 'Click to pick an emoji';
    emojiDisplay.type = 'button';

    // Hidden text input with inputmode=emoji — triggers emoji keyboard on mobile,
    // and on macOS/Windows the user can use Ctrl+Cmd+Space / Win+. shortcuts
    const emojiInput = document.createElement('input');
    emojiInput.type = 'text';
    emojiInput.setAttribute('inputmode', 'emoji');
    emojiInput.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;width:1px;height:1px;pointer-events:none;font-size:16px;';
    emojiInput.maxLength = 8;
    document.body.appendChild(emojiInput);

    const emojiHint = document.createElement('p');
    emojiHint.className = 'cat-modal-emoji-hint';
    // Platform hint
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    const isWin = /Win/.test(navigator.userAgent);
    emojiHint.textContent = isMac
      ? 'Click the emoji, then press Ctrl+Cmd+Space to open the emoji picker'
      : isWin
        ? 'Click the emoji, then press Win+. (period) to open the emoji picker'
        : 'Click the emoji and type one, or paste from your emoji keyboard';

    emojiDisplay.addEventListener('click', () => {
      emojiInput.value = '';
      emojiInput.focus({ preventScroll: true });
      // On macOS, try triggering emoji picker via keyboard simulation hint
    });

    emojiInput.addEventListener('input', () => {
      const raw = emojiInput.value;
      const chars = [...raw];
      if (chars.length > 0) {
        const emoji = chars.slice(-2).join('');
        emojiDisplay.textContent = emoji;
        emojiInput.value = '';
        // Auto-update color to match new emoji
        selectedColor = emojiToColor(emoji);
        buildNewCatSwatches();
      }
    });

    emojiSection.append(emojiLabel, emojiDisplay, emojiHint);

    // Name field
    const nameSection = document.createElement('div');
    nameSection.className = 'cat-modal-section';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'cat-modal-label';
    nameLabel.textContent = 'Name this area';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cat-modal-input';
    nameInput.placeholder = 'e.g. Mountain Biking, Music, Reading…';
    nameInput.maxLength = 30;
    nameSection.append(nameLabel, nameInput);

    // Color swatches
    const colorSection = document.createElement('div');
    colorSection.className = 'cat-modal-section';
    const colorLabel = document.createElement('label');
    colorLabel.className = 'cat-modal-label';
    colorLabel.textContent = 'Pick a color';
    const swatchRow = document.createElement('div');
    swatchRow.className = 'cat-modal-swatches';
    let selectedColor = emojiToColor(DEFAULT_EMOJI);

    const usedColors = new Set(categories.filter(c => !c.deleted).map(c => c.color).filter(Boolean));

    function buildNewCatSwatches() {
      swatchRow.innerHTML = '';
      COLOR_SWATCHES.forEach(color => {
        const taken = usedColors.has(color);
        const swatch = document.createElement('button');
        swatch.className = 'cat-modal-swatch' + (color === selectedColor ? ' selected' : '') + (taken ? ' swatch-taken' : '');
        swatch.style.background = color;
        swatch.title = taken ? 'Already used by another life area' : '';
        swatch.disabled = taken && color !== selectedColor;
        swatch.addEventListener('click', () => {
          if (taken) return;
          selectedColor = color;
          swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
          swatch.classList.add('selected');
        });
        swatchRow.appendChild(swatch);
      });
      // Custom color picker — on OK, inject/update a swatch and select it
      appendColorPickerSwatch(swatchRow, selectedColor, hex => {
        selectedColor = hex;
        swatchRow.querySelectorAll('.cat-modal-swatch:not(.swatch-rainbow):not(.swatch-custom)').forEach(s => s.classList.remove('selected'));
        let customSw = swatchRow.querySelector('.swatch-custom');
        if (!customSw) {
          customSw = document.createElement('button');
          customSw.className = 'cat-modal-swatch swatch-custom';
          customSw.title = 'Your custom color';
          customSw.addEventListener('click', () => {
            selectedColor = customSw.style.background; // always read current value
            swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
            customSw.classList.add('selected');
          });
          swatchRow.querySelector('.swatch-rainbow').insertAdjacentElement('beforebegin', customSw);
        }
        customSw.style.background = hex;
        swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
        customSw.classList.add('selected');
      });
    }
    buildNewCatSwatches();

    colorSection.append(colorLabel, swatchRow);

    // Vision note
    const visionSection = document.createElement('div');
    visionSection.className = 'cat-modal-section';
    const visionLabel = document.createElement('label');
    visionLabel.className = 'cat-modal-label';
    visionLabel.textContent = 'Your vision for this area';
    const visionHint = document.createElement('p');
    visionHint.className = 'cat-modal-hint';
    visionHint.textContent = 'Where do you see yourself when this area is thriving? What does success feel like?';
    const visionInput = document.createElement('textarea');
    visionInput.className = 'cat-modal-textarea';
    visionInput.placeholder = 'In 3 years I want to…';
    visionInput.rows = 3;
    visionSection.append(visionLabel, visionHint, visionInput);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'cat-modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);
    const createBtn = document.createElement('button');
    createBtn.className = 'btn btn-primary';
    createBtn.textContent = 'Create Life Area';
    actions.append(cancelBtn, createBtn);

    function confirmCreate() {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus({ preventScroll: true }); nameInput.style.borderColor = '#e63946'; return; }
      const id = 'custom_' + Date.now();
      const emoji = emojiDisplay.textContent.trim() || DEFAULT_EMOJI;
      const newCat = { id, name, emoji, color: selectedColor, totalHours: 0, vision: visionInput.value.trim() };
      categories.push(newCat);
      saveCategories();
      emojiInput.remove();
      closeModal();
      renderSidebar();
      if (onSelect) onSelect(id);
    }

    createBtn.addEventListener('click', confirmCreate);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmCreate(); } });

    modal.append(mHeader, emojiSection, nameSection, colorSection, visionSection, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', e => {
      if (e.target === overlay) { emojiInput.remove(); closeModal(); }
    });

    setTimeout(() => nameInput.focus({ preventScroll: true }), 80);
  }

  // Build the category pill — emoji only, opens context popover (category + repeatable)
  // getRepeatable / setRepeatable are optional accessors for the repeatable state
  function createCategoryPill(catId, onCategorySelect, getRepeatable, setRepeatable) {
    let currentCatId = catId || 'general';
    const cat = getCategoryById(currentCatId);
    const pill = document.createElement('button');
    pill.className = 'cat-pill';
    pill.title = cat.name;
    pill.style.setProperty('--pill-color', cat.color);

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'cat-pill-emoji';
    emojiSpan.textContent = cat.emoji || '●';
    pill.appendChild(emojiSpan);

    pill.addEventListener('click', e => {
      e.stopPropagation();
      if (getRepeatable !== undefined) {
        // Full context popover: category + repeatable
        openTaskContextPicker(pill, currentCatId, getRepeatable(), (newCatId, newRepeatable) => {
          currentCatId = newCatId;
          onCategorySelect(newCatId);
          setRepeatable(newRepeatable);
          const newCat = getCategoryById(newCatId);
          pill.title = newCat.name;
          pill.style.setProperty('--pill-color', newCat.color);
          emojiSpan.textContent = newCat.emoji || '●';
          renderSidebar();
        });
      } else {
        // Category-only: same unified modal as Top 5, repeatable row hidden.
        openTaskContextPicker(pill, currentCatId, false, newCatId => {
          currentCatId = newCatId;
          onCategorySelect(newCatId);
          const newCat = getCategoryById(newCatId);
          pill.title = newCat.name;
          pill.style.setProperty('--pill-color', newCat.color);
          emojiSpan.textContent = newCat.emoji || '●';
          renderSidebar();
        }, { showRepeatable: false });
      }
    });

    return pill;
  }

  // Context popover shown when clicking the pill on an existing task row
  // Shows category list + repeatable toggle in one floating panel
  // Unified category/context modal. Used by every task-like row (Top 5 goals,
  // backlog, distractions). Pass opts.showRepeatable === false to get a
  // category-only picker (hides the repeatable toggle) — keeps the backlog and
  // distraction pickers visually consistent with Top 5.
  function openTaskContextPicker(anchorEl, currentCatId, currentRepeatable, onConfirm, opts = {}) {
    const showRepeatable = opts.showRepeatable !== false;
    closePicker();
    closeModal();

    let selectedCatId = currentCatId || 'general';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay task-context-modal-overlay';
    activeModal = overlay;

    const modal = document.createElement('div');
    modal.className = 'task-context-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'task-context-modal-header';
    const title = document.createElement('h3');
    title.className = 'task-context-modal-title';
    title.textContent = showRepeatable ? 'Task Settings' : 'Life Area';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cat-modal-close';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', closeModal);
    header.append(title, closeBtn);
    modal.appendChild(header);

    // Life Area section label — only when the repeatable section follows it,
    // otherwise the modal title already says "Life Area".
    if (showRepeatable) {
      const catLabel = document.createElement('div');
      catLabel.className = 'task-context-section-label';
      catLabel.textContent = 'Life Area';
      modal.appendChild(catLabel);
    }

    // Category list
    const list = document.createElement('div');
    list.className = 'cat-picker-list task-context-cat-list';

    activeCategories().forEach(cat => {
      const opt = document.createElement('button');
      opt.className = 'cat-picker-option' + (cat.id === selectedCatId ? ' selected' : '');
      opt.dataset.catId = cat.id;
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'cat-picker-emoji';
      emojiSpan.textContent = cat.emoji || '●';
      emojiSpan.style.color = cat.color;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = cat.name;
      opt.append(emojiSpan, nameSpan);
      opt.addEventListener('click', () => {
        selectedCatId = cat.id;
        list.querySelectorAll('.cat-picker-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
      list.appendChild(opt);
    });

    const newCatBtn = document.createElement('button');
    newCatBtn.className = 'cat-picker-new';
    newCatBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"/></svg> New area…';
    newCatBtn.addEventListener('click', () => { closeModal(); openNewCategoryModal(newId => { selectedCatId = newId; }); });
    list.appendChild(newCatBtn);
    modal.appendChild(list);

    // Repeatable toggle row — only in full "Task Settings" mode.
    let toggleInput = null;
    if (showRepeatable) {
      const divider = document.createElement('div');
      divider.className = 'task-context-divider';
      modal.appendChild(divider);

      const repeatRow = document.createElement('div');
      repeatRow.className = 'context-picker-repeat-row';
      const repeatLabel = document.createElement('label');
      repeatLabel.className = 'context-picker-repeat-label';
      repeatLabel.htmlFor = 'ctx-repeat-toggle';
      repeatLabel.innerHTML = '↻ Repeatable <span>carries forward if not done</span>';

      const toggleSwitch = document.createElement('label');
      toggleSwitch.className = 'toggle-switch';
      toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.id = 'ctx-repeat-toggle';
      toggleInput.checked = currentRepeatable;
      const toggleTrack = document.createElement('span');
      toggleTrack.className = 'toggle-track';
      toggleSwitch.append(toggleInput, toggleTrack);
      repeatRow.append(repeatLabel, toggleSwitch);
      modal.appendChild(repeatRow);
    }

    // Done button
    const footer = document.createElement('div');
    footer.className = 'task-context-modal-footer';
    const doneBtn = document.createElement('button');
    doneBtn.className = 'cat-picker-done-btn';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
      closeModal();
      onConfirm(selectedCatId, toggleInput ? toggleInput.checked : undefined);
    });
    footer.appendChild(doneBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeModal(); });

    // Scroll selected into view
    setTimeout(() => {
      const sel = list.querySelector('.cat-picker-option.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }, 50);
  }

  // =========================================================
  // TASK DETAIL MODAL — used by the + button (new task with category + repeatable)
  // =========================================================
  function openTaskDetailModal(initial, onConfirm) {
    closeModal(); closeQuickAdd();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay quick-add-modal-overlay';
    activeModal = overlay;

    const modal = document.createElement('div');
    modal.className = 'quick-add-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'quick-add-header';
    const titleEl = document.createElement('div');
    titleEl.className = 'quick-add-title';
    titleEl.textContent = 'Add to Today\'s Top 5';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cat-modal-close';
    closeBtn.style.marginLeft = 'auto';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', closeModal);
    header.append(titleEl, closeBtn);

    // Task input
    const inputRow = document.createElement('div');
    inputRow.className = 'quick-add-input-row';
    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.className = 'quick-add-input';
    taskInput.placeholder = 'What do you want to work on?';
    taskInput.maxLength = 100;
    taskInput.value = initial.name || '';
    inputRow.appendChild(taskInput);

    // Category selector — pill grid
    const catSection = document.createElement('div');
    catSection.className = 'task-modal-cat-section';
    const catLabel = document.createElement('div');
    catLabel.className = 'cat-modal-label';
    catLabel.textContent = 'Life Area';
    const catGrid = document.createElement('div');
    catGrid.className = 'task-modal-cat-grid';
    let selectedCatId = initial.category || 'general';

    function renderCatGrid() {
      catGrid.innerHTML = '';
      activeCategories().forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'task-modal-cat-chip' + (cat.id === selectedCatId ? ' selected' : '');
        chip.style.setProperty('--chip-color', cat.color);
        chip.innerHTML = `<span>${cat.emoji || '●'}</span><span>${cat.name}</span>`;
        chip.addEventListener('click', () => {
          selectedCatId = cat.id;
          catGrid.querySelectorAll('.task-modal-cat-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        });
        catGrid.appendChild(chip);
      });
      // + New area chip
      const newChip = document.createElement('button');
      newChip.className = 'task-modal-cat-chip task-modal-cat-new';
      newChip.textContent = '+ New';
      newChip.addEventListener('click', () => {
        closeModal();
        openNewCategoryModal(newId => {
          // Re-open this modal with the new category selected
          openTaskDetailModal({ name: taskInput.value, category: newId, repeatable: toggleInput.checked }, onConfirm);
        });
      });
      catGrid.appendChild(newChip);
    }
    renderCatGrid();
    catSection.append(catLabel, catGrid);

    // Repeatable toggle
    const repeatRow = document.createElement('div');
    repeatRow.className = 'quick-add-repeat-row';
    const repeatLabelBlock = document.createElement('label');
    repeatLabelBlock.className = 'quick-add-repeat-label';
    repeatLabelBlock.htmlFor = 'detail-repeat-toggle';
    repeatLabelBlock.innerHTML = 'Repeatable task <span class="quick-add-repeat-sub">Carries forward to tomorrow if not done</span>';
    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'detail-repeat-toggle';
    toggleInput.checked = initial.repeatable || false;
    const toggleTrack = document.createElement('span');
    toggleTrack.className = 'toggle-track';
    toggleSwitch.append(toggleInput, toggleTrack);
    repeatRow.append(repeatLabelBlock, toggleSwitch);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'cat-modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = 'Add Task';
    addBtn.addEventListener('click', () => {
      const name = taskInput.value.trim();
      if (!name) { taskInput.focus({ preventScroll: true }); return; }
      closeModal();
      onConfirm({ name, category: selectedCatId, repeatable: toggleInput.checked });
    });
    actions.append(cancelBtn, addBtn);

    taskInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
      if (e.key === 'Escape') closeModal();
    });

    modal.append(header, inputRow, catSection, repeatRow, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeModal(); });
    setTimeout(() => { taskInput.focus({ preventScroll: true }); taskInput.setSelectionRange(taskInput.value.length, taskInput.value.length); }, 60);
  }

  // =========================================================
  // DATE / STATE MANAGEMENT
  // =========================================================
  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDefaultState() {
    return { date: getTodayString(), goals: [], distractions: [], successes: [], failures: [], quickDone: [], focusSessions: [] };
  }

  // Permanently delete a goal by index — scrubs it from state.goals AND _carryover so
  // it never resurfaces in the day transition modal or anywhere else.
  function permanentlyDeleteGoal(index) {
    const goal = state.goals[index];
    undoStack.push({ type: 'goal', item: goal, index });
    state.goals.splice(index, 1);
    // Also remove from _carryover (built at day-rollover, not updated on subsequent deletes)
    if (state._carryover && goal) {
      state._carryover = state._carryover.filter(g => g.name !== goal.name);
    }
    // Also remove from _prevDayForModal so the summary modal doesn't show it
    if (_prevDayForModal && _prevDayForModal.goals && goal) {
      _prevDayForModal.goals = _prevDayForModal.goals.filter(g => g.name !== goal.name);
    }
    saveState();
    render();
  }

  function loadState() {
    try {
      const raw = storageGet(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        p.successes = p.successes || [];
        p.failures = p.failures || [];
        p.quickDone = p.quickDone || [];
        if (p.date === getTodayString()) return p;
        archiveDay(p);
        _prevDayForModal = p;
        const ns = getDefaultState();
        ns._carryover = p.goals
          ? p.goals.map(g => {
              const done = (g.progress || 0) >= 100;
              if (done && !g.repeatable) return null; // completed non-repeatable: gone
              return {
                name: g.name, hours: 0,
                progress: done ? 0 : (g.progress || 0), // reset repeatables to fresh
                // Cumulative across multi-day carries — earlier days' hours
                // must not vanish from the "Xh prev" badge on each rollover.
                prevHours: (g.prevHours || 0) + (g.hours || 0),
                category: g.category || null, repeatable: g.repeatable || false
              };
            }).filter(Boolean)
          : [];
        return ns;
      }
    } catch (e) {}
    return getDefaultState();
  }

  function loadBacklog() {
    try {
      const raw = storageGet(BACKLOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveBacklog() {
    syncBacklogToStore();
    saveStore();
    storageSet(BACKLOG_KEY, JSON.stringify(backlog));
  }

  function archiveDay(ds) {
    if (!ds || !ds.date) return;
    try {
      const h = loadHistory();
      if (!h.find(d => d.date === ds.date)) {
        h.push({ date: ds.date, goals: ds.goals || [], distractions: ds.distractions || [], successes: ds.successes || [], failures: ds.failures || [] });
        while (h.length > 30) h.shift();
        storageSet(HISTORY_KEY, JSON.stringify(h));
      }
    } catch (e) {}
  }

  function loadHistory() {
    try { const r = storageGet(HISTORY_KEY); return r ? JSON.parse(r) : []; } catch (e) { return []; }
  }

  function saveState() {
    // Sync today's goals/distractions/quickDone views back into the store
    // (source of truth), then persist both. Legacy key is still written so the
    // old backup stays current too.
    syncDayToStore(state.date);
    syncSessionsToStore();
    saveStore();
    storageSet(STORAGE_KEY, JSON.stringify(state));
  }

  // =========================================================
  // CARRYOVER
  // =========================================================
  function showCarryoverIfNeeded() {
    if (!state._carryover || state._carryover.length === 0) {
      if (carryoverBanner) carryoverBanner.classList.add('hidden');
      return;
    }
    carryoverList.innerHTML = '';
    state._carryover.forEach(g => {
      const li = document.createElement('li');
      const hrs = g.prevHours > 0 ? ` — ${g.prevHours}h invested` : '';
      li.textContent = `${g.name} (${g.progress}% done${hrs})`;
      carryoverList.appendChild(li);
    });
    carryoverBanner.classList.remove('hidden');
  }

  if (carryoverAccept) carryoverAccept.addEventListener('click', () => {
    (state._carryover || []).forEach(g => {
      if (state.goals.length < MAX_GOALS)
        state.goals.push({ name: g.name, hours: 0, progress: g.progress, prevHours: g.prevHours || 0, category: g.category || null, repeatable: g.repeatable || false });
    });
    delete state._carryover;
    saveState();
    carryoverBanner.classList.add('hidden');
    render();
  });

  if (carryoverDismiss) carryoverDismiss.addEventListener('click', () => {
    delete state._carryover;
    carryoverBanner.classList.add('hidden');
  });

  if (storageWarning && !storageAvailable) storageWarning.classList.remove('hidden');

  // =========================================================
  // INLINE EDITING
  // =========================================================
  function makeEditable(spanEl, onSave) {
    spanEl.style.cursor = 'pointer';
    spanEl.title = 'Click to edit';
    spanEl.addEventListener('click', () => {
      if (spanEl.querySelector('input')) return;
      const current = spanEl.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'inline-edit-input';
      input.value = current;
      input.maxLength = 200;
      spanEl.textContent = '';
      spanEl.appendChild(input);
      input.focus();
      input.select();

      function finish() {
        const newVal = input.value.trim() || current;
        spanEl.textContent = newVal;
        onSave(newVal);
      }
      input.addEventListener('blur', finish);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  }

  // =========================================================
  // PROGRESS SLIDER FILL
  // =========================================================
  function updateSliderFill(slider) {
    const val = slider.value;
    const pct = ((val - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, #2D6A4F 0%, #40916C ${pct}%, rgba(45,106,79,0.1) ${pct}%)`;
  }

  // =========================================================
  // RENDERING
  // =========================================================
  function render() {
    renderGoals();
    renderDistractions();
    renderJournal();
    renderSummary();
    renderBacklog();
    renderDone();
    updateAddButtonVisibility();
    renderSidebar();
    applyBlobColors();
  }

  // Split goals into active (< 100%) and completed (= 100%)
  function getActiveGoals() {
    return state.goals.filter(g => (g.progress || 0) < 100);
  }
  function getCompletedGoals() {
    return state.goals.filter(g => (g.progress || 0) >= 100);
  }

  function renderGoals() {
    goalsListEl.innerHTML = '';
    const active = getActiveGoals();
    active.forEach((goal, i) => {
      const realIndex = state.goals.indexOf(goal);
      goalsListEl.appendChild(createGoalElement(goal, realIndex, i + 1));
    });
  }

  function createGoalElement(goal, index, displayNumber) {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.dataset.goalIndex = index;

    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'task-drag-handle';
    dragHandle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,60ZM108,128a16,16,0,1,1-16-16A16,16,0,0,1,108,128Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,128ZM108,196a16,16,0,1,1-16-16A16,16,0,0,1,108,196Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,196Z"/></svg>';
    dragHandle.title = 'Drag to reorder';

    const number = document.createElement('span');
    number.className = 'task-number';
    number.textContent = displayNumber;

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = goal.name;
    makeEditable(name, newVal => { state.goals[index].name = newVal; saveState(); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => { permanentlyDeleteGoal(index); });

    const focusBtn = document.createElement('button');
    focusBtn.className = 'task-focus-btn';
    focusBtn.title = 'Focus on this task';
    focusBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-144a56,56,0,1,0,56,56A56.06,56.06,0,0,0,128,72Zm0,96a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg>';
    focusBtn.addEventListener('click', e => { e.stopPropagation(); openFocusModal(goal, index); });

    const trailing = [];
    if (goal.prevHours > 0) {
      const badge = document.createElement('span');
      badge.className = 'prev-hours-badge';
      badge.title = 'Hours invested in previous sessions';
      badge.textContent = `${goal.prevHours}h prev`;
      trailing.push(badge);
    }

    // Demote button — shown on all goals (fade-in on hover), not just fromBacklog
    const demoteBtn = document.createElement('button');
    demoteBtn.className = 'btn-demote' + (goal.fromBacklog ? '' : ' btn-demote-any');
    demoteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,149.66l-96,96a8,8,0,0,1-11.32,0l-96-96a8,8,0,0,1,11.32-11.32L120,226.69V40a8,8,0,0,1,16,0V226.69l82.34-88.35a8,8,0,0,1,11.32,11.32Z"/></svg> Backlog';
    demoteBtn.title = 'Move to backlog';
    demoteBtn.addEventListener('click', () => {
      const g = state.goals[index];
      backlog.push({ name: g.name, category: g.category || null, repeatable: g.repeatable || false });
      state.goals.splice(index, 1);
      saveState(); saveBacklog(); render(); renderSidebar();
    });
    trailing.push(demoteBtn);
    trailing.push(focusBtn);
    trailing.push(deleteBtn);
    topRow.append(dragHandle, number, name, ...trailing);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

    // Hours pill — clickable to edit inline, matches done-card badge style
    const hoursPill = document.createElement('span');
    hoursPill.className = 'goal-hours-pill';
    hoursPill.dataset.goalIndex = index;

    function renderHoursPill() {
      const h = state.goals[index].hours || 0;
      hoursPill.textContent = formatHours(h);
      hoursPill.classList.toggle('goal-hours-pill--empty', h === 0);
    }
    renderHoursPill();

    makeInlineHoursEditor(hoursPill, {
      getValue: () => state.goals[index].hours,
      onCommit: (v, prev, delta) => {
        state.goals[index].hours = v;
        saveState();
        accumulateCategoryHours(state.goals[index].category || 'general', delta);
        renderSummary();
      },
      render: renderHoursPill,
    });

    const pg = document.createElement('div'); pg.className = 'log-group';
    const pl = document.createElement('label'); pl.textContent = 'Progress';
    const ps = document.createElement('input');
    ps.type = 'range'; ps.className = 'progress-slider'; ps.min = '0'; ps.max = '100'; ps.step = '5';
    ps.value = goal.progress || 0;
    updateSliderFill(ps);
    const pv = document.createElement('span');
    pv.className = 'progress-value'; pv.textContent = (goal.progress || 0) + '%';
    ps.addEventListener('input', () => {
      const val = parseInt(ps.value);
      pv.textContent = val + '%';
      state.goals[index].progress = val;
      updateSliderFill(ps);
      saveState();
      if (val >= 100) {
        item.classList.add('task-completing');
        pulseBlobEvent('complete');
        setTimeout(() => render(), 350);
      } else {
        renderSummary();
      }
    });
    pg.append(pl, ps, pv);

    // Repeat icon — sits in log row, only visible when repeatable
    const repeatIcon = document.createElement('span');
    repeatIcon.className = 'task-repeat-badge' + (goal.repeatable ? '' : ' hidden');
    repeatIcon.title = 'Repeatable — carries forward if not done';
    repeatIcon.textContent = '↻';

    // Category + repeatable pill — opens context popover with both controls
    const catPill = createCategoryPill(
      goal.category,
      newId => { state.goals[index].category = newId; saveState(); renderSidebar(); },
      () => state.goals[index].repeatable || false,
      newVal => {
        state.goals[index].repeatable = newVal;
        saveState();
        repeatIcon.classList.toggle('hidden', !newVal);
      }
    );

    logRow.append(hoursPill, pg, repeatIcon, catPill);
    item.append(topRow, logRow);

    // Task-level drag & drop — reorder within Top 5, or drag out to backlog
    setupTaskDrag(item, goalsListEl, 'goal');

    return item;
  }

  // =========================================================
  // FOCUS MODAL
  // =========================================================

  const FOCUS_WISDOM = [
    "The anxiety of not starting is always worse than the discomfort of doing the work.",
    "Distraction isn't random — it's your mind flinching away from the discomfort of real work. Lean in.",
    "You don't need to feel ready. The leap is what creates the readiness.",
    "Stop waiting for motivation. Action creates motivation, not the other way around.",
    "The discomfort you feel when starting? That's the feeling of doing something that matters.",
    "You'll never clear the decks. The question is: are you doing what matters?",
    "Every time you choose your goal over a distraction, you're voting for the person you want to become.",
  ];

  const ENTRY_STATES = [
    { emoji: '😶', label: 'Hard to start',     prompt: 'What\'s making it hard to begin? Is it the task itself, or something else on your mind?' },
    { emoji: '💭', label: 'Mind is scattered',  prompt: 'What\'s pulling your attention? Sometimes naming it is enough to set it aside.' },
    { emoji: '😰', label: 'Feels too big',      prompt: 'What feels overwhelming about this? What would the smallest possible first step look like?' },
    { emoji: '📱', label: 'Tempted to scroll',  prompt: 'What are you avoiding by reaching for distraction? What feels uncomfortable about diving in?' },
    { emoji: '😴', label: 'Low energy',         prompt: 'Is this tiredness physical, mental, or emotional? What does your body actually need right now?' },
    { emoji: '✨', label: 'Actually ready',      prompt: null },
    { emoji: '✏️', label: 'Something else…',    prompt: 'Describe what\'s going on for you right now.', custom: true },
  ];

  const EXIT_STATES = [
    { emoji: '🎯', label: 'Got into flow',               prompt: 'What helped you get there? Capture it so you can recreate it.' },
    { emoji: '🌊', label: 'Some resistance, made progress', prompt: 'What created the friction? What kept you going despite it?' },
    { emoji: '🧱', label: 'Kept hitting walls',           prompt: 'What wall did you keep running into? Is it a blocker you can remove, or something to work around?' },
    { emoji: '🌀', label: 'Got distracted',               prompt: 'What pulled you away? No judgment — just notice it. What would you do differently next time?' },
    { emoji: '✏️', label: 'Something else…',              prompt: 'What was the experience like? Write whatever comes up.', custom: true },
  ];

  const LESSON_SUGGESTIONS = {
    'Hard to start':     'When it\'s hard to start, try committing to just 5 minutes.',
    'Mind is scattered': 'When my mind is scattered, writing down what\'s distracting me first helps.',
    'Feels too big':     'When a task feels too big, break it into one next action and start there.',
    'Tempted to scroll': 'When I want to scroll, putting my phone out of reach for 20 minutes works.',
    'Low energy':        'When my energy is low, a short walk before starting helps more than I expect.',
  };

  let activeFocusOverlay = null;

  // Attention check: after this much time with no interaction during a
  // running session, ask (gently) whether the user is still working.
  const FOCUS_IDLE_THRESHOLD_MS = 60 * 60 * 1000;
  const FOCUS_IDLE_CHECK_MS = 30 * 1000;
  const ULTRA_FOCUS_COLOR = '#D9A441'; // warm gold — ultra focus accent

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function openFocusModal(goal, index) {
    if (activeFocusOverlay) activeFocusOverlay.remove();

    const cat = getCategoryById(goal.category || 'general');
    const catColor = cat ? cat.color : '#2D6A4F';
    const catEmoji = cat ? cat.emoji : '⚡';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay focus-modal-overlay';
    activeFocusOverlay = overlay;

    const modal = document.createElement('div');
    modal.className = 'focus-modal';
    modal.style.setProperty('--focus-cat-color-rgb', hexToRgb(catColor));

    // Header
    const header = document.createElement('div');
    header.className = 'focus-modal-header';

    const catTag = document.createElement('span');
    catTag.className = 'focus-modal-cat-tag';
    catTag.style.setProperty('--cat-color', catColor);
    catTag.textContent = `${catEmoji} ${cat ? cat.name : 'General'}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'focus-modal-close';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', () => { overlay.remove(); activeFocusOverlay = null; });
    header.append(catTag, closeBtn);

    // Task name
    const taskName = document.createElement('h2');
    taskName.className = 'focus-modal-task-name';
    taskName.textContent = goal.name;

    // Hours pill — same pattern as goal card, clickable to edit
    const hoursDisplay = document.createElement('span');
    hoursDisplay.className = 'goal-hours-pill focus-modal-hours-pill';

    const updateHoursDisplay = () => {
      const h = state.goals[index] ? (state.goals[index].hours || 0) : (goal.hours || 0);
      if (hoursDisplay.querySelector('input')) return;
      hoursDisplay.textContent = h === 0 ? '+ hrs' : `${formatHours(h)} today`;
      hoursDisplay.classList.toggle('goal-hours-pill--empty', h === 0);
    };
    updateHoursDisplay();

    makeInlineHoursEditor(hoursDisplay, {
      getValue: () => state.goals[index].hours,
      onCommit: (v, prev, delta) => {
        state.goals[index].hours = v;
        saveState();
        accumulateCategoryHours(state.goals[index].category || 'general', delta);
        renderSummary();
        // Sync card pill too
        const cardPill = goalsListEl.querySelector(`.goal-hours-pill[data-goal-index="${index}"]`);
        if (cardPill && !cardPill.querySelector('input')) {
          cardPill.textContent = formatHours(v);
          cardPill.classList.toggle('goal-hours-pill--empty', v === 0);
        }
      },
      render: updateHoursDisplay,
    });

    // Quick time chips
    const chipsSection = document.createElement('div');
    chipsSection.className = 'focus-modal-chips-section';

    const chipsLabel = document.createElement('p');
    chipsLabel.className = 'focus-modal-chips-label';
    chipsLabel.textContent = 'Log time on this task';

    const chips = makeTimeAddPills(addedHours => {
      const prev = state.goals[index].hours || 0;
      const next = Math.min(24, prev + addedHours);
      const delta = next - prev;
      state.goals[index].hours = Math.round(next * 100) / 100;
      saveState();
      accumulateCategoryHours(state.goals[index].category || 'general', delta);
      renderSummary();
      updateHoursDisplay();
      // Sync the hours pill on the card without a full re-render
      const cardPill = goalsListEl.querySelector(`.goal-hours-pill[data-goal-index="${index}"]`);
      if (cardPill && !cardPill.querySelector('input')) {
        const h = state.goals[index].hours || 0;
        cardPill.textContent = formatHours(h);
        cardPill.classList.toggle('goal-hours-pill--empty', h === 0);
      }
    });

    chipsSection.append(chipsLabel, chips);

    // Divider
    const divider = document.createElement('div');
    divider.className = 'focus-modal-divider';

    // Focus mode button
    const focusModeBtn = document.createElement('button');
    focusModeBtn.className = 'focus-enter-btn';
    focusModeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-144a56,56,0,1,0,56,56A56.06,56.06,0,0,0,128,72Zm0,96a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg> Enter Focus Mode';
    focusModeBtn.addEventListener('click', () => {
      overlay.remove();
      activeFocusOverlay = null;
      openFullFocusMode(goal, index, catColor, catEmoji, cat);
    });

    modal.append(header, taskName, hoursDisplay, chipsSection, divider, focusModeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', e => {
      if (e.target === overlay) { overlay.remove(); activeFocusOverlay = null; }
    });
  }

  // `resume` (optional): a crash-recovery snapshot from FOCUS_SNAPSHOT_KEY —
  // { snap, toExit }. Restores session state and boots straight to the
  // ambient screen (or the exit screen when toExit is set).
  function openFullFocusMode(goal, index, catColor, catEmoji, cat, resume) {
    if (activeFocusOverlay) activeFocusOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay focus-fullscreen-overlay';
    overlay.style.setProperty('--focus-cat-color', catColor);
    overlay.style.setProperty('--focus-cat-color-rgb', hexToRgb(catColor));
    activeFocusOverlay = overlay;
    document.body.appendChild(overlay);

    // Shared session state — carries through all screens
    const snap = resume ? resume.snap : null;
    let sessionIntention = snap ? (snap.sessionIntention || '') : '';
    let sessionEntryTag = snap ? (snap.sessionEntryTag || null) : null;
    let sessionEntryNote = snap ? (snap.sessionEntryNote || '') : '';
    let sessionNotes = snap ? (snap.sessionNotes || []) : [];
    let sessionStartTime = snap ? (snap.sessionStartTime || null) : null; // set when ambient screen opens
    let ultraFocus = snap ? !!snap.ultraFocus : false; // user kept going after an idle check-in
    let overrideTotalMins = null; // set when user logs custom hours from the idle dialog

    // Crash backup: while a session runs, a snapshot lives in localStorage.
    // Written at ambient start and on every meaningful change; cleared on
    // every deliberate close so it only survives crashes/reloads.
    function persistSnapshot() {
      storageSet(FOCUS_SNAPSHOT_KEY, JSON.stringify({
        date: getTodayString(),
        goalName: goal.name,
        category: goal.category || null,
        sessionStartTime, sessionIntention, sessionEntryTag, sessionEntryNote,
        sessionNotes, ultraFocus,
        savedAt: Date.now(),
      }));
    }
    function clearSnapshot() { storageRemove(FOCUS_SNAPSHOT_KEY); }

    // ── helpers ──────────────────────────────────────────────

    function transition(fromEl, buildNext) {
      if (fromEl.classList.contains('focus-full-screen')) {
        fromEl.classList.add('focus-screen-exit');
      } else {
        // Ambient screen uses inline style transitions
        fromEl.style.opacity = '0';
        fromEl.style.transform = 'translateY(-12px)';
      }
      setTimeout(() => {
        fromEl.remove();
        const next = buildNext();
        overlay.appendChild(next);
        if (next.classList.contains('focus-full-screen')) {
          requestAnimationFrame(() => next.classList.add('focus-screen-enter'));
        }
      }, 280);
    }

    function makeScreen(extraClass) {
      const s = document.createElement('div');
      s.className = 'focus-full-screen' + (extraClass ? ' ' + extraClass : '');
      return s;
    }

    function makeLabel(text, cls) {
      const el = document.createElement('p');
      el.className = cls || 'focus-entry-label';
      el.textContent = text;
      return el;
    }

    function makeTextarea(placeholder, rows, cls) {
      const ta = document.createElement('textarea');
      ta.className = cls || 'focus-lesson-input';
      ta.placeholder = placeholder;
      ta.rows = rows || 3;
      return ta;
    }

    function makeTagGrid(states, onSelect) {
      const grid = document.createElement('div');
      grid.className = 'focus-entry-tags';
      states.forEach(({ emoji, label, custom }) => {
        const btn = document.createElement('button');
        btn.className = 'focus-entry-tag';
        btn.dataset.label = label;
        if (custom) {
          btn.innerHTML = `<span class="focus-tag-emoji">${emoji}</span><span class="focus-tag-label">${label}</span>`;
          btn.addEventListener('click', () => {
            grid.querySelectorAll('.focus-entry-tag').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            onSelect(label, true);
          });
        } else {
          btn.innerHTML = `<span class="focus-tag-emoji">${emoji}</span><span class="focus-tag-label">${label}</span>`;
          btn.addEventListener('click', () => {
            grid.querySelectorAll('.focus-entry-tag').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            onSelect(label, false);
          });
        }
        grid.appendChild(btn);
      });
      return grid;
    }

    // `teardown` lets a screen clean up its own timers before the overlay
    // goes away. Only the ambient screen has any (clock/idle/breathe); without
    // it those intervals outlive the closed session forever.
    function makeCloseBtn(teardown) {
      const btn = document.createElement('button');
      btn.className = 'focus-fullscreen-close';
      btn.title = 'Close focus mode';
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
      btn.addEventListener('click', () => {
        if (teardown) teardown();
        clearSnapshot(); overlay.remove(); activeFocusOverlay = null;
      });
      return btn;
    }

    // ── Screen 1: Intention ──────────────────────────────────

    function buildIntentionScreen() {
      const screen = makeScreen('focus-intention-screen');

      const label = makeLabel('What do you want to achieve in this session?');
      const sub = makeLabel('Set an intention — even a rough one. It helps.', 'focus-entry-sublabel');

      const intentionInput = makeTextarea('e.g. "Get the first draft of the intro written" or "figure out why the bug is happening"', 3, 'focus-lesson-input focus-intention-input');

      const nextBtn = document.createElement('button');
      nextBtn.className = 'focus-enter-btn focus-entry-start';
      nextBtn.textContent = 'Next →';
      nextBtn.addEventListener('click', () => {
        sessionIntention = intentionInput.value.trim();
        transition(screen, buildEntryScreen);
      });

      const skipBtn = document.createElement('button');
      skipBtn.className = 'focus-skip-btn';
      skipBtn.textContent = 'Skip intention';
      skipBtn.addEventListener('click', () => transition(screen, buildEntryScreen));

      screen.append(makeCloseBtn(), label, sub, intentionInput, nextBtn, skipBtn);
      return screen;
    }

    // ── Screen 2: Entry check-in ─────────────────────────────

    function buildEntryScreen() {
      const screen = makeScreen('focus-entry-screen');

      const label = makeLabel('How\'s your mind right now?');
      const sub = makeLabel('Pick what fits — or skip straight in.', 'focus-entry-sublabel');

      // Journaling area — revealed after tag pick (if prompt exists)
      const journalArea = document.createElement('div');
      journalArea.className = 'focus-journal-area hidden';
      const journalPrompt = document.createElement('p');
      journalPrompt.className = 'focus-lesson-label';
      const journalInput = makeTextarea('Write freely…', 3);
      journalArea.append(journalPrompt, journalInput);

      // Custom label input — shown when "Something else…" picked
      const customLabelArea = document.createElement('div');
      customLabelArea.className = 'focus-journal-area hidden';
      const customInput = makeTextarea('Describe how you\'re feeling…', 2);
      customLabelArea.appendChild(customInput);

      const tagGrid = makeTagGrid(ENTRY_STATES, (label, isCustom) => {
        sessionEntryTag = label;
        if (isCustom) {
          journalArea.classList.add('hidden');
          customLabelArea.classList.remove('hidden');
          customInput.focus({ preventScroll: true });
        } else {
          customLabelArea.classList.add('hidden');
          const stateObj = ENTRY_STATES.find(s => s.label === label);
          if (stateObj && stateObj.prompt) {
            journalPrompt.textContent = stateObj.prompt;
            journalArea.classList.remove('hidden');
            journalInput.focus({ preventScroll: true });
          } else {
            journalArea.classList.add('hidden');
          }
        }
      });

      const beginBtn = document.createElement('button');
      beginBtn.className = 'focus-enter-btn focus-entry-start';
      beginBtn.textContent = 'Begin →';
      beginBtn.addEventListener('click', () => {
        if (sessionEntryTag === 'Something else…') {
          sessionEntryNote = customInput.value.trim();
          sessionEntryTag = sessionEntryNote || 'Something else';
        } else {
          sessionEntryNote = journalInput.value.trim();
        }
        transition(screen, buildAmbientScreen);
      });

      const skipBtn = document.createElement('button');
      skipBtn.className = 'focus-skip-btn';
      skipBtn.textContent = 'Skip';
      skipBtn.addEventListener('click', () => transition(screen, buildAmbientScreen));

      screen.append(makeCloseBtn(), label, sub, tagGrid, journalArea, customLabelArea, beginBtn, skipBtn);
      return screen;
    }

    // ── Screen 3: Ambient (3-column) ─────────────────────────

    function buildAmbientScreen() {
      if (!sessionStartTime) sessionStartTime = Date.now(); // preserved on crash-resume
      persistSnapshot();

      const screen = document.createElement('div');
      screen.className = 'focus-ambient-screen';
      screen.style.setProperty('--cat-color', catColor);

      // Wrapped in an arrow fn: stopAmbientIntervals is hoisted but its
      // interval handles aren't assigned until further down this function.
      const closeBtn = makeCloseBtn(() => stopAmbientIntervals());
      closeBtn.classList.add('focus-ambient-close');
      screen.appendChild(closeBtn);

      // ── LEFT: Journal log ──────────────────────────────────
      const leftCol = document.createElement('div');
      leftCol.className = 'focus-col focus-col-left';

      const leftTitle = document.createElement('p');
      leftTitle.className = 'focus-col-title';
      leftTitle.textContent = 'This session';

      // Intention block
      if (sessionIntention) {
        const intentBlock = document.createElement('div');
        intentBlock.className = 'focus-journal-block';
        const intentLabel = document.createElement('span');
        intentLabel.className = 'focus-journal-block-label';
        intentLabel.textContent = 'Intention';
        const intentText = document.createElement('p');
        intentText.className = 'focus-journal-block-text';
        intentText.textContent = sessionIntention;
        intentBlock.append(intentLabel, intentText);
        leftCol.append(leftTitle, intentBlock);
      } else {
        leftCol.appendChild(leftTitle);
      }

      // Entry state block
      if (sessionEntryTag) {
        const entryBlock = document.createElement('div');
        entryBlock.className = 'focus-journal-block';
        const entryLabel = document.createElement('span');
        entryLabel.className = 'focus-journal-block-label';
        entryLabel.textContent = 'State of mind';
        const entryText = document.createElement('p');
        entryText.className = 'focus-journal-block-text';
        entryText.textContent = sessionEntryTag + (sessionEntryNote ? ` — "${sessionEntryNote}"` : '');
        entryBlock.append(entryLabel, entryText);
        leftCol.appendChild(entryBlock);
      }

      // Live notes list — updates as notes are saved
      const notesListEl = document.createElement('div');
      notesListEl.className = 'focus-notes-list';
      const renderNotesList = () => {
        notesListEl.innerHTML = '';
        if (sessionNotes.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'focus-notes-empty';
          empty.textContent = 'Notes you add will appear here.';
          notesListEl.appendChild(empty);
        } else {
          sessionNotes.forEach(n => {
            // Notes are { text, at } — but tolerate plain strings from
            // snapshots written before timestamps existed.
            const noteEl = document.createElement('div');
            noteEl.className = 'focus-note-item';
            const dot = document.createElement('span');
            dot.className = 'focus-note-dot';
            const txt = document.createElement('span');
            txt.textContent = typeof n === 'string' ? n : n.text;
            noteEl.append(dot, txt);
            if (n.at) {
              const time = document.createElement('span');
              time.className = 'focus-note-time';
              time.textContent = new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              noteEl.appendChild(time);
            }
            notesListEl.appendChild(noteEl);
          });
        }
      };
      renderNotesList();
      leftCol.appendChild(notesListEl);

      // ── CENTER: Task + clock + add note ───────────────────
      const centerCol = document.createElement('div');
      centerCol.className = 'focus-col focus-col-center';

      const catEl = document.createElement('div');
      catEl.className = 'focus-ambient-cat';
      catEl.textContent = catEmoji;

      const nameEl = document.createElement('h1');
      nameEl.className = 'focus-ambient-name';
      nameEl.textContent = goal.name;

      const clockEl = document.createElement('div');
      clockEl.className = 'focus-ambient-clock';
      const tick = () => { clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
      tick();
      const clockInterval = setInterval(tick, 10000);

      // ── Attention check ────────────────────────────────────
      // No interaction for FOCUS_IDLE_THRESHOLD_MS while the session runs
      // → gently ask what to do with the away time. Timestamp-based, so a
      // late tick after machine sleep still sees the full gap. The
      // isConnected guard self-clears the interval on every teardown path.
      let idleDialogEl = null;
      const idleCheckInterval = setInterval(() => {
        if (!screen.isConnected) { clearInterval(idleCheckInterval); return; }
        if (idleDialogEl) return;
        if (getIdleMs() >= FOCUS_IDLE_THRESHOLD_MS) showIdleDialog();
      }, FOCUS_IDLE_CHECK_MS);

      function stopAmbientIntervals() {
        clearInterval(idleCheckInterval);
        clearInterval(clockInterval);
        if (breatheInterval) clearInterval(breatheInterval);
      }

      function applyUltraFocus() {
        // Guard on the DOM, not the flag — a crash-resumed ultra session
        // has ultraFocus=true but still needs its visuals re-applied.
        if (overlay.classList.contains('focus-ultra')) return;
        ultraFocus = true;
        overlay.classList.add('focus-ultra');
        overlay.style.setProperty('--focus-cat-color', ULTRA_FOCUS_COLOR);
        overlay.style.setProperty('--focus-cat-color-rgb', hexToRgb(ULTRA_FOCUS_COLOR));
        const badge = document.createElement('span');
        badge.className = 'focus-ultra-badge';
        badge.textContent = '🔥 Ultra focus';
        clockEl.insertAdjacentElement('afterend', badge);
        persistSnapshot();
      }

      function showIdleDialog() {
        // Anchor the away period to the last real interaction. Clicking
        // the dialog itself marks activity globally, but the away math
        // stays frozen to this anchor until a choice is made.
        const awayStart = getLastActivity();

        const scrim = document.createElement('div');
        scrim.className = 'focus-idle-scrim';
        idleDialogEl = scrim;

        const dialog = document.createElement('div');
        dialog.className = 'focus-idle-dialog';

        const title = document.createElement('p');
        title.className = 'focus-idle-title';
        title.textContent = 'Still working on this?';

        const away = document.createElement('p');
        away.className = 'focus-idle-away';
        const updateAway = () => {
          away.textContent = `No activity for ${formatHours((Date.now() - awayStart) / 3600000, 'a little while')}.`;
        };
        updateAway();
        const awayInterval = setInterval(() => {
          if (!scrim.isConnected) { clearInterval(awayInterval); return; }
          updateAway();
        }, 10000);

        function closeIdleDialog() {
          clearInterval(awayInterval);
          scrim.remove();
          idleDialogEl = null;
          markActivity(); // answering means the user is back
        }

        function makeIdleBtn(text, extraClass) {
          const b = document.createElement('button');
          b.className = 'focus-idle-btn' + (extraClass ? ' ' + extraClass : '');
          b.textContent = text;
          return b;
        }

        // 1. Keep counting — this is a marathon. Acknowledge it.
        const stillBtn = makeIdleBtn('I\'m still focusing — count it all', 'focus-idle-btn--primary');
        stillBtn.addEventListener('click', () => {
          applyUltraFocus();
          closeIdleDialog();
        });

        // 2. Trim the away time, keep the session going.
        const trimBtn = makeIdleBtn('I stepped away — trim that time');
        trimBtn.addEventListener('click', () => {
          const gapMs = Date.now() - awayStart;
          sessionStartTime = Math.min(Date.now(), sessionStartTime + gapMs);
          persistSnapshot();
          closeIdleDialog();
        });

        // 3. End now, logging hours the user chooses.
        const customBtn = makeIdleBtn('Wrap up — I\'ll log the hours myself');
        const hoursArea = document.createElement('div');
        hoursArea.className = 'focus-idle-hours-area hidden';
        const hoursInput = document.createElement('input');
        hoursInput.type = 'number';
        hoursInput.className = 'focus-idle-hours-input';
        hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.25';
        const hoursConfirm = makeIdleBtn('End session', 'focus-idle-btn--primary');
        hoursArea.append(hoursInput, hoursConfirm);
        customBtn.addEventListener('click', () => {
          hoursArea.classList.remove('hidden');
          // Prefill with the time before the away gap began.
          const activeHours = Math.max(0, Math.round((awayStart - sessionStartTime) / 36000) / 100);
          hoursInput.value = String(activeHours);
          hoursInput.focus({ preventScroll: true });
          hoursInput.select();
        });
        hoursConfirm.addEventListener('click', () => {
          const v = parseFloat(hoursInput.value);
          if (!isFinite(v) || v < 0 || v > 24) {
            hoursInput.classList.add('focus-idle-input-error');
            setTimeout(() => hoursInput.classList.remove('focus-idle-input-error'), 600);
            return;
          }
          overrideTotalMins = Math.round(v * 60);
          stopAmbientIntervals();
          closeIdleDialog();
          transition(screen, buildExitScreen);
        });
        hoursInput.addEventListener('keydown', e => { if (e.key === 'Enter') hoursConfirm.click(); });

        // 4. Scrap — same discard path as the close button.
        const scrapBtn = makeIdleBtn('Scrap this session', 'focus-idle-btn--quiet');
        scrapBtn.addEventListener('click', () => {
          stopAmbientIntervals();
          closeIdleDialog();
          clearSnapshot();
          overlay.remove();
          activeFocusOverlay = null;
        });

        const actions = document.createElement('div');
        actions.className = 'focus-idle-actions';
        actions.append(stillBtn, trimBtn, customBtn, hoursArea, scrapBtn);

        dialog.append(title, away, actions);
        scrim.appendChild(dialog);
        overlay.appendChild(scrim);
      }

      // Add note area — always visible in center
      const noteInputWrapper = document.createElement('div');
      noteInputWrapper.className = 'focus-note-input-wrapper';
      const noteInput = makeTextarea('Capture a thought, a blocker, a breakthrough…', 3, 'focus-lesson-input focus-notes-input');
      const saveNoteBtn = document.createElement('button');
      saveNoteBtn.className = 'focus-note-save-btn';
      saveNoteBtn.textContent = 'Save note';
      saveNoteBtn.addEventListener('click', () => {
        const text = noteInput.value.trim();
        if (text) {
          sessionNotes.push({ text, at: Date.now() });
          noteInput.value = '';
          renderNotesList();
          persistSnapshot();
        }
      });
      // Enter saves the note as a new bullet; Shift+Enter makes a newline.
      noteInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveNoteBtn.click();
        }
      });
      noteInputWrapper.append(noteInput, saveNoteBtn);

      const doneBtn = document.createElement('button');
      doneBtn.className = 'focus-done-btn';
      doneBtn.textContent = 'I\'m done for now';
      doneBtn.addEventListener('click', () => {
        stopAmbientIntervals();
        transition(screen, buildExitScreen);
      });

      centerCol.append(catEl, nameEl, clockEl, noteInputWrapper, doneBtn);

      // ── RIGHT: Focus tools ─────────────────────────────────
      const rightCol = document.createElement('div');
      rightCol.className = 'focus-col focus-col-right';

      const rightTitle = document.createElement('p');
      rightTitle.className = 'focus-col-title';
      rightTitle.textContent = 'Focus tools';

      const wisdomCard = document.createElement('div');
      wisdomCard.className = 'focus-tool-card';
      const wisdomIcon = document.createElement('span');
      wisdomIcon.className = 'focus-tool-icon';
      wisdomIcon.textContent = '💡';
      const wisdomText = document.createElement('p');
      wisdomText.className = 'focus-tool-text';
      wisdomText.textContent = FOCUS_WISDOM[Math.floor(Math.random() * FOCUS_WISDOM.length)];
      wisdomCard.append(wisdomIcon, wisdomText);

      const breatheCard = document.createElement('div');
      breatheCard.className = 'focus-tool-card focus-breathe-card';
      const breatheIcon = document.createElement('span');
      breatheIcon.className = 'focus-tool-icon';
      breatheIcon.textContent = '🌬️';
      const breatheTitle = document.createElement('p');
      breatheTitle.className = 'focus-tool-label';
      breatheTitle.textContent = 'Box breathing';
      const breatheDesc = document.createElement('p');
      breatheDesc.className = 'focus-tool-text';
      breatheDesc.textContent = 'In 4s · Hold 4s · Out 4s · Hold 4s. Repeat 4×. Resets the nervous system in under 2 minutes.';
      const breatheBtn = document.createElement('button');
      breatheBtn.className = 'focus-tool-btn';
      breatheBtn.textContent = 'Start guide';
      let breatheInterval = null;
      let breathePhase = 0;
      const breathePhases = ['Breathe in…', 'Hold…', 'Breathe out…', 'Hold…'];
      breatheBtn.addEventListener('click', () => {
        if (breatheInterval) {
          clearInterval(breatheInterval);
          breatheInterval = null;
          breatheBtn.textContent = 'Start guide';
          breatheDesc.textContent = 'In 4s · Hold 4s · Out 4s · Hold 4s. Repeat 4×. Resets the nervous system in under 2 minutes.';
          breatheDesc.classList.remove('focus-breathe-active');
        } else {
          breathePhase = 0;
          breatheDesc.textContent = breathePhases[0];
          breatheDesc.classList.add('focus-breathe-active');
          breatheBtn.textContent = 'Stop';
          breatheInterval = setInterval(() => {
            breathePhase = (breathePhase + 1) % 4;
            breatheDesc.textContent = breathePhases[breathePhase];
          }, 4000);
        }
      });
      breatheCard.append(breatheIcon, breatheTitle, breatheDesc, breatheBtn);

      const groundCard = document.createElement('div');
      groundCard.className = 'focus-tool-card';
      const groundIcon = document.createElement('span');
      groundIcon.className = 'focus-tool-icon';
      groundIcon.textContent = '🌿';
      const groundTitle = document.createElement('p');
      groundTitle.className = 'focus-tool-label';
      groundTitle.textContent = '5-4-3-2-1 grounding';
      const groundText = document.createElement('p');
      groundText.className = 'focus-tool-text';
      groundText.textContent = 'Name 5 things you see · 4 you can touch · 3 you hear · 2 you smell · 1 you taste. Brings you back to now.';
      groundCard.append(groundIcon, groundTitle, groundText);

      rightCol.append(rightTitle, wisdomCard, breatheCard, groundCard);

      const grid = document.createElement('div');
      grid.className = 'focus-ambient-grid';
      grid.append(leftCol, centerCol, rightCol);
      screen.appendChild(grid);

      // Crash-resumed ultra session → re-apply the gold visuals
      if (ultraFocus) applyUltraFocus();

      // Animate in
      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.35s ease';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        screen.style.opacity = '1';
      }));

      return screen;
    }

    // ── Screen 4: Exit check-in ──────────────────────────────

    function buildExitScreen() {
      const screen = makeScreen('focus-exit-screen');

      // Compute total session minutes (idle dialog may have set an override)
      const sessionMs = sessionStartTime ? (Date.now() - sessionStartTime) : 0;
      const totalMins = overrideTotalMins !== null ? overrideTotalMins : Math.round(sessionMs / 60000);

      const label = makeLabel('How did it go?');
      const sub = makeLabel('No judgment — just honest.', 'focus-entry-sublabel');

      // ── Focus % slider ───────────────────────────────────────
      const sliderSection = document.createElement('div');
      sliderSection.className = 'focus-pct-section';

      const sliderLabel = document.createElement('p');
      sliderLabel.className = 'focus-lesson-label';
      sliderLabel.textContent = 'How much of this session were you actually focused?';

      const sliderRow = document.createElement('div');
      sliderRow.className = 'focus-pct-row';

      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5'; slider.value = '80';
      slider.className = 'focus-pct-slider';

      const sliderVal = document.createElement('span');
      sliderVal.className = 'focus-pct-value';
      sliderVal.textContent = '80%';

      const updateSlider = () => {
        const pct = parseInt(slider.value);
        sliderVal.textContent = pct + '%';
        const focused = Math.round(totalMins * pct / 100);
        const distracted = totalMins - focused;
        timeBreakdown.textContent = totalMins > 0
          ? `${focused}m focused · ${distracted}m distracted`
          : 'Set time via the hours pill after closing';
        slider.style.background = `linear-gradient(to right, rgba(var(--focus-cat-color-rgb,64,145,108),0.8) 0%, rgba(var(--focus-cat-color-rgb,64,145,108),0.8) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
        // Show distraction capture if ≥50% distracted
        distractionCapture.classList.toggle('hidden', pct > 50);
      };

      slider.addEventListener('input', updateSlider);
      sliderRow.append(slider, sliderVal);

      const timeBreakdown = document.createElement('p');
      timeBreakdown.className = 'focus-entry-sublabel';

      sliderSection.append(sliderLabel, sliderRow, timeBreakdown);

      // ── Distraction capture (shown when focus < 50%) ─────────
      const distractionCapture = document.createElement('div');
      distractionCapture.className = 'focus-journal-area hidden';
      const distLabel = document.createElement('p');
      distLabel.className = 'focus-lesson-label';
      distLabel.textContent = 'What pulled you away? (will be added to 5 to Avoid)';
      const distInput = makeTextarea('e.g. phone, email, thoughts about X…', 2);
      distractionCapture.append(distLabel, distInput);

      // ── Reflection area ──────────────────────────────────────
      const reflectionArea = document.createElement('div');
      reflectionArea.className = 'focus-journal-area hidden';
      const reflectionPrompt = document.createElement('p');
      reflectionPrompt.className = 'focus-lesson-label';
      const reflectionInput = makeTextarea('Write what comes up…', 4);
      reflectionArea.append(reflectionPrompt, reflectionInput);

      const customExitArea = document.createElement('div');
      customExitArea.className = 'focus-journal-area hidden';
      const customExitInput = makeTextarea('What was the experience like?', 4);
      customExitArea.appendChild(customExitInput);

      let selectedExitTag = null;

      const tagGrid = makeTagGrid(EXIT_STATES, (tagLabel, isCustom) => {
        selectedExitTag = tagLabel;
        if (isCustom) {
          reflectionArea.classList.add('hidden');
          customExitArea.classList.remove('hidden');
          customExitInput.focus({ preventScroll: true });
        } else {
          customExitArea.classList.add('hidden');
          const stateObj = EXIT_STATES.find(s => s.label === tagLabel);
          reflectionPrompt.textContent = sessionIntention && tagLabel === 'Got into flow'
            ? `You set out to: "${sessionIntention}" — did you get there? What helped?`
            : (stateObj ? stateObj.prompt : 'What did you notice?');
          reflectionArea.classList.remove('hidden');
          reflectionInput.focus({ preventScroll: true });
        }
      });

      // ── Save ─────────────────────────────────────────────────
      const saveBtn = document.createElement('button');
      saveBtn.className = 'focus-enter-btn focus-entry-start';
      saveBtn.textContent = 'Save & close';
      saveBtn.addEventListener('click', () => {
        const focusPct = parseInt(slider.value);
        const focusMins = Math.round(totalMins * focusPct / 100);
        const distractMins = totalMins - focusMins;
        const focusHours = Math.round(focusMins / 60 * 100) / 100;
        const distractHours = Math.round(distractMins / 60 * 100) / 100;

        // Log focus hours to the goal
        if (focusHours > 0 && state.goals[index]) {
          const prev = state.goals[index].hours || 0;
          state.goals[index].hours = Math.round(Math.min(24, prev + focusHours) * 100) / 100;
          // Accumulate what the goal actually gained (the 24h/day cap may
          // truncate it) — same rule as the time-add chips.
          accumulateCategoryHours(state.goals[index].category || 'general', state.goals[index].hours - prev);
          // Sync the pill on the card
          const cardPill = goalsListEl.querySelector(`.goal-hours-pill[data-goal-index="${index}"]`);
          if (cardPill && !cardPill.querySelector('input')) {
            const h = state.goals[index].hours;
            const hr = Math.floor(h), mn = Math.round((h - hr) * 60);
            cardPill.textContent = h === 0 ? '+ hrs' : (hr > 0 && mn > 0 ? `${hr}h ${mn}m` : hr > 0 ? `${hr}h` : `${mn}m`);
            cardPill.classList.toggle('goal-hours-pill--empty', h === 0);
          }
        }

        // Log distraction time — the unfocused share of the session always
        // lands in the day's distraction hours, exactly once:
        // a named distraction if one was typed, else the first existing
        // item, else a generic "Drifted time" entry.
        if (distractHours > 0) {
          const distText = distInput.value.trim();
          if (distText && state.distractions.length < MAX_DISTRACTIONS) {
            state.distractions.push({ name: distText, hours: distractHours });
          } else if (state.distractions.length > 0) {
            state.distractions[0].hours = Math.round(((state.distractions[0].hours || 0) + distractHours) * 100) / 100;
          } else {
            state.distractions.push({ name: 'Drifted time', hours: distractHours });
          }
        }

        // Build exit reflection text
        const exitNote = selectedExitTag === 'Something else…'
          ? customExitInput.value.trim()
          : reflectionInput.value.trim();

        // Save focus session object
        if (!state.focusSessions) state.focusSessions = [];
        const session = {
          timestamp: Date.now(),
          goalName: goal.name,
          goalIndex: index,
          // Store only the category id; emoji/color are resolved live at render
          // so category edits reflect in the journal (no frozen snapshot).
          category: goal.category || 'general',
          totalMins,
          focusPct,
          focusMins,
          distractMins,
          isWin: focusPct >= 70,
          ultraFocus,
          intention: sessionIntention || null,
          entryTag: sessionEntryTag || null,
          entryNote: sessionEntryNote || null,
          midNotes: [...sessionNotes],
          exitTag: selectedExitTag || null,
          exitNote: exitNote || null,
        };
        state.focusSessions.push(session);

        saveState();
        clearSnapshot();
        renderSummary();
        renderJournal();
        render(); // refresh goal card hours pill
        overlay.remove();
        activeFocusOverlay = null;
      });

      const skipBtn = document.createElement('button');
      skipBtn.className = 'focus-skip-btn';
      skipBtn.textContent = 'Skip — just close';
      skipBtn.addEventListener('click', () => { clearSnapshot(); overlay.remove(); activeFocusOverlay = null; });

      const actions = document.createElement('div');
      actions.className = 'focus-exit-actions';
      actions.append(saveBtn, skipBtn);

      // Init slider display
      updateSlider();

      screen.append(makeCloseBtn(), label, sub, sliderSection, distractionCapture, tagGrid, reflectionArea, customExitArea, actions);
      return screen;
    }

    // ── Boot ─────────────────────────────────────────────────

    if (resume && resume.toExit) {
      // Crash recovery, "wrap up": straight to the reflection screen.
      const exitScreen = buildExitScreen();
      overlay.appendChild(exitScreen);
      requestAnimationFrame(() => exitScreen.classList.add('focus-screen-enter'));
    } else if (resume) {
      // Crash recovery, "resume": back into the running session.
      // buildAmbientScreen keeps the snapshot's sessionStartTime and
      // re-applies ultra visuals; it animates itself in.
      overlay.appendChild(buildAmbientScreen());
    } else {
      const firstScreen = buildIntentionScreen();
      overlay.appendChild(firstScreen);
      requestAnimationFrame(() => firstScreen.classList.add('focus-screen-enter'));
    }
  }

  // Crash recovery: a snapshot in FOCUS_SNAPSHOT_KEY means the tab crashed
  // or reloaded mid-session (deliberate closes always clear it). Offer to
  // pick the session back up. Same-day only — after a day rollover the
  // snapshot is stale and silently dropped.
  function checkForCrashedFocusSession() {
    const raw = storageGet(FOCUS_SNAPSHOT_KEY);
    if (!raw) return;
    let snap = null;
    try { snap = JSON.parse(raw); } catch (e) { snap = null; }
    if (!snap || snap.date !== getTodayString() || !snap.sessionStartTime) {
      storageRemove(FOCUS_SNAPSHOT_KEY);
      return;
    }

    const catObj = getCategoryById(snap.category || 'general');
    const catColor = (catObj && catObj.color) || '#2D6A4F';
    const catEmoji = (catObj && catObj.emoji) || '⚡';
    const goalIdx = state.goals.findIndex(g => g.name === snap.goalName);
    // Goal may have been completed/deleted since — a stub still lets the
    // session be logged (exit save guards state.goals[index] itself).
    const goalObj = goalIdx !== -1 ? state.goals[goalIdx] : { name: snap.goalName, category: snap.category || null };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay focus-restore-overlay';
    overlay.style.setProperty('--focus-cat-color-rgb', hexToRgb(catColor));

    const dialog = document.createElement('div');
    dialog.className = 'focus-idle-dialog';

    const title = document.createElement('p');
    title.className = 'focus-idle-title';
    title.textContent = 'Pick up where you left off?';

    const info = document.createElement('p');
    info.className = 'focus-idle-away';
    const startedAt = new Date(snap.sessionStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    info.textContent = `A focus session on “${snap.goalName}” has been running since ${startedAt}.`;

    function makeBtn(text, extraClass) {
      const b = document.createElement('button');
      b.className = 'focus-idle-btn' + (extraClass ? ' ' + extraClass : '');
      b.textContent = text;
      return b;
    }

    const resumeBtn = makeBtn('Resume the session', 'focus-idle-btn--primary');
    resumeBtn.addEventListener('click', () => {
      overlay.remove();
      openFullFocusMode(goalObj, goalIdx, catColor, catEmoji, catObj, { snap });
    });

    const wrapBtn = makeBtn('Wrap it up — log the time');
    wrapBtn.addEventListener('click', () => {
      overlay.remove();
      openFullFocusMode(goalObj, goalIdx, catColor, catEmoji, catObj, { snap, toExit: true });
    });

    const discardBtn = makeBtn('Discard it', 'focus-idle-btn--quiet');
    discardBtn.addEventListener('click', () => {
      storageRemove(FOCUS_SNAPSHOT_KEY);
      overlay.remove();
    });

    const actions = document.createElement('div');
    actions.className = 'focus-idle-actions';
    actions.append(resumeBtn, wrapBtn, discardBtn);

    dialog.append(title, info, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // =========================================================
  // DONE TODAY
  // =========================================================
  const DONE_VISIBLE = 3; // items shown before collapse
  const doneExpanded = { goals: false, quick: false };

  function renderDone() {
    if (!doneListEl) return;
    doneListEl.innerHTML = '';

    const completedGoals = getCompletedGoals();
    const quickItems = state.quickDone || [];
    const total = completedGoals.length + quickItems.length;

    if (doneSubtitle) {
      doneSubtitle.textContent = total === 0
        ? 'Nothing yet — go get one'
        : `${total} thing${total !== 1 ? 's' : ''} done`;
    }

    if (total === 0) return;

    // --- From Top 5 group (newest first) ---
    if (completedGoals.length > 0) {
      const reversed = [...completedGoals].reverse();
      doneListEl.appendChild(createDoneGroup({
        label: 'From Top 5',
        items: reversed,
        expandKey: 'goals',
        createItem: (goal, i) => {
          const realIndex = state.goals.indexOf(goal);
          return createDoneGoalItem(goal, realIndex, i === 0);
        }
      }));
    }

    // --- Quick wins group (newest first) ---
    if (quickItems.length > 0) {
      const reversed = [...quickItems].reverse();
      doneListEl.appendChild(createDoneGroup({
        label: 'Quick wins',
        items: reversed,
        expandKey: 'quick',
        createItem: (item, i) => {
          const realIndex = quickItems.indexOf(item);
          return createDoneQuickItem(item, realIndex, i === 0);
        }
      }));
    }
  }

  function createDoneGroup({ label, items, expandKey, createItem }) {
    const group = document.createElement('div');
    group.className = 'done-group';

    const header = document.createElement('div');
    header.className = 'done-group-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'done-group-label';
    labelEl.textContent = label;

    const countEl = document.createElement('span');
    countEl.className = 'done-group-count';
    countEl.textContent = items.length;

    header.append(labelEl, countEl);
    group.appendChild(header);

    const list = document.createElement('div');
    list.className = 'done-group-list';

    const isExpanded = doneExpanded[expandKey];
    const showCount = isExpanded ? items.length : Math.min(DONE_VISIBLE, items.length);
    const hiddenCount = items.length - DONE_VISIBLE;

    items.slice(0, showCount).forEach((item, i) => {
      list.appendChild(createItem(item, i));
    });

    group.appendChild(list);

    // Expand/collapse toggle
    if (hiddenCount > 0) {
      const toggle = document.createElement('button');
      toggle.className = 'done-expand-btn';

      if (!isExpanded) {
        toggle.textContent = `+ ${hiddenCount} more`;
        toggle.addEventListener('click', () => {
          doneExpanded[expandKey] = true;
          renderDone();
        });
      } else {
        toggle.textContent = 'Show less';
        toggle.classList.add('done-expand-btn--open');
        toggle.addEventListener('click', () => {
          doneExpanded[expandKey] = false;
          renderDone();
        });
      }

      group.appendChild(toggle);
    }

    return group;
  }

  function createDoneGoalItem(goal, index, isLatest) {
    const row = document.createElement('div');
    row.className = 'done-item done-item-goal' + (isLatest ? ' done-item-entering' : '');
    if (isLatest) requestAnimationFrame(() => row.classList.remove('done-item-entering'));

    // Category emoji badge — static, no edit from done list
    const cat = getCategoryById(goal.category || 'general');
    const catBadge = document.createElement('span');
    catBadge.className = 'done-item-cat-badge';
    catBadge.textContent = cat.emoji || '●';
    catBadge.title = cat.name;
    catBadge.style.setProperty('--badge-color', cat.color);

    const name = document.createElement('span');
    name.className = 'done-item-name';
    name.textContent = goal.name;

    const meta = document.createElement('span');
    meta.className = 'done-item-meta';
    meta.textContent = goal.hours > 0 ? `${goal.hours}h` : '';

    const reopenBtn = document.createElement('button');
    reopenBtn.className = 'btn-uncomplete';
    reopenBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h31.39L181.19,69.8a80,80,0,1,0,1.67,114.1,8,8,0,0,1,11.16,11.46A96,96,0,1,1,207.07,73.93L224,90.51V48a8,8,0,0,1,16,0Z"/></svg> Reopen';
    reopenBtn.addEventListener('click', () => {
      state.goals[index].progress = 95;
      saveState(); render();
    });

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    del.addEventListener('click', () => { permanentlyDeleteGoal(index); });

    row.append(catBadge, name, meta, reopenBtn, del);
    return row;
  }

  function createDoneQuickItem(item, index, isLatest) {
    const row = document.createElement('div');
    row.className = 'done-item done-item-quick' + (isLatest ? ' done-item-entering' : '');
    if (isLatest) requestAnimationFrame(() => row.classList.remove('done-item-entering'));

    // Category pill — clickable to assign/change the life area (reuses the same
    // unified picker as distractions/backlog), so quick tasks can be categorized.
    const catPill = createCategoryPill(item.category, newId => {
      // Logged hours follow the item to its new category — otherwise they
      // stay counted under the old one and totals drift.
      const prevCat = item.category || 'general';
      const nextCat = newId || 'general';
      if (prevCat !== nextCat && item.hours > 0) {
        accumulateCategoryHours(prevCat, -item.hours);
        accumulateCategoryHours(nextCat, item.hours);
      }
      state.quickDone[index].category = newId;
      item.category = newId;
      saveState();
      renderSidebar();
    });
    catPill.classList.add('done-item-cat-pill');
    row.appendChild(catPill);

    const name = document.createElement('span');
    name.className = 'done-item-name';
    name.textContent = item.name;
    makeEditable(name, newVal => { state.quickDone[index].name = newVal; saveState(); });

    // Hours: show badge if set, otherwise show inline input
    const hoursBadge = document.createElement('span');
    hoursBadge.className = 'done-item-meta done-hours-badge';
    hoursBadge.title = 'Click to edit hours';

    function renderHoursBadge() {
      hoursBadge.textContent = formatHours(item.hours);
      hoursBadge.classList.toggle('done-hours-badge--empty', !(item.hours > 0));
    }
    renderHoursBadge();

    makeInlineHoursEditor(hoursBadge, {
      getValue: () => item.hours,
      onCommit: (v, prev, delta) => {
        state.quickDone[index].hours = v;
        item.hours = v;
        saveState();
        // Keep category totals in sync with the edit (creation already
        // accumulated the original hours).
        accumulateCategoryHours(item.category || 'general', delta);
        renderSummary();
      },
      render: renderHoursBadge,
    });

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    del.addEventListener('click', () => {
      undoStack.push({ type: 'quickDone', item: state.quickDone[index], index });
      state.quickDone.splice(index, 1); saveState(); renderDone();
    });

    row.append(name, hoursBadge, del);
    return row;
  }

  function addQuickDone(name, hours, catId) {
    const n = name !== undefined ? name : (quickInputEl ? quickInputEl.value.trim() : '');
    if (!n) return;
    state.quickDone.push({ name: n, hours: hours || 0, category: catId || null });
    if (quickInputEl && name === undefined) quickInputEl.value = '';
    doneExpanded.quick = false;
    saveState(); renderDone();
    pulseBlobEvent('add');
  }

  function openLogDoneModal() {
    closeQuickAdd();
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay quick-add-modal-overlay';
    activeQuickAdd = overlay;

    const modal = document.createElement('div');
    modal.className = 'quick-add-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'quick-add-header';
    const badge = document.createElement('div');
    badge.className = 'quick-add-cat-badge';
    badge.textContent = '✅';
    badge.style.background = 'rgba(64,145,108,0.15)';
    badge.style.border = '1.5px solid rgba(64,145,108,0.35)';
    const titleBlock = document.createElement('div');
    titleBlock.innerHTML = '<div class="quick-add-title">Log completed task</div><div class="quick-add-subtitle">Something you already finished today</div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cat-modal-close';
    closeBtn.style.marginLeft = 'auto';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', closeQuickAdd);
    header.append(badge, titleBlock, closeBtn);

    // Task name input
    const inputRow = document.createElement('div');
    inputRow.className = 'quick-add-input-row';
    const taskInput = document.createElement('input');
    taskInput.type = 'text';
    taskInput.className = 'quick-add-input';
    taskInput.placeholder = 'What did you get done?';
    taskInput.maxLength = 100;
    // Pre-fill from the text input if something was typed there
    if (quickInputEl && quickInputEl.value.trim()) {
      taskInput.value = quickInputEl.value.trim();
      quickInputEl.value = '';
    }
    inputRow.appendChild(taskInput);

    // Category chips (same pill style as dest chips in quick-add modal)
    let selectedCatId = 'general';
    const catRow = document.createElement('div');
    catRow.className = 'quick-add-dest-row';

    activeCategories().forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'quick-add-dest-chip' + (cat.id === selectedCatId ? ' active' : '');
      chip.innerHTML = `${cat.emoji} ${cat.name}`;
      chip.addEventListener('click', () => {
        selectedCatId = cat.id;
        catRow.querySelectorAll('.quick-add-dest-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
      catRow.appendChild(chip);
    });

    // Hours row — label + number input side by side
    const hoursRow = document.createElement('div');
    hoursRow.className = 'quick-add-repeat-row';
    hoursRow.style.marginBottom = '18px';
    const hoursLabel = document.createElement('label');
    hoursLabel.className = 'quick-add-repeat-label';
    hoursLabel.textContent = 'Hours invested';
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.className = 'quick-add-hours-input';
    hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.5';
    hoursInput.placeholder = '0';
    hoursRow.append(hoursLabel, hoursInput);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'quick-add-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeQuickAdd);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = 'Mark as done';

    function confirmLog() {
      const name = taskInput.value.trim();
      if (!name) { taskInput.focus({ preventScroll: true }); return; }
      const hours = Math.max(0, parseFloat(hoursInput.value) || 0);
      addQuickDone(name, hours, selectedCatId !== 'general' ? selectedCatId : null);
      accumulateCategoryHours(selectedCatId, hours);
      closeQuickAdd();
    }

    addBtn.addEventListener('click', confirmLog);
    taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmLog(); } if (e.key === 'Escape') closeQuickAdd(); });
    actions.append(cancelBtn, addBtn);

    modal.append(header, inputRow, catRow, hoursRow, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeQuickAdd(); });
    setTimeout(() => taskInput.focus({ preventScroll: true }), 60);
  }

  if (addQuickBtn) addQuickBtn.addEventListener('click', () => openLogDoneModal());
  if (quickInputEl) quickInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addQuickDone(); });

  function renderDistractions() {
    distractionsListEl.innerHTML = '';
    state.distractions.forEach((d, i) => {
      const el = createDistractionElement(d, i);
      distractionsListEl.appendChild(el);
      setupTaskDrag(el, distractionsListEl, 'distraction');
    });
  }

  function createDistractionElement(dist, index) {
    const item = document.createElement('div');
    item.className = 'task-item distraction';
    item.dataset.distIndex = index;

    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'task-drag-handle';
    dragHandle.textContent = '☰';

    const number = document.createElement('span');
    number.className = 'task-number';
    number.textContent = index + 1;

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = dist.name;
    makeEditable(name, newVal => { state.distractions[index].name = newVal; saveState(); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
      undoStack.push({ type: 'distraction', item: state.distractions[index], index });
      state.distractions.splice(index, 1); saveState(); render();
    });

    topRow.append(dragHandle, number, name, deleteBtn);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';
    const hg = document.createElement('div'); hg.className = 'log-group';
    const hl = document.createElement('label'); hl.textContent = 'Hours spent';
    const hi = document.createElement('input');
    hi.type = 'number'; hi.className = 'hours-input'; hi.min = '0'; hi.max = '24'; hi.step = '0.25';
    hi.value = dist.hours || 0;
    hi.addEventListener('change', () => {
      const prev = state.distractions[index].hours || 0;
      let v = Math.max(0, Math.min(24, parseFloat(hi.value) || 0));
      hi.value = v;
      const delta = v - prev;
      state.distractions[index].hours = v;
      saveState();
      accumulateCategoryHours(state.distractions[index].category || 'general', delta);
      renderSummary();
    });
    hg.append(hl, hi);

    // Category pill for distractions
    const catPill = createCategoryPill(dist.category, newId => {
      state.distractions[index].category = newId;
      saveState();
      renderSidebar();
    });

    logRow.append(hg, catPill);

    item.append(topRow, logRow);
    return item;
  }

  // =========================================================
  // BACKLOG
  // =========================================================
  // The backlog card only shows items from today's focus categories (picked in
  // the day-start modal). With no focus set (e.g. modal skipped) it shows all.
  // Hidden items stay reachable via the sidebar category expansions.
  function isBacklogItemVisible(item) {
    const focusIds = state.focusCategoryIds || [];
    return focusIds.length === 0 || focusIds.includes(item.category || 'general');
  }

  // Map a slot among the *visible* backlog rows to an index in the full
  // backlog array (hidden items make the two diverge).
  function backlogVisibleSlotToIndex(slot) {
    let seen = 0;
    for (let i = 0; i < backlog.length; i++) {
      if (!isBacklogItemVisible(backlog[i])) continue;
      if (seen === slot) return i;
      seen++;
    }
    return backlog.length;
  }

  function renderBacklog() {
    if (!backlogListEl) return;
    backlogListEl.innerHTML = '';
    let hiddenCount = 0;
    backlog.forEach((item, i) => {
      if (!isBacklogItemVisible(item)) {
        hiddenCount++;
        return;
      }
      backlogListEl.appendChild(createBacklogElement(item, i));
    });
    if (hiddenCount > 0) {
      const note = document.createElement('div');
      note.className = 'backlog-hidden-note';
      note.textContent = hiddenCount === 1
        ? '1 more task in other life areas — find it in the sidebar'
        : `${hiddenCount} more tasks in other life areas — find them in the sidebar`;
      backlogListEl.appendChild(note);
    }
    updateAddButtonVisibility();
  }

  function createBacklogElement(item, index) {
    const row = document.createElement('div');
    row.className = 'backlog-item';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'task-drag-handle backlog-drag-handle';
    dragHandle.title = 'Drag to Top 5';
    dragHandle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,60ZM108,128a16,16,0,1,1-16-16A16,16,0,0,1,108,128Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,128ZM108,196a16,16,0,1,1-16-16A16,16,0,0,1,108,196Zm56,0a16,16,0,1,1-16-16A16,16,0,0,1,164,196Z"/></svg>';

    const name = document.createElement('span');
    name.className = 'backlog-name';
    name.textContent = item.name;
    makeEditable(name, newVal => { backlog[index].name = newVal; saveBacklog(); });

    const actions = document.createElement('div');
    actions.className = 'backlog-actions';

    // Category pill
    const catPill = createCategoryPill(item.category, newId => {
      backlog[index].category = newId;
      saveBacklog();
      renderSidebar();
      renderBacklog();
    });
    actions.appendChild(catPill);

    const activeCount = getActiveGoals().length;
    if (activeCount < MAX_GOALS) {
      const promoteBtn = document.createElement('button');
      promoteBtn.className = 'btn-promote';
      promoteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,106.34l-96-96a8,8,0,0,0-11.32,0l-96,96a8,8,0,0,0,11.32,11.32L120,29.31V216a8,8,0,0,0,16,0V29.31l82.34,88.35a8,8,0,0,0,11.32-11.32Z"/></svg> Promote';
      promoteBtn.title = 'Move to active goals';
      promoteBtn.addEventListener('click', () => {
        if (getActiveGoals().length >= MAX_GOALS) return;
        state.goals.push({ name: item.name, hours: 0, progress: 0, fromBacklog: true, category: item.category || null });
        backlog.splice(index, 1);
        saveState(); saveBacklog(); render();
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
      });
      actions.appendChild(promoteBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
      undoStack.push({ type: 'backlog', item: backlog[index], index });
      backlog.splice(index, 1); saveBacklog(); renderBacklog();
    });

    actions.appendChild(deleteBtn);
    row.append(dragHandle, name, actions);
    setupBacklogItemDrag(row, item, index);
    return row;
  }

  function addBacklogItem() {
    if (!backlogInputEl) return;
    const n = backlogInputEl.value.trim();
    if (!n) return;
    backlog.push({ name: n });
    backlogInputEl.value = '';
    saveBacklog(); renderBacklog();
  }

  if (addBacklogBtn) addBacklogBtn.addEventListener('click', addBacklogItem);
  if (backlogInputEl) backlogInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addBacklogItem(); });

  // =========================================================
  // JOURNAL
  // =========================================================
  function renderJournal() {
    if (!successesListEl || !failuresListEl) return;

    // ── Focus sessions section ─────────────────────────────────
    const journalCard = successesListEl.closest('.card-journal');
    let focusSessionsEl = journalCard ? journalCard.querySelector('.focus-sessions-list') : null;

    const sessions = state.focusSessions || [];
    if (journalCard) {
      if (!focusSessionsEl) {
        // Insert before the wins block
        focusSessionsEl = document.createElement('div');
        focusSessionsEl.className = 'focus-sessions-list';
        const winsBlock = journalCard.querySelector('.journal-block');
        if (winsBlock) journalCard.insertBefore(focusSessionsEl, winsBlock);
        else journalCard.appendChild(focusSessionsEl);
      }
      focusSessionsEl.innerHTML = '';
      if (sessions.length > 0) {
        const heading = document.createElement('h3');
        heading.className = 'journal-heading journal-heading-focus';
        heading.textContent = 'Focus Sessions';
        focusSessionsEl.appendChild(heading);
        [...sessions].reverse().forEach((s, ri) => {
          const i = sessions.length - 1 - ri;
          focusSessionsEl.appendChild(createFocusSessionEntry(s, i));
        });
      }
    }

    // ── Manual wins & lessons ──────────────────────────────────
    successesListEl.innerHTML = '';
    state.successes.forEach((t, i) => successesListEl.appendChild(createJournalEntry(t, i, 'successes')));
    failuresListEl.innerHTML = '';
    state.failures.forEach((t, i) => failuresListEl.appendChild(createJournalEntry(t, i, 'failures')));
  }

  function createFocusSessionEntry(session, index) {
    const row = document.createElement('div');
    row.className = 'focus-session-entry' + (session.isWin ? ' focus-session-win' : ' focus-session-lesson');

    // ── Collapsed pill ──────────────────────────────────────
    const pill = document.createElement('div');
    pill.className = 'focus-session-pill';

    const pillLeft = document.createElement('div');
    pillLeft.className = 'focus-session-pill-left';

    const badge = document.createElement('span');
    badge.className = 'focus-session-badge';
    badge.textContent = session.isWin ? '🏆' : '📖';
    badge.title = session.isWin ? 'Win session (70%+ focused)' : 'Lesson session';

    const pillName = document.createElement('span');
    pillName.className = 'focus-session-name';
    // Resolve the category emoji LIVE from the id so renaming/recoloring a
    // category reflects in past journal entries. goalName stays a snapshot since
    // the goal itself may be renamed or deleted (this is an audit-log row).
    const sessCat = getCategoryById(session.category || 'general');
    pillName.textContent = (sessCat.emoji || session.catEmoji || '⚡') + ' ' + session.goalName;

    pillLeft.append(badge, pillName);

    if (session.ultraFocus) {
      const ultraMark = document.createElement('span');
      ultraMark.className = 'focus-session-ultra';
      ultraMark.textContent = '🔥';
      ultraMark.title = 'Ultra focus session — kept going past an hour-long stretch';
      pillLeft.appendChild(ultraMark);
    }

    const pillRight = document.createElement('div');
    pillRight.className = 'focus-session-pill-right';

    const timePill = document.createElement('span');
    timePill.className = 'focus-session-time';
    timePill.textContent = formatHours(session.focusMins / 60, '0m') + ' focused';

    const pctPill = document.createElement('span');
    pctPill.className = 'focus-session-pct' + (session.isWin ? ' pct-win' : ' pct-lesson');
    pctPill.textContent = session.focusPct + '%';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'done-expand-btn focus-session-expand';
    expandBtn.textContent = 'Details';

    const delBtn = document.createElement('button');
    delBtn.className = 'task-delete';
    delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      state.focusSessions.splice(index, 1);
      saveState(); renderJournal();
    });

    pillRight.append(timePill, pctPill, expandBtn, delBtn);
    pill.append(pillLeft, pillRight);

    // ── Expanded detail panel ────────────────────────────────
    const detail = document.createElement('div');
    detail.className = 'focus-session-detail hidden';

    function addDetailBlock(label, text) {
      if (!text) return;
      const block = document.createElement('div');
      block.className = 'focus-session-detail-block';
      const lbl = document.createElement('span');
      lbl.className = 'focus-session-detail-label';
      lbl.textContent = label;
      const txt = document.createElement('p');
      txt.className = 'focus-session-detail-text';
      txt.textContent = text;
      block.append(lbl, txt);
      detail.appendChild(block);
    }

    addDetailBlock('Intention', session.intention);
    addDetailBlock('State of mind', session.entryTag
      ? session.entryTag + (session.entryNote ? ` — "${session.entryNote}"` : '')
      : null);
    if (session.midNotes && session.midNotes.length > 0) {
      // midNotes are { text, at } since timestamps were added; older
      // records hold plain strings.
      addDetailBlock('During session', session.midNotes.map(n => {
        if (typeof n === 'string') return n;
        const time = n.at ? new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
        return time ? `${n.text} (${time})` : n.text;
      }).join(' · '));
    }
    addDetailBlock('Exit note', session.exitTag
      ? session.exitTag + (session.exitNote ? ` — "${session.exitNote}"` : '')
      : session.exitNote);

    let expanded = false;
    expandBtn.addEventListener('click', e => {
      e.stopPropagation();
      expanded = !expanded;
      detail.classList.toggle('hidden', !expanded);
      expandBtn.textContent = expanded ? 'Hide' : 'Details';
    });

    row.append(pill, detail);
    return row;
  }

  function createJournalEntry(text, index, type) {
    const row = document.createElement('div');
    row.className = 'journal-entry';
    const span = document.createElement('span');
    span.className = 'journal-text';
    span.textContent = text;
    makeEditable(span, newVal => { state[type][index] = newVal; saveState(); });
    const del = document.createElement('button');
    del.className = 'task-delete';
    del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    del.addEventListener('click', () => {
      undoStack.push({ type, item: state[type][index], index });
      state[type].splice(index, 1); saveState(); renderJournal();
    });
    row.append(span, del);
    return row;
  }

  function addSuccess() {
    const t = successInputEl.value.trim(); if (!t) return;
    state.successes.push(t); successInputEl.value = ''; saveState(); renderJournal();
  }
  function addFailure() {
    const t = failureInputEl.value.trim(); if (!t) return;
    state.failures.push(t); failureInputEl.value = ''; saveState(); renderJournal();
  }

  if (addSuccessBtn) { addSuccessBtn.addEventListener('click', addSuccess); successInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addSuccess(); }); }
  if (addFailureBtn) { addFailureBtn.addEventListener('click', addFailure); failureInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addFailure(); }); }

  // =========================================================
  // SUMMARY & RINGS
  // =========================================================
  function setRingProgress(el, frac) {
    if (!el) return;
    el.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, frac)));
  }

  function renderSummary() {
    const allGoals = state.goals;
    const gh = allGoals.reduce((s, g) => s + (g.hours || 0), 0);
    totalHoursEl.textContent = gh > 0 ? gh.toFixed(1) + 'h' : '0h';
    const dh = state.distractions.reduce((s, d) => s + (d.hours || 0), 0);
    distractionHoursEl.textContent = dh > 0 ? dh.toFixed(1) + 'h' : '0h';
    const ap = allGoals.length > 0
      ? Math.round(allGoals.reduce((s, g) => s + (g.progress || 0), 0) / allGoals.length)
      : 0;
    avgProgressEl.textContent = ap + '%';

    const qh = (state.quickDone || []).reduce((s, q) => s + (q.hours || 0), 0);
    if (quickHoursEl) quickHoursEl.textContent = qh > 0 ? qh.toFixed(1) + 'h' : '0h';

    setRingProgress(ringProgress, ap / 100);
    setRingProgress(ringHours, Math.min(gh / 8, 1));
    setRingProgress(ringDistractionHours, Math.min(dh / 4, 1));
    setRingProgress(ringQuickHours, Math.min(qh / 4, 1));

    summaryBreakdownEl.innerHTML = '';
    allGoals.forEach(g => {
      const row = document.createElement('div'); row.className = 'breakdown-item';
      const n = document.createElement('span'); n.className = 'breakdown-name'; n.textContent = g.name;
      if ((g.progress || 0) >= 100) n.classList.add('breakdown-name-done');
      const h = document.createElement('span'); h.className = 'breakdown-hours'; h.textContent = (g.hours || 0) + 'h';
      const bc = document.createElement('div'); bc.className = 'breakdown-bar-container';
      const b = document.createElement('div'); b.className = 'breakdown-bar'; b.style.width = (g.progress || 0) + '%';
      if ((g.progress || 0) >= 100) b.classList.add('breakdown-bar-done');
      bc.appendChild(b);
      row.append(n, h, bc);
      summaryBreakdownEl.appendChild(row);
    });

    updateEncouragement(ap, gh, dh);
  }

  function updateEncouragement(ap, gh, dh) {
    const el = document.getElementById('encouragement-text');
    if (!el) return;

    const completed = getCompletedGoals();
    if (completed.length > 0 && completed.length === state.goals.length) {
      el.textContent = `All ${completed.length} goals done. You didn't just plan a good day — you lived one. That's rare.`;
      return;
    }

    if (completed.length > 0) {
      el.textContent = `${completed.length} goal${completed.length > 1 ? 's' : ''} completed. The momentum is real. Carry it forward.`;
      return;
    }

    if (dh > 0 && state.distractions.length > 0 && state.goals.length > 0) {
      const td = state.distractions.reduce((m, d) => (d.hours || 0) > (m.hours || 0) ? d : m, state.distractions[0]);
      const tg = state.goals.reduce((m, g) => (g.progress || 0) < (m.progress || 0) ? g : m, state.goals[0]);
      if ((td.hours || 0) > 0 && (tg.progress || 0) < 80) {
        const pp = Math.min(100, (tg.progress || 0) + Math.round((td.hours || 0) * 12));
        el.textContent = `You've spent ${td.hours}h on "${td.name}." That same time on "${tg.name}" could have brought it to ~${pp}%. The work won't be perfect — but done beats imagined.`;
        return;
      }
    }

    if (state.goals.length === 0) el.textContent = "You have roughly 4,000 weeks in a lifetime. This one counts. Start by adding just one goal.";
    else if (gh > 0 && dh === 0) el.textContent = "You're investing in what matters and keeping distractions at bay. This is how days become a life well-spent.";
    else if (ap >= 75) el.textContent = "Over 75% progress. You showed up, did the work, and didn't wait for perfect. That's the whole game.";
    else if (ap >= 40) el.textContent = "Past the halfway mark. The hardest part was starting — you've done that. Keep going.";
    else el.textContent = "The future is never guaranteed — only this moment is real. Every hour on your goals is an hour chosen well.";
  }

  function updateAddButtonVisibility() {
    const activeGoalCount = getActiveGoals().length;
    addGoalRow.classList.toggle('hidden', activeGoalCount >= MAX_GOALS);
    addDistractionRow.classList.toggle('hidden', state.distractions.length >= MAX_DISTRACTIONS);
  }

  // =========================================================
  // ADDING TASKS
  // =========================================================
  function addGoal() {
    const n = goalInputEl.value.trim();
    if (!n || getActiveGoals().length >= MAX_GOALS) return;
    state.goals.push({ name: n, hours: 0, progress: 0 }); goalInputEl.value = '';
    saveState(); render();
    pulseBlobEvent('add');
    if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
  }
  function addDistraction() {
    const n = distractionInputEl.value.trim(); if (!n || state.distractions.length >= MAX_DISTRACTIONS) return;
    state.distractions.push({ name: n, hours: 0 }); distractionInputEl.value = '';
    saveState(); render();
    pulseBlobEvent('distraction');
  }

  addGoalBtn.addEventListener('click', () => {
    const n = goalInputEl.value.trim();
    if (n) {
      // Name already typed — open splash with name pre-filled
      openTaskDetailModal({ name: n, category: null, repeatable: false }, (result) => {
        if (getActiveGoals().length >= MAX_GOALS) return;
        state.goals.push({ name: result.name, hours: 0, progress: 0, category: result.category || null, repeatable: result.repeatable });
        goalInputEl.value = '';
        saveState(); render(); pulseBlobEvent('add');
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
      });
    } else {
      // Nothing typed — open blank splash
      openTaskDetailModal({ name: '', category: null, repeatable: false }, (result) => {
        if (!result.name || getActiveGoals().length >= MAX_GOALS) return;
        state.goals.push({ name: result.name, hours: 0, progress: 0, category: result.category || null, repeatable: result.repeatable });
        saveState(); render(); pulseBlobEvent('add');
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
      });
    }
  });
  goalInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const n = goalInputEl.value.trim();
      if (!n || getActiveGoals().length >= MAX_GOALS) return;
      state.goals.push({ name: n, hours: 0, progress: 0 });
      goalInputEl.value = '';
      saveState(); render();
      pulseBlobEvent('add');
      if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
    }
  });
  addDistractionBtn.addEventListener('click', addDistraction);
  distractionInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addDistraction(); });

  resetDayBtn.addEventListener('click', () => {
    if (confirm('Archive today and start fresh? Progress will be saved in history.')) {
      archiveDay(state); state = getDefaultState(); saveState(); render();
    }
  });

  // =========================================================
  // SMOOTH DRAG & DROP — Pointer Events (cards)
  // =========================================================
  let activeDrag = null; // { ghost, source, list, type, startX, startY, origRect }

  function setupCardDrag(card) {
    const handle = card.querySelector('.card-drag-handle');
    if (!handle) return;

    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      startCardDrag(e, card);
    });
  }

  function startCardDrag(e, card) {
    const rect = card.getBoundingClientRect();

    const ghost = card.cloneNode(true);
    ghost.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      opacity: 0.85;
      pointer-events: none;
      z-index: 9999;
      transform: scale(1.02) rotate(1deg);
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
      transition: transform 0.1s ease;
      border-radius: 16px;
    `;
    document.body.appendChild(ghost);

    card.classList.add('card-dragging');

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    activeDrag = { ghost, card, offsetX, offsetY, type: 'card' };

    document.addEventListener('pointermove', onCardDragMove);
    document.addEventListener('pointerup', onCardDragEnd, { once: true });
  }

  function onCardDragMove(e) {
    if (!activeDrag || activeDrag.type !== 'card') return;
    const { ghost, card, offsetX, offsetY } = activeDrag;

    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';

    const midX = e.clientX;
    const midY = e.clientY;

    // Find which col + insertBefore the cursor is over
    let newCol = null;
    let newInsertBefore = null;

    const cols = Array.from(document.querySelectorAll('.col'));
    for (const col of cols) {
      const colRect = col.getBoundingClientRect();
      if (midX < colRect.left || midX > colRect.right) continue;

      const siblings = Array.from(col.querySelectorAll('.draggable-card:not(.card-dragging)'));
      for (const sib of siblings) {
        const sibRect = sib.getBoundingClientRect();
        if (midY < sibRect.top + sibRect.height / 2) {
          newInsertBefore = sib;
          break;
        }
      }
      newCol = col;
      break;
    }

    // Only move/recreate the indicator when the slot actually changes
    const slotChanged = newCol !== activeDrag.targetCol || newInsertBefore !== activeDrag.insertBefore;
    if (slotChanged) {
      document.querySelectorAll('.card-drop-indicator').forEach(el => el.remove());

      if (newCol) {
        const indicator = document.createElement('div');
        indicator.className = 'card-drop-indicator';
        if (newInsertBefore) {
          newCol.insertBefore(indicator, newInsertBefore);
        } else {
          newCol.appendChild(indicator);
        }
      }

      activeDrag.targetCol = newCol;
      activeDrag.insertBefore = newInsertBefore;
    }
  }

  function onCardDragEnd(e) {
    document.removeEventListener('pointermove', onCardDragMove);
    if (!activeDrag || activeDrag.type !== 'card') { activeDrag = null; return; }

    const { ghost, card, targetCol, insertBefore } = activeDrag;
    ghost.remove();
    document.querySelectorAll('.card-drop-indicator').forEach(el => el.remove());
    card.classList.remove('card-dragging');

    if (targetCol) {
      if (insertBefore) {
        targetCol.insertBefore(card, insertBefore);
      } else {
        targetCol.appendChild(card);
      }
    }

    saveCardLayout();
    activeDrag = null;
  }

  // =========================================================
  // TASK REORDER — lift-in-place with sibling shifting
  // =========================================================
  function setupTaskDrag(item, list, type) {
    const handle = item.querySelector('.task-drag-handle');
    if (!handle) return;

    handle.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      startTaskDrag(e, item, list, type);
    });
  }

  function startTaskDrag(e, item, list, type) {
    const rect  = item.getBoundingClientRect();
    const itemH = rect.height;
    const gap   = parseFloat(getComputedStyle(list).gap) || 10;
    const step  = itemH + gap;

    const allItems = Array.from(list.querySelectorAll('.task-item'));
    const siblings = allItems.filter(el => el !== item);

    // displayIndex = position among DOM items (0-based); used for all slot math
    const displayIndex = allItems.indexOf(item);
    // stateIndex = index in state.goals / state.distractions array
    const stateIndex = parseInt(item.dataset.goalIndex ?? item.dataset.distIndex ?? -1);

    item.classList.add('task-lifted');
    siblings.forEach(s => s.classList.add('task-shifting'));

    const pointerOffsetY = e.clientY - rect.top;
    const listRect   = list.getBoundingClientRect();
    const naturalTop = rect.top - listRect.top;
    const minTop = 0;
    const maxTop = listRect.height - itemH;

    // The card that owns this list — used to detect when drag exits card bounds
    const parentCard = list.closest('.card');

    activeDrag = { item, list, type, siblings, step, displayIndex, stateIndex,
                   draggingIndex: displayIndex, currentSlot: displayIndex,
                   pointerOffsetY, naturalTop, listTop: listRect.top, minTop, maxTop,
                   dragType: 'task', parentCard };

    document.addEventListener('pointermove', onTaskDragMove);
    document.addEventListener('pointerup',   onTaskDragEnd, { once: true });
  }

  function onTaskDragMove(e) {
    if (!activeDrag) return;

    // ── Cross-card ghost mode ──────────────────────────────────
    if (activeDrag.dragType === 'cross') {
      const { ghost, goalData, ghostW, ghostH } = activeDrag;
      ghost.style.transform = `translate(${e.clientX - (ghostW || 200) / 2}px, ${e.clientY - (ghostH || 44) / 2}px)`;

      const backlogCard = document.getElementById('backlog-section');
      const goalsCard   = document.getElementById('goals-section');

      if (activeDrag.crossTarget === 'backlog') {
        const insideBacklog = backlogCard && (() => { const br = backlogCard.getBoundingClientRect(); return e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom; })();
        const insideGoals   = goalsCard   && (() => { const gr = goalsCard.getBoundingClientRect();   return e.clientX >= gr.left && e.clientX <= gr.right && e.clientY >= gr.top && e.clientY <= gr.bottom; })();

        if (insideBacklog) {
          // ── Over backlog card ──
          if (activeDrag.overGoals) { removeGoalsReentryPlaceholder(); }
          activeDrag.overGoals = false;
          activeDrag.overBacklog = true;
          goalsCard && goalsCard.classList.remove('goals-drop-target');
          backlogCard.classList.add('goals-drop-target');
          const step = crossDropStep(backlogListEl, '.backlog-item');
          const listRect = backlogListEl.getBoundingClientRect();
          const slot = Math.max(0, Math.round((e.clientY - listRect.top) / step));
          insertCrossPlaceholder(slot, backlogListEl, '.backlog-item', 'backlog-item backlog-placeholder', goalData.name);

        } else if (insideGoals) {
          // ── Re-entered goals card ──
          if (!activeDrag.overGoals) { removeCrossPlaceholder(); }
          activeDrag.overGoals = true;
          activeDrag.overBacklog = false;
          backlogCard && backlogCard.classList.remove('goals-drop-target');
          goalsCard.classList.add('goals-drop-target');
          // Compute step from a real task row (original item already removed from DOM)
          const refRow = goalsListEl.querySelector('.task-item:not(.task-reentry-placeholder)');
          const stepH = refRow
            ? refRow.getBoundingClientRect().height + (parseFloat(getComputedStyle(goalsListEl).gap) || 10)
            : 52;
          const listRect = goalsListEl.getBoundingClientRect();
          const slot = Math.max(0, Math.round((e.clientY - listRect.top) / stepH));
          insertGoalsReentryPlaceholder(slot, goalData.name);

        } else {
          // ── Over neither card ──
          if (activeDrag.overGoals) { removeGoalsReentryPlaceholder(); }
          if (activeDrag.overBacklog) { removeCrossPlaceholder(); }
          activeDrag.overGoals = false;
          activeDrag.overBacklog = false;
          backlogCard && backlogCard.classList.remove('goals-drop-target');
          goalsCard   && goalsCard.classList.remove('goals-drop-target');
        }
      }
      return;
    }

    // ── Normal within-list reorder mode ───────────────────────
    if (activeDrag.dragType !== 'task') return;
    const { item, list, siblings, step, draggingIndex, pointerOffsetY, naturalTop, minTop, maxTop, parentCard } = activeDrag;

    // Check if pointer has left the parent card — if so, switch to cross-card mode
    if (parentCard && activeDrag.type === 'goal') {
      const cr = parentCard.getBoundingClientRect();
      const outside = e.clientX < cr.left || e.clientX > cr.right || e.clientY < cr.top || e.clientY > cr.bottom;
      if (outside) {
        // Tear down task-lift state
        item.classList.remove('task-lifted');
        item.style.transform = '';
        siblings.forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });

        // Get data for the goal being dragged (use stateIndex to address state.goals correctly)
        const goalData = state.goals[activeDrag.stateIndex];
        if (!goalData) { activeDrag = null; return; }

        // Release pointer capture from handle so events route globally during cross-drag
        const handle = item.querySelector('.task-drag-handle');
        try { if (handle) handle.releasePointerCapture(e.pointerId); } catch(_) {}

        // Remove the item from the DOM entirely — hiding/collapsing leaves compositor
        // layer artifacts that trail across the screen during pointer movement
        const itemParent = item.parentNode;
        const itemNextSibling = item.nextSibling;
        if (itemParent) itemParent.removeChild(item);

        // Build ghost — no backdrop-filter (causes compositing trail); plain opaque pill
        const cat = getCategoryById(goalData.category || 'general');
        const ghost = document.createElement('div');
        ghost.style.cssText = [
          'position:fixed',
          'left:0',
          'top:0',
          'pointer-events:none',
          'z-index:9999',
          'display:flex',
          'align-items:center',
          'gap:8px',
          'background:#ffffff',
          'border:1.5px solid rgba(45,106,79,0.25)',
          'border-radius:12px',
          'padding:10px 16px',
          'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
          'font-family:var(--font,system-ui)',
          'font-size:0.85rem',
          'font-weight:600',
          'color:#1B4332',
          'max-width:260px',
          'white-space:nowrap',
          'will-change:transform',
        ].join(';');
        ghost.innerHTML = `<span style="font-size:1rem;flex-shrink:0">${cat.emoji}</span><span style="overflow:hidden;text-overflow:ellipsis">${goalData.name}</span>`;
        document.body.appendChild(ghost);
        const gw = ghost.offsetWidth || 200;
        const gh = ghost.offsetHeight || 44;
        ghost.style.transform = `translate(${e.clientX - gw / 2}px, ${e.clientY - gh / 2}px)`;

        // Transition activeDrag to cross mode
        activeDrag = {
          dragType: 'cross',
          crossTarget: 'backlog',
          ghost,
          ghostW: gw,
          ghostH: gh,
          goalData,
          goalIndex: activeDrag.stateIndex,
          originalItem: item,
          originalList: list,
          originalDisplayIndex: activeDrag.displayIndex,
          itemParent,
          itemNextSibling,
          crossPlaceholderEl: null,
          crossSlot: -1,
          goalsPlaceholderEl: null,
          goalsSlot: -1,
          overGoals: false,
          overBacklog: false,
        };
        return;
      }
    }

    const rawTop = (e.clientY - pointerOffsetY) - (activeDrag.listTop + naturalTop);
    const desiredTop = Math.max(minTop - naturalTop, Math.min(maxTop - naturalTop, rawTop));
    item.style.transform = `translateY(${desiredTop}px)`;

    const slotsMoved = Math.round(desiredTop / step);
    const newSlot = Math.max(0, Math.min(draggingIndex + slotsMoved, siblings.length));

    if (newSlot !== activeDrag.currentSlot) {
      activeDrag.currentSlot = newSlot;

      siblings.forEach((sib, i) => {
        const origFull = i < draggingIndex ? i : i + 1;
        if (origFull >= newSlot && origFull < draggingIndex) {
          sib.style.transform = `translateY(${step}px)`;
        } else if (origFull > draggingIndex && origFull <= newSlot) {
          sib.style.transform = `translateY(-${step}px)`;
        } else {
          sib.style.transform = '';
        }
      });
    }
  }

  function crossDropStep(listEl, selector) {
    const rows = Array.from(listEl.querySelectorAll(selector + ':not(.backlog-placeholder):not(.sidebar-placeholder)'));
    if (!rows.length) return 48;
    return rows[0].getBoundingClientRect().height + (parseFloat(getComputedStyle(listEl).gap) || 8);
  }

  function insertCrossPlaceholder(slot, listEl, selector, className, label) {
    if (!activeDrag) return;
    if (!activeDrag.crossPlaceholderEl) {
      activeDrag.crossPlaceholderEl = document.createElement('div');
      activeDrag.crossPlaceholderEl.className = className;
      activeDrag.crossPlaceholderEl.textContent = label;
    }
    const rows = Array.from(listEl.querySelectorAll(selector + ':not(.backlog-placeholder):not(.sidebar-placeholder)'));
    const clamped = Math.max(0, Math.min(slot, rows.length));
    if (clamped !== activeDrag.crossSlot) {
      activeDrag.crossSlot = clamped;
      clamped >= rows.length
        ? listEl.appendChild(activeDrag.crossPlaceholderEl)
        : listEl.insertBefore(activeDrag.crossPlaceholderEl, rows[clamped]);
    }
  }

  function removeCrossPlaceholder() {
    if (!activeDrag || !activeDrag.crossPlaceholderEl) return;
    if (activeDrag.crossPlaceholderEl.parentNode) activeDrag.crossPlaceholderEl.parentNode.removeChild(activeDrag.crossPlaceholderEl);
    activeDrag.crossPlaceholderEl = null;
    activeDrag.crossSlot = -1;
  }

  function insertGoalsReentryPlaceholder(slot, label) {
    if (!activeDrag) return;
    if (!activeDrag.goalsPlaceholderEl) {
      const ph = document.createElement('div');
      ph.className = 'task-item task-reentry-placeholder';
      // Match the height of a real task row (item is removed from DOM, so all rows are real)
      const refItem = goalsListEl.querySelector('.task-item:not(.task-reentry-placeholder)');
      if (refItem) ph.style.height = refItem.getBoundingClientRect().height + 'px';
      ph.innerHTML = `<span class="task-reentry-name">${label}</span>`;
      activeDrag.goalsPlaceholderEl = ph;
    }
    const rows = Array.from(goalsListEl.querySelectorAll('.task-item:not(.task-reentry-placeholder)'));
    const clamped = Math.max(0, Math.min(slot, rows.length));
    if (clamped !== activeDrag.goalsSlot) {
      activeDrag.goalsSlot = clamped;
      clamped >= rows.length
        ? goalsListEl.appendChild(activeDrag.goalsPlaceholderEl)
        : goalsListEl.insertBefore(activeDrag.goalsPlaceholderEl, rows[clamped]);
    }
  }

  function removeGoalsReentryPlaceholder() {
    if (!activeDrag || !activeDrag.goalsPlaceholderEl) return;
    if (activeDrag.goalsPlaceholderEl.parentNode) activeDrag.goalsPlaceholderEl.parentNode.removeChild(activeDrag.goalsPlaceholderEl);
    activeDrag.goalsPlaceholderEl = null;
    activeDrag.goalsSlot = -1;
  }

  function onTaskDragEnd(e) {
    document.removeEventListener('pointermove', onTaskDragMove);

    if (!activeDrag) return;

    // ── Cross-card drop ────────────────────────────────────────
    if (activeDrag.dragType === 'cross') {
      const { ghost, goalData, goalIndex, crossSlot, goalsSlot, originalItem, originalDisplayIndex, itemParent, itemNextSibling } = activeDrag;
      ghost.remove();

      const backlogCard = document.getElementById('backlog-section');
      const goalsCard   = document.getElementById('goals-section');
      removeCrossPlaceholder();
      removeGoalsReentryPlaceholder();
      if (backlogCard) backlogCard.classList.remove('goals-drop-target');
      if (goalsCard)   goalsCard.classList.remove('goals-drop-target');

      // Use actual drop coordinates — don't rely solely on flags (pointermove may not fire on final frame)
      function hitTest(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      const droppedOnBacklog = hitTest(backlogCard);
      const droppedOnGoals   = hitTest(goalsCard);

      if (droppedOnBacklog && goalData) {
        // ── Drop onto backlog ──
        const g = state.goals[goalIndex];
        if (g) {
          const newItem = { name: g.name, category: g.category || null, repeatable: g.repeatable || false };
          const slot = activeDrag.crossSlot >= 0 ? backlogVisibleSlotToIndex(activeDrag.crossSlot) : backlog.length;
          backlog.splice(Math.min(slot, backlog.length), 0, newItem);
          state.goals.splice(goalIndex, 1);
          saveState(); saveBacklog(); render(); renderSidebar();
        }
      } else if (droppedOnGoals && goalData) {
        // ── Drop back onto Top 5 ──
        const targetSlot = goalsSlot >= 0 ? goalsSlot : originalDisplayIndex;
        const activeGoals = getActiveGoals();
        const completedGoals = getCompletedGoals();
        const [moved] = activeGoals.splice(originalDisplayIndex, 1);
        activeGoals.splice(Math.min(targetSlot, activeGoals.length), 0, moved);
        state.goals = [...activeGoals, ...completedGoals];
        saveState(); render();
      } else {
        // ── Cancelled: restore item to its original DOM position ──
        if (itemParent && originalItem) {
          if (itemNextSibling && itemNextSibling.parentNode === itemParent) {
            itemParent.insertBefore(originalItem, itemNextSibling);
          } else {
            itemParent.appendChild(originalItem);
          }
        }
        Array.from(goalsListEl.querySelectorAll('.task-shifting')).forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });
      }

      activeDrag = null;
      return;
    }

    // ── Normal within-list reorder ─────────────────────────────
    if (activeDrag.dragType !== 'task') { activeDrag = null; return; }

    const { item, list, type, siblings, displayIndex, stateIndex, currentSlot } = activeDrag;

    item.classList.remove('task-lifted');
    item.style.transform = '';
    siblings.forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });

    if (currentSlot !== displayIndex) {
      if (type === 'goal') {
        // Reorder within active goals only, then rebuild state.goals preserving completed goals
        const activeGoals = getActiveGoals();
        const completedGoals = getCompletedGoals();
        const [moved] = activeGoals.splice(displayIndex, 1);
        activeGoals.splice(Math.min(currentSlot, activeGoals.length), 0, moved);
        state.goals = [...activeGoals, ...completedGoals];
      } else {
        const arr = state.distractions;
        const [moved] = arr.splice(stateIndex, 1);
        arr.splice(Math.min(currentSlot, arr.length), 0, moved);
      }
      saveState();
    }

    activeDrag = null;
    render();
  }

  // =========================================================
  // SIDEBAR BACKLOG → TOP 5 DRAG
  // =========================================================
  function setupSidebarBacklogDrag(dragEl, backlogItem) {
    dragEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      dragEl.setPointerCapture(e.pointerId);

      const goalsCard = document.getElementById('goals-section');
      if (!goalsCard) return;

      // Ghost card follows the cursor
      const cat = getCategoryById(backlogItem.category || 'general');
      const ghost = document.createElement('div');
      ghost.className = 'sidebar-drag-ghost';
      ghost.innerHTML = `<span class="sidebar-drag-ghost-emoji">${cat.emoji}</span><span class="sidebar-drag-ghost-name">${backlogItem.name}</span>`;
      document.body.appendChild(ghost);

      // Placeholder slot state — only active while inside the goals card
      let placeholder = null;   // the fake task-item row inserted into goalsListEl
      let currentSlot = -1;     // which index slot the placeholder is sitting at (-1 = not in list)

      function getStep() {
        const items = Array.from(goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
        if (!items.length) return 52; // fallback height
        const r = items[0].getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(goalsListEl).gap) || 10;
        return r.height + gap;
      }

      function insertPlaceholder(slot) {
        if (!placeholder) {
          placeholder = document.createElement('div');
          placeholder.className = 'task-item sidebar-placeholder';
          placeholder.textContent = backlogItem.name;
        }
        const items = Array.from(goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
        const clampedSlot = Math.max(0, Math.min(slot, items.length));
        if (clampedSlot !== currentSlot) {
          currentSlot = clampedSlot;
          if (clampedSlot >= items.length) {
            goalsListEl.appendChild(placeholder);
          } else {
            goalsListEl.insertBefore(placeholder, items[clampedSlot]);
          }
        }
      }

      function removePlaceholder() {
        if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
        placeholder = null;
        currentSlot = -1;
      }

      const move = ev => {
        ghost.style.left = (ev.clientX - ghost.offsetWidth / 2) + 'px';
        ghost.style.top = (ev.clientY - ghost.offsetHeight / 2) + 'px';

        const gr = goalsCard.getBoundingClientRect();
        const inside = ev.clientX >= gr.left && ev.clientX <= gr.right &&
                       ev.clientY >= gr.top  && ev.clientY <= gr.bottom;

        if (inside) {
          if (getActiveGoals().length >= MAX_GOALS) {
            // Full — just highlight with outline, no placeholder
            goalsCard.classList.add('goals-drop-target');
            removePlaceholder();
          } else {
            goalsCard.classList.add('goals-drop-target');
            // Compute slot from pointer Y relative to the list
            const listRect = goalsListEl.getBoundingClientRect();
            const step = getStep();
            const relY = ev.clientY - listRect.top;
            const slot = Math.max(0, Math.round(relY / step));
            insertPlaceholder(slot);
          }
        } else {
          goalsCard.classList.remove('goals-drop-target');
          removePlaceholder();
        }
      };

      const up = ev => {
        document.removeEventListener('pointermove', move);
        ghost.remove();
        goalsCard.classList.remove('goals-drop-target');

        const gr = goalsCard.getBoundingClientRect();
        const dropped = ev.clientX >= gr.left && ev.clientX <= gr.right &&
                        ev.clientY >= gr.top  && ev.clientY <= gr.bottom;

        const insertAt = currentSlot; // capture before removePlaceholder resets it
        removePlaceholder();

        if (dropped) {
          if (getActiveGoals().length >= MAX_GOALS) {
            goalsCard.classList.add('goals-drop-full');
            setTimeout(() => goalsCard.classList.remove('goals-drop-full'), 600);
          } else {
            const bi = backlog.findIndex(b => b.name === backlogItem.name && (b.category || 'general') === (backlogItem.category || 'general'));
            if (bi !== -1) backlog.splice(bi, 1);
            // Insert at the slot position within active goals
            const activeGoals = getActiveGoals();
            const clampedSlot = Math.max(0, Math.min(insertAt < 0 ? activeGoals.length : insertAt, activeGoals.length));
            // Find the real state.goals index to insert before
            const newGoal = { name: backlogItem.name, hours: 0, progress: 0, category: backlogItem.category || null, repeatable: backlogItem.repeatable || false, fromBacklog: true };
            if (clampedSlot >= activeGoals.length) {
              // Append after last active goal — find the real index of the last active goal
              const lastActive = activeGoals[activeGoals.length - 1];
              const insertIdx = lastActive ? state.goals.indexOf(lastActive) + 1 : state.goals.length;
              state.goals.splice(insertIdx, 0, newGoal);
            } else {
              const targetGoal = activeGoals[clampedSlot];
              const insertIdx = state.goals.indexOf(targetGoal);
              state.goals.splice(insertIdx, 0, newGoal);
            }
            saveBacklog();
            saveState();
            render();
            renderSidebar();
          }
        }
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, { once: true });
    });
  }

  // =========================================================
  // BACKLOG CARD → TOP 5 drag  (mirrors sidebar backlog drag)
  // =========================================================
  function setupBacklogItemDrag(dragEl, item, index) {
    dragEl.addEventListener('pointerdown', e => {
      // Only trigger on the drag handle, not the whole row
      if (!e.target.closest('.backlog-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      dragEl.setPointerCapture(e.pointerId);

      const goalsCard = document.getElementById('goals-section');
      if (!goalsCard) return;

      const cat = getCategoryById(item.category || 'general');
      const ghost = document.createElement('div');
      ghost.className = 'sidebar-drag-ghost';
      ghost.innerHTML = `<span class="sidebar-drag-ghost-emoji">${cat.emoji}</span><span class="sidebar-drag-ghost-name">${item.name}</span>`;
      document.body.appendChild(ghost);

      let placeholder = null;
      let currentSlot = -1;

      function getStep() {
        const items = Array.from(goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
        if (!items.length) return 52;
        const r = items[0].getBoundingClientRect();
        return r.height + (parseFloat(getComputedStyle(goalsListEl).gap) || 10);
      }

      function insertPlaceholder(slot) {
        if (!placeholder) {
          placeholder = document.createElement('div');
          placeholder.className = 'task-item sidebar-placeholder';
          placeholder.textContent = item.name;
        }
        const rows = Array.from(goalsListEl.querySelectorAll('.task-item:not(.sidebar-placeholder)'));
        const clamped = Math.max(0, Math.min(slot, rows.length));
        if (clamped !== currentSlot) {
          currentSlot = clamped;
          clamped >= rows.length ? goalsListEl.appendChild(placeholder) : goalsListEl.insertBefore(placeholder, rows[clamped]);
        }
      }

      function removePlaceholder() {
        if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
        placeholder = null; currentSlot = -1;
      }

      const move = ev => {
        ghost.style.left = (ev.clientX - ghost.offsetWidth / 2) + 'px';
        ghost.style.top  = (ev.clientY - ghost.offsetHeight / 2) + 'px';
        const gr = goalsCard.getBoundingClientRect();
        const inside = ev.clientX >= gr.left && ev.clientX <= gr.right && ev.clientY >= gr.top && ev.clientY <= gr.bottom;
        if (inside) {
          goalsCard.classList.add('goals-drop-target');
          if (getActiveGoals().length < MAX_GOALS) {
            const listRect = goalsListEl.getBoundingClientRect();
            const slot = Math.max(0, Math.round((ev.clientY - listRect.top) / getStep()));
            insertPlaceholder(slot);
          } else {
            removePlaceholder();
          }
        } else {
          goalsCard.classList.remove('goals-drop-target');
          removePlaceholder();
        }
      };

      const up = ev => {
        document.removeEventListener('pointermove', move);
        ghost.remove();
        goalsCard.classList.remove('goals-drop-target');
        const gr = goalsCard.getBoundingClientRect();
        const dropped = ev.clientX >= gr.left && ev.clientX <= gr.right && ev.clientY >= gr.top && ev.clientY <= gr.bottom;
        const insertAt = currentSlot;
        removePlaceholder();

        if (dropped) {
          if (getActiveGoals().length >= MAX_GOALS) {
            goalsCard.classList.add('goals-drop-full');
            setTimeout(() => goalsCard.classList.remove('goals-drop-full'), 600);
          } else {
            backlog.splice(index, 1);
            const activeGoals = getActiveGoals();
            const clamped = Math.max(0, Math.min(insertAt < 0 ? activeGoals.length : insertAt, activeGoals.length));
            const newGoal = { name: item.name, hours: 0, progress: 0, category: item.category || null, repeatable: item.repeatable || false, fromBacklog: true };
            if (clamped >= activeGoals.length) {
              const last = activeGoals[activeGoals.length - 1];
              state.goals.splice(last ? state.goals.indexOf(last) + 1 : state.goals.length, 0, newGoal);
            } else {
              state.goals.splice(state.goals.indexOf(activeGoals[clamped]), 0, newGoal);
            }
            saveBacklog(); saveState(); render(); renderSidebar();
          }
        }
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, { once: true });
    });
  }

  // =========================================================
  // CARD LAYOUT
  // =========================================================
  function saveCardLayout() {
    const layout = {};
    document.querySelectorAll('.col').forEach(col => {
      const cards = Array.from(col.querySelectorAll('.draggable-card')).map(c => c.dataset.cardId);
      layout[col.id] = cards;
    });
    storageSet(LAYOUT_KEY, JSON.stringify(layout));
  }

  function restoreCardLayout() {
    try {
      const raw = storageGet(LAYOUT_KEY);
      if (!raw) return;
      const layout = JSON.parse(raw);
      Object.keys(layout).forEach(colId => {
        const col = document.getElementById(colId);
        if (!col) return;
        layout[colId].forEach(cardId => {
          const card = document.querySelector(`[data-card-id="${cardId}"]`);
          if (card) col.appendChild(card);
        });
      });
    } catch (e) {}
  }

  function initCardDragHandles() {
    document.querySelectorAll('.draggable-card').forEach(card => setupCardDrag(card));
  }

  // =========================================================
  // SETTINGS — gear at the bottom of the sidebar rail.
  // One organized home for app-level options. Future settings (theme
  // color, blob animation behavior, notification frequency…) each get
  // their own cat-modal-section block inside openSettingsModal().
  // =========================================================
  const APP_VERSION = '0.9.0'; // keep in sync with package.json
  const EXPORT_FORMAT_VERSION = 1;

  // Complete backup: every daybyday_* localStorage key, verbatim. Restoring
  // is a byte-for-byte round trip regardless of future schema changes.
  function collectExportPayload() {
    const keys = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('daybyday_') === 0) keys[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return {
      app: 'day-by-day',
      formatVersion: EXPORT_FORMAT_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      keys,
    };
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(collectExportPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `day-by-day-backup-${getTodayString()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Replaces all app data with the backup. Returns an error string, or
  // null on success (caller reloads the page so the app boots fresh).
  function applyImportPayload(payload) {
    if (!payload || payload.app !== 'day-by-day' || typeof payload.keys !== 'object' || payload.keys === null) {
      return 'That file isn\'t a Day by Day backup.';
    }
    if (!payload.keys.daybyday_store && !payload.keys.daybyday_data) {
      return 'This backup contains no app data.';
    }
    try {
      const stale = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('daybyday_') === 0) stale.push(k);
      }
      stale.forEach(k => localStorage.removeItem(k));
      Object.keys(payload.keys).forEach(k => {
        if (k.indexOf('daybyday_') === 0 && typeof payload.keys[k] === 'string') {
          localStorage.setItem(k, payload.keys[k]);
        }
      });
    } catch (e) {
      return 'Import failed — the browser blocked storage access.';
    }
    return null;
  }

  // Short human summary for the import confirmation.
  function describeBackup(payload) {
    try {
      const store = JSON.parse(payload.keys.daybyday_store || 'null');
      if (store && store.entities) {
        const tasks = Object.keys(store.entities).length;
        const sessions = (store.sessions || []).length;
        const cats = (store.categories || []).length;
        return `${tasks} tasks · ${sessions} focus sessions · ${cats} life areas`;
      }
    } catch (e) {}
    return 'summary unavailable';
  }

  function openSettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cat-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cat-modal settings-modal';

    const header = document.createElement('div');
    header.className = 'cat-modal-header';
    const title = document.createElement('h3');
    title.className = 'cat-modal-title';
    title.textContent = 'Settings';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cat-modal-close';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.append(title, closeBtn);

    // ── Data ─────────────────────────────────────────────────
    const dataSection = document.createElement('div');
    dataSection.className = 'cat-modal-section';
    const dataLabel = document.createElement('p');
    dataLabel.className = 'cat-modal-label';
    dataLabel.textContent = 'Data';
    const dataHint = document.createElement('p');
    dataHint.className = 'settings-hint';
    dataHint.textContent = 'Everything lives in this browser. Export a backup now and then — clearing browser data would erase the app.';

    const dataRow = document.createElement('div');
    dataRow.className = 'settings-row';
    const dataStatus = document.createElement('p');
    dataStatus.className = 'settings-hint settings-status';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary';
    exportBtn.textContent = 'Export backup';
    exportBtn.addEventListener('click', () => {
      downloadExport();
      dataStatus.textContent = 'Backup downloaded.';
    });

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-ghost';
    importBtn.textContent = 'Import backup…';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.className = 'hidden';
    importBtn.addEventListener('click', () => fileInput.click());

    // Import confirmation — shown once a file parses as a backup.
    const confirmArea = document.createElement('div');
    confirmArea.className = 'settings-confirm hidden';
    const confirmText = document.createElement('p');
    confirmText.className = 'settings-hint';
    const confirmRow = document.createElement('div');
    confirmRow.className = 'settings-row';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary settings-danger-btn';
    confirmBtn.textContent = 'Replace & reload';
    const cancelImportBtn = document.createElement('button');
    cancelImportBtn.className = 'btn btn-ghost';
    cancelImportBtn.textContent = 'Cancel';
    confirmRow.append(confirmBtn, cancelImportBtn);
    confirmArea.append(confirmText, confirmRow);

    let pendingImport = null;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let payload = null;
        try { payload = JSON.parse(reader.result); } catch (e) {}
        if (!payload || payload.app !== 'day-by-day' || !payload.keys) {
          dataStatus.textContent = 'That file isn\'t a Day by Day backup.';
          confirmArea.classList.add('hidden');
          return;
        }
        pendingImport = payload;
        const when = payload.exportedAt ? new Date(payload.exportedAt).toLocaleDateString() : 'an unknown date';
        confirmText.textContent = `Backup from ${when} — ${describeBackup(payload)}. Importing replaces everything currently in the app.`;
        dataStatus.textContent = '';
        confirmArea.classList.remove('hidden');
      };
      reader.readAsText(file);
    });

    confirmBtn.addEventListener('click', () => {
      if (!pendingImport) return;
      const err = applyImportPayload(pendingImport);
      if (err) {
        dataStatus.textContent = err;
        confirmArea.classList.add('hidden');
        pendingImport = null;
        return;
      }
      location.reload();
    });
    cancelImportBtn.addEventListener('click', () => {
      pendingImport = null;
      confirmArea.classList.add('hidden');
    });

    dataRow.append(exportBtn, importBtn);
    dataSection.append(dataLabel, dataHint, dataRow, confirmArea, dataStatus, fileInput);

    // ── About ────────────────────────────────────────────────
    const aboutSection = document.createElement('div');
    aboutSection.className = 'cat-modal-section';
    const aboutLabel = document.createElement('p');
    aboutLabel.className = 'cat-modal-label';
    aboutLabel.textContent = 'About';
    const aboutText = document.createElement('p');
    aboutText.className = 'settings-hint';
    aboutText.textContent = `Day by Day v${APP_VERSION} — a finitude-aware daily focus app. Your data never leaves this browser.`;
    aboutSection.append(aboutLabel, aboutText);

    modal.append(header, dataSection, aboutSection);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) overlay.remove(); });
  }

  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);

  // =========================================================
  // TODAY'S FOCUS EDITOR — sidebar row → picker modal.
  // Set focus areas if the day-start modal was skipped, or change them
  // mid-day when the plan isn't working out. Same chips + up-to-3 rule
  // as the day-transition modal; zero selected = no filter.
  // =========================================================
  function openEditFocusModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cat-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cat-modal focus-edit-modal';

    const header = document.createElement('div');
    header.className = 'cat-modal-header';
    const title = document.createElement('h3');
    title.className = 'cat-modal-title';
    title.textContent = 'Today\'s focus';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cat-modal-close';
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.append(title, closeBtn);

    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = 'Pick up to 3 life areas for today — the backlog card and sidebar follow along. Plans change; that\'s allowed.';

    // Same chip grid + selection rule as the day-transition modal.
    const catGrid = document.createElement('div');
    catGrid.className = 'day-modal-cat-grid';
    const selectedCats = new Set(state.focusCategoryIds || []);

    activeCategories().forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'day-modal-cat-btn' + (selectedCats.has(cat.id) ? ' selected' : '');
      btn.dataset.catId = cat.id;
      const allTimeHours = cat.totalHours || 0;
      btn.innerHTML = `<span class="dmc-emoji">${cat.emoji}</span><span class="dmc-name">${cat.name}</span>${allTimeHours > 0 ? `<span class="dmc-hours">${allTimeHours.toFixed(0)}h</span>` : ''}`;
      btn.addEventListener('click', () => {
        if (selectedCats.has(cat.id)) {
          selectedCats.delete(cat.id);
          btn.classList.remove('selected');
        } else {
          if (selectedCats.size >= 3) {
            const first = catGrid.querySelector('.day-modal-cat-btn.selected');
            if (first) { selectedCats.delete(first.dataset.catId); first.classList.remove('selected'); }
          }
          selectedCats.add(cat.id);
          btn.classList.add('selected');
        }
      });
      catGrid.appendChild(btn);
    });

    const actions = document.createElement('div');
    actions.className = 'cat-modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Set focus';
    saveBtn.addEventListener('click', () => {
      state.focusCategoryIds = Array.from(selectedCats);
      saveState();
      renderSidebar();
      renderBacklog(); // backlog card filters by focus categories
      applyBlobColors();
      overlay.remove();
    });
    actions.append(cancelBtn, saveBtn);

    modal.append(header, hint, catGrid, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) overlay.remove(); });
  }

  // =========================================================
  // MODAL LOCK — design rule: while any modal overlay is open,
  // the page behind it is inert. Every overlay carries the shared
  // `modal-overlay` class; this observer toggles `modal-open` on
  // <body> (CSS kills page scroll) no matter which code path
  // opens or removes the overlay. Global shortcuts must check
  // isModalOpen() before touching background state.
  // =========================================================
  function isModalOpen() {
    return !!document.querySelector('body > .modal-overlay');
  }
  function isFocusFullscreenOpen() {
    return !!document.querySelector('body > .focus-fullscreen-overlay');
  }
  new MutationObserver(() => {
    // Class goes on <html>: overflow:hidden on body alone doesn't reliably
    // stop viewport wheel scrolling in Chromium.
    document.documentElement.classList.toggle('modal-open', isModalOpen());
    // Focus fullscreen hides the blob layer and pauses its drift loop.
    // Driven from here so every overlay.remove() path is covered for free.
    const focusOpen = isFocusFullscreenOpen();
    document.documentElement.classList.toggle('focus-fullscreen-open', focusOpen);
    if (window.DayByDayBlobs) window.DayByDayBlobs.setOccluded(focusOpen);
  }).observe(document.body, { childList: true });

  // =========================================================
  // ACTIVITY MONITOR — app-wide attention tracking.
  // Keeps a single lastActivityTime timestamp updated from real user
  // interaction (pointer, keyboard). Consumers ask "how long has the
  // user been away?" via getIdleMs(). Currently only focus mode's idle
  // check uses it; later it can feed the notifications/intelligence
  // systems (exposed on window.DayByDayApp.activity).
  // =========================================================
  let lastActivityTime = Date.now();
  let lastPointerMoveMark = 0;
  function markActivity() { lastActivityTime = Date.now(); }
  function getLastActivity() { return lastActivityTime; }
  function getIdleMs() { return Date.now() - lastActivityTime; }
  document.addEventListener('pointerdown', markActivity, { capture: true, passive: true });
  document.addEventListener('keydown', markActivity, { capture: true, passive: true });
  // pointermove fires constantly — throttle to one mark per second.
  document.addEventListener('pointermove', () => {
    const now = Date.now();
    if (now - lastPointerMoveMark > 1000) {
      lastPointerMoveMark = now;
      lastActivityTime = now;
    }
  }, { capture: true, passive: true });
  // Note: returning to the tab (visibilitychange) is deliberately NOT
  // activity — only a real interaction ends an away period.

  // =========================================================
  // UNDO — Cmd+Z / Ctrl+Z
  // =========================================================
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      if (isModalOpen()) return; // modal owns the keyboard (native text undo etc.)
      if (!undoStack.length) return;
      e.preventDefault();
      const { type, item, index } = undoStack.pop();
      if (type === 'goal') {
        state.goals.splice(Math.min(index, state.goals.length), 0, item);
        saveState(); render();
      } else if (type === 'distraction') {
        state.distractions.splice(Math.min(index, state.distractions.length), 0, item);
        saveState(); render();
      } else if (type === 'successes' || type === 'failures') {
        state[type].splice(Math.min(index, state[type].length), 0, item);
        saveState(); renderJournal();
      } else if (type === 'backlog') {
        backlog.splice(Math.min(index, backlog.length), 0, item);
        saveBacklog(); renderBacklog();
      } else if (type === 'quickDone') {
        state.quickDone.splice(Math.min(index, state.quickDone.length), 0, item);
        saveState(); renderDone();
      }
    }
  });

  // =========================================================
  // AUTO NEW-DAY DETECTION
  // =========================================================
  // =========================================================
  // DAY TRANSITION MODAL
  // =========================================================
  function showDayTransitionModal(prev) {
    // Only ever one transition modal at a time. If we cross several day
    // boundaries (left the tab open, or skipped days), dismiss any modal already
    // showing so the latest summary replaces it instead of stacking on top.
    document.querySelectorAll('.day-modal-overlay').forEach(el => el.remove());

    // Compute yesterday's stats
    const prevGoals = prev.goals || [];
    const prevDistractions = prev.distractions || [];
    const prevQuickDone = prev.quickDone || [];

    const completedGoals = prevGoals.filter(g => (g.progress || 0) >= 100);
    const incompletedGoals = prevGoals.filter(g => (g.progress || 0) < 100);
    const goalHours = prevGoals.reduce((s, g) => s + (g.hours || 0), 0);
    const quickHours = prevQuickDone.reduce((s, q) => s + (q.hours || 0), 0);
    const totalProductiveHours = goalHours + quickHours;
    const distractionHours = prevDistractions.reduce((s, d) => s + (d.hours || 0), 0);
    const DISTRACTION_THRESHOLD = 2;

    // Category breakdown from yesterday
    const catHoursYesterday = {};
    prevGoals.forEach(g => {
      const id = g.category || 'general';
      catHoursYesterday[id] = (catHoursYesterday[id] || 0) + (g.hours || 0);
    });

    // Suggest focus categories: ones with least all-time hours that have backlog or repeatable tasks
    function getSuggestedCats() {
      const catsWithWork = activeCategories().filter(cat => {
        const hasBacklog = backlog.some(b => (b.category || 'general') === cat.id);
        const hasRepeatable = prevGoals.some(g => g.repeatable && (g.category || 'general') === cat.id);
        return hasBacklog || hasRepeatable || (cat.totalHours || 0) === 0;
      });
      const ranked = [...catsWithWork].sort((a, b) => (a.totalHours || 0) - (b.totalHours || 0));
      return ranked.slice(0, 3);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay day-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'day-modal';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'day-modal-header';
    const prevDate = new Date(prev.date + 'T12:00:00');
    const dateLabel = prevDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const today = new Date(getTodayString() + 'T12:00:00');
    const dayGap = Math.round((today - prevDate) / (1000 * 60 * 60 * 24));
    const greeting = dayGap === 1 ? 'Good morning.' : `Welcome back.`;
    const subline = dayGap === 1
      ? `Here's how ${dateLabel} went`
      : `Last session: ${dateLabel}`;
    header.innerHTML = `
      <div class="day-modal-greeting">${greeting}</div>
      <div class="day-modal-date">${subline}</div>
    `;

    // ── Yesterday's summary ──
    const summary = document.createElement('div');
    summary.className = 'day-modal-summary';

    // Stat pills
    const stats = document.createElement('div');
    stats.className = 'day-modal-stats';

    function statPill(value, label, variant) {
      const p = document.createElement('div');
      p.className = 'day-stat-pill day-stat-' + variant;
      p.innerHTML = `<span class="day-stat-value">${value}</span><span class="day-stat-label">${label}</span>`;
      return p;
    }

    stats.appendChild(statPill(completedGoals.length + prevQuickDone.length, 'tasks done', 'green'));
    stats.appendChild(statPill(totalProductiveHours > 0 ? totalProductiveHours.toFixed(1) + 'h' : '—', 'focused', 'green'));
    stats.appendChild(statPill(distractionHours > 0 ? distractionHours.toFixed(1) + 'h' : '—', 'distracted', distractionHours >= DISTRACTION_THRESHOLD ? 'red' : 'muted'));
    summary.appendChild(stats);

    // Completed task list
    if (completedGoals.length > 0 || prevQuickDone.length > 0) {
      const doneList = document.createElement('div');
      doneList.className = 'day-modal-done-list';
      completedGoals.forEach(g => {
        const cat = getCategoryById(g.category || 'general');
        const row = document.createElement('div');
        row.className = 'day-modal-done-item';
        row.innerHTML = `<span class="day-done-emoji">${cat.emoji}</span><span class="day-done-name">${g.name}</span>${g.hours > 0 ? `<span class="day-done-hours">${g.hours}h</span>` : ''}`;
        doneList.appendChild(row);
      });
      prevQuickDone.forEach(q => {
        const row = document.createElement('div');
        row.className = 'day-modal-done-item day-modal-done-quick';
        row.innerHTML = `<span class="day-done-emoji">⚡</span><span class="day-done-name">${q.name}</span>${q.hours > 0 ? `<span class="day-done-hours">${q.hours}h</span>` : ''}`;
        doneList.appendChild(row);
      });
      summary.appendChild(doneList);
    }

    // Distraction warning
    if (distractionHours >= DISTRACTION_THRESHOLD) {
      const warn = document.createElement('div');
      warn.className = 'day-modal-warning';
      warn.innerHTML = `<span>⚠️</span> You logged ${distractionHours.toFixed(1)}h in distractions — more than half a morning. What's one thing you could do differently today?`;
      summary.appendChild(warn);
    }

    // ── Category insights ──
    const insights = document.createElement('div');
    insights.className = 'day-modal-insights';

    // Find lagging categories (have totalHours < average, and not zero because new)
    const activeCats = activeCategories().filter(c => (c.totalHours || 0) > 0 || backlog.some(b => (b.category || 'general') === c.id));
    if (activeCats.length > 1) {
      const avgHours = activeCats.reduce((s, c) => s + (c.totalHours || 0), 0) / activeCats.length;
      const lagging = activeCats.filter(c => (c.totalHours || 0) < avgHours * 0.5);
      const thriving = activeCats.filter(c => (c.totalHours || 0) > avgHours * 1.5);
      if (lagging.length > 0) {
        const insightEl = document.createElement('div');
        insightEl.className = 'day-modal-insight-row';
        const lagNames = lagging.map(c => `${c.emoji} ${c.name}`).join(', ');
        const thriveName = thriving.length > 0 ? thriving[0].name : null;
        insightEl.innerHTML = `<strong>${lagNames}</strong> ${lagging.length === 1 ? 'is' : 'are'} lagging behind your other life areas.${thriveName ? ` <em>${thriveName}</em> already has strong momentum.` : ''} Consider making space for it today.`;
        insights.appendChild(insightEl);
      }
    }

    // ── Focus category picker ──
    const focusSection = document.createElement('div');
    focusSection.className = 'day-modal-focus-section';
    const focusLabel = document.createElement('div');
    focusLabel.className = 'day-modal-section-label';
    focusLabel.textContent = 'Choose up to 3 focus areas for today';
    focusSection.appendChild(focusLabel);

    const catGrid = document.createElement('div');
    catGrid.className = 'day-modal-cat-grid';
    const selectedCats = new Set(getSuggestedCats().map(c => c.id));

    activeCategories().forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'day-modal-cat-btn' + (selectedCats.has(cat.id) ? ' selected' : '');
      btn.dataset.catId = cat.id;
      const allTimeHours = cat.totalHours || 0;
      btn.innerHTML = `<span class="dmc-emoji">${cat.emoji}</span><span class="dmc-name">${cat.name}</span>${allTimeHours > 0 ? `<span class="dmc-hours">${allTimeHours.toFixed(0)}h</span>` : ''}`;
      btn.addEventListener('click', () => {
        if (selectedCats.has(cat.id)) {
          selectedCats.delete(cat.id);
          btn.classList.remove('selected');
        } else {
          if (selectedCats.size >= 3) {
            // Deselect oldest selection
            const first = catGrid.querySelector('.day-modal-cat-btn.selected');
            if (first) { selectedCats.delete(first.dataset.catId); first.classList.remove('selected'); }
          }
          selectedCats.add(cat.id);
          btn.classList.add('selected');
        }
        updateRepeatableChecklist();
      });
      catGrid.appendChild(btn);
    });
    focusSection.appendChild(catGrid);

    // ── Repeatable tasks checklist ──
    const repeatSection = document.createElement('div');
    repeatSection.className = 'day-modal-repeat-section';
    const repeatLabel = document.createElement('div');
    repeatLabel.className = 'day-modal-section-label';
    repeatLabel.textContent = 'Repeatable tasks to pre-load';
    repeatSection.appendChild(repeatLabel);

    const repeatList = document.createElement('div');
    repeatList.className = 'day-modal-repeat-list';
    repeatSection.appendChild(repeatList);

    // Gather all repeatable tasks: from yesterday's goals + backlog, filtered by selected cats
    function getRepeatableTasks() {
      const seen = new Set();
      const tasks = [];
      // From yesterday's carried-over repeatable goals
      const carryover = state._carryover || [];
      carryover.forEach(g => {
        if (g.repeatable && !seen.has(g.name)) {
          seen.add(g.name);
          tasks.push({ name: g.name, category: g.category || 'general', source: 'carryover', progress: g.progress || 0 });
        }
      });
      // From backlog repeatable items
      backlog.forEach(b => {
        if (b.repeatable && !seen.has(b.name)) {
          seen.add(b.name);
          tasks.push({ name: b.name, category: b.category || 'general', source: 'backlog' });
        }
      });
      return tasks.filter(t => selectedCats.has(t.category || 'general'));
    }

    const checkedTasks = new Set();

    // Capacity warning element — shown when >MAX_GOALS tasks are checked
    const capacityWarning = document.createElement('div');
    capacityWarning.className = 'day-modal-capacity-warning hidden';
    repeatSection.appendChild(capacityWarning);

    function updateCapacityWarning() {
      const checkedCount = checkedTasks.size;
      if (checkedCount > MAX_GOALS) {
        const overflow = checkedCount - MAX_GOALS;
        capacityWarning.textContent = `Top 5 is full — ${overflow} task${overflow > 1 ? 's' : ''} will go to backlog instead. Uncheck some to choose which ones stay in Top 5.`;
        capacityWarning.classList.remove('hidden');
      } else {
        capacityWarning.classList.add('hidden');
      }
    }

    function updateRepeatableChecklist() {
      repeatList.innerHTML = '';
      const tasks = getRepeatableTasks();
      if (tasks.length === 0) {
        repeatSection.classList.add('hidden');
        return;
      }
      repeatSection.classList.remove('hidden');
      tasks.forEach(task => {
        const row = document.createElement('label');
        row.className = 'day-modal-repeat-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'day-modal-repeat-cb';
        cb.checked = checkedTasks.has(task.name);
        cb.addEventListener('change', () => {
          if (cb.checked) checkedTasks.add(task.name);
          else checkedTasks.delete(task.name);
          updateCapacityWarning();
        });
        // Default-check all
        if (!checkedTasks.has(task.name)) {
          cb.checked = true; checkedTasks.add(task.name);
        }
        const cat = getCategoryById(task.category);
        row.innerHTML = '';
        row.appendChild(cb);
        row.insertAdjacentHTML('beforeend', `<span class="day-repeat-emoji">${cat.emoji}</span><span class="day-repeat-name">${task.name}</span>${task.progress > 0 ? `<span class="day-repeat-prog">${task.progress}%</span>` : ''}`);
        repeatList.appendChild(row);
      });
      updateCapacityWarning();
    }

    updateRepeatableChecklist();

    // ── Actions ──
    const actions = document.createElement('div');
    actions.className = 'day-modal-actions';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-ghost';
    skipBtn.textContent = 'Skip, start fresh';
    skipBtn.addEventListener('click', () => {
      delete state._carryover;
      saveState();
      overlay.remove();
    });

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary';
    startBtn.textContent = 'Start my day →';
    startBtn.addEventListener('click', () => {
      const tasks = getRepeatableTasks();

      // Remove all checked repeatable tasks from backlog first (we'll re-add overflows below)
      tasks.forEach(task => {
        if (checkedTasks.has(task.name) && task.source === 'backlog') {
          const bi = backlog.findIndex(b => b.name === task.name && b.repeatable);
          if (bi !== -1) backlog.splice(bi, 1);
        }
      });

      // Fill Top 5 first; overflow checked tasks go to backlog
      tasks.forEach(task => {
        if (!checkedTasks.has(task.name)) return;
        if (state.goals.length < MAX_GOALS) {
          state.goals.push({ name: task.name, hours: 0, progress: task.progress || 0, category: task.category, repeatable: true });
        } else {
          // Top 5 full — put overflow in backlog (avoid duplicates)
          if (!backlog.find(b => b.name === task.name)) {
            backlog.push({ name: task.name, category: task.category, repeatable: true });
          }
        }
      });

      // Carry over non-repeatable unfinished goals from _carryover if in selected cats
      (state._carryover || []).forEach(g => {
        if (!g.repeatable && selectedCats.has(g.category || 'general') && state.goals.length < MAX_GOALS) {
          if (!state.goals.find(eg => eg.name === g.name)) {
            state.goals.push({ name: g.name, hours: 0, progress: g.progress, prevHours: g.prevHours || 0, category: g.category || null });
          }
        }
      });

      // Persist today's focus categories so the sidebar can show them all day
      state.focusCategoryIds = Array.from(selectedCats);

      delete state._carryover;
      saveBacklog();
      saveState();
      render();
      renderSidebar();
      applyBlobColors();
      overlay.remove();
    });

    actions.append(skipBtn, startBtn);

    modal.append(header, summary);
    if (insights.children.length > 0) modal.appendChild(insights);
    modal.append(focusSection, repeatSection, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function checkForNewDay() {
    const today = getTodayString();
    if (state.date !== today) {
      const prev = state;
      archiveDay(prev);
      const ns = getDefaultState();
      ns._carryover = prev.goals
        ? prev.goals.map(g => {
            const done = (g.progress || 0) >= 100;
            if (done && !g.repeatable) return null;
            return {
              name: g.name, hours: 0,
              progress: done ? 0 : (g.progress || 0),
              prevHours: (g.prevHours || 0) + (g.hours || 0), // cumulative, matches loadState
              category: g.category || null, repeatable: g.repeatable || false
            };
          }).filter(Boolean)
        : [];
      state = ns;
      saveState();
      render();
      updateClock();
      showDayTransitionModal(prev);
    }
  }
  (function scheduleNewDayCheck() {
    const msLeft = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
    setTimeout(() => { checkForNewDay(); setInterval(checkForNewDay, 60000); }, msLeft);
  })();

  // =========================================================
  // PUBLIC API
  // =========================================================
  window.DayByDayApp = {
    getState: () => state,
    getGoals: () => state.goals,
    getDistractions: () => state.distractions,
    getStore: () => store,
    storageGet, storageSet,
    // Attention tracking — for the notifications/intelligence systems (and tests).
    activity: {
      getLastActivity,
      getIdleMs,
      _setLastActivityForTest: ts => { lastActivityTime = ts; },
    },
  };

  // =========================================================
  // BOOT
  // =========================================================
  restoreCardLayout();
  render();
  if (_prevDayForModal) {
    const prevDate = new Date(_prevDayForModal.date + 'T12:00:00');
    const todayDate = new Date(getTodayString() + 'T12:00:00');
    const gap = Math.round((todayDate - prevDate) / (1000 * 60 * 60 * 24));
    const hasData = (_prevDayForModal.goals && _prevDayForModal.goals.length > 0) ||
                    (_prevDayForModal.quickDone && _prevDayForModal.quickDone.length > 0) ||
                    (_prevDayForModal.successes && _prevDayForModal.successes.length > 0);
    if (gap === 1 || hasData) showDayTransitionModal(_prevDayForModal);
    else showCarryoverIfNeeded();
  } else showCarryoverIfNeeded();
  initCardDragHandles();
  checkForCrashedFocusSession();
  initSidebar();

})();
