// Core: what the journal says about a focus session.
//
// PORTABLE — no DOM, no browser APIs.
//
// Session records accumulated fields over time, so readers must tolerate old
// shapes: midNotes were plain strings before they carried a timestamp, and
// most reflection fields are optional.

import { formatHours } from './format.js';

// Sessions newest first, each paired with its position in the stored array
// (deletes splice by that index).
export function sessionsNewestFirst(sessions) {
  return sessions.map((session, index) => ({ session, index })).reverse();
}

// The hours a session gave its goal, and which goal holds them now. Deleting
// the session hands these back. Sessions saved since 2026-11 record the exact
// gain (`goalHoursAdded`, after the 24h/day cap); older ones fall back to
// their focused minutes. Never more than the goal still holds, and nothing
// when the goal is gone — deleting a goal already took its hours out.
export function sessionHoursOnGoal(session, goals) {
  const byIndex = goals[session.goalIndex];
  const goalIndex = byIndex && byIndex.name === session.goalName
    ? session.goalIndex
    : goals.findIndex(g => g && g.name === session.goalName);
  if (goalIndex === -1) return { goalIndex: -1, hours: 0 };
  const recorded = session.goalHoursAdded != null
    ? session.goalHoursAdded
    : Math.round((session.focusMins || 0) / 60 * 100) / 100;
  const hours = Math.max(0, Math.min(recorded, goals[goalIndex].hours || 0));
  return { goalIndex, hours };
}

// What deleting a session hands back: one { goalIndex, hours } per task it
// credited. Sessions that shared their time across tasks (since 2026-11)
// carry `shares`, each with the exact hours it added; older sessions credited
// one goal (see sessionHoursOnGoal). A share is never handed back beyond what
// its task still holds, and a task that's gone gets nothing (deleting a goal
// already took its hours out).
export function sessionReturns(session, goals) {
  if (!session.shares || session.shares.length === 0) return [sessionHoursOnGoal(session, goals)];
  const used = new Set();
  return session.shares.map((share, i) => {
    let goalIndex = -1;
    const hinted = goals[session.goalIndex];
    if (i === 0 && hinted && hinted.name === share.goalName) goalIndex = session.goalIndex;
    if (goalIndex === -1) goalIndex = goals.findIndex((g, k) => g && g.name === share.goalName && !used.has(k));
    if (goalIndex === -1) return { goalIndex: -1, hours: 0 };
    used.add(goalIndex);
    const hours = Math.max(0, Math.min(share.hoursAdded || 0, goals[goalIndex].hours || 0));
    return { goalIndex, hours };
  });
}

const defaultFormatTime = at =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function formatMidNote(note, formatTime = defaultFormatTime) {
  if (typeof note === 'string') return note;
  const time = note.at ? formatTime(note.at) : null;
  return time ? `${note.text} (${time})` : note.text;
}

function tagWithNote(tag, note) {
  return tag + (note ? ` — "${note}"` : '');
}

// The labelled blocks of the expanded detail panel, in display order. Blocks
// with nothing to say are dropped here so the UI can render the list as is.
export function sessionDetailBlocks(session, formatTime = defaultFormatTime) {
  const blocks = [
    ['Intention', session.intention],
    ['State of mind', session.entryTag ? tagWithNote(session.entryTag, session.entryNote) : null],
    ['During session', session.midNotes && session.midNotes.length > 0
      ? session.midNotes.map(n => formatMidNote(n, formatTime)).join(' · ')
      : null],
    ['Exit note', session.exitTag ? tagWithNote(session.exitTag, session.exitNote) : session.exitNote],
    ['Time shared', session.shares && session.shares.length > 1
      ? session.shares.map(sh => `${sh.goalName} ${sh.pct}% · ${formatHours(sh.hoursAdded, '0m')}`).join(' · ')
      : null],
  ];
  return blocks.filter(([, text]) => text).map(([label, text]) => ({ label, text }));
}
