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
  hoursByCategoryToday as coreHoursByCategoryToday,
  intentionsAllMetToday as coreIntentionsAllMet,
  getIntentions as coreGetIntentions, getIntentionFor as coreGetIntentionFor,
} from './js/core/intentions.js';
import {
  getTodayString, getDefaultState, dayHasWork,
  findLastActiveDay as coreFindLastActiveDay,
} from './js/core/day.js';
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
import * as Journal from './js/ui/journal.js';
import * as Backlog from './js/ui/backlog.js';
import * as Tasks from './js/ui/tasks.js';
import * as Editable from './js/ui/editable.js';
import { emojiToColor, COLOR_SWATCHES } from './js/core/palette.js';
import * as CoreSessions from './js/core/sessions.js';
import {
  isBacklogItemVisible as coreIsBacklogItemVisible,
  backlogVisibleSlotToIndex as coreBacklogVisibleSlotToIndex,
} from './js/core/backlog.js';
import * as CoreCarryover from './js/core/carryover.js';
import * as IntentionsUI from './js/ui/intentions.js';
import * as CarryoverUI from './js/ui/carryover.js';

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
  // DAILY INTENTIONS — wiring only
  // =========================================================
  // Rules (reading, parsing, which survive a change of selection):
  // js/core/intentions.js. The "how much time?" rows under both focus
  // pickers: js/ui/intentions.js. See docs/features.md § Daily intentions.
  //
  // Function declarations, not consts: Sidebar.configure() and
  // DayTransition.configure() pass these by value, and declarations hoist.
  IntentionsUI.configure({ getCategoryById });

  function getIntentions() {
    return coreGetIntentions(state);
  }

  function getIntentionFor(catId) {
    return coreGetIntentionFor(state, catId);
  }

  function makeIntentionFields(getSelected, initial) {
    return IntentionsUI.makeIntentionFields(getSelected, initial);
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
  // DATE / STATE MANAGEMENT — wiring only
  // =========================================================
  // getTodayString / getDefaultState / dayHasWork / findLastActiveDay:
  // js/core/day.js. Loading, archiving and building the carryover:
  // js/core/state.js. What stays here binds those to the live state, store
  // and undo stack, and persists.

  // Permanently delete a goal by index — scrubs it from state.goals AND _carryover so
  // it never resurfaces in the day transition modal or anywhere else.
  function permanentlyDeleteGoal(index) {
    const goal = state.goals[index];
    undoStack.push({ type: 'goal', item: goal, index });
    state.goals.splice(index, 1);
    // Also remove from _carryover (built at day-rollover, not updated on subsequent deletes)
    if (state._carryover && goal) {
      state._carryover = CoreCarryover.withoutGoalNamed(state._carryover, goal.name);
    }
    // Also remove from _prevDayForModal so the summary modal doesn't show it
    if (_prevDayForModal && _prevDayForModal.goals && goal) {
      _prevDayForModal.goals = CoreCarryover.withoutGoalNamed(_prevDayForModal.goals, goal.name);
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

  // findLastActiveDay: js/core/day.js. This binding supplies today's date
  // and the archived history; the rule itself takes both as arguments.
  function findLastActiveDay(fallback) {
    const today = getTodayString();
    return coreFindLastActiveDay(loadHistory(), today, fallback);
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
  // CARRYOVER — wiring only
  // =========================================================
  // Rules for consuming `_carryover`: js/core/carryover.js (it is built by
  // buildCarryover() in js/core/state.js). The legacy banner: js/ui/carryover.js.

  // Nothing unfinished may be silently discarded. Every path that clears
  // `_carryover` routes through here first: anything not already live in
  // Top 5 lands in the backlog. Returns the number of tasks rescued.
  // backlog is appended to in place, never reassigned.
  function rescueCarryoverToBacklog() {
    const rescued = CoreCarryover.rescueItems(state._carryover, state.goals, backlog);
    rescued.forEach(item => backlog.push(item));
    delete state._carryover;
    if (rescued.length > 0) saveBacklog();
    return rescued.length;
  }

  // state is a getter: rollover replaces the object (see docs/architecture.md
  // § The injected-context pattern).
  CarryoverUI.configure({
    get state() { return state; },
    carryoverBanner, carryoverList, carryoverAccept, carryoverDismiss,
    MAX_GOALS, saveState, render, rescueCarryoverToBacklog,
  });

  function showCarryoverIfNeeded() { CarryoverUI.showCarryoverIfNeeded(); }

  if (storageWarning && !isStorageAvailable()) storageWarning.classList.remove('hidden');

  // =========================================================
  // INLINE EDITING + PROGRESS SLIDER FILL — wiring only
  // =========================================================
  // js/ui/editable.js. Shared by the Top 5, distraction, backlog, journal and
  // Done Today rows. A hoisted declaration so a configure() call placed above
  // this point could still pass it by value. updateSliderFill has no caller
  // left in this file; js/ui/tasks.js imports it directly.
  function makeEditable(spanEl, onSave) { return Editable.makeEditable(spanEl, onSave); }

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

  // Top 5 and distraction rows: js/ui/tasks.js (wired under ADDING TASKS
  // below). Hoisted declarations, so render() can call them from anywhere.
  function renderGoals() { Tasks.renderGoals(); }
  function renderDistractions() { Tasks.renderDistractions(); }

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

  // =========================================================
  // BACKLOG — wiring only
  // =========================================================
  // Visibility rules (focus filter, General-as-inbox, visible slot → array
  // index): js/core/backlog.js. These bind them to the live `state` /
  // `backlog`. Function declarations, not consts: Sidebar.configure() and
  // Drag.configure() receive them by value.
  function isBacklogItemVisible(item) {
    return coreIsBacklogItemVisible(item, state.focusCategoryIds);
  }

  function backlogVisibleSlotToIndex(slot) {
    return coreBacklogVisibleSlotToIndex(slot, backlog, state.focusCategoryIds);
  }

  // Card rendering, rows and the add input: js/ui/backlog.js.
  Backlog.configure({
    get state() { return state; },
    get backlog() { return backlog; },
    backlogListEl, backlogInputEl, addBacklogBtn, undoStack,
    saveState, saveBacklog, render, renderSidebar, updateAddButtonVisibility,
    getActiveGoals, MAX_GOALS, createCategoryPill, makeEditable,
    // Getter: destructured from js/ui/drag.js further down (TDZ).
    get setupBacklogItemDrag() { return setupBacklogItemDrag; },
  });
  // A function declaration, not `const { renderBacklog } = Backlog`: the
  // Sidebar, Modals and Settings configure() calls pass renderBacklog by
  // value, and a const here would still be in its temporal dead zone then.
  function renderBacklog() { Backlog.renderBacklog(); }

  // =========================================================
  // JOURNAL — wiring only
  // =========================================================
  // js/ui/journal.js. Session ordering and detail-panel text:
  // js/core/journal.js.
  Journal.configure({
    get state() { return state; },
    successesListEl, failuresListEl, successInputEl, failureInputEl,
    addSuccessBtn, addFailureBtn, undoStack,
    saveState, getCategoryById, makeEditable,
  });
  // A function declaration, not `const { renderJournal } = Journal`:
  // FocusMode.configure() above passes renderJournal by value, and a const
  // here would still be in its temporal dead zone at that point. Declarations
  // hoist, so every existing call site keeps working unchanged.
  function renderJournal() { Journal.renderJournal(); }

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
  // ADDING TASKS + TASK ROWS — wiring only
  // =========================================================
  // The Top 5 / distraction rows, add inputs and buttons: js/ui/tasks.js. The
  // "Reset day" button stays here because it reassigns `state`.
  Tasks.configure({
    get state() { return state; },
    get backlog() { return backlog; },
    goalInputEl, addGoalBtn, distractionInputEl, addDistractionBtn,
    goalsListEl, distractionsListEl, undoStack,
    saveState, saveBacklog, render, renderSidebar, renderSummary,
    getActiveGoals, openTaskDetailModal, permanentlyDeleteGoal, openFocusModal,
    accumulateCategoryHours, createCategoryPill,
    MAX_GOALS, MAX_DISTRACTIONS,
    // Getter: destructured from js/ui/drag.js further down (TDZ).
    get setupTaskDrag() { return setupTaskDrag; },
  });

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
