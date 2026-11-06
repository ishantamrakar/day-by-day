// UI: focus mode — the per-goal fullscreen session.
//
// DOM. Not portable; a native build rebuilds these screens.
//
// Two modals, easily confused:
//   openFocusModal      — the small per-goal sheet (hours pill, staged time
//                         ring, "Focus Mode" / "Add"). Staged time is committed
//                         before entering focus mode so taps are never lost.
//   openFullFocusMode   — the fullscreen session: intention -> mind check-in ->
//                         ambient screen -> exit reflection, where a focus-%
//                         slider splits wall-clock time into goal hours and
//                         distraction hours.
//
// THE SNAPSHOT INVARIANT: while a session runs, its state is mirrored to
// localStorage. Every DELIBERATE close clears it, so a snapshot that survives
// means the tab crashed or reloaded mid-session. Break that pairing and the
// app will offer to resume sessions the user actually finished. The retirement
// rules for a snapshot found on a later day live in js/core/sessions.js.

import { formatHours, hexToRgb } from '../core/format.js';
import * as Sessions from '../core/sessions.js';

let _ctx = null;
export function configure(c) { _ctx = c; }
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

const storageGet = (k) => _ctx.storageGet(k);
const storageSet = (k, v) => _ctx.storageSet(k, v);
const storageRemove = (k) => _ctx.storageRemove(k);
const getTodayString = () => _ctx.getTodayString();
const FOCUS_SNAPSHOT_KEY = 'daybyday_focus_session';


const FOCUS_WISDOM = [
  "The anxiety of not starting is always worse than the discomfort of doing the work.",
  "Distraction isn't random — it's your mind flinching away from the discomfort of real work. Lean in.",
  "You don't need to feel ready. The leap is what creates the readiness.",
  "Stop waiting for motivation. Action creates motivation, not the other way around.",
  "The discomfort you feel when starting? That's the feeling of doing something that matters.",
  "You'll never clear the decks. The question is: are you doing what matters?",
  "Every time you choose your goal over a distraction, you're voting for the person you want to become.",
];

const ENTRY_STATES = [
  { emoji: '😶', label: 'Hard to start',     prompt: 'What\'s making it hard to begin? Is it the task itself, or something else on your mind?' },
  { emoji: '💭', label: 'Mind is scattered',  prompt: 'What\'s pulling your attention? Sometimes naming it is enough to set it aside.' },
  { emoji: '😰', label: 'Feels too big',      prompt: 'What feels overwhelming about this? What would the smallest possible first step look like?' },
  { emoji: '📱', label: 'Tempted to scroll',  prompt: 'What are you avoiding by reaching for distraction? What feels uncomfortable about diving in?' },
  { emoji: '😴', label: 'Low energy',         prompt: 'Is this tiredness physical, mental, or emotional? What does your body actually need right now?' },
  { emoji: '✨', label: 'Actually ready',      prompt: null },
  { emoji: '✏️', label: 'Something else…',    prompt: 'Describe what\'s going on for you right now.', custom: true },
];

const EXIT_STATES = [
  { emoji: '🎯', label: 'Got into flow',               prompt: 'What helped you get there? Capture it so you can recreate it.' },
  { emoji: '🌊', label: 'Some resistance, made progress', prompt: 'What created the friction? What kept you going despite it?' },
  { emoji: '🧱', label: 'Kept hitting walls',           prompt: 'What wall did you keep running into? Is it a blocker you can remove, or something to work around?' },
  { emoji: '🌀', label: 'Got distracted',               prompt: 'What pulled you away? No judgment — just notice it. What would you do differently next time?' },
  { emoji: '✏️', label: 'Something else…',              prompt: 'What was the experience like? Write whatever comes up.', custom: true },
];

const LESSON_SUGGESTIONS = {
  'Hard to start':     'When it\'s hard to start, try committing to just 5 minutes.',
  'Mind is scattered': 'When my mind is scattered, writing down what\'s distracting me first helps.',
  'Feels too big':     'When a task feels too big, break it into one next action and start there.',
  'Tempted to scroll': 'When I want to scroll, putting my phone out of reach for 20 minutes works.',
  'Low energy':        'When my energy is low, a short walk before starting helps more than I expect.',
};

let activeFocusOverlay = null;

// app.js tears the overlay down itself at a day rollover (it owns the
// archive-then-replace sequence), so it needs a way to clear this module's
// handle without reaching into the binding.
export function clearActiveOverlay() { activeFocusOverlay = null; }

// Attention check: after this much time with no interaction during a
// running session, ask (gently) whether the user is still working.
const FOCUS_IDLE_THRESHOLD_MS = 60 * 60 * 1000;
const FOCUS_IDLE_CHECK_MS = 30 * 1000;
const ULTRA_FOCUS_COLOR = '#D9A441'; // warm gold — ultra focus accent


