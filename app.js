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
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34;

  // --- Default categories ---
  const DEFAULT_CATEGORIES = [
    { id: 'fitness',       name: 'Fitness',       emoji: '💪', color: '#3a86ff', totalHours: 0 },
    { id: 'career',        name: 'Career',        emoji: '💼', color: '#2D6A4F', totalHours: 0 },
    { id: 'relationships', name: 'Relationships', emoji: '❤️', color: '#ff6b9d', totalHours: 0 },
    { id: 'chores',        name: 'Chores',        emoji: '🧹', color: '#f4a261', totalHours: 0 },
    { id: 'general',       name: 'General',       emoji: '⚡', color: '#8d99ae', totalHours: 0 },
  ];

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
    return categories.find(c => c.id === id) || categories.find(c => c.id === 'general');
  }

  function getCategoryColor(id) {
    const cat = getCategoryById(id);
    return cat ? cat.color : '#8d99ae';
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
    state.goals.forEach(g => {
      const id = g.category || 'general';
      if ((g.progress || 0) >= 100) todayCompleted[id] = (todayCompleted[id] || 0) + 1;
      else todayActive[id] = (todayActive[id] || 0) + 1;
    });
    backlog.forEach(b => {
      const id = b.category || 'general';
      todayBacklog[id] = (todayBacklog[id] || 0) + 1;
    });

    const MAX_SCALE_HOURS = 40;
    const maxHours = Math.max(...categories.map(c => c.totalHours || 0), MAX_SCALE_HOURS);

    categories.forEach(cat => {
      // Rail emoji button — clicking opens quick-add modal for this category
      if (sidebarCatDots) {
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'sidebar-emoji-btn';
        emojiBtn.textContent = cat.emoji || '●';
        emojiBtn.title = cat.name;
        emojiBtn.style.setProperty('--cat-color', cat.color);
        emojiBtn.addEventListener('click', () => openQuickAddModal(cat));
        sidebarCatDots.appendChild(emojiBtn);
      }

      // Sidebar card
      const card = document.createElement('div');
      card.className = 'sidebar-cat-card';

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
      hoursEl.textContent = cat.totalHours > 0 ? `${cat.totalHours.toFixed(1)}h` : '—';

      // Pencil edit button — fades in on hover
      const editBtn = document.createElement('button');
      editBtn.className = 'sidebar-cat-edit-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>';
      editBtn.addEventListener('click', e => {
        e.stopPropagation();
        openCatInlineEdit(cat, card, top, editBtn);
      });

      top.append(emojiEl, nameEl, hoursEl);

      // Completed count badge
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
      const pct = Math.min(100, ((cat.totalHours || 0) / maxHours) * 100);
      bar.style.width = pct + '%';
      barContainer.appendChild(bar);

      const active = todayActive[cat.id] || 0;
      const backlogged = todayBacklog[cat.id] || 0;
      const countEl = document.createElement('div');
      countEl.className = 'sidebar-cat-task-count';
      const parts = [];
      if (active > 0) parts.push(`${active} active`);
      if (completed > 0) parts.push(`${completed} done`);
      if (backlogged > 0) parts.push(`${backlogged} backlog`);
      countEl.textContent = parts.join(' · ');

      card.append(top, barContainer, countEl);

      // Expand panel — shows all tasks for this category
      const isExpanded = expandedCatId === cat.id;
      if (isExpanded) card.classList.add('sidebar-cat-expanded');

      if (isExpanded) {
        const detail = document.createElement('div');
        detail.className = 'sidebar-cat-detail';

        const activeGoals = state.goals.filter(g => (g.category || 'general') === cat.id && (g.progress || 0) < 100);
        const doneGoals = state.goals.filter(g => (g.category || 'general') === cat.id && (g.progress || 0) >= 100);
        const backlogItems = backlog.filter(b => (b.category || 'general') === cat.id);

        function addSection(label, items, itemClass) {
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
            row.textContent = item.name;
            sec.appendChild(row);
          });
          detail.appendChild(sec);
        }

        addSection('Active', activeGoals, 'sidebar-detail-active');
        addSection('Done Today', doneGoals, 'sidebar-detail-done');
        addSection('Backlog', backlogItems, 'sidebar-detail-backlog');

        if (!activeGoals.length && !doneGoals.length && !backlogItems.length) {
          const empty = document.createElement('div');
          empty.className = 'sidebar-detail-empty';
          empty.textContent = 'No tasks here yet';
          detail.appendChild(empty);
        }

        card.appendChild(detail);
      }

      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        expandedCatId = expandedCatId === cat.id ? null : cat.id;
        renderSidebar();
      });

      sidebarCategoriesEl.appendChild(card);
    });
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

    editRow.append(emojiBtn, nameInput, saveBtn, cancelBtn);

    function confirmEdit() {
      const newName = nameInput.value.trim();
      if (!newName) { nameInput.focus(); return; }
      cat.emoji = emojiBtn.textContent;
      cat.name = newName;
      saveCategories();
      renderSidebar();
    }

    function cancelEdit() {
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
    overlay.className = 'quick-add-modal-overlay';
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
      if (!name) { taskInput.focus(); return; }
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
    setTimeout(() => taskInput.focus(), 60);
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

  function openCategoryPicker(anchorEl, currentCatId, onSelect) {
    closePicker();

    const picker = document.createElement('div');
    picker.className = 'cat-picker';
    activePicker = picker;

    const list = document.createElement('div');
    list.className = 'cat-picker-list';

    categories.forEach(cat => {
      const opt = document.createElement('button');
      opt.className = 'cat-picker-option' + (cat.id === (currentCatId || 'general') ? ' selected' : '');
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'cat-picker-emoji';
      emojiSpan.textContent = cat.emoji || '●';
      emojiSpan.style.color = cat.color;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = cat.name;
      opt.append(emojiSpan, nameSpan);
      opt.addEventListener('click', () => { closePicker(); onSelect(cat.id); });
      list.appendChild(opt);
    });

    const divider = document.createElement('div');
    divider.className = 'cat-picker-divider';
    list.appendChild(divider);

    const newBtn = document.createElement('button');
    newBtn.className = 'cat-picker-new';
    newBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"/></svg> New area…';
    newBtn.addEventListener('click', () => { closePicker(); openNewCategoryModal(onSelect); });
    list.appendChild(newBtn);

    picker.appendChild(list);
    document.body.appendChild(picker);

    // Position below anchor, ensure it stays in viewport
    const rect = anchorEl.getBoundingClientRect();
    const pickerW = 192;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + pickerW > window.innerWidth - 12) left = window.innerWidth - pickerW - 12;
    if (top + 320 > window.innerHeight) top = rect.top - 8 - picker.offsetHeight;
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';

    setTimeout(() => document.addEventListener('pointerdown', onPickerOutsideClick, true), 50);
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

    const PALETTE = ['#9b5de5','#00bbf9','#f15bb5','#00f5d4','#fb5607','#3a0ca3','#e63946','#2ec4b6','#ff9f1c'];
    const DEFAULT_EMOJI = '🌟';

    const overlay = document.createElement('div');
    overlay.className = 'cat-modal-overlay';
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
      emojiInput.focus();
      // On macOS, try triggering emoji picker via keyboard simulation hint
    });

    emojiInput.addEventListener('input', () => {
      // Extract the last emoji character (handles multi-codepoint emoji like flags)
      const raw = emojiInput.value;
      const chars = [...raw]; // proper unicode segmentation
      if (chars.length > 0) {
        // Take last 2 code points (handles emoji + variation selector)
        const emoji = chars.slice(-2).join('');
        emojiDisplay.textContent = emoji;
        emojiInput.value = '';
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
    let selectedColor = PALETTE[categories.filter(c => c.id.startsWith('custom_')).length % PALETTE.length];

    PALETTE.forEach(color => {
      const swatch = document.createElement('button');
      swatch.className = 'cat-modal-swatch' + (color === selectedColor ? ' selected' : '');
      swatch.style.background = color;
      swatch.addEventListener('click', () => {
        selectedColor = color;
        swatchRow.querySelectorAll('.cat-modal-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      swatchRow.appendChild(swatch);
    });
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
      if (!name) { nameInput.focus(); nameInput.style.borderColor = '#e63946'; return; }
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

    setTimeout(() => nameInput.focus(), 80);
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
        openCategoryPicker(pill, currentCatId, newId => {
          currentCatId = newId;
          onCategorySelect(newId);
          const newCat = getCategoryById(newId);
          pill.title = newCat.name;
          pill.style.setProperty('--pill-color', newCat.color);
          emojiSpan.textContent = newCat.emoji || '●';
          renderSidebar();
        });
      }
    });

    return pill;
  }

  // Context popover shown when clicking the pill on an existing task row
  // Shows category list + repeatable toggle in one floating panel
  function openTaskContextPicker(anchorEl, currentCatId, currentRepeatable, onConfirm) {
    closePicker();

    const picker = document.createElement('div');
    picker.className = 'cat-picker task-context-picker';
    activePicker = picker;

    // Section label: category
    const catLabel = document.createElement('div');
    catLabel.className = 'context-picker-label';
    catLabel.textContent = 'Life Area';
    picker.appendChild(catLabel);

    const list = document.createElement('div');
    list.className = 'cat-picker-list';
    let selectedCatId = currentCatId;

    categories.forEach(cat => {
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
    newCatBtn.addEventListener('click', () => { closePicker(); openNewCategoryModal(newId => { selectedCatId = newId; }); });
    list.appendChild(newCatBtn);
    picker.appendChild(list);

    // Scroll the pre-selected item into view once picker is in the DOM
    setTimeout(() => {
      const sel = list.querySelector('.cat-picker-option.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }, 0);

    // Divider
    const div = document.createElement('div');
    div.className = 'cat-picker-divider';
    picker.appendChild(div);

    // Repeatable toggle row inside popover
    const repeatRow = document.createElement('div');
    repeatRow.className = 'context-picker-repeat-row';
    const repeatLabel = document.createElement('label');
    repeatLabel.className = 'context-picker-repeat-label';
    repeatLabel.htmlFor = 'ctx-repeat-toggle';
    repeatLabel.innerHTML = '↻ Repeatable <span>carries forward if not done</span>';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'ctx-repeat-toggle';
    toggleInput.checked = currentRepeatable;
    const toggleTrack = document.createElement('span');
    toggleTrack.className = 'toggle-track';
    toggleSwitch.append(toggleInput, toggleTrack);
    repeatRow.append(repeatLabel, toggleSwitch);
    picker.appendChild(repeatRow);

    // Done button
    const doneDiv = document.createElement('div');
    doneDiv.style.cssText = 'padding:6px 4px 2px; display:flex; justify-content:flex-end;';
    const doneBtn = document.createElement('button');
    doneBtn.className = 'cat-picker-done-btn';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => {
      closePicker();
      onConfirm(selectedCatId, toggleInput.checked);
    });
    doneDiv.appendChild(doneBtn);
    picker.appendChild(doneDiv);

    document.body.appendChild(picker);

    const rect = anchorEl.getBoundingClientRect();
    const pickerW = 220;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + pickerW > window.innerWidth - 12) left = window.innerWidth - pickerW - 12;
    if (top + 400 > window.innerHeight) top = rect.top - 8 - 380;
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';

    setTimeout(() => document.addEventListener('pointerdown', onPickerOutsideClick, true), 50);
  }

  // =========================================================
  // TASK DETAIL MODAL — used by the + button (new task with category + repeatable)
  // =========================================================
  function openTaskDetailModal(initial, onConfirm) {
    closeModal(); closeQuickAdd();

    const overlay = document.createElement('div');
    overlay.className = 'quick-add-modal-overlay';
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
      categories.forEach(cat => {
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
      if (!name) { taskInput.focus(); return; }
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
    setTimeout(() => { taskInput.focus(); taskInput.setSelectionRange(taskInput.value.length, taskInput.value.length); }, 60);
  }

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

  let _prevDayForModal = null; // set when new day detected, consumed by modal

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
          ? p.goals.filter(g => (g.progress || 0) < 100).map(g => ({
              name: g.name, hours: 0, progress: g.progress || 0, prevHours: g.hours || 0,
              category: g.category || null, repeatable: g.repeatable || false
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
    dragHandle.textContent = '☰';

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
      demoteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,149.66l-96,96a8,8,0,0,1-11.32,0l-96-96a8,8,0,0,1,11.32-11.32L120,226.69V40a8,8,0,0,1,16,0V226.69l82.34-88.35a8,8,0,0,1,11.32,11.32Z"/></svg> Backlog';
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
      const prev = state.goals[index].hours || 0;
      let v = Math.max(0, Math.min(24, parseFloat(hi.value) || 0));
      hi.value = v;
      const delta = v - prev;
      state.goals[index].hours = v;
      saveState();
      accumulateCategoryHours(state.goals[index].category || 'general', delta);
      renderSummary();
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

    logRow.append(hg, pg, repeatIcon, catPill);
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
    del.addEventListener('click', () => {
      undoStack.push({ type: 'goal', item: state.goals[index], index });
      state.goals.splice(index, 1); saveState(); render();
    });

    row.append(catBadge, name, meta, reopenBtn, del);
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
    del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
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

    // Category pill
    const catPill = createCategoryPill(item.category, newId => {
      backlog[index].category = newId;
      saveBacklog();
      renderSidebar();
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
    if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
  }
  function addDistraction() {
    const n = distractionInputEl.value.trim(); if (!n || state.distractions.length >= MAX_DISTRACTIONS) return;
    state.distractions.push({ name: n, hours: 0 }); distractionInputEl.value = '';
    saveState(); render();
  }

  addGoalBtn.addEventListener('click', () => {
    const n = goalInputEl.value.trim();
    if (n) {
      // Name already typed — open splash with name pre-filled
      openTaskDetailModal({ name: n, category: null, repeatable: false }, (result) => {
        if (getActiveGoals().length >= MAX_GOALS) return;
        state.goals.push({ name: result.name, hours: 0, progress: 0, category: result.category || null, repeatable: result.repeatable });
        goalInputEl.value = '';
        saveState(); render();
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
      });
    } else {
      // Nothing typed — open blank splash
      openTaskDetailModal({ name: '', category: null, repeatable: false }, (result) => {
        if (!result.name || getActiveGoals().length >= MAX_GOALS) return;
        state.goals.push({ name: result.name, hours: 0, progress: 0, category: result.category || null, repeatable: result.repeatable });
        saveState(); render();
        if (window.DayByDayNotifications) window.DayByDayNotifications.onGoalsUpdated(state.goals);
      });
    }
  });
  goalInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const n = goalInputEl.value.trim();
      if (!n || getActiveGoals().length >= MAX_GOALS) return;
      // Quick-add on Enter without modal (fast path)
      state.goals.push({ name: n, hours: 0, progress: 0 });
      goalInputEl.value = '';
      saveState(); render();
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
  // =========================================================
  // DAY TRANSITION MODAL
  // =========================================================
  function showDayTransitionModal(prev) {
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
      const catsWithWork = categories.filter(cat => {
        const hasBacklog = backlog.some(b => (b.category || 'general') === cat.id);
        const hasRepeatable = prevGoals.some(g => g.repeatable && (g.category || 'general') === cat.id);
        return hasBacklog || hasRepeatable || (cat.totalHours || 0) === 0;
      });
      const ranked = [...catsWithWork].sort((a, b) => (a.totalHours || 0) - (b.totalHours || 0));
      return ranked.slice(0, 3);
    }

    const overlay = document.createElement('div');
    overlay.className = 'day-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'day-modal';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'day-modal-header';
    const prevDate = new Date(prev.date + 'T12:00:00');
    const dateLabel = prevDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    header.innerHTML = `
      <div class="day-modal-greeting">Good morning.</div>
      <div class="day-modal-date">Here's how ${dateLabel} went</div>
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
    const activeCats = categories.filter(c => (c.totalHours || 0) > 0 || backlog.some(b => (b.category || 'general') === c.id));
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

    categories.forEach(cat => {
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
        });
        // Default-check all
        if (!checkedTasks.has(task.name) && tasks.length > 0) {
          cb.checked = true; checkedTasks.add(task.name);
        }
        const cat = getCategoryById(task.category);
        row.innerHTML = '';
        row.appendChild(cb);
        row.insertAdjacentHTML('beforeend', `<span class="day-repeat-emoji">${cat.emoji}</span><span class="day-repeat-name">${task.name}</span>${task.progress > 0 ? `<span class="day-repeat-prog">${task.progress}%</span>` : ''}`);
        repeatList.appendChild(row);
      });
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
      // Add checked repeatable tasks to today's goals
      const tasks = getRepeatableTasks();
      tasks.forEach(task => {
        if (checkedTasks.has(task.name) && state.goals.length < MAX_GOALS) {
          // Remove from backlog if that's where it came from
          const bi = backlog.findIndex(b => b.name === task.name && b.repeatable);
          if (bi !== -1) backlog.splice(bi, 1);
          state.goals.push({ name: task.name, hours: 0, progress: task.progress || 0, category: task.category, repeatable: true });
        }
      });

      // Also carry over non-repeatable unfinished goals from _carryover if they're in selected cats
      // (standard carryover accept behaviour but filtered to focus cats)
      (state._carryover || []).forEach(g => {
        if (!g.repeatable && selectedCats.has(g.category || 'general') && state.goals.length < MAX_GOALS) {
          if (!state.goals.find(eg => eg.name === g.name)) {
            state.goals.push({ name: g.name, hours: 0, progress: g.progress, prevHours: g.prevHours || 0, category: g.category || null });
          }
        }
      });

      delete state._carryover;
      saveBacklog();
      saveState();
      render();
      renderSidebar();
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
        ? prev.goals.filter(g => (g.progress || 0) < 100).map(g => ({
            name: g.name, hours: 0, progress: g.progress || 0, prevHours: g.hours || 0,
            category: g.category || null, repeatable: g.repeatable || false
          }))
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
    storageGet, storageSet
  };

  // =========================================================
  // BOOT
  // =========================================================
  restoreCardLayout();
  render();
  if (_prevDayForModal) showDayTransitionModal(_prevDayForModal);
  else showCarryoverIfNeeded();
  initCardDragHandles();
  initSidebar();

})();
