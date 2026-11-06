// Core: checkpoints — the moments a focus session was certainly being worked on.
//
// PORTABLE — no DOM, no browser APIs.
//
// Every explicit action inside a running focus session (a click, a key press,
// a scroll) is a checkpoint: you were there, on this task, at that moment.
// Starting the session is the first one. Returning to the tab or moving the
// mouse never is; neither proves anything. Time up to the last checkpoint
// counts as certain; only the time since it can be in question.
//
// One rule holds it together: a gap of ASK_AFTER_MS or more with no checkpoint
// is never filled in silently. The session asks ("Still working on this?"),
// and a new checkpoint can't bridge such a gap on its own. That covers the
// first click after a laptop wakes from sleep, before any timer has run.

// No checkpoint for this long → ask what to do with the time since the last.
export const ASK_AFTER_MS = 60 * 60 * 1000;
// This much of the session confirmed by checkpoints → Ultra Focus.
export const ULTRA_AFTER_MS = 60 * 60 * 1000;

// What a running session should do now: 'ask' (an hour without a checkpoint),
// 'ultra' (an hour confirmed, not yet Ultra), or 'none'. Ultra waits for a
// checkpoint past the hour rather than the clock alone, so trimming away-time
// can never leave an Ultra badge on a session shorter than an hour.
export function attentionCheck({ sessionStart, lastCheckpoint, now, ultra }) {
  if (now - lastCheckpoint >= ASK_AFTER_MS) return 'ask';
  if (!ultra && lastCheckpoint - sessionStart >= ULTRA_AFTER_MS) return 'ultra';
  return 'none';
}

// Whether an action at `now` can simply become the new checkpoint. Not across
// an hour-long gap: that gap has to be answered first.
export function canAdvanceCheckpoint(lastCheckpoint, now) {
  return now - lastCheckpoint < ASK_AFTER_MS;
}

// "I stepped away": the session's start moves forward by the time since the
// last checkpoint, so that stretch no longer counts. Never past now.
export function trimToCheckpoint(sessionStart, lastCheckpoint, now) {
  return Math.min(now, sessionStart + Math.max(0, now - lastCheckpoint));
}

// Whole minutes from the session's start to its last checkpoint: the time the
// checkpoints confirm.
export function confirmedMinutes(sessionStart, lastCheckpoint) {
  return Math.max(0, Math.round((lastCheckpoint - sessionStart) / 60000));
}
