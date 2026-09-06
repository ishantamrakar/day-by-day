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
    openCatInlineEdit, openQuickAddModal, openEditFocusModal, openNewCategoryModal,
    archiveCategory, restoreCategory, deleteCategory,
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
  // SETTINGS — gear at the bottom of the sidebar rail.
  // One organized home for app-level options. Future settings (theme
  // color, blob animation behavior, notification frequency…) each get
  // their own cat-modal-section block inside openSettingsModal().
  // =========================================================
  const APP_VERSION = '0.9.0'; // keep in sync with package.json

  // Backup/restore rules: js/core/backup.js. Only the download itself is here,
  // because handing the user a file is a platform concern.
  const collectExportPayload = () => CoreBackup.collectExportPayload({ appVersion: APP_VERSION });
  const applyImportPayload = CoreBackup.applyImportPayload;
  const describeBackup = CoreBackup.describeBackup;

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
        intentionFields.refresh();
      });
      catGrid.appendChild(btn);
    });

    // Same optional time intentions as the morning modal, so they can be
    // adjusted mid-day without waiting for tomorrow.
    const intentionFields = makeIntentionFields(
      () => Array.from(selectedCats),
      state.focusIntentions,
    );

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
      state.focusIntentions = intentionFields.collect();
      saveState();
      renderSidebar();
      renderBacklog(); // backlog card filters by focus categories
      applyBlobColors();
      overlay.remove();
    });
    actions.append(cancelBtn, saveBtn);

    modal.append(header, hint, catGrid, intentionFields.el, actions);
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
