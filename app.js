// === Day by Day — Core Application Logic ===

(function () {
  'use strict';

  // --- Constants ---
  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const STORAGE_KEY = 'daybyday_data';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34; // ~213.63

  // --- State ---
  let state = loadState();

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

  // --- Clock (no seconds — calm, not stressful) ---
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
  setInterval(updateClock, 30000); // Update every 30s — no ticking anxiety

  // --- State Management ---
  function getDefaultState() {
    return {
      date: getTodayString(),
      goals: [],
      distractions: []
    };
  }

  function getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date !== getTodayString()) {
          return getDefaultState();
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
    return getDefaultState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  // --- Rendering ---
  function render() {
    renderGoals();
    renderDistractions();
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

    // Top row
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

    // Logging row
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

    // Top row
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

    // Hours logging row for distractions
    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

    const hoursGroup = document.createElement('div');
    hoursGroup.className = 'log-group';
    const hoursLabel = document.createElement('label');
    hoursLabel.textContent = 'Hours lost';
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

  // --- Summary & Progress Rings ---
  function setRingProgress(ringEl, fraction) {
    // fraction: 0 to 1
    const offset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
    ringEl.style.strokeDashoffset = offset;
  }

  function renderSummary() {
    // Goal hours
    const goalHours = state.goals.reduce((sum, g) => sum + (g.hours || 0), 0);
    totalHoursEl.textContent = goalHours > 0 ? goalHours.toFixed(1) + 'h' : '0h';

    // Distraction hours
    const distHours = state.distractions.reduce((sum, d) => sum + (d.hours || 0), 0);
    distractionHoursEl.textContent = distHours > 0 ? distHours.toFixed(1) + 'h' : '0h';

    // Average progress
    const avgProg = state.goals.length > 0
      ? Math.round(state.goals.reduce((sum, g) => sum + (g.progress || 0), 0) / state.goals.length)
      : 0;
    avgProgressEl.textContent = avgProg + '%';

    // Update rings
    setRingProgress(ringProgress, avgProg / 100);
    setRingProgress(ringHours, Math.min(goalHours / 8, 1)); // 8h = full ring
    setRingProgress(ringDistractionHours, Math.min(distHours / 4, 1)); // 4h = full ring (bad!)

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

    // Update encouragement text based on state
    updateEncouragement(avgProg, goalHours, distHours);
  }

  function updateEncouragement(avgProg, goalHours, distHours) {
    const el = document.getElementById('encouragement-text');
    if (!el) return;

    if (state.goals.length === 0) {
      el.textContent = "Start by adding your most important goal for today. Just one is enough to begin.";
    } else if (goalHours > 0 && distHours === 0) {
      el.textContent = "Amazing — you're investing time in your goals and keeping distractions at bay. This is how progress happens.";
    } else if (distHours > goalHours && goalHours > 0) {
      el.textContent = "You've spent more time on distractions than goals today. No judgment — just gently shift your focus back. You've got this.";
    } else if (avgProg >= 75) {
      el.textContent = "You're crushing it today! Over 75% average progress. Finish strong — your future self is cheering.";
    } else if (avgProg >= 40) {
      el.textContent = "Solid progress so far. You're past the halfway mark on many goals. Keep the momentum going!";
    } else {
      el.textContent = "Every hour you spend on your goals instead of distractions compounds into something remarkable. Trust the process.";
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
  goalInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addGoal();
  });

  addDistractionBtn.addEventListener('click', addDistraction);
  distractionInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDistraction();
  });

  // --- Reset Day ---
  resetDayBtn.addEventListener('click', () => {
    if (confirm('Start a fresh day? This will clear all tasks and progress.')) {
      state = getDefaultState();
      saveState();
      render();
    }
  });

  // --- Expose for notifications ---
  window.DayByDayApp = {
    getState: () => state,
    getGoals: () => state.goals,
    getDistractions: () => state.distractions
  };

  // --- Initial Render ---
  render();

})();
