// UI: the in-app nudge banner. A wisdom or motivational line every 25 min,
// the reflective focus check every 40 min, and the "All 5 goals set" line
// when the Top 5 fills up. The banner stays until the user dismisses it; a
// new message replaces the current text.
//
// DOM. Not portable.
//
// What to say and how often: js/core/nudges.js. There are no browser (OS)
// notifications; they were removed in 2026-11 and come back with the native
// builds (see docs/roadmap.md).

import {
  NUDGE_INTERVAL_MS, GUILT_CHECK_INTERVAL_MS, GOALS_FULL_MESSAGE,
  wisdomMessages, motivationalMessages, pickRandom, buildGuiltTripMessage,
} from '../core/nudges.js';

let _ctx = null;
let timersStarted = false;
let nudgeBanner = null;
let nudgeText = null;
let nudgeDismiss = null;

// STAYS visible until the user dismisses it. No auto-hide.
function showInAppNudge(message) {
  if (!nudgeText || !nudgeBanner) return;
  nudgeText.textContent = message;
  nudgeBanner.classList.remove('hidden');
}

function getGuiltTripMessage() {
  return buildGuiltTripMessage(_ctx.getGoals(), _ctx.getDistractions());
}

function startTimers() {
  if (timersStarted) return;
  timersStarted = true;

  // Motivational + wisdom nudge every 25 min
  setInterval(() => {
    showInAppNudge(pickRandom([...motivationalMessages, ...wisdomMessages]));
  }, NUDGE_INTERVAL_MS);

  // Reflective focus check every 40 min; wisdom when there is nothing to weigh
  setInterval(() => {
    const gm = getGuiltTripMessage();
    showInAppNudge(gm || pickRandom(wisdomMessages));
  }, GUILT_CHECK_INTERVAL_MS);
}

function start() {
  startTimers();

  if (nudgeDismiss) {
    nudgeDismiss.addEventListener('click', () => {
      nudgeBanner.classList.add('hidden');
    });
  }

  // Initial nudge after a moment
  setTimeout(() => {
    showInAppNudge(pickRandom([...wisdomMessages, ...motivationalMessages]));
  }, 1500);
}

// Called once from app.js, at the end of boot. ctx supplies today's goals and
// distractions for the focus check.
//
// window.DayByDayNotifications is published here, not at module load, so it
// appears at the same point in boot as it did when this was a classic script
// loaded after app.js: nothing during the boot render can trigger a nudge.
// The callers in js/ui/ still reach it through the global.
export function initNudges(c) {
  _ctx = c;
  nudgeBanner = document.getElementById('nudge-banner');
  nudgeText = document.getElementById('nudge-text');
  nudgeDismiss = document.getElementById('nudge-dismiss');

  window.DayByDayNotifications = {
    onGoalsUpdated(goals) {
      if (goals.length === 5) showInAppNudge(GOALS_FULL_MESSAGE);
    },
    showNudge: showInAppNudge,
    getWisdom: () => pickRandom(wisdomMessages),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
  } else {
    setTimeout(start, 50);
  }
}