export function openFocusModal(goal, index) {
  if (activeFocusOverlay) activeFocusOverlay.remove();

  const cat = ctx.getCategoryById(goal.category || 'general');
  const catColor = cat ? cat.color : '#2D6A4F';
  const catEmoji = cat ? cat.emoji : '⚡';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay focus-modal-overlay';
  activeFocusOverlay = overlay;

  const modal = document.createElement('div');
  modal.className = 'focus-modal';
  modal.style.setProperty('--focus-cat-color-rgb', hexToRgb(catColor));

  // Header
  const header = document.createElement('div');
  header.className = 'focus-modal-header';

  const catTag = document.createElement('span');
  catTag.className = 'focus-modal-cat-tag';
  catTag.style.setProperty('--cat-color', catColor);
  catTag.textContent = `${catEmoji} ${cat ? cat.name : 'General'}`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'focus-modal-close';
  closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  closeBtn.addEventListener('click', () => { overlay.remove(); activeFocusOverlay = null; });
  header.append(catTag, closeBtn);

  // Task name
  const taskName = document.createElement('h2');
  taskName.className = 'focus-modal-task-name';
  taskName.textContent = goal.name;

  // Hours pill — same pattern as goal card, clickable to edit
  const hoursDisplay = document.createElement('span');
  hoursDisplay.className = 'goal-hours-pill focus-modal-hours-pill';

  const updateHoursDisplay = () => {
    const h = ctx.state.goals[index] ? (ctx.state.goals[index].hours || 0) : (goal.hours || 0);
    if (hoursDisplay.querySelector('input')) return;
    // Reads as the existing total, distinct from the ring below it (which
    // is only what's about to be added).
    hoursDisplay.textContent = h === 0 ? 'Nothing logged yet' : `${formatHours(h)} logged today`;
    hoursDisplay.classList.toggle('goal-hours-pill--empty', h === 0);
  };
  updateHoursDisplay();

  ctx.makeInlineHoursEditor(hoursDisplay, {
    getValue: () => ctx.state.goals[index].hours,
    onCommit: (v, prev, delta) => {
      ctx.state.goals[index].hours = v;
      ctx.saveState();
      ctx.accumulateCategoryHours(ctx.state.goals[index].category || 'general', delta);
      ctx.renderSummary();
      // Sync card pill too
      const cardPill = ctx.goalsListEl.querySelector(`.goal-hours-pill[data-goal-index="${index}"]`);
      if (cardPill && !cardPill.querySelector('input')) {
        cardPill.textContent = formatHours(v);
        cardPill.classList.toggle('goal-hours-pill--empty', v === 0);
      }
    },
    render: updateHoursDisplay,
  });

  // ── Time to add ──
  // Staged, not live: the ring counts only what this visit is about to log
  // and starts at zero. Nothing reaches the task until "Add" is pressed, so
  // dismissing the modal adds nothing.
  const chipsSection = document.createElement('div');
  chipsSection.className = 'focus-modal-chips-section';

  const chipsLabel = document.createElement('p');
  chipsLabel.className = 'focus-modal-chips-label';
  chipsLabel.textContent = 'Log time on this task';

  // Declared before the ring: constructing it paints once, which fires
  // onChange before this button would otherwise exist.
  let addBtn = null;
  const ring = ctx.makeTimeAddRing({
    onChange: pending => {
      if (!addBtn) return;
      addBtn.disabled = pending <= 0;
      addBtn.textContent = pending > 0 ? `Add ${formatHours(pending, '0m')}` : 'Add time';
    },
  });

  chipsSection.append(chipsLabel, ring.el);

  // Divider
  const divider = document.createElement('div');
  divider.className = 'focus-modal-divider';

  // Commits the staged time onto the task. Shared by the Add button and by
  // entering focus mode, so staged time is never silently dropped.
  function commitPendingTime() {
    const pending = ring.getHours();
    if (pending <= 0) return 0;
    const prev = ctx.state.goals[index].hours || 0;
    const next = Math.min(24, prev + pending);
    const delta = next - prev;
    ctx.state.goals[index].hours = Math.round(next * 100) / 100;
    ctx.saveState();
    ctx.accumulateCategoryHours(ctx.state.goals[index].category || 'general', delta);
    ctx.renderSummary();
    updateHoursDisplay();
    const cardPill = ctx.goalsListEl.querySelector(`.goal-hours-pill[data-goal-index="${index}"]`);
    if (cardPill && !cardPill.querySelector('input')) {
      const h = ctx.state.goals[index].hours || 0;
      cardPill.textContent = formatHours(h);
      cardPill.classList.toggle('goal-hours-pill--empty', h === 0);
    }
    ring.reset();
    return delta;
  }

  const actions = document.createElement('div');
  actions.className = 'focus-modal-actions';

  const focusModeBtn = document.createElement('button');
  focusModeBtn.className = 'focus-enter-btn focus-enter-btn--secondary';
  focusModeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-144a56,56,0,1,0,56,56A56.06,56.06,0,0,0,128,72Zm0,96a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg> Focus Mode';
  focusModeBtn.addEventListener('click', () => {
    // Don't discard staged time just because they chose to focus instead.
    commitPendingTime();
    overlay.remove();
    activeFocusOverlay = null;
    openFullFocusMode(goal, index, catColor, catEmoji, cat);
  });

  addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary focus-add-time-btn';
  addBtn.textContent = 'Add time';
  addBtn.disabled = true;
  addBtn.addEventListener('click', () => {
    commitPendingTime();
    overlay.remove();
    activeFocusOverlay = null;
  });

  actions.append(focusModeBtn, addBtn);

  modal.append(header, taskName, hoursDisplay, chipsSection, divider, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('pointerdown', e => {
    if (e.target === overlay) { overlay.remove(); activeFocusOverlay = null; }
  });
}

// `resume` (optional): a crash-recovery snapshot from FOCUS_SNAPSHOT_KEY —
// { snap, toExit }. Restores session state and boots straight to the
// ambient screen (or the exit screen when toExit is set).
export function openFullFocusMode(goal, index, catColor, catEmoji, cat, resume) {
  if (activeFocusOverlay) activeFocusOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay focus-fullscreen-overlay';
  overlay.style.setProperty('--focus-cat-color', catColor);
  overlay.style.setProperty('--focus-cat-color-rgb', hexToRgb(catColor));
  activeFocusOverlay = overlay;
  document.body.appendChild(overlay);

  // Shared session state — carries through all screens
  const snap = resume ? resume.snap : null;
  let sessionIntention = snap ? (snap.sessionIntention || '') : '';
  let sessionEntryTag = snap ? (snap.sessionEntryTag || null) : null;
  let sessionEntryNote = snap ? (snap.sessionEntryNote || '') : '';
  let sessionNotes = snap ? (snap.sessionNotes || []) : [];
  let sessionStartTime = snap ? (snap.sessionStartTime || null) : null; // set when ambient screen opens
  let ultraFocus = snap ? !!snap.ultraFocus : false; // user kept going after an idle check-in
  let overrideTotalMins = null; // set when user logs custom hours from the idle dialog

  // Crash backup: while a session runs, a snapshot lives in localStorage.
  // Written at ambient start and on every meaningful change; cleared on
  // every deliberate close so it only survives crashes/reloads.
  function persistSnapshot() {
    storageSet(FOCUS_SNAPSHOT_KEY, JSON.stringify({
      date: getTodayString(),
      goalName: goal.name,
      category: goal.category || null,
      sessionStartTime, sessionIntention, sessionEntryTag, sessionEntryNote,
      sessionNotes, ultraFocus,
      savedAt: Date.now(),
    }));
  }
  function clearSnapshot() { storageRemove(FOCUS_SNAPSHOT_KEY); }

  // ── helpers ──────────────────────────────────────────────

  function transition(fromEl, buildNext) {
    if (fromEl.classList.contains('focus-full-screen')) {
      fromEl.classList.add('focus-screen-exit');
    } else {
      // Ambient screen uses inline style transitions
      fromEl.style.opacity = '0';
      fromEl.style.transform = 'translateY(-12px)';
    }
    setTimeout(() => {
      fromEl.remove();
      const next = buildNext();
      overlay.appendChild(next);
      if (next.classList.contains('focus-full-screen')) {
        requestAnimationFrame(() => next.classList.add('focus-screen-enter'));
      }
    }, 280);
  }

  function makeScreen(extraClass) {
    const s = document.createElement('div');
    s.className = 'focus-full-screen' + (extraClass ? ' ' + extraClass : '');
    return s;
  }

  function makeLabel(text, cls) {
    const el = document.createElement('p');
    el.className = cls || 'focus-entry-label';
    el.textContent = text;
    return el;
  }

  function makeTextarea(placeholder, rows, cls) {
    const ta = document.createElement('textarea');
    ta.className = cls || 'focus-lesson-input';
    ta.placeholder = placeholder;
    ta.rows = rows || 3;
    return ta;
  }

  function makeTagGrid(states, onSelect) {
    const grid = document.createElement('div');
    grid.className = 'focus-entry-tags';
    states.forEach(({ emoji, label, custom }) => {
      const btn = document.createElement('button');
      btn.className = 'focus-entry-tag';
      btn.dataset.label = label;
      if (custom) {
        btn.innerHTML = `<span class="focus-tag-emoji">${emoji}</span><span class="focus-tag-label">${label}</span>`;
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.focus-entry-tag').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          onSelect(label, true);
        });
      } else {
        btn.innerHTML = `<span class="focus-tag-emoji">${emoji}</span><span class="focus-tag-label">${label}</span>`;
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.focus-entry-tag').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          onSelect(label, false);
        });
      }
      grid.appendChild(btn);
    });
    return grid;
  }

  // `teardown` lets a screen clean up its own timers before the overlay
  // goes away. Only the ambient screen has any (clock/idle/breathe); without
  // it those intervals outlive the closed session forever.
  function makeCloseBtn(teardown) {
    const btn = document.createElement('button');
    btn.className = 'focus-fullscreen-close';
    btn.title = 'Close focus mode';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    btn.addEventListener('click', () => {
      if (teardown) teardown();
      clearSnapshot(); overlay.remove(); activeFocusOverlay = null;
    });
    return btn;
  }

  // ── Screen 1: Intention ──────────────────────────────────

  function buildIntentionScreen() {
    const screen = makeScreen('focus-intention-screen');

    const label = makeLabel('What do you want to achieve in this session?');
    const sub = makeLabel('Set an intention — even a rough one. It helps.', 'focus-entry-sublabel');

    const intentionInput = makeTextarea('e.g. "Get the first draft of the intro written" or "figure out why the bug is happening"', 3, 'focus-lesson-input focus-intention-input');

    const nextBtn = document.createElement('button');
    nextBtn.className = 'focus-enter-btn focus-entry-start';
    nextBtn.textContent = 'Next →';
    nextBtn.addEventListener('click', () => {
      sessionIntention = intentionInput.value.trim();
      transition(screen, buildEntryScreen);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'focus-skip-btn';
    skipBtn.textContent = 'Skip intention';
    skipBtn.addEventListener('click', () => transition(screen, buildEntryScreen));

    screen.append(makeCloseBtn(), label, sub, intentionInput, nextBtn, skipBtn);
    return screen;
  }

  // ── Screen 2: Entry check-in ─────────────────────────────

  function buildEntryScreen() {
    const screen = makeScreen('focus-entry-screen');

    const label = makeLabel('How\'s your mind right now?');
    const sub = makeLabel('Pick what fits — or skip straight in.', 'focus-entry-sublabel');

    // Journaling area — revealed after tag pick (if prompt exists)
    const journalArea = document.createElement('div');
    journalArea.className = 'focus-journal-area hidden';
    const journalPrompt = document.createElement('p');
    journalPrompt.className = 'focus-lesson-label';
    const journalInput = makeTextarea('Write freely…', 3);
    journalArea.append(journalPrompt, journalInput);

    // Custom label input — shown when "Something else…" picked
    const customLabelArea = document.createElement('div');
    customLabelArea.className = 'focus-journal-area hidden';
    const customInput = makeTextarea('Describe how you\'re feeling…', 2);
    customLabelArea.appendChild(customInput);

    const tagGrid = makeTagGrid(ENTRY_STATES, (label, isCustom) => {
      sessionEntryTag = label;
      if (isCustom) {
        journalArea.classList.add('hidden');
        customLabelArea.classList.remove('hidden');
        customInput.focus({ preventScroll: true });
      } else {
        customLabelArea.classList.add('hidden');
        const stateObj = ENTRY_STATES.find(s => s.label === label);
        if (stateObj && stateObj.prompt) {
          journalPrompt.textContent = stateObj.prompt;
          journalArea.classList.remove('hidden');
          journalInput.focus({ preventScroll: true });
        } else {
          journalArea.classList.add('hidden');
        }
      }
    });

    const beginBtn = document.createElement('button');
    beginBtn.className = 'focus-enter-btn focus-entry-start';
    beginBtn.textContent = 'Begin →';
    beginBtn.addEventListener('click', () => {
      if (sessionEntryTag === 'Something else…') {
        sessionEntryNote = customInput.value.trim();
        sessionEntryTag = sessionEntryNote || 'Something else';
      } else {
        sessionEntryNote = journalInput.value.trim();
      }
      transition(screen, buildAmbientScreen);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'focus-skip-btn';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => transition(screen, buildAmbientScreen));

    screen.append(makeCloseBtn(), label, sub, tagGrid, journalArea, customLabelArea, beginBtn, skipBtn);
    return screen;
  }

  // ── Screen 3: Ambient (3-column) ─────────────────────────

  function buildAmbientScreen() {
    if (!sessionStartTime) sessionStartTime = Date.now(); // preserved on crash-resume
    persistSnapshot();

    const screen = document.createElement('div');
    screen.className = 'focus-ambient-screen';
    screen.style.setProperty('--cat-color', catColor);

    // Wrapped in an arrow fn: stopAmbientIntervals is hoisted but its
    // interval handles aren't assigned until further down this function.
    const closeBtn = makeCloseBtn(() => stopAmbientIntervals());
    closeBtn.classList.add('focus-ambient-close');
    screen.appendChild(closeBtn);

    // ── LEFT: Journal log ──────────────────────────────────
    const leftCol = document.createElement('div');
    leftCol.className = 'focus-col focus-col-left';

    const leftTitle = document.createElement('p');
    leftTitle.className = 'focus-col-title';
    leftTitle.textContent = 'This session';

    // Intention block
    if (sessionIntention) {
      const intentBlock = document.createElement('div');
      intentBlock.className = 'focus-journal-block';
      const intentLabel = document.createElement('span');
      intentLabel.className = 'focus-journal-block-label';
      intentLabel.textContent = 'Intention';
      const intentText = document.createElement('p');
      intentText.className = 'focus-journal-block-text';
      intentText.textContent = sessionIntention;
      intentBlock.append(intentLabel, intentText);
      leftCol.append(leftTitle, intentBlock);
    } else {
      leftCol.appendChild(leftTitle);
    }

    // Entry state block
    if (sessionEntryTag) {
      const entryBlock = document.createElement('div');
      entryBlock.className = 'focus-journal-block';
      const entryLabel = document.createElement('span');
      entryLabel.className = 'focus-journal-block-label';
      entryLabel.textContent = 'State of mind';
      const entryText = document.createElement('p');
      entryText.className = 'focus-journal-block-text';
      entryText.textContent = sessionEntryTag + (sessionEntryNote ? ` — "${sessionEntryNote}"` : '');
      entryBlock.append(entryLabel, entryText);
      leftCol.appendChild(entryBlock);
    }

    // Live notes list — updates as notes are saved
    const notesListEl = document.createElement('div');
    notesListEl.className = 'focus-notes-list';
    const renderNotesList = () => {
      notesListEl.innerHTML = '';
      if (sessionNotes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'focus-notes-empty';
        empty.textContent = 'Notes you add will appear here.';
        notesListEl.appendChild(empty);
      } else {
        sessionNotes.forEach(n => {
          // Notes are { text, at } — but tolerate plain strings from
          // snapshots written before timestamps existed.
          const noteEl = document.createElement('div');
          noteEl.className = 'focus-note-item';
          const dot = document.createElement('span');
          dot.className = 'focus-note-dot';
          const txt = document.createElement('span');
          txt.textContent = typeof n === 'string' ? n : n.text;
          noteEl.append(dot, txt);
          if (n.at) {
            const time = document.createElement('span');
            time.className = 'focus-note-time';
            time.textContent = new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            noteEl.appendChild(time);
          }
          notesListEl.appendChild(noteEl);
        });
      }
    };
    renderNotesList();
    leftCol.appendChild(notesListEl);

    // ── CENTER: Task + clock + add note ───────────────────
    const centerCol = document.createElement('div');
    centerCol.className = 'focus-col focus-col-center';

    const catEl = document.createElement('div');
    catEl.className = 'focus-ambient-cat';
    catEl.textContent = catEmoji;

    const nameEl = document.createElement('h1');
    nameEl.className = 'focus-ambient-name';
    nameEl.textContent = goal.name;

    const clockEl = document.createElement('div');
    clockEl.className = 'focus-ambient-clock';
    const tick = () => { clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    tick();
    const clockInterval = setInterval(tick, 10000);

    // ── Attention check ────────────────────────────────────
    // No interaction for FOCUS_IDLE_THRESHOLD_MS while the session runs
    // → gently ask what to do with the away time. Timestamp-based, so a
    // late tick after machine sleep still sees the full gap. The
    // isConnected guard self-clears the interval on every teardown path.
    let idleDialogEl = null;
    const idleCheckInterval = setInterval(() => {
      if (!screen.isConnected) { clearInterval(idleCheckInterval); return; }
      if (idleDialogEl) return;
      if (ctx.getIdleMs() >= FOCUS_IDLE_THRESHOLD_MS) showIdleDialog();
    }, FOCUS_IDLE_CHECK_MS);

    function stopAmbientIntervals() {
      clearInterval(idleCheckInterval);
      clearInterval(clockInterval);
      if (breatheInterval) clearInterval(breatheInterval);
    }

    function applyUltraFocus() {
      // Guard on the DOM, not the flag — a crash-resumed ultra session
      // has ultraFocus=true but still needs its visuals re-applied.
      if (overlay.classList.contains('focus-ultra')) return;
      ultraFocus = true;
      overlay.classList.add('focus-ultra');
      overlay.style.setProperty('--focus-cat-color', ULTRA_FOCUS_COLOR);
      overlay.style.setProperty('--focus-cat-color-rgb', hexToRgb(ULTRA_FOCUS_COLOR));
      const badge = document.createElement('span');
      badge.className = 'focus-ultra-badge';
      badge.textContent = '🔥 Ultra focus';
      clockEl.insertAdjacentElement('afterend', badge);
      persistSnapshot();
    }

    function showIdleDialog() {
      // Anchor the away period to the last real interaction. Clicking
      // the dialog itself marks activity globally, but the away math
      // stays frozen to this anchor until a choice is made.
      const awayStart = ctx.getLastActivity();

      const scrim = document.createElement('div');
      scrim.className = 'focus-idle-scrim';
      idleDialogEl = scrim;

      const dialog = document.createElement('div');
      dialog.className = 'focus-idle-dialog';

      const title = document.createElement('p');
      title.className = 'focus-idle-title';
      title.textContent = 'Still working on this?';

      const away = document.createElement('p');
      away.className = 'focus-idle-away';
      const updateAway = () => {
        away.textContent = `No activity for ${formatHours((Date.now() - awayStart) / 3600000, 'a little while')}.`;
      };
      updateAway();
      const awayInterval = setInterval(() => {
        if (!scrim.isConnected) { clearInterval(awayInterval); return; }
        updateAway();
      }, 10000);

      function closeIdleDialog() {
        clearInterval(awayInterval);
        scrim.remove();
        idleDialogEl = null;
        ctx.markActivity(); // answering means the user is back
      }

      function makeIdleBtn(text, extraClass) {
        const b = document.createElement('button');
        b.className = 'focus-idle-btn' + (extraClass ? ' ' + extraClass : '');
        b.textContent = text;
        return b;
      }

      // 1. Keep counting — this is a marathon. Acknowledge it.
      const stillBtn = makeIdleBtn('I\'m still focusing — count it all', 'focus-idle-btn--primary');
      stillBtn.addEventListener('click', () => {
        applyUltraFocus();
        closeIdleDialog();
      });

      // 2. Trim the away time, keep the session going.
      const trimBtn = makeIdleBtn('I stepped away — trim that time');
      trimBtn.addEventListener('click', () => {
        const gapMs = Date.now() - awayStart;
        sessionStartTime = Math.min(Date.now(), sessionStartTime + gapMs);
        persistSnapshot();
        closeIdleDialog();
      });

      // 3. End now, logging hours the user chooses.
      const customBtn = makeIdleBtn('Wrap up — I\'ll log the hours myself');
      const hoursArea = document.createElement('div');
      hoursArea.className = 'focus-idle-hours-area hidden';
      const hoursInput = document.createElement('input');
      hoursInput.type = 'number';
      hoursInput.className = 'focus-idle-hours-input';
      hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.25';
      const hoursConfirm = makeIdleBtn('End session', 'focus-idle-btn--primary');
      hoursArea.append(hoursInput, hoursConfirm);
      customBtn.addEventListener('click', () => {
        hoursArea.classList.remove('hidden');
        // Prefill with the time before the away gap began.
        const activeHours = Math.max(0, Math.round((awayStart - sessionStartTime) / 36000) / 100);
        hoursInput.value = String(activeHours);
        hoursInput.focus({ preventScroll: true });
        hoursInput.select();
      });
      hoursConfirm.addEventListener('click', () => {
        const v = parseFloat(hoursInput.value);
        if (!isFinite(v) || v < 0 || v > 24) {
          hoursInput.classList.add('focus-idle-input-error');
          setTimeout(() => hoursInput.classList.remove('focus-idle-input-error'), 600);
          return;
        }
        overrideTotalMins = Math.round(v * 60);
        stopAmbientIntervals();
        closeIdleDialog();
        transition(screen, buildExitScreen);
      });
      hoursInput.addEventListener('keydown', e => { if (e.key === 'Enter') hoursConfirm.click(); });

      // 4. Scrap — same discard path as the close button.
      const scrapBtn = makeIdleBtn('Scrap this session', 'focus-idle-btn--quiet');
      scrapBtn.addEventListener('click', () => {
        stopAmbientIntervals();
        closeIdleDialog();
        clearSnapshot();
        overlay.remove();
        activeFocusOverlay = null;
      });

      const actions = document.createElement('div');
      actions.className = 'focus-idle-actions';
      actions.append(stillBtn, trimBtn, customBtn, hoursArea, scrapBtn);

      dialog.append(title, away, actions);
      scrim.appendChild(dialog);
      overlay.appendChild(scrim);
    }

    // Add note area — always visible in center
    const noteInputWrapper = document.createElement('div');
    noteInputWrapper.className = 'focus-note-input-wrapper';
    const noteInput = makeTextarea('Capture a thought, a blocker, a breakthrough…', 3, 'focus-lesson-input focus-notes-input');
    const saveNoteBtn = document.createElement('button');
    saveNoteBtn.className = 'focus-note-save-btn';
    saveNoteBtn.textContent = 'Save note';
    saveNoteBtn.addEventListener('click', () => {
      const text = noteInput.value.trim();
      if (text) {
        sessionNotes.push({ text, at: Date.now() });
        noteInput.value = '';
        renderNotesList();
        persistSnapshot();
      }
    });
    // Enter saves the note as a new bullet; Shift+Enter makes a newline.
    noteInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveNoteBtn.click();
      }
    });
    noteInputWrapper.append(noteInput, saveNoteBtn);

    const doneBtn = document.createElement('button');
    doneBtn.className = 'focus-done-btn';
    doneBtn.textContent = 'I\'m done for now';
    doneBtn.addEventListener('click', () => {
      stopAmbientIntervals();
      transition(screen, buildExitScreen);
    });

    centerCol.append(catEl, nameEl, clockEl, noteInputWrapper, doneBtn);

    // ── RIGHT: Focus tools ─────────────────────────────────
    const rightCol = document.createElement('div');
    rightCol.className = 'focus-col focus-col-right';

    const rightTitle = document.createElement('p');
    rightTitle.className = 'focus-col-title';
    rightTitle.textContent = 'Focus tools';

    const wisdomCard = document.createElement('div');
    wisdomCard.className = 'focus-tool-card';
    const wisdomIcon = document.createElement('span');
    wisdomIcon.className = 'focus-tool-icon';
    wisdomIcon.textContent = '💡';
    const wisdomText = document.createElement('p');
    wisdomText.className = 'focus-tool-text';
    wisdomText.textContent = FOCUS_WISDOM[Math.floor(Math.random() * FOCUS_WISDOM.length)];
    wisdomCard.append(wisdomIcon, wisdomText);

    const breatheCard = document.createElement('div');
    breatheCard.className = 'focus-tool-card focus-breathe-card';
    const breatheIcon = document.createElement('span');
    breatheIcon.className = 'focus-tool-icon';
    breatheIcon.textContent = '🌬️';
    const breatheTitle = document.createElement('p');
    breatheTitle.className = 'focus-tool-label';
    breatheTitle.textContent = 'Box breathing';
    const breatheDesc = document.createElement('p');
    breatheDesc.className = 'focus-tool-text';
    breatheDesc.textContent = 'In 4s · Hold 4s · Out 4s · Hold 4s. Repeat 4×. Resets the nervous system in under 2 minutes.';
    const breatheBtn = document.createElement('button');
    breatheBtn.className = 'focus-tool-btn';
    breatheBtn.textContent = 'Start guide';
    let breatheInterval = null;
    let breathePhase = 0;
    const breathePhases = ['Breathe in…', 'Hold…', 'Breathe out…', 'Hold…'];
    breatheBtn.addEventListener('click', () => {
      if (breatheInterval) {
        clearInterval(breatheInterval);
        breatheInterval = null;
        breatheBtn.textContent = 'Start guide';
        breatheDesc.textContent = 'In 4s · Hold 4s · Out 4s · Hold 4s. Repeat 4×. Resets the nervous system in under 2 minutes.';
        breatheDesc.classList.remove('focus-breathe-active');
      } else {
        breathePhase = 0;
        breatheDesc.textContent = breathePhases[0];
        breatheDesc.classList.add('focus-breathe-active');
        breatheBtn.textContent = 'Stop';
        breatheInterval = setInterval(() => {
          breathePhase = (breathePhase + 1) % 4;
          breatheDesc.textContent = breathePhases[breathePhase];
        }, 4000);
      }
    });
    breatheCard.append(breatheIcon, breatheTitle, breatheDesc, breatheBtn);

    const groundCard = document.createElement('div');
    groundCard.className = 'focus-tool-card';
    const groundIcon = document.createElement('span');
    groundIcon.className = 'focus-tool-icon';
    groundIcon.textContent = '🌿';
    const groundTitle = document.createElement('p');
    groundTitle.className = 'focus-tool-label';
    groundTitle.textContent = '5-4-3-2-1 grounding';
    const groundText = document.createElement('p');
    groundText.className = 'focus-tool-text';
    groundText.textContent = 'Name 5 things you see · 4 you can touch · 3 you hear · 2 you smell · 1 you taste. Brings you back to now.';
    groundCard.append(groundIcon, groundTitle, groundText);

    rightCol.append(rightTitle, wisdomCard, breatheCard, groundCard);

    const grid = document.createElement('div');
    grid.className = 'focus-ambient-grid';
    grid.append(leftCol, centerCol, rightCol);
    screen.appendChild(grid);

    // Crash-resumed ultra session → re-apply the gold visuals
    if (ultraFocus) applyUltraFocus();

    // Animate in
    screen.style.opacity = '0';
    screen.style.transition = 'opacity 0.35s ease';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      screen.style.opacity = '1';
    }));

    return screen;
  }

  // ── Screen 4: Exit check-in ──────────────────────────────

  function buildExitScreen() {
    const screen = makeScreen('focus-exit-screen');

    // Compute total session minutes (idle dialog may have set an override)
    const sessionMs = sessionStartTime ? (Date.now() - sessionStartTime) : 0;
    const totalMins = overrideTotalMins !== null ? overrideTotalMins : Math.round(sessionMs / 60000);

    const label = makeLabel('How did it go?');
    const sub = makeLabel('No judgment — just honest.', 'focus-entry-sublabel');

    // ── Focus % slider ───────────────────────────────────────
    const sliderSection = document.createElement('div');
    sliderSection.className = 'focus-pct-section';

    const sliderLabel = document.createElement('p');
    sliderLabel.className = 'focus-lesson-label';
    sliderLabel.textContent = 'How much of this session were you actually focused?';

    const sliderRow = document.createElement('div');
    sliderRow.className = 'focus-pct-row';

    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5'; slider.value = '80';
    slider.className = 'focus-pct-slider';

    const sliderVal = document.createElement('span');
    sliderVal.className = 'focus-pct-value';
    sliderVal.textContent = '80%';

    const updateSlider = () => {
      const pct = parseInt(slider.value);
      sliderVal.textContent = pct + '%';
      const focused = Math.round(totalMins * pct / 100);
      const distracted = totalMins - focused;
      timeBreakdown.textContent = totalMins > 0
        ? `${focused}m focused · ${distracted}m distracted`
        : 'Set time via the hours pill after closing';
      slider.style.background = `linear-gradient(to right, rgba(var(--focus-cat-color-rgb,64,145,108),0.8) 0%, rgba(var(--focus-cat-color-rgb,64,145,108),0.8) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
      // Show distraction capture if ≥50% distracted
      distractionCapture.classList.toggle('hidden', pct > 50);
    };

    slider.addEventListener('input', updateSlider);
    sliderRow.append(slider, sliderVal);

    const timeBreakdown = document.createElement('p');
    timeBreakdown.className = 'focus-entry-sublabel';

    sliderSection.append(sliderLabel, sliderRow, timeBreakdown);

    // ── Distraction capture (shown when focus < 50%) ─────────
    const distractionCapture = document.createElement('div');
    distractionCapture.className = 'focus-journal-area hidden';
    const distLabel = document.createElement('p');
    distLabel.className = 'focus-lesson-label';
    distLabel.textContent = 'What pulled you away? (will be added to 5 to Avoid)';
    const distInput = makeTextarea('e.g. phone, email, thoughts about X…', 2);
    distractionCapture.append(distLabel, distInput);

    // ── Reflection area ──────────────────────────────────────
    const reflectionArea = document.createElement('div');
    reflectionArea.className = 'focus-journal-area hidden';
    const reflectionPrompt = document.createElement('p');
    reflectionPrompt.className = 'focus-lesson-label';
    const reflectionInput = makeTextarea('Write what comes up…', 4);
    reflectionArea.append(reflectionPrompt, reflectionInput);

    const customExitArea = document.createElement('div');
    customExitArea.className = 'focus-journal-area hidden';
    const customExitInput = makeTextarea('What was the experience like?', 4);
    customExitArea.appendChild(customExitInput);

    let selectedExitTag = null;

    const tagGrid = makeTagGrid(EXIT_STATES, (tagLabel, isCustom) => {
      selectedExitTag = tagLabel;
      if (isCustom) {
        reflectionArea.classList.add('hidden');
        customExitArea.classList.remove('hidden');
        customExitInput.focus({ preventScroll: true });
      } else {
        customExitArea.classList.add('hidden');
        const stateObj = EXIT_STATES.find(s => s.label === tagLabel);
        reflectionPrompt.textContent = sessionIntention && tagLabel === 'Got into flow'
          ? `You set out to: "${sessionIntention}" — did you get there? What helped?`
          : (stateObj ? stateObj.prompt : 'What did you notice?');
        reflectionArea.classList.remove('hidden');
        reflectionInput.focus({ preventScroll: true });
      }
    });

    // ── Save ─────────────────────────────────────────────────
    const saveBtn = document.createElement('button');
    saveBtn.className = 'focus-enter-btn focus-entry-start';
    saveBtn.textContent = 'Save & close';
    saveBtn.addEventListener('click', () => {
      const focusPct = parseInt(slider.value);
      const focusMins = Math.round(totalMins * focusPct / 100);
      const distractMins = totalMins - focusMins;
      const focusHours = Math.round(focusMins / 60 * 100) / 100;
      const distractHours = Math.round(distractMins / 60 * 100) / 100;

      // Log focus hours to the goal
      if (focusHours > 0 && ctx.state.goals[index]) {
        const prev = ctx.state.goals[index].hours || 0;
        ctx.state.goals[index].hours = Math.round(Math.min(24, prev + focusHours) * 100) / 100;
        // Accumulate what the goal actually gained (the 24h/day cap may
        // truncate it) — same rule as the time-add chips.
        ctx.accumulateCategoryHours(ctx.state.goals[index].category || 'general', ctx.state.goals[index].hours - prev);
        // Sync the pill on the card
        const cardPill = ctx.goalsListEl.querySelector(`.goal-hours-pill[data-goal-index="${index}"]`);
        if (cardPill && !cardPill.querySelector('input')) {
          const h = ctx.state.goals[index].hours;
          const hr = Math.floor(h), mn = Math.round((h - hr) * 60);
          cardPill.textContent = h === 0 ? '+ hrs' : (hr > 0 && mn > 0 ? `${hr}h ${mn}m` : hr > 0 ? `${hr}h` : `${mn}m`);
          cardPill.classList.toggle('goal-hours-pill--empty', h === 0);
        }
      }

      // Log distraction time — the unfocused share of the session always
      // lands in the day's distraction hours, exactly once:
      // a named distraction if one was typed, else the first existing
      // item, else a generic "Drifted time" entry.
      if (distractHours > 0) {
        const distText = distInput.value.trim();
        if (distText && ctx.state.distractions.length < ctx.MAX_DISTRACTIONS) {
          ctx.state.distractions.push({ name: distText, hours: distractHours });
        } else if (ctx.state.distractions.length > 0) {
          ctx.state.distractions[0].hours = Math.round(((ctx.state.distractions[0].hours || 0) + distractHours) * 100) / 100;
        } else {
          ctx.state.distractions.push({ name: 'Drifted time', hours: distractHours });
        }
      }

      // Build exit reflection text
      const exitNote = selectedExitTag === 'Something else…'
        ? customExitInput.value.trim()
        : reflectionInput.value.trim();

      // Save focus session object
      if (!ctx.state.focusSessions) ctx.state.focusSessions = [];
      const session = {
        timestamp: Date.now(),
        goalName: goal.name,
        goalIndex: index,
        // Store only the category id; emoji/color are resolved live at render
        // so category edits reflect in the journal (no frozen snapshot).
        category: goal.category || 'general',
        totalMins,
        focusPct,
        focusMins,
        distractMins,
        isWin: focusPct >= 70,
        ultraFocus,
        intention: sessionIntention || null,
        entryTag: sessionEntryTag || null,
        entryNote: sessionEntryNote || null,
        midNotes: [...sessionNotes],
        exitTag: selectedExitTag || null,
        exitNote: exitNote || null,
      };
      ctx.state.focusSessions.push(session);

      ctx.saveState();
      clearSnapshot();
      ctx.renderSummary();
      ctx.renderJournal();
      ctx.render(); // refresh goal card hours pill
      overlay.remove();
      activeFocusOverlay = null;
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'focus-skip-btn';
    skipBtn.textContent = 'Skip — just close';
    skipBtn.addEventListener('click', () => { clearSnapshot(); overlay.remove(); activeFocusOverlay = null; });

    const actions = document.createElement('div');
    actions.className = 'focus-exit-actions';
    actions.append(saveBtn, skipBtn);

    // Init slider display
    updateSlider();

    screen.append(makeCloseBtn(), label, sub, sliderSection, distractionCapture, tagGrid, reflectionArea, customExitArea, actions);
    return screen;
  }

  // ── Boot ─────────────────────────────────────────────────

  if (resume && resume.toExit) {
    // Crash recovery, "wrap up": straight to the reflection screen.
    const exitScreen = buildExitScreen();
    overlay.appendChild(exitScreen);
    requestAnimationFrame(() => exitScreen.classList.add('focus-screen-enter'));
  } else if (resume) {
    // Crash recovery, "resume": back into the running session.
    // buildAmbientScreen keeps the snapshot's sessionStartTime and
    // re-applies ultra visuals; it animates itself in.
    overlay.appendChild(buildAmbientScreen());
  } else {
    const firstScreen = buildIntentionScreen();
    overlay.appendChild(firstScreen);
    requestAnimationFrame(() => firstScreen.classList.add('focus-screen-enter'));
  }
}

// A session left running past midnight belongs to the day it started on,
// not to the one you woke up in. Rather than discard it (hours genuinely
// worked) or credit it to today (hours nobody worked), retire it onto its
// own day in history, capped at the time from its start to end of that day.
//
// The cap matters: an untended session reads as 14h when the real work was
// maybe two. We can't know the true figure, so we record a deliberately
// conservative one — OVERNIGHT_CREDIT_HOURS — and mark the session
// `unattended` so the journal can say the number is an estimate. Erring low
// is the honest direction here: overstating hours is the one outcome that
// would make the whole log untrustworthy.
// Crash recovery: a snapshot in FOCUS_SNAPSHOT_KEY means the tab crashed
// or reloaded mid-session (deliberate closes always clear it). Offer to
// pick the session back up. Same-day only — a session from an earlier day
// is retired onto that day (see retireStaleFocusSession) rather than
// resumed, since its clock has been running unattended overnight.
export function checkForCrashedFocusSession() {
  const raw = storageGet(FOCUS_SNAPSHOT_KEY);
  if (!raw) return;
  let snap = null;
  try { snap = JSON.parse(raw); } catch (e) { snap = null; }
  if (!snap || !snap.sessionStartTime) {
    storageRemove(FOCUS_SNAPSHOT_KEY);
    return;
  }
  if (snap.date !== getTodayString()) {
    // From an earlier day: retire it onto the day it was worked (js/core/
    // sessions.js) rather than resuming a clock that has been running unwatched.
    Sessions.retireStaleFocusSession(snap, { loadHistory: ctx.loadHistory });
    storageRemove(FOCUS_SNAPSHOT_KEY);
    return;
  }

  const catObj = ctx.getCategoryById(snap.category || 'general');
  const catColor = (catObj && catObj.color) || '#2D6A4F';
  const catEmoji = (catObj && catObj.emoji) || '⚡';
  const goalIdx = ctx.state.goals.findIndex(g => g.name === snap.goalName);
  // Goal may have been completed/deleted since — a stub still lets the
  // session be logged (exit save guards state.goals[index] itself).
  const goalObj = goalIdx !== -1 ? ctx.state.goals[goalIdx] : { name: snap.goalName, category: snap.category || null };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay focus-restore-overlay';
  overlay.style.setProperty('--focus-cat-color-rgb', hexToRgb(catColor));

  const dialog = document.createElement('div');
  dialog.className = 'focus-idle-dialog';

  const title = document.createElement('p');
  title.className = 'focus-idle-title';
  title.textContent = 'Pick up where you left off?';

  const info = document.createElement('p');
  info.className = 'focus-idle-away';
  const startedAt = new Date(snap.sessionStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  info.textContent = `A focus session on “${snap.goalName}” has been running since ${startedAt}.`;

  function makeBtn(text, extraClass) {
    const b = document.createElement('button');
    b.className = 'focus-idle-btn' + (extraClass ? ' ' + extraClass : '');
    b.textContent = text;
    return b;
  }

  const resumeBtn = makeBtn('Resume the session', 'focus-idle-btn--primary');
  resumeBtn.addEventListener('click', () => {
    overlay.remove();
    openFullFocusMode(goalObj, goalIdx, catColor, catEmoji, catObj, { snap });
  });

  const wrapBtn = makeBtn('Wrap it up — log the time');
  wrapBtn.addEventListener('click', () => {
    overlay.remove();
    openFullFocusMode(goalObj, goalIdx, catColor, catEmoji, catObj, { snap, toExit: true });
  });

  const discardBtn = makeBtn('Discard it', 'focus-idle-btn--quiet');
  discardBtn.addEventListener('click', () => {
    storageRemove(FOCUS_SNAPSHOT_KEY);
    overlay.remove();
  });

  const actions = document.createElement('div');
  actions.className = 'focus-idle-actions';
  actions.append(resumeBtn, wrapBtn, discardBtn);

  dialog.append(title, info, actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

