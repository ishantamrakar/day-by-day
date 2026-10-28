// === Day by Day — Core Application Logic ===
//
// MIGRATION IN PROGRESS: this file is being split into js/core (portable,
// no DOM), js/platform (browser APIs, swapped per target) and js/ui (DOM).
// See docs/architecture.md § Module map. Code still living here has not been
// moved yet; new code belongs in a module, not at the bottom of this file.

import {
  storageGet, storageSet, storageRemove, isStorageAvailable, storageKeysWithPrefix,
} from './js/platform/storage.js';
import { formatHours, hexToRgb, hexToRgba } from './js/core/format.js';
import {
  HOURS_PER_STAGE, GROWTH_STAGES, getGrowthStage,
  pendingGrowthMilestones as corePendingMilestones,
  acknowledgeGrowthMilestones as coreAckMilestones,
  baselineGrowthStages as coreBaselineStages,
} from './js/core/growth.js';
import {
  MAX_INTENTION_HOURS, hoursByCategoryToday as coreHoursByCategoryToday,
  intentionsAllMetToday as coreIntentionsAllMet,
} from './js/core/intentions.js';
import { getTodayString, getDefaultState, dayHasWork } from './js/core/day.js';
import {
  STORAGE_KEY, HISTORY_KEY, LAYOUT_KEY, BACKLOG_KEY, CATEGORIES_KEY,
  SIDEBAR_KEY, FOCUS_SNAPSHOT_KEY, STORE_KEY, KEY_PREFIX,
} from './js/core/keys.js';
import * as CoreState from './js/core/state.js';
import * as CoreStore from './js/core/store.js';
import {
  applyBlobColors, pulseBlobEvent, DayByDayBlobs,
  configureColorSource as configureBlobColorSource,
} from './js/ui/blobs.js';
import {
  makeChipDial, makeTimeAddRing, makeInlineHoursEditor, DEFAULT_TIME_PRESETS,
} from './js/ui/time-ring.js';
import * as CoreBackup from './js/core/backup.js';
import * as DayTransition from './js/ui/day-transition.js';
import * as Drag from './js/ui/drag.js';
import * as FocusMode from './js/ui/focus-mode.js';
import * as Sidebar from './js/ui/sidebar.js';
import * as Modals from './js/ui/modals.js';
import * as Settings from './js/ui/settings.js';
import * as DoneToday from './js/ui/done-today.js';
import { emojiToColor, COLOR_SWATCHES } from './js/core/palette.js';
import * as CoreSessions from './js/core/sessions.js';

