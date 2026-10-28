// Core: what the journal says about a focus session.
//
// PORTABLE — no DOM, no browser APIs.
//
// Session records accumulated fields over time, so readers must tolerate old
// shapes: midNotes were plain strings before they carried a timestamp, and
// most reflection fields are optional.

// Sessions newest first, each paired with its position in the stored array
// (deletes splice by that index).
export function sessionsNewestFirst(sessions) {
  return sessions.map((session, index) => ({ session, index })).reverse();
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
  ];
  return blocks.filter(([, text]) => text).map(([label, text]) => ({ label, text }));
}
