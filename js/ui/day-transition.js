// UI: the day-transition modal — the morning review shown on a new day.
//
// DOM. Not portable; a native build rebuilds this screen.
//
// It is the app's one moment of deliberate friction: yesterday summarised,
// unfinished work surfaced rather than silently dropped, and today's focus
// chosen before anything else happens. Tone matters here more than anywhere —
// the copy reflects, it never scolds (see docs/features.md § Day Transition).

import { formatHours } from '../core/format.js';

// Injected app context. This module needs ~14 things from app.js; passing them
// as parameters would mean a 14-argument call, so they arrive as one object.
// `state`, `backlog` and `categories` are defined as GETTERS by the caller,
// because those bindings are reassigned — see configure() in app.js.
let _ctx = null;
export function configure(ctx) { _ctx = ctx; }

export function showDayTransitionModal(prev) {
  // Destructured per call, not at module load: `state` and `backlog` are
  // reassigned in app.js (rollover replaces state; backlog is rehydrated), so
  // a value captured once at import time would go stale. ctx.state is a
  // getter — read it fresh here, every time the modal opens.
  const {
    getCategoryById, activeCategories, saveState, saveBacklog, render,
    renderSidebar, applyBlobColors, makeIntentionFields,
    rescueCarryoverToBacklog, getTodayString, MAX_GOALS,
  } = _ctx;
  const state = _ctx.state;
  const backlog = _ctx.backlog;
  const categories = _ctx.categories;
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
  const missedDays = Math.max(0, dayGap - 1);
  const greeting = dayGap === 1 ? 'Good morning.' : `Welcome back.`;
  const subline = dayGap === 1
    ? `Here's how ${dateLabel} went`
    : `Here's how ${dateLabel} went — your last day of work`;
  header.innerHTML = `
    <div class="day-modal-greeting">${greeting}</div>
    <div class="day-modal-date">${subline}</div>
  `;
  if (missedDays > 0) {
    const gapNote = document.createElement('div');
    gapNote.className = 'day-modal-gap-note';
    gapNote.textContent = missedDays === 1
      ? 'That was a day ago. One day away — the thread is still here.'
      : `That was ${missedDays} days ago. ${missedDays} days away, and today is still yours to use.`;
    header.appendChild(gapNote);
  }

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

  // Returning after a gap — a reflective nudge, never a scolding.
  // Burkeman's point: you can't do everything, so the missed days aren't a
  // debt to repay. Pick a few things today and let the rest go.
  if (missedDays > 0) {
    const RETURN_NOTES = [
      'Missing days isn\'t falling behind — there was never a schedule to fall behind on. There\'s only what you choose to do with today.',
      'You can\'t do everything, and the days away don\'t change that. Pick two or three things that matter and let the rest go.',
      'Nothing needs making up for. A finite day holds only a few things well — choose those, and count today a good one.',
      'The backlog will always outgrow the time. That\'s not failure, it\'s arithmetic. Choose a little, do it properly.',
    ];
    // Stable per-day pick, so reopening the modal doesn't reshuffle the text.
    const seed = getTodayString().split('-').reduce((s, n) => s + parseInt(n, 10), 0);
    const note = document.createElement('div');
    note.className = 'day-modal-insight-row day-modal-return-note';
    note.innerHTML = `<strong>Good luck today.</strong> ${RETURN_NOTES[seed % RETURN_NOTES.length]}`;
    insights.appendChild(note);
  }

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
          // Drop the oldest *pick*, FIFO. A Set preserves insertion order, so
          // its first value is the earliest selection — querySelector would
          // instead return whichever selected button sits leftmost in the
          // grid, which is rarely the one chosen first.
          const oldestId = selectedCats.values().next().value;
          selectedCats.delete(oldestId);
          const oldestBtn = catGrid.querySelector(`.day-modal-cat-btn[data-cat-id="${oldestId}"]`);
          if (oldestBtn) oldestBtn.classList.remove('selected');
        }
        selectedCats.add(cat.id);
        btn.classList.add('selected');
      }
      updateRepeatableChecklist();
      updateBacklogWaiting();
      intentionFields.refresh();
    });
    catGrid.appendChild(btn);
  });
  focusSection.appendChild(catGrid);

  // Optional per-area time intentions for today. Appended not here but to
  // the planning row below, so it sits beside the backlog preview — both
  // are consequences of the same chip selection and read as one pair.
  const intentionFields = makeIntentionFields(
    () => Array.from(selectedCats),
    state.focusIntentions,
  );

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

  // ── Leftover tasks ──
  // Show what was actually left unfinished, by name, so the carryover is
  // visible rather than implied. Nothing here is lost: whatever isn't
  // pre-loaded into Top 5 lands in the backlog.
  const leftovers = (state._carryover || []).filter(g => g && g.name);
  let leftoverSection = null;
  if (leftovers.length > 0) {
    leftoverSection = document.createElement('div');
    leftoverSection.className = 'day-modal-leftover-section';

    const leftoverLabel = document.createElement('div');
    leftoverLabel.className = 'day-modal-section-label';
    leftoverLabel.textContent = leftovers.length === 1
      ? 'Left unfinished'
      : `Left unfinished (${leftovers.length})`;
    leftoverSection.appendChild(leftoverLabel);

    const leftoverList = document.createElement('div');
    leftoverList.className = 'day-modal-leftover-list';
    leftovers.forEach(g => {
      const cat = getCategoryById(g.category || 'general');
      const row = document.createElement('div');
      row.className = 'day-modal-leftover-item';
      const prog = g.progress || 0;
      const prevH = g.prevHours || 0;
      row.innerHTML =
        `<span class="day-leftover-emoji">${cat.emoji}</span>` +
        `<span class="day-leftover-name">${g.name}</span>` +
        (prog > 0 ? `<span class="day-leftover-prog">${prog}%</span>` : '') +
        (prevH > 0 ? `<span class="day-leftover-hours">${formatHours(prevH, '')}</span>` : '');
      leftoverList.appendChild(row);
    });
    leftoverSection.appendChild(leftoverList);

    const leftoverNote = document.createElement('div');
    leftoverNote.className = 'day-modal-leftover-note';
    leftoverNote.textContent = leftovers.length === 1
      ? 'Not started today? It waits in your backlog — nothing is lost.'
      : 'Any you don\'t start today wait in your backlog — nothing is lost.';
    leftoverSection.appendChild(leftoverNote);
  }

  // ── Waiting in backlog ──
  // Shelved work is unfinished work too, so the morning view shouldn't
  // pretend the backlog isn't there. Filtered to today's selected focus
  // areas (re-rendered on every chip click, like the repeatable checklist)
  // so it stays a short, relevant nudge rather than a guilt-pile.
  const waitingSection = document.createElement('div');
  waitingSection.className = 'day-modal-waiting-section';
  const waitingLabel = document.createElement('div');
  waitingLabel.className = 'day-modal-section-label';
  waitingSection.appendChild(waitingLabel);
  const waitingList = document.createElement('div');
  waitingList.className = 'day-modal-waiting-list';
  waitingSection.appendChild(waitingList);

  function updateBacklogWaiting() {
    // Skip anything already surfaced above: repeatables have their own
    // checklist, and leftovers their own list.
    const shownAbove = new Set(leftovers.map(g => g.name));
    const items = backlog.filter(b =>
      b && b.name &&
      !b.repeatable &&
      !shownAbove.has(b.name) &&
      selectedCats.has(b.category || 'general')
    );
    waitingList.innerHTML = '';
    if (items.length === 0) { waitingSection.classList.add('hidden'); return; }
    waitingSection.classList.remove('hidden');
    waitingLabel.textContent = items.length === 1
      ? 'Waiting in backlog'
      : `Waiting in backlog (${items.length})`;
    items.forEach(b => {
      const cat = getCategoryById(b.category || 'general');
      const row = document.createElement('div');
      row.className = 'day-modal-waiting-item';
      const prog = b.progress || 0;
      const hrs = b.hours || 0;
      row.innerHTML =
        `<span class="day-leftover-emoji">${cat.emoji}</span>` +
        `<span class="day-leftover-name"></span>` +
        (prog > 0 ? `<span class="day-leftover-prog">${prog}%</span>` : '') +
        (hrs > 0 ? `<span class="day-leftover-hours">${formatHours(hrs, '')}</span>` : '');
      row.querySelector('.day-leftover-name').textContent = b.name;
      waitingList.appendChild(row);
    });
  }
  updateBacklogWaiting();

  // ── Planning row ──
  // The intention fields and the backlog preview are two readings of the
  // same chip selection: what you mean to give, and what's already waiting.
  // Side by side they answer each other; stacked, the second scrolls out of
  // sight exactly when the first is being filled in. Each column hides
  // itself independently, so a lone survivor simply takes the full width.
  const planningRow = document.createElement('div');
  planningRow.className = 'day-modal-planning-row';
  planningRow.append(intentionFields.el, waitingSection);

  // ── Actions ──
  const actions = document.createElement('div');
  actions.className = 'day-modal-actions';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn btn-ghost';
  skipBtn.textContent = 'Start fresh';
  skipBtn.addEventListener('click', () => {
    // "Start fresh" clears today's board — it must not destroy yesterday's
    // unfinished work. Everything left over drops into the backlog.
    rescueCarryoverToBacklog();
    saveState();
    render();
    renderSidebar();
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
    state.focusIntentions = intentionFields.collect();

    // Anything still unfinished (wrong focus category, or Top 5 was full)
    // goes to the backlog rather than disappearing.
    rescueCarryoverToBacklog();
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
  if (leftoverSection) modal.appendChild(leftoverSection);
  // The planning row sits *after* the focus picker: both its columns are
  // filtered by the selected areas, so they only make sense once that
  // choice is visible — same placement logic as the repeatable checklist.
  modal.append(focusSection, repeatSection, planningRow);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