(function () {
  'use strict';

  const MAX_GOALS = 5;
  const MAX_DISTRACTIONS = 5;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 34;
  // Storage keys and STORE_VERSION: js/core/keys.js (imported above).

  // --- Default categories ---
  const DEFAULT_CATEGORIES = CoreState.DEFAULT_CATEGORIES;

  // --- Emoji → color mapping ---
  // Category palette + emojiToColor: js/core/palette.js

  // Curated swatches shown in both category modals — ordered for visual appeal



  // --- Storage ---
  // Moved to js/platform/storage.js — imported at the top of this file.

  // =========================================================
  // BLOB CONTROLLER — wiring only
  // =========================================================
  // Colour selection: js/core/blob-colors.js. Motion and painting:
  // js/ui/blobs.js. All that remains here is handing the UI module a way to
  // read the colour inputs, so it never reaches into app state itself.
  //
  // The getter body runs on demand, not now — `state` and `categories` are
  // declared further down and would be in the temporal dead zone if this
  // dereferenced them immediately.
  configureBlobColorSource(() => (state && categories) ? {
    focusIds: state.focusCategoryIds || [],
    categories,
    activeCats: activeCategories(),
    getCategoryById,
    today: getTodayString(),
  } : null);

  // Deferred: state isn't loaded yet at this point in the IIFE.
  setTimeout(applyBlobColors, 0);

  // storageGet / storageSet / storageRemove now come from
  // js/platform/storage.js (imported at the top of this file).

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
  // ---- Store: thin bindings over js/core/store.js ----
  // The core module is stateless about *which* store it operates on — every
  // function takes it explicitly, which is what keeps it portable. These
  // wrappers supply this module's live `store` / `state` / `backlog` so the
  // ~40 call sites throughout app.js stay unchanged.
  const makeEntity = CoreStore.makeEntity;
  const entityToView = CoreStore.entityToView;
  const hydrateDayType = (day, type) => CoreStore.hydrateDayType(store, day, type);
  const hydrateBacklogFromStore = () => CoreStore.hydrateBacklogFromStore(store);
  const hydrateSessionsFromStore = () => CoreStore.hydrateSessionsFromStore(store);
  const syncDayToStore = (day) => CoreStore.syncDayToStore(store, day, state);
  const syncBacklogToStore = () => CoreStore.syncBacklogToStore(store, backlog);
  const syncSessionsToStore = () => CoreStore.syncSessionsToStore(store, state);
  const saveStore = () => CoreStore.saveStore(store);

  // HOURS_PER_STAGE / GROWTH_STAGES: js/core/growth.js

  // --- Categories ---
  // Composition root: core modules take storage as an injected dependency so
  // they never import js/platform (the boundary rule — see
  // docs/architecture.md § Module map). Wiring happens here, before any core
  // function that persists is called.
  CoreState.configureStorage({ get: storageGet, set: storageSet });
  CoreStore.configureStorage({ get: storageGet, set: storageSet });
  CoreSessions.configureStorage({ get: storageGet, set: storageSet, remove: storageRemove });
  CoreBackup.configureStorage({
    get: storageGet, set: storageSet, remove: storageRemove,
    keysWithPrefix: storageKeysWithPrefix,
  });

  // initState() loads categories + today's state + backlog, and returns the
  // previous day when it detected a rollover. Returning it beats the old
  // shared `_prevDayForModal`: loading's second output is now visible in the
  // signature rather than arriving as a side effect.
  const _prevDayForModal = CoreState.initState();
  const categories = CoreState.getCategories();

  const loadCategories = CoreState.loadCategories;

  // `store.categories` is the same array object, so a category change is
  // already live in memory — but the *persisted* store would keep a stale copy
  // until something else happened to save it. Write both.
  function saveCategories() {
    storageSet(CATEGORIES_KEY, JSON.stringify(categories));
    if (typeof store !== 'undefined' && store) saveStore();
  }

  // Thin wrappers over js/core. They supply this module's live state so every
  // existing call site stays unchanged and the core stays free of globals —
  // the rationale for each rule lives with the rule, in js/core/.
  function baselineGrowthStages() {
    if (coreBaselineStages(categories)) saveCategories();
  }

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

  // =========================================================
  // GROWTH + INTENTIONS — state-bound wrappers
  // =========================================================
  // The rules themselves live in js/core/growth.js and js/core/intentions.js;
  // these bind them to this module's live `state` / `categories` and persist
  // the result. Read the core files for the reasoning behind each rule.
  function pendingGrowthMilestones() {
    return corePendingMilestones(activeCategories());
  }

  function hoursByCategoryToday() {
    return coreHoursByCategoryToday(state);
  }

  function intentionsAllMetToday() {
    return coreIntentionsAllMet(state, categories);
  }

  function acknowledgeGrowthMilestones(items) {
    if (coreAckMilestones(items)) saveCategories();
  }


  // =========================================================
  // DAILY INTENTIONS
  // =========================================================
  // An optional "I'd like to give this area about N hours today", set when
  // picking focus areas and shown as a quiet progress bar on the sidebar card.
  //
  // Deliberately soft: intentions live on the day's state (so a Tuesday
  // intention never leaks into Wednesday), every one is optional, and nothing
  // in the UI ever reports falling short. An unmet intention looks exactly
  // like mid-morning progress — see docs/features.md § Daily intentions.
  // MAX_INTENTION_HOURS: js/core/intentions.js

  function getIntentions() {
    return state.focusIntentions || {};
  }

  function getIntentionFor(catId) {
    const v = getIntentions()[catId];
    return typeof v === 'number' && v > 0 ? v : null;
  }

  // Builds the "how much time?" rows shown under a focus picker. Rows appear
  // only for currently-selected areas and carry whatever was already set.
  //   getSelected() -> array of category ids, in pick order
  //   returns { el, refresh, collect }
  function makeIntentionFields(getSelected, initial) {
    const draft = Object.assign({}, initial || {});

    const wrap = document.createElement('div');
    wrap.className = 'intention-fields';

    const label = document.createElement('div');
    label.className = 'day-modal-section-label';
    label.textContent = 'Time you\'d like to give (optional)';

    const rows = document.createElement('div');
    rows.className = 'intention-rows';
    wrap.append(label, rows);

    function refresh() {
      const ids = getSelected();
      rows.innerHTML = '';
      if (ids.length === 0) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');

      ids.forEach(id => {
        const cat = getCategoryById(id);
        if (!cat) return;
        const row = document.createElement('label');
        row.className = 'intention-row';

        const name = document.createElement('span');
        name.className = 'intention-row-name';
        name.innerHTML = `<span class="intention-row-emoji">${cat.emoji}</span>`;
        name.appendChild(document.createTextNode(cat.name));

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'intention-input';
        input.min = '0';
        input.max = String(MAX_INTENTION_HOURS);
        // Whole hours only. `step` governs the spinner arrows; the rounding
        // in the handler covers typed input, which ignores step entirely.
        // An intention is a rough gesture at the day, not a schedule — half
        // hours invite a precision the number doesn't have.
        input.step = '1';
        input.placeholder = '—';
        input.value = draft[id] != null ? String(draft[id]) : '';
        input.setAttribute('aria-label', `Hours for ${cat.name}`);
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          if (!input.value.trim() || isNaN(v) || v <= 0) delete draft[id];
          else draft[id] = Math.round(Math.min(MAX_INTENTION_HOURS, Math.max(0, v)));
        });
        // Snap the visible field to the stored whole number, but only once
        // the user is done typing — rewriting the value mid-input would fight
        // the caret on every keystroke.
        input.addEventListener('blur', () => {
          input.value = draft[id] != null ? String(draft[id]) : '';
        });

        const unit = document.createElement('span');
        unit.className = 'intention-unit';
        unit.textContent = 'h';

        row.append(name, input, unit);
        rows.appendChild(row);
      });
    }

    // Only keep intentions for areas still selected — deselecting an area
    // shouldn't leave an orphaned target behind.
    function collect() {
      const ids = new Set(getSelected());
      const out = {};
      Object.keys(draft).forEach(id => { if (ids.has(id)) out[id] = draft[id]; });
      return out;
    }

    refresh();
    return { el: wrap, refresh, collect };
  }

  // Time-add ring, chip dials, inline hours editor: js/ui/time-ring.js

  // Accumulate hours into category totals — called when hours change on a task
  function accumulateCategoryHours(catId, delta) {
    if (!catId || delta === 0) return;
    const cat = getCategoryById(catId);
    if (!cat) return;
    cat.totalHours = Math.max(0, (cat.totalHours || 0) + delta);
    saveCategories();
    renderSidebar();
  }

  // Sidebar + toast state: js/ui/sidebar.js

  // --- State ---
  // Loaded by CoreState.initState() above; mirrored into local bindings so the
  // ~400 existing reads of `state` / `backlog` are unchanged. Reassignment
  // goes through setState/setBacklog so core and app.js can't diverge.
  let state = CoreState.getState();
  let backlog = CoreState.getBacklog();

  // --- Unified store (Phase 3) ---
  // Built once at boot from the legacy keys. The store is the source of truth;
  // goals, distractions, quickDone and backlog are read/written through the
  // adapter above. Sessions still use the legacy path for now.
  const store = CoreStore.migrateToStore({
    loadCategories: CoreState.loadCategories,
    loadHistory: CoreState.loadHistory,
    loadBacklog: CoreState.loadBacklog,
  });

  // Share one categories array between the store and the module so totalHours
  // updates (via accumulateCategoryHours) stay reflected in the store.
  store.categories = categories;

  // Now that categories are the live, store-backed array, baseline the growth
  // stages: pre-existing hours must not fire a milestone toast the first time
  // this feature runs.
  baselineGrowthStages();

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
  // Reassignment: keep core's binding in step, or the two views diverge and
  // a later CoreState.getBacklog() would hand out the pre-hydration array.
  backlog = hydrateBacklogFromStore();
  CoreState.setBacklog(backlog);
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
  const sidebarScrim = document.getElementById('sidebar-scrim');
  const sidebarFab = document.getElementById('sidebar-fab');

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
  // SIDEBAR — wiring only
  // =========================================================
  // Rendering, rail/panel behaviour and the growth/intentions toasts live in
  // js/ui/sidebar.js, along with the toast state they depend on.
  Sidebar.configure({
    get state() { return state; },
    get categories() { return categories; },
    get backlog() { return backlog; },
    saveState, saveBacklog, render, renderBacklog, applyBlobColors,
    getCategoryById, activeCategories, getIntentionFor,
    pendingGrowthMilestones, acknowledgeGrowthMilestones, intentionsAllMetToday,
    archiveCategory, restoreCategory, deleteCategory,
    get openEditFocusModal() { return openEditFocusModal; },
    // Getters: these come from js/ui/modals.js, destructured further down.
    // Reading them eagerly here hits the temporal dead zone (see
    // scripts/check-configure-tdz.mjs).
    get openCatInlineEdit() { return openCatInlineEdit; },
    get openQuickAddModal() { return openQuickAddModal; },
    get openNewCategoryModal() { return openNewCategoryModal; },
    isBacklogItemVisible, getActiveGoals, MAX_GOALS,
    // Getter: this configure() call runs near the top of the IIFE, but the
    // drag bindings are `const`s destructured much further down. Reading the
    // value eagerly here hits the temporal dead zone; a getter defers it to
    // first use, which is always after boot.
    get setupSidebarBacklogDrag() { return setupSidebarBacklogDrag; },
    isModalOpen, isFocusFullscreenOpen, undoStack,
    storageGet, storageSet,
    lifeSidebar, sidebarCategoriesEl, sidebarCatDots, sidebarScrim, sidebarFab,
    sidebarExpandBtn, sidebarCloseBtn, addCategoryBtn,
  });
  const { isMobileLayout, setSidebarOpen, initSidebar, renderSidebar } = Sidebar;

  // =========================================================
  // MODALS — wiring only
  // =========================================================
  // Category editing, quick-add, new area, task detail: js/ui/modals.js.
  Modals.configure({
    get state() { return state; },
    get categories() { return categories; },
    get backlog() { return backlog; },
    saveState, saveBacklog, saveCategories, render, renderSidebar, renderBacklog,
    getCategoryById, activeCategories, getActiveGoals, MAX_GOALS,
    get addQuickDone() { return addQuickDone; },
    get quickInputEl() { return quickInputEl; },
    get accumulateCategoryHours() { return accumulateCategoryHours; },
  });
  const {
    openCatInlineEdit, closeQuickAdd, openQuickAddModal, closePicker, closeModal,
    openNewCategoryModal, createCategoryPill, openTaskContextPicker, openTaskDetailModal,
    openLogDoneModal,
  } = Modals;

  // =========================================================
  // DATE / STATE MANAGEMENT
  // =========================================================
  // getTodayString / getDefaultState: js/core/day.js

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

  const loadBacklog = CoreState.loadBacklog;

  function saveBacklog() {
    syncBacklogToStore();
    saveStore();
    storageSet(BACKLOG_KEY, JSON.stringify(backlog));
  }

  const archiveDay = CoreState.archiveDay;
  const loadHistory = CoreState.loadHistory;

  // Did anything actually happen on this day? Used to tell a real working day
  // apart from one where the app was merely opened (which still gets saved and
  // archived, and would otherwise masquerade as "the previous day").

  // The summary modal should reflect the last day you actually WORKED, not
  // simply the last day the app was open. Skipping days (or opening the app
  // and doing nothing) leaves empty days in between; walk back through history
  // to find the most recent real one, falling back to `fallback` when there is
  // no such day. Returns { day, gapDays, idleDays }.
  function findLastActiveDay(fallback) {
    const today = getTodayString();
    const candidates = loadHistory().filter(d => d && d.date && d.date < today);
    if (fallback && fallback.date && !candidates.find(d => d.date === fallback.date)) {
      candidates.push(fallback);
    }
    candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const active = candidates.filter(dayHasWork);
    const day = active.length ? active[active.length - 1] : fallback;
    if (!day || !day.date) return { day: fallback, gapDays: 0, idleDays: 0 };

    const dayMs = 1000 * 60 * 60 * 24;
    const gapDays = Math.round(
      (new Date(today + 'T12:00:00') - new Date(day.date + 'T12:00:00')) / dayMs
    );
    // Days between that last active day and today where nothing was logged.
    const idleDays = Math.max(0, gapDays - 1);
    return { day, gapDays, idleDays };
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

  // Nothing unfinished may be silently discarded. Every path that clears
  // `_carryover` routes through here first: anything not already live in
  // Top 5 lands in the backlog, so a task survives until the user
  // deliberately deletes it. Returns the number of tasks rescued.
  //
  // Note this is deliberately NOT filtered by today's focus categories —
  // the focus picker decides what gets pre-loaded into Top 5, not what is
  // allowed to survive the day.
  function rescueCarryoverToBacklog() {
    const leftovers = state._carryover || [];
    if (leftovers.length === 0) { delete state._carryover; return 0; }
    let rescued = 0;
    leftovers.forEach(g => {
      if (!g || !g.name) return;
      // Already carried into today's Top 5 — nothing to rescue.
      if (state.goals.find(eg => eg.name === g.name)) return;
      // Already sitting in the backlog — don't duplicate it.
      if (backlog.find(b => b.name === g.name)) return;
      backlog.push({
        name: g.name,
        category: g.category || null,
        repeatable: g.repeatable || false,
        hours: g.hours || 0,
        progress: g.progress || 0,
      });
      rescued++;
    });
    delete state._carryover;
    if (rescued > 0) saveBacklog();
    return rescued;
  }

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
    rescueCarryoverToBacklog();
    saveState();
    carryoverBanner.classList.add('hidden');
    render();
  });

  if (carryoverDismiss) carryoverDismiss.addEventListener('click', () => {
    rescueCarryoverToBacklog();
    saveState();
    carryoverBanner.classList.add('hidden');
    render();
  });

  if (storageWarning && !isStorageAvailable()) storageWarning.classList.remove('hidden');

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
      backlog.push({
        name: g.name, category: g.category || null, repeatable: g.repeatable || false,
        hours: g.hours || 0, progress: g.progress || 0,
      });
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
  // FOCUS MODE — wiring only
  // =========================================================
  // Screens: js/ui/focus-mode.js. Session-retirement rules (what to do with a
  // session left running overnight): js/core/sessions.js.
  FocusMode.configure({
    get state() { return state; },
    saveState, render, renderSummary, renderJournal, renderSidebar,
    goalsListEl, getCategoryById, accumulateCategoryHours,
    makeTimeAddRing, makeInlineHoursEditor, MAX_DISTRACTIONS,
    getIdleMs, getLastActivity, markActivity,
    loadHistory, getTodayString, storageGet, storageSet, storageRemove,
  });
  const { openFocusModal, checkForCrashedFocusSession } = FocusMode;

  // Midnight passed with a session still on screen. Tear the overlay down and
  // file the hours on the day they were worked — the record itself is built by
  // js/core/sessions.js, shared with the reloaded-next-day path so the two
  // can't drift into recording different shapes for the same situation.
  function closeFocusSessionForRollover(prevDay) {
    const overlay = document.querySelector('body > .focus-fullscreen-overlay');
    const snap = CoreSessions.readSnapshot();
    if (!overlay && !snap) return;

    const gain = CoreSessions.retireSessionIntoDay(prevDay, snap);
    if (gain > 0) {
      // Category totals are all-time, not per-day, so they take the real gain —
      // only the day the hours are filed under is changing.
      const goal = (prevDay.goals || []).find(g => g && g.name === snap.goalName);
      accumulateCategoryHours((goal && goal.category) || 'general', gain);
    }

    CoreSessions.clearSnapshot();
    if (overlay) overlay.remove();
    FocusMode.clearActiveOverlay();
    // No further cleanup needed: the body MutationObserver drops the
    // focus-fullscreen-open class and unpauses the blobs, and the ambient
    // screen's intervals self-clear on their `isConnected` guard.
  }

  // =========================================================
  // DONE TODAY — wiring only
  // =========================================================
  // js/ui/done-today.js. Ordering and the fold arithmetic: js/core/done-today.js.
  DoneToday.configure({
    get state() { return state; },
    doneListEl, doneSubtitle, quickInputEl, addQuickBtn, undoStack,
    saveState, render, renderSummary, renderSidebar,
    getCompletedGoals, getCategoryById, permanentlyDeleteGoal,
    createCategoryPill, openLogDoneModal, accumulateCategoryHours, makeEditable,
  });
  const { renderDone, addQuickDone } = DoneToday;

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
  // General is the backlog's inbox — items land there before they're filed into
  // a life area, so today's focus filter must never hide them.
  function isBacklogItemVisible(item) {
    const focusIds = state.focusCategoryIds || [];
    const cat = item.category || 'general';
    return cat === 'general' || focusIds.length === 0 || focusIds.includes(cat);
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
        state.goals.push({ name: item.name, hours: item.hours || 0, progress: item.progress || 0, fromBacklog: true, category: item.category || null, repeatable: item.repeatable || false });
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
    // Stamp 'general' explicitly: an undefined category defaults to General in
    // isBacklogItemVisible, and General items are always shown, so a freshly
    // typed task can never be filtered out of the card the instant it's added.
    backlog.push({ name: n, category: 'general' });
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

    // Left running past midnight and closed automatically — the hours are a
    // conservative estimate, not a measurement. Say so rather than let the
    // number pass as measured time.
    if (session.unattended) {
      const estMark = document.createElement('span');
      estMark.className = 'focus-session-estimate';
      estMark.textContent = '~';
      estMark.title = 'Session was left running overnight and closed automatically — these hours are a conservative estimate';
      pillLeft.appendChild(estMark);
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
      archiveDay(state);
      state = getDefaultState();
      CoreState.setState(state); // reassignment — core must not keep the archived day
      saveState(); render();
    }
  });

  // =========================================================
  // DRAG & DROP — wiring only
  // =========================================================
  // All three systems live in js/ui/drag.js (see docs/drag-drop.md).
  // state/backlog are getters: app.js reassigns them, and a drag must always
  // act on the current day's arrays.
  Drag.configure({
    get state() { return state; },
    get backlog() { return backlog; },
    goalsListEl, distractionsListEl, backlogListEl,
    saveState, saveBacklog, render, renderSidebar, renderBacklog,
    getCategoryById, saveCardLayout, backlogVisibleSlotToIndex,
    getActiveGoals, getCompletedGoals, MAX_GOALS,
  });
  const { setupCardDrag, setupTaskDrag, setupSidebarBacklogDrag, setupBacklogItemDrag } = Drag;

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
  // SETTINGS + FOCUS EDITOR — wiring only
  // =========================================================
  // js/ui/settings.js. Backup rules come from js/core/backup.js; this module
  // only presents them and performs the download.
  const APP_VERSION = '0.9.0'; // keep in sync with package.json
  const collectExportPayload = () => CoreBackup.collectExportPayload({ appVersion: APP_VERSION });
  const applyImportPayload = CoreBackup.applyImportPayload;
  const describeBackup = CoreBackup.describeBackup;

  Settings.configure({
    get state() { return state; },
    get categories() { return categories; },
    get backlog() { return backlog; },
    saveState, renderSidebar, renderBacklog, applyBlobColors,
    activeCategories, getCategoryById, getTodayString, APP_VERSION,
    get makeIntentionFields() { return makeIntentionFields; },
    get collectExportPayload() { return collectExportPayload; },
    get applyImportPayload() { return applyImportPayload; },
    get describeBackup() { return describeBackup; },
    get closeModal() { return closeModal; },
    get isMobileLayout() { return isMobileLayout; },
  });
  const { downloadExport, openSettingsModal, openEditFocusModal } = Settings;

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
    DayByDayBlobs.setOccluded(focusOpen);
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
        // Sidebar too: backlog items are also listed under their life area,
        // and deleting from there is now possible.
        saveBacklog(); renderBacklog(); renderSidebar();
      } else if (type === 'quickDone') {
        state.quickDone.splice(Math.min(index, state.quickDone.length), 0, item);
        saveState(); renderDone();
      }
    }
  });

  // =========================================================
  // AUTO NEW-DAY DETECTION
  // =========================================================
  // Day transition modal: js/ui/day-transition.js.
  //
  // state/backlog/categories are GETTERS, not values: app.js reassigns `state`
  // at rollover and `backlog` after hydration, so a captured value would go
  // stale and the modal would plan against yesterday's data.
  DayTransition.configure({
    get state() { return state; },
    get backlog() { return backlog; },
    get categories() { return categories; },
    getCategoryById, activeCategories, saveState, saveBacklog,
    render, renderSidebar, applyBlobColors, makeIntentionFields,
    rescueCarryoverToBacklog, getTodayString, MAX_GOALS,
  });
  const showDayTransitionModal = DayTransition.showDayTransitionModal;


  function checkForNewDay() {
    const today = getTodayString();
    if (state.date !== today) {
      const prev = state;
      // Close any focus session still running as the day turns. Its exit
      // handler closes over `state.goals[index]`, so left open it would log
      // last night's hours against a goal on the fresh day. Tear the overlay
      // down BEFORE archiving, so the retired session lands in `prev` and is
      // archived along with it.
      closeFocusSessionForRollover(prev);
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
      CoreState.setState(state); // keep core's binding in step (see above)
      saveState();
      render();
      updateClock();
      // Same rule as boot: if `prev` was an idle day (tab left open overnight,
      // nothing logged), summarise the last day that actually had work.
      const { day: lastActive } = findLastActiveDay(prev);
      showDayTransitionModal(dayHasWork(prev) ? prev : (lastActive || prev));
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
    // Show the last day real work happened, not merely the last day the app
    // was opened — skipped (or idle) days would otherwise summarise as blank.
    const { day: lastActive, gapDays } = findLastActiveDay(_prevDayForModal);
    const summaryDay = lastActive || _prevDayForModal;
    const hasData = dayHasWork(summaryDay) ||
                    (summaryDay.goals && summaryDay.goals.length > 0);
    if (gapDays === 1 || hasData) showDayTransitionModal(summaryDay);
    else showCarryoverIfNeeded();
  } else showCarryoverIfNeeded();
  initCardDragHandles();
  checkForCrashedFocusSession();
  initSidebar();

})();
