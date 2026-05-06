// === Day by Day — Core Application Logic ===

(function () {
  'use strict';

  // --- Constants ---
  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const STORAGE_KEY = 'daybyday_data';
  const HISTORY_KEY = 'daybyday_history';
  const PREFS_KEY = 'daybyday_prefs';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34; // ~213.63

  // --- Storage Test ---
  // file:// protocol can block localStorage in some browsers
  let storageAvailable = false;
  try {
    const testKey = '__daybyday_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch (e) {
    console.warn('localStorage not available. Data will not persist between sessions.');
  }

  // --- Safe Storage Helpers ---
  function storageGet(key) {
    if (!storageAvailable) return null;
    try { return localStorage.getItem(key); }
    catch (e) { return null; }
  }

  function storageSet(key, value) {
    if (!storageAvailable) return;
    try { localStorage.setItem(key, value); }
    catch (e) { console.warn('Storage write failed:', e); }
  }

  // --- State ---
  let state = loadState();
  let history = loadHistory();

  // --- DOM References ---
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

  // --- Clock (no seconds) ---
  function updateClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    timeEl.textContent = `${displayHours}:${minutes} ${ampm}`;

    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }

  updateClock();
  setInterval(updateClock, 30000);

  // --- Date Helpers ---
  function getTodayString() {
    // Use local date, not UTC — avoids timezone mismatch bugs
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- State Management ---
  function getDefaultState() {
    return {
      date: getTodayString(),
      goals: [],
      distractions: [],
      successes: [],
      failures: []
    };
  }

  function loadState() {
    try {
      const raw = storageGet(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure all fields exist (migration from older format)
        parsed.successes = parsed.successes || [];
        parsed.failures = parsed.failures || [];

        if (parsed.date === getTodayString()) {
          return parsed;
        }

        // It's a new day — archive yesterday and check for carryover
        archiveDay(parsed);
        const newState = getDefaultState();
        newState._carryover = getCarryoverGoals(parsed);
        return newState;
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
    return getDefaultState();
  }

  function getCarryoverGoals(oldState) {
    if (!oldState || !oldState.goals) return [];
    return oldState.goals
      .filter(g => (g.progress || 0) < 100)
      .map(g => ({ name: g.name, hours: 0, progress: g.progress || 0 }));
  }

  function archiveDay(dayState) {
    if (!dayState || !dayState.date) return;
    try {
      const hist = loadHistory();
      // Don't duplicate
      if (!hist.find(d => d.date === dayState.date)) {
        hist.push({
          date: dayState.date,
          goals: dayState.goals || [],
          distractions: dayState.distractions || [],
          successes: dayState.successes || [],
          failures: dayState.failures || []
        });
        // Keep last 30 days
        while (hist.length > 30) hist.shift();
        storageSet(HISTORY_KEY, JSON.stringify(hist));
      }
    } catch (e) {
      console.warn('Failed to archive:', e);
    }
  }

  function loadHistory() {
    try {
      const raw = storageGet(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveState() {
    storageSet(STORAGE_KEY, JSON.stringify(state));
  }

  // --- Carryover UI ---
  function showCarryoverIfNeeded() {
    if (!state._carryover || state._carryover.length === 0) {
      if (carryoverBanner) carryoverBanner.classList.add('hidden');
      return;
    }
    // Show the carryover banner
    carryoverList.innerHTML = '';
    state._carryover.forEach(g => {
      const li = document.createElement('li');
      li.textContent = `${g.name} (${g.progress}% done)`;
      carryoverList.appendChild(li);
    });
    carryoverBanner.classList.remove('hidden');
  }

  if (carryoverAccept) {
    carryoverAccept.addEventListener('click', () => {
      // Add carried-over goals
      state._carryover.forEach(g => {
        if (state.goals.length < MAX_GOALS) {
          state.goals.push({ name: g.name, hours: 0, progress: g.progress });
        }
      });
      delete state._carryover;
      saveState();
      carryoverBanner.classList.add('hidden');
      render();
    });
  }

  if (carryoverDismiss) {
    carryoverDismiss.addEventListener('click', () => {
      delete state._carryover;
      carryoverBanner.classList.add('hidden');
    });
  }

  // --- Storage Warning ---
  if (storageWarning && !storageAvailable) {
    storageWarning.classList.remove('hidden');
  }

  // --- Rendering ---
  function render() {
    renderGoals();
    renderDistractions();
    renderJournal();
    renderSummary();
    updateAddButtonVisibility();
  }

  function renderGoals() {
    goalsListEl.innerHTML = '';
    state.goals.forEach((goal, index) => {
      goalsListEl.appendChild(createGoalElement(goal, index));
    });
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

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
      state.goals.splice(index, 1);
      saveState();
      render();
    });

    topRow.append(number, name, deleteBtn);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

    // Hours
    const hoursGroup = document.createElement('div');
    hoursGroup.className = 'log-group';
    const hoursLabel = document.createElement('label');
    hoursLabel.textContent = 'Hours';
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.className = 'hours-input';
    hoursInput.min = '0';
    hoursInput.max = '24';
    hoursInput.step = '0.25';
    hoursInput.value = goal.hours || 0;
    hoursInput.addEventListener('change', () => {
      let val = parseFloat(hoursInput.value) || 0;
      val = Math.max(0, Math.min(24, val));
      hoursInput.value = val;
      state.goals[index].hours = val;
      saveState();
      renderSummary();
    });
    hoursGroup.append(hoursLabel, hoursInput);

    // Progress
    const progressGroup = document.createElement('div');
    progressGroup.className = 'log-group';
    const progressLabel = document.createElement('label');
    progressLabel.textContent = 'Progress';
    const progressSlider = document.createElement('input');
    progressSlider.type = 'range';
    progressSlider.className = 'progress-slider';
    progressSlider.min = '0';
    progressSlider.max = '100';
    progressSlider.step = '5';
    progressSlider.value = goal.progress || 0;
    const progressValue = document.createElement('span');
    progressValue.className = 'progress-value';
    progressValue.textContent = (goal.progress || 0) + '%';
    progressSlider.addEventListener('input', () => {
      const val = parseInt(progressSlider.value);
      progressValue.textContent = val + '%';
      state.goals[index].progress = val;
      if (val >= 100) item.classList.add('task-complete');
      else item.classList.remove('task-complete');
      saveState();
      renderSummary();
    });
    progressGroup.append(progressLabel, progressSlider, progressValue);

    logRow.append(hoursGroup, progressGroup);
    item.append(topRow, logRow);
    return item;
  }

  function renderDistractions() {
    distractionsListEl.innerHTML = '';
    state.distractions.forEach((dist, index) => {
      distractionsListEl.appendChild(createDistractionElement(dist, index));
    });
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

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
      state.distractions.splice(index, 1);
      saveState();
      render();
    });

    topRow.append(number, name, deleteBtn);

    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

    const hoursGroup = document.createElement('div');
    hoursGroup.className = 'log-group';
    const hoursLabel = document.createElement('label');
    hoursLabel.textContent = 'Hours spent';
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.className = 'hours-input';
    hoursInput.min = '0';
    hoursInput.max = '24';
    hoursInput.step = '0.25';
    hoursInput.value = dist.hours || 0;
    hoursInput.addEventListener('change', () => {
      let val = parseFloat(hoursInput.value) || 0;
      val = Math.max(0, Math.min(24, val));
      hoursInput.value = val;
      state.distractions[index].hours = val;
      saveState();
      renderSummary();
    });
    hoursGroup.append(hoursLabel, hoursInput);

    logRow.append(hoursGroup);
    item.append(topRow, logRow);
    return item;
  }

  // --- Journal ---
  function renderJournal() {
    if (!successesListEl || !failuresListEl) return;

    successesListEl.innerHTML = '';
    state.successes.forEach((text, i) => {
      successesListEl.appendChild(createJournalEntry(text, i, 'successes'));
    });

    failuresListEl.innerHTML = '';
    state.failures.forEach((text, i) => {
      failuresListEl.appendChild(createJournalEntry(text, i, 'failures'));
    });
  }

  function createJournalEntry(text, index, type) {
    const row = document.createElement('div');
    row.className = 'journal-entry';

    const span = document.createElement('span');
    span.className = 'journal-text';
    span.textContent = text;

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.textContent = '×';
    del.addEventListener('click', () => {
      state[type].splice(index, 1);
      saveState();
      renderJournal();
    });

    row.append(span, del);
    return row;
  }

  function addSuccess() {
    const text = successInputEl.value.trim();
    if (!text) return;
    state.successes.push(text);
    successInputEl.value = '';
    saveState();
    renderJournal();
  }

  function addFailure() {
    const text = failureInputEl.value.trim();
    if (!text) return;
    state.failures.push(text);
    failureInputEl.value = '';
    saveState();
    renderJournal();
  }

  if (addSuccessBtn) {
    addSuccessBtn.addEventListener('click', addSuccess);
    successInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addSuccess(); });
  }
  if (addFailureBtn) {
    addFailureBtn.addEventListener('click', addFailure);
    failureInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addFailure(); });
  }

  // --- Summary & Progress Rings ---
  function setRingProgress(ringEl, fraction) {
    if (!ringEl) return;
    const offset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
    ringEl.style.strokeDashoffset = offset;
  }

  function renderSummary() {
    const goalHours = state.goals.reduce((sum, g) => sum + (g.hours || 0), 0);
    totalHoursEl.textContent = goalHours > 0 ? goalHours.toFixed(1) + 'h' : '0h';

    const distHours = state.distractions.reduce((sum, d) => sum + (d.hours || 0), 0);
    distractionHoursEl.textContent = distHours > 0 ? distHours.toFixed(1) + 'h' : '0h';

    const avgProg = state.goals.length > 0
      ? Math.round(state.goals.reduce((sum, g) => sum + (g.progress || 0), 0) / state.goals.length)
      : 0;
    avgProgressEl.textContent = avgProg + '%';

    setRingProgress(ringProgress, avgProg / 100);
    setRingProgress(ringHours, Math.min(goalHours / 8, 1));
    setRingProgress(ringDistractionHours, Math.min(distHours / 4, 1));

    // Breakdown
    summaryBreakdownEl.innerHTML = '';
    state.goals.forEach(goal => {
      const row = document.createElement('div');
      row.className = 'breakdown-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'breakdown-name';
      nameSpan.textContent = goal.name;

      const hoursSpan = document.createElement('span');
      hoursSpan.className = 'breakdown-hours';
      hoursSpan.textContent = (goal.hours || 0) + 'h';

      const barContainer = document.createElement('div');
      barContainer.className = 'breakdown-bar-container';
      const bar = document.createElement('div');
      bar.className = 'breakdown-bar';
      bar.style.width = (goal.progress || 0) + '%';
      barContainer.appendChild(bar);

      row.append(nameSpan, hoursSpan, barContainer);
      summaryBreakdownEl.appendChild(row);
    });

    updateEncouragement(avgProg, goalHours, distHours);
  }

  function updateEncouragement(avgProg, goalHours, distHours) {
    const el = document.getElementById('encouragement-text');
    if (!el) return;

    // Guilt-trip: when distraction hours are significant vs goals
    if (distHours > 0 && state.distractions.length > 0 && state.goals.length > 0) {
      const topDistraction = state.distractions.reduce((max, d) =>
        (d.hours || 0) > (max.hours || 0) ? d : max, state.distractions[0]);
      const topGoal = state.goals.reduce((min, g) =>
        (g.progress || 0) < (min.progress || 0) ? g : min, state.goals[0]);

      if ((topDistraction.hours || 0) > 0 && (topGoal.progress || 0) < 80) {
        const potentialProgress = Math.min(100, (topGoal.progress || 0) + Math.round((topDistraction.hours || 0) * 12));
        el.textContent = `You've spent ${topDistraction.hours}h on "${topDistraction.name}." That same time on "${topGoal.name}" could have brought it to ~${potentialProgress}%. The work won't be perfect — it never is. But done beats imagined.`;
        return;
      }
    }

    if (state.goals.length === 0) {
      el.textContent = "You have roughly 4,000 weeks in a lifetime. This one counts. Start by adding just one goal for today.";
    } else if (goalHours > 0 && distHours === 0) {
      el.textContent = "You're investing in what matters and keeping distractions at bay. This is how days become weeks become a life well-spent.";
    } else if (avgProg >= 75) {
      el.textContent = "Over 75% progress. You showed up, did the work, and didn't wait for it to feel perfect. That's the whole game.";
    } else if (avgProg >= 40) {
      el.textContent = "You're past the halfway mark. The hardest part was starting — you've already done that. Keep going.";
    } else {
      el.textContent = "The future is never guaranteed — only this moment is real. Every hour on your goals is an hour you chose to spend on what matters most.";
    }
  }

  function updateAddButtonVisibility() {
    addGoalRow.classList.toggle('hidden', state.goals.length >= MAX_GOALS);
    addDistractionRow.classList.toggle('hidden', state.distractions.length >= MAX_DISTRACTIONS);
  }

  // --- Adding Tasks ---
  function addGoal() {
    const name = goalInputEl.value.trim();
    if (!name || state.goals.length >= MAX_GOALS) return;
    state.goals.push({ name, hours: 0, progress: 0 });
    goalInputEl.value = '';
    saveState();
    render();
    if (window.DayByDayNotifications) {
      window.DayByDayNotifications.onGoalsUpdated(state.goals);
    }
  }

  function addDistraction() {
    const name = distractionInputEl.value.trim();
    if (!name || state.distractions.length >= MAX_DISTRACTIONS) return;
    state.distractions.push({ name, hours: 0 });
    distractionInputEl.value = '';
    saveState();
    render();
  }

  addGoalBtn.addEventListener('click', addGoal);
  goalInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addGoal(); });

  addDistractionBtn.addEventListener('click', addDistraction);
  distractionInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addDistraction(); });

  // --- Reset Day ---
  resetDayBtn.addEventListener('click', () => {
    if (confirm('Archive today and start fresh? Your progress will be saved in history.')) {
      archiveDay(state);
      state = getDefaultState();
      saveState();
      render();
    }
  });

  // --- Expose for notifications ---
  window.DayByDayApp = {
    getState: () => state,
    getGoals: () => state.goals,
    getDistractions: () => state.distractions,
    storageGet: storageGet,
    storageSet: storageSet
  };

  // --- Init ---
  render();
  showCarryoverIfNeeded();

})();
