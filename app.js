// === Day by Day — Core Application Logic ===

(function () {
  'use strict';

  // --- Constants ---
  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const STORAGE_KEY = 'daybyday_data';

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
  const goalsCountEl = document.getElementById('goals-count');
  const summaryBreakdownEl = document.getElementById('summary-breakdown');
  const resetDayBtn = document.getElementById('reset-day-btn');

  // --- Clock ---
  function updateClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    timeEl.textContent = `${displayHours}:${minutes}:${seconds} ${ampm}`;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }

  updateClock();
  setInterval(updateClock, 1000);

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
        // If it's a new day, start fresh but keep the data viewable
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
      const el = createGoalElement(goal, index);
      goalsListEl.appendChild(el);
    });
  }

  function createGoalElement(goal, index) {
    const item = document.createElement('div');
    item.className = 'task-item';

    // Top row: number, name, delete
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
    deleteBtn.title = 'Remove goal';
    deleteBtn.addEventListener('click', () => {
      state.goals.splice(index, 1);
      saveState();
      render();
    });

    topRow.append(number, name, deleteBtn);

    // Logging row: hours + progress
    const logRow = document.createElement('div');
    logRow.className = 'task-logging-row';

    // Hours group
    const hoursGroup = document.createElement('div');
    hoursGroup.className = 'log-group';
    const hoursLabel = document.createElement('label');
    hoursLabel.textContent = 'Hours:';
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

    // Progress group
    const progressGroup = document.createElement('div');
    progressGroup.className = 'log-group';
    const progressLabel = document.createElement('label');
    progressLabel.textContent = 'Progress:';
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
      deleteBtn.title = 'Remove distraction';
      deleteBtn.addEventListener('click', () => {
        state.distractions.splice(index, 1);
        saveState();
        render();
      });

      topRow.append(number, name, deleteBtn);
      item.appendChild(topRow);
      distractionsListEl.appendChild(item);
    });
  }

  function renderSummary() {
    // Total hours
    const totalHours = state.goals.reduce((sum, g) => sum + (g.hours || 0), 0);
    totalHoursEl.textContent = totalHours.toFixed(1);

    // Average progress
    const avgProg = state.goals.length > 0
      ? Math.round(state.goals.reduce((sum, g) => sum + (g.progress || 0), 0) / state.goals.length)
      : 0;
    avgProgressEl.textContent = avgProg + '%';

    // Goals count
    goalsCountEl.textContent = `${state.goals.length}/${MAX_GOALS}`;

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

    // Notify the notification system about goal changes
    if (window.DayByDayNotifications) {
      window.DayByDayNotifications.onGoalsUpdated(state.goals);
    }
  }

  function addDistraction() {
    const name = distractionInputEl.value.trim();
    if (!name || state.distractions.length >= MAX_DISTRACTIONS) return;
    state.distractions.push({ name });
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

  // --- Expose state for notifications module ---
  window.DayByDayApp = {
    getState: () => state,
    getGoals: () => state.goals,
    getDistractions: () => state.distractions
  };

  // --- Initial Render ---
  render();

})();
