// UI: the journal card. Today's focus sessions (collapsed pill + expandable
// detail panel) above the manual wins and lessons lists.
//
// DOM. Not portable.
//
// The text of a session's detail panel, and the newest-first ordering, come
// from js/core/journal.js. A session row is an audit-log entry: its goal name
// is a snapshot, but the category emoji is resolved live so renaming or
// recolouring an area reflects in past rows.

import { formatHours } from '../core/format.js';
import { sessionsNewestFirst, sessionDetailBlocks } from '../core/journal.js';

let _ctx = null;
export function configure(c) {
  _ctx = c;
  const { addSuccessBtn, addFailureBtn, successInputEl, failureInputEl } = c;
  if (addSuccessBtn) { addSuccessBtn.addEventListener('click', addSuccess); successInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addSuccess(); }); }
  if (addFailureBtn) { addFailureBtn.addEventListener('click', addFailure); failureInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addFailure(); }); }
}
const ctx = new Proxy({}, { get: (_, k) => _ctx[k] });

export function renderJournal() {
  const { successesListEl, failuresListEl } = ctx;
  if (!successesListEl || !failuresListEl) return;
  const state = ctx.state;

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
      sessionsNewestFirst(sessions).forEach(({ session, index }) => {
        focusSessionsEl.appendChild(createFocusSessionEntry(session, index));
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
  const sessCat = ctx.getCategoryById(session.category || 'general');
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
    ctx.state.focusSessions.splice(index, 1);
    ctx.saveState(); renderJournal();
  });

  pillRight.append(timePill, pctPill, expandBtn, delBtn);
  pill.append(pillLeft, pillRight);

  // ── Expanded detail panel ────────────────────────────────
  const detail = document.createElement('div');
  detail.className = 'focus-session-detail hidden';

  sessionDetailBlocks(session).forEach(({ label, text }) => {
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
  });

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
  ctx.makeEditable(span, newVal => { ctx.state[type][index] = newVal; ctx.saveState(); });
  const del = document.createElement('button');
  del.className = 'task-delete';
  del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
  del.addEventListener('click', () => {
    const state = ctx.state;
    ctx.undoStack.push({ type, item: state[type][index], index });
    state[type].splice(index, 1); ctx.saveState(); renderJournal();
  });
  row.append(span, del);
  return row;
}

function addSuccess() {
  const t = ctx.successInputEl.value.trim(); if (!t) return;
  ctx.state.successes.push(t); ctx.successInputEl.value = ''; ctx.saveState(); renderJournal();
}
function addFailure() {
  const t = ctx.failureInputEl.value.trim(); if (!t) return;
  ctx.state.failures.push(t); ctx.failureInputEl.value = ''; ctx.saveState(); renderJournal();
}
