// === Day by Day — Core Application Logic ===

(function () {
  'use strict';

  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const STORAGE_KEY = 'daybyday_data';
  const HISTORY_KEY = 'daybyday_history';
  const LAYOUT_KEY = 'daybyday_layout';
  const BACKLOG_KEY = 'daybyday_backlog';
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
  let backlog = loadBacklog();

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
  // DATE / STATE MANAGEMENT
  // =========================================================
  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDefaultState() {
    return { date: getTodayString(), goals: [], distractions: [], successes: [], failures: [], quickDone: [] };
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
        const ns = getDefaultState();
        ns._carryover = p.goals
          ? p.goals.filter(g => (g.progress || 0) < 100).map(g => ({
              name: g.name, hours: 0, progress: g.progress || 0, prevHours: g.hours || 0
            }))
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

  function saveBacklog() { storageSet(BACKLOG_KEY, JSON.stringify(backlog)); }

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
      const hrs = g.prevHours > 0 ? ` — ${g.prevHours}h invested` : '';
      li.textContent = `${g.name} (${g.progress}% done${hrs})`;
      carryoverList.appendChild(li);
    });
    carryoverBanner.classList.remove('hidden');
  }

  if (carryoverAccept) carryoverAccept.addEventListener('click', () => {
    (state._carryover || []).forEach(g => {
      if (state.goals.length < MAX_GOALS)
        state.goals.push({ name: g.name, hours: 0, progress: g.progress, prevHours: g.prevHours || 0 });
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
    dragHandle.textContent = '⋮⋮';

    const number = document.createElement('span');
    number.className = 'task-number';
    number.textContent = displayNumber;

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = goal.name;
    makeEditable(name, newVal => { state.goals[index].name = newVal; saveState(); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
      undoStack.push({ type: 'goal', item: state.goals[index], index });
      state.goals.splice(index, 1); saveState(); render();
    });

    const trailing = [];
    if (goal.prevHours > 0) {
      const badge = document.createElement('span');
      badge.className = 'prev-hours-badge';
      badge.title = 'Hours invested in previous sessions';
      badge.textContent = `${goal.prevHours}h prev`;
      trailing.push(badge);
    }
    if (goal.fromBacklog) {
      const demoteBtn = document.createElement('button');
      demoteBtn.className = 'btn-demote';
      demoteBtn.textContent = '↓ Backlog';
      demoteBtn.title = 'Move back to backlog';
      demoteBtn.addEventListener('click', () => {
        backlog.push({ name: state.goals[index].name });
        state.goals.splice(index, 1);
        saveState(); saveBacklog(); render();
      });
      trailing.push(demoteBtn);
    }
    trailing.push(deleteBtn);
    topRow.append(dragHandle, number, name, ...trailing);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

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
        setTimeout(() => render(), 350);
      } else {
        renderSummary();
      }
    });
    pg.append(pl, ps, pv);

    logRow.append(hg, pg);
    item.append(topRow, logRow);

    // Task-level drag & drop (pointer events)
    setupTaskDrag(item, goalsListEl, 'goal');

    return item;
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

    const name = document.createElement('span');
    name.className = 'done-item-name';
    name.textContent = goal.name;

    const meta = document.createElement('span');
    meta.className = 'done-item-meta';
    meta.textContent = goal.hours > 0 ? `${goal.hours}h` : '';

    const reopenBtn = document.createElement('button');
    reopenBtn.className = 'btn-uncomplete';
    reopenBtn.textContent = 'Reopen';
    reopenBtn.addEventListener('click', () => {
      state.goals[index].progress = 95;
      saveState(); render();
    });

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '×';
    del.addEventListener('click', () => {
      undoStack.push({ type: 'goal', item: state.goals[index], index });
      state.goals.splice(index, 1); saveState(); render();
    });

    row.append(name, meta, reopenBtn, del);
    return row;
  }

  function createDoneQuickItem(item, index, isLatest) {
    const row = document.createElement('div');
    row.className = 'done-item done-item-quick' + (isLatest ? ' done-item-entering' : '');
    if (isLatest) requestAnimationFrame(() => row.classList.remove('done-item-entering'));

    const name = document.createElement('span');
    name.className = 'done-item-name';
    name.textContent = item.name;
    makeEditable(name, newVal => { state.quickDone[index].name = newVal; saveState(); });

    // Hours: show badge if set, otherwise show inline input
    const hoursBadge = document.createElement('span');
    hoursBadge.className = 'done-item-meta done-hours-badge';
    hoursBadge.title = 'Click to edit hours';

    function renderHoursBadge() {
      hoursBadge.textContent = (item.hours > 0) ? `${item.hours}h` : '+ hrs';
      hoursBadge.classList.toggle('done-hours-badge--empty', !(item.hours > 0));
    }
    renderHoursBadge();

    hoursBadge.addEventListener('click', () => {
      if (hoursBadge.querySelector('input')) return;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'done-hours-input';
      input.min = '0'; input.max = '24'; input.step = '0.25';
      input.value = item.hours || '';
      input.placeholder = '0';
      hoursBadge.textContent = '';
      hoursBadge.appendChild(input);
      input.focus(); input.select();

      function commit() {
        const v = Math.max(0, Math.min(24, parseFloat(input.value) || 0));
        state.quickDone[index].hours = v;
        item.hours = v;
        saveState();
        renderSummary();
        renderHoursBadge();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { hoursBadge.textContent = ''; renderHoursBadge(); }
      });
    });

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '×';
    del.addEventListener('click', () => {
      undoStack.push({ type: 'quickDone', item: state.quickDone[index], index });
      state.quickDone.splice(index, 1); saveState(); renderDone();
    });

    row.append(name, hoursBadge, del);
    return row;
  }

  function addQuickDone() {
    if (!quickInputEl) return;
    const n = quickInputEl.value.trim();
    if (!n) return;
    state.quickDone.push({ name: n, hours: 0 });
    quickInputEl.value = '';
    // Auto-expand quick wins group when adding so the new item is visible
    doneExpanded.quick = false;
    saveState(); renderDone();
  }

  if (addQuickBtn) addQuickBtn.addEventListener('click', addQuickDone);
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
    dragHandle.textContent = '⋮⋮';

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
      let v = Math.max(0, Math.min(24, parseFloat(hi.value) || 0));
      hi.value = v; state.distractions[index].hours = v; saveState(); renderSummary();
    });
    hg.append(hl, hi);
    logRow.append(hg);

    item.append(topRow, logRow);
    return item;
  }

  // =========================================================
  // BACKLOG
  // =========================================================
  function renderBacklog() {
    if (!backlogListEl) return;
    backlogListEl.innerHTML = '';
    backlog.forEach((item, i) => backlogListEl.appendChild(createBacklogElement(item, i)));
    updateAddButtonVisibility();
  }

  function createBacklogElement(item, index) {
    const row = document.createElement('div');
    row.className = 'backlog-item';

    const name = document.createElement('span');
    name.className = 'backlog-name';
    name.textContent = item.name;
    makeEditable(name, newVal => { backlog[index].name = newVal; saveBacklog(); });

    const actions = document.createElement('div');
    actions.className = 'backlog-actions';

    const activeCount = getActiveGoals().length;
    if (activeCount < MAX_GOALS) {
      const promoteBtn = document.createElement('button');
      promoteBtn.className = 'btn-promote';
      promoteBtn.textContent = '↑ Promote';
      promoteBtn.title = 'Move to active goals';
      promoteBtn.addEventListener('click', () => {
        if (getActiveGoals().length >= MAX_GOALS) return;
        state.goals.push({ name: item.name, hours: 0, progress: 0, fromBacklog: true });
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
    row.append(name, actions);
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

    const siblings = Array.from(list.querySelectorAll('.task-item'))
      .filter(el => el !== item);

    const draggingIndex = parseInt(item.dataset.goalIndex ?? item.dataset.distIndex ?? -1);

    item.classList.add('task-lifted');
    siblings.forEach(s => s.classList.add('task-shifting'));

    // How far the pointer is from the item's natural top edge
    const pointerOffsetY = e.clientY - rect.top;
    // The item's natural top relative to the list container
    const listRect   = list.getBoundingClientRect();
    const naturalTop = rect.top - listRect.top;

    const minTop = 0;
    const maxTop = listRect.height - itemH;

    activeDrag = { item, list, type, siblings, step, draggingIndex, currentSlot: draggingIndex,
                   pointerOffsetY, naturalTop, listTop: listRect.top, minTop, maxTop, dragType: 'task' };

    document.addEventListener('pointermove', onTaskDragMove);
    document.addEventListener('pointerup',   onTaskDragEnd, { once: true });
  }

  function onTaskDragMove(e) {
    if (!activeDrag || activeDrag.dragType !== 'task') return;
    const { item, siblings, step, draggingIndex, pointerOffsetY, naturalTop, minTop, maxTop } = activeDrag;

    // Where the pointer wants the item's top to be, relative to its natural position — clamped to list bounds
    const rawTop = (e.clientY - pointerOffsetY) - (activeDrag.listTop + naturalTop);
    const desiredTop = Math.max(minTop - naturalTop, Math.min(maxTop - naturalTop, rawTop));
    item.style.transform = `translateY(${desiredTop}px)`;

    // How many slots has it moved?
    const slotsMoved = Math.round(desiredTop / step);
    const newSlot = Math.max(0, Math.min(draggingIndex + slotsMoved, siblings.length));

    if (newSlot !== activeDrag.currentSlot) {
      activeDrag.currentSlot = newSlot;

      // Shift siblings: those that need to move up or down by one slot
      siblings.forEach((sib, i) => {
        // originalIndex in full list (0-based among siblings = items excluding dragged)
        // siblings[i] was originally at index i < draggingIndex ? i : i+1
        const origFull = i < draggingIndex ? i : i + 1;
        if (origFull >= newSlot && origFull < draggingIndex) {
          // Item dragged up past this sibling — shift it down
          sib.style.transform = `translateY(${step}px)`;
        } else if (origFull > draggingIndex && origFull <= newSlot) {
          // Item dragged down past this sibling — shift it up
          sib.style.transform = `translateY(-${step}px)`;
        } else {
          sib.style.transform = '';
        }
      });
    }
  }

  function onTaskDragEnd() {
    document.removeEventListener('pointermove', onTaskDragMove);
    if (!activeDrag || activeDrag.dragType !== 'task') { activeDrag = null; return; }

    const { item, list, type, siblings, draggingIndex, currentSlot } = activeDrag;

    // Reset all transforms before re-render
    item.classList.remove('task-lifted');
    item.style.transform = '';
    siblings.forEach(s => { s.classList.remove('task-shifting'); s.style.transform = ''; });

    // Commit to state
    if (currentSlot !== draggingIndex) {
      const arr = type === 'goal' ? state.goals : state.distractions;
      const [moved] = arr.splice(draggingIndex, 1);
      arr.splice(Math.min(currentSlot, arr.length), 0, moved);
      saveState();
    }

    activeDrag = null;
    render();
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
  // UNDO — Cmd+Z / Ctrl+Z
  // =========================================================
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
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
  function checkForNewDay() {
    const today = getTodayString();
    if (state.date !== today) {
      archiveDay(state);
      const ns = getDefaultState();
      ns._carryover = state.goals
        ? state.goals.filter(g => (g.progress || 0) < 100).map(g => ({ name: g.name, hours: 0, progress: g.progress || 0, prevHours: g.hours || 0 }))
        : [];
      state = ns;
      saveState();
      render();
      showCarryoverIfNeeded();
      updateClock();
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
    storageGet, storageSet
  };

  // =========================================================
  // INIT
  // =========================================================
  restoreCardLayout();
  render();
  showCarryoverIfNeeded();
  initCardDragHandles();

})();
