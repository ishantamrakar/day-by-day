// === Day by Day — Core Application Logic ===

(function () {
  'use strict';

  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const STORAGE_KEY = 'daybyday_data';
  const HISTORY_KEY = 'daybyday_history';
  const LAYOUT_KEY = 'daybyday_layout';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34;

  // --- Storage ---
  let storageAvailable = false;
  try {
    const k = '__daybyday_test__';
    localStorage.setItem(k, '1');
    if (localStorage.getItem(k) === '1') storageAvailable = true;
    localStorage.removeItem(k);
  } catch (e) {}

  function storageGet(key) {
    if (!storageAvailable) return null;
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    if (!storageAvailable) return;
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // --- State ---
  let state = loadState();

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

  // =========================================================
  // CLOCK — syncs to system clock, updates on the exact minute
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
  // Sync to the next minute boundary, then tick every 60s
  const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  setTimeout(() => {
    updateClock();
    setInterval(updateClock, 60000);
  }, msUntilNextMinute);

  // =========================================================
  // DATE / STATE MANAGEMENT
  // =========================================================
  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDefaultState() {
    return { date: getTodayString(), goals: [], distractions: [], successes: [], failures: [] };
  }

  function loadState() {
    try {
      const raw = storageGet(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        p.successes = p.successes || [];
        p.failures = p.failures || [];
        if (p.date === getTodayString()) return p;
        archiveDay(p);
        const ns = getDefaultState();
        ns._carryover = p.goals ? p.goals.filter(g => (g.progress || 0) < 100).map(g => ({ name: g.name, hours: 0, progress: g.progress || 0 })) : [];
        return ns;
      }
    } catch (e) {}
    return getDefaultState();
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

  function saveState() { storageSet(STORAGE_KEY, JSON.stringify(state)); }

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
      li.textContent = `${g.name} (${g.progress}% done)`;
      carryoverList.appendChild(li);
    });
    carryoverBanner.classList.remove('hidden');
  }

  if (carryoverAccept) carryoverAccept.addEventListener('click', () => {
    (state._carryover || []).forEach(g => { if (state.goals.length < MAX_GOALS) state.goals.push({ name: g.name, hours: 0, progress: g.progress }); });
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
  // INLINE EDITING — click any task name to edit it
  // =========================================================
  function makeEditable(spanEl, onSave) {
    spanEl.style.cursor = 'pointer';
    spanEl.title = 'Click to edit';
    spanEl.addEventListener('click', () => {
      if (spanEl.querySelector('input')) return; // already editing
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
  // PROGRESS SLIDER — filled track color
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
    updateAddButtonVisibility();
  }

  function renderGoals() {
    goalsListEl.innerHTML = '';
    state.goals.forEach((goal, i) => goalsListEl.appendChild(createGoalElement(goal, i)));
  }

  function createGoalElement(goal, index) {
    const item = document.createElement('div');
    item.className = 'task-item';
    if ((goal.progress || 0) >= 100) item.classList.add('task-complete');

    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';

    const number = document.createElement('span');
    number.className = 'task-number';
    number.textContent = index + 1;

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = goal.name;
    makeEditable(name, newVal => { state.goals[index].name = newVal; saveState(); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => { state.goals.splice(index, 1); saveState(); render(); });

    topRow.append(number, name, deleteBtn);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

    // Hours
    const hg = document.createElement('div'); hg.className = 'log-group';
    const hl = document.createElement('label'); hl.textContent = 'Hours';
    const hi = document.createElement('input');
    hi.type = 'number'; hi.className = 'hours-input'; hi.min = '0'; hi.max = '24'; hi.step = '0.25';
    hi.value = goal.hours || 0;
    hi.addEventListener('change', () => {
      let v = Math.max(0, Math.min(24, parseFloat(hi.value) || 0));
      hi.value = v; state.goals[index].hours = v; saveState(); renderSummary();
    });
    hg.append(hl, hi);

    // Progress
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
      if (val >= 100) item.classList.add('task-complete'); else item.classList.remove('task-complete');
      updateSliderFill(ps);
      saveState(); renderSummary();
    });
    pg.append(pl, ps, pv);

    logRow.append(hg, pg);
    item.append(topRow, logRow);
    return item;
  }

  function renderDistractions() {
    distractionsListEl.innerHTML = '';
    state.distractions.forEach((d, i) => distractionsListEl.appendChild(createDistractionElement(d, i)));
  }

  function createDistractionElement(dist, index) {
    const item = document.createElement('div');
    item.className = 'task-item distraction';

    const topRow = document.createElement('div');
    topRow.className = 'task-top-row';

    const number = document.createElement('span');
    number.className = 'task-number';
    number.textContent = index + 1;

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = dist.name;
    makeEditable(name, newVal => { state.distractions[index].name = newVal; saveState(); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => { state.distractions.splice(index, 1); saveState(); render(); });

    topRow.append(number, name, deleteBtn);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';
    const hg = document.createElement('div'); hg.className = 'log-group';
    const hl = document.createElement('label'); hl.textContent = 'Hours spent';
    const hi = document.createElement('input');
    hi.type = 'number'; hi.className = 'hours-input'; hi.min = '0'; hi.max = '24'; hi.step = '0.25';
    hi.value = dist.hours || 0;
    hi.addEventListener('change', () => {
      let v = Math.max(0, Math.min(24, parseFloat(hi.value) || 0));
      hi.value = v; state.distractions[index].hours = v; saveState(); renderSummary();
    });
    hg.append(hl, hi);
    logRow.append(hg);

    item.append(topRow, logRow);
    return item;
  }

  // =========================================================
  // JOURNAL
  // =========================================================
  function renderJournal() {
    if (!successesListEl || !failuresListEl) return;
    successesListEl.innerHTML = '';
    state.successes.forEach((t, i) => successesListEl.appendChild(createJournalEntry(t, i, 'successes')));
    failuresListEl.innerHTML = '';
    state.failures.forEach((t, i) => failuresListEl.appendChild(createJournalEntry(t, i, 'failures')));
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
    del.textContent = '×';
    del.addEventListener('click', () => { state[type].splice(index, 1); saveState(); renderJournal(); });
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
    const gh = state.goals.reduce((s, g) => s + (g.hours || 0), 0);
    totalHoursEl.textContent = gh > 0 ? gh.toFixed(1) + 'h' : '0h';
    const dh = state.distractions.reduce((s, d) => s + (d.hours || 0), 0);
    distractionHoursEl.textContent = dh > 0 ? dh.toFixed(1) + 'h' : '0h';
    const ap = state.goals.length > 0 ? Math.round(state.goals.reduce((s, g) => s + (g.progress || 0), 0) / state.goals.length) : 0;
    avgProgressEl.textContent = ap + '%';

    setRingProgress(ringProgress, ap / 100);
    setRingProgress(ringHours, Math.min(gh / 8, 1));
    setRingProgress(ringDistractionHours, Math.min(dh / 4, 1));

    summaryBreakdownEl.innerHTML = '';
    state.goals.forEach(g => {
      const row = document.createElement('div'); row.className = 'breakdown-item';
      const n = document.createElement('span'); n.className = 'breakdown-name'; n.textContent = g.name;
      const h = document.createElement('span'); h.className = 'breakdown-hours'; h.textContent = (g.hours || 0) + 'h';
      const bc = document.createElement('div'); bc.className = 'breakdown-bar-container';
      const b = document.createElement('div'); b.className = 'breakdown-bar'; b.style.width = (g.progress || 0) + '%';
      bc.appendChild(b);
      row.append(n, h, bc);
      summaryBreakdownEl.appendChild(row);
    });

    updateEncouragement(ap, gh, dh);
  }

  function updateEncouragement(ap, gh, dh) {
    const el = document.getElementById('encouragement-text');
    if (!el) return;

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
    addGoalRow.classList.toggle('hidden', state.goals.length >= MAX_GOALS);
    addDistractionRow.classList.toggle('hidden', state.distractions.length >= MAX_DISTRACTIONS);
  }

  // =========================================================
  // ADDING TASKS
  // =========================================================
  function addGoal() {
    const n = goalInputEl.value.trim(); if (!n || state.goals.length >= MAX_GOALS) return;
    state.goals.push({ name: n, hours: 0, progress: 0 }); goalInputEl.value = '';
    saveState(); render();
    if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
  }
  function addDistraction() {
    const n = distractionInputEl.value.trim(); if (!n || state.distractions.length >= MAX_DISTRACTIONS) return;
    state.distractions.push({ name: n, hours: 0 }); distractionInputEl.value = '';
    saveState(); render();
  }

  addGoalBtn.addEventListener('click', addGoal);
  goalInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addGoal(); });
  addDistractionBtn.addEventListener('click', addDistraction);
  distractionInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addDistraction(); });

  resetDayBtn.addEventListener('click', () => {
    if (confirm('Archive today and start fresh? Progress will be saved in history.')) {
      archiveDay(state); state = getDefaultState(); saveState(); render();
    }
  });

  // =========================================================
  // DRAG & DROP — reorder cards across/within columns
  // =========================================================
  let draggedCard = null;

  document.querySelectorAll('.draggable-card').forEach(card => {
    const handle = card.querySelector('.card-drag-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', () => { card.setAttribute('draggable', 'true'); });
    card.addEventListener('dragend', () => { card.setAttribute('draggable', 'false'); });

    card.addEventListener('dragstart', e => {
      draggedCard = card;
      card.classList.add('card-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.cardId);
    });

    card.addEventListener('dragend', () => {
      if (draggedCard) draggedCard.classList.remove('card-dragging');
      draggedCard = null;
      document.querySelectorAll('.card-drag-over').forEach(el => el.classList.remove('card-drag-over'));
      saveCardLayout();
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card !== draggedCard) card.classList.add('card-drag-over');
    });

    card.addEventListener('dragleave', () => { card.classList.remove('card-drag-over'); });

    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('card-drag-over');
      if (!draggedCard || draggedCard === card) return;
      const targetCol = card.parentElement;
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        targetCol.insertBefore(draggedCard, card);
      } else {
        targetCol.insertBefore(draggedCard, card.nextSibling);
      }
    });
  });

  // Also allow dropping on empty space in columns
  document.querySelectorAll('.col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    col.addEventListener('drop', e => {
      e.preventDefault();
      if (draggedCard && !col.contains(draggedCard)) col.appendChild(draggedCard);
    });
  });

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

  // =========================================================
  // PUBLIC API
  // =========================================================
  window.DayByDayApp = {
    getState: () => state,
    getGoals: () => state.goals,
    getDistractions: () => state.distractions,
    storageGet, storageSet
  };

  // =========================================================
  // INIT
  // =========================================================
  restoreCardLayout();
  render();
  showCarryoverIfNeeded();

})();
