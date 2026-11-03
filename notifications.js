// === Day by Day — In-app Nudge System ===
//
// Gentle in-app nudges: wisdom/motivational messages every 25 min and a
// reflective focus check every 40 min, shown in a dismissable banner.
// Browser (OS) notifications were removed in 2026-11: they never delivered
// reliably, and real notifications belong to the native macOS/iOS/Android
// builds (see docs/roadmap.md).

(function () {
  'use strict';

  const NUDGE_INTERVAL_MS = 25 * 60 * 1000;
  const GUILT_CHECK_INTERVAL_MS = 40 * 60 * 1000;

  // --- 4000 Weeks Wisdom ---
  const wisdomMessages = [
    "You don't need to feel ready. The leap is what creates the readiness.",
    "The real problem isn't that you might fail — it's that the result will never match the perfect version in your head. Do it anyway.",
    "You have roughly 4,000 weeks. This one is happening right now. What are you choosing to spend it on?",
    "Perfectionism is just procrastination in a nicer outfit. Ship the imperfect thing.",
    "The future isn't guaranteed. The only time you can act is now — and now is enough.",
    "You'll never clear the decks. There will always be more to do. The question is: are you doing what matters?",
    "Distraction isn't random — it's your mind flinching away from the discomfort of real work. Lean in.",
    "Embrace the fact that you can't do everything. Then choose what's worth doing today.",
    "The anxiety of not starting is always worse than the discomfort of doing the work.",
    "You don't procrastinate because you're lazy. You procrastinate because the real thing is harder than the imagined thing. Begin anyway.",
    "Every time you choose your goal over a distraction, you're voting for the person you want to become.",
    "Stop waiting for motivation. Action creates motivation, not the other way around.",
    "Your goals don't need to be done perfectly. They need to be done by you, imperfectly, today.",
    "The discomfort you feel when starting? That's the feeling of doing something that matters.",
    "Time is not a resource you manage — it's the medium you exist in. Spend it on what counts."
  ];

  const motivationalMessages = [
    "How's your top goal coming along? Small progress is still progress.",
    "You set your goals for a reason. Trust that reason.",
    "Quick check-in: are you working on what matters most right now?",
    "The little things you do today add up to big results.",
    "One goal at a time. That's all it takes.",
    "Take a moment to log your progress — tracking builds awareness.",
    "Every hour on your goals is an hour invested in your future.",
    "Feeling stuck? Take a 5-minute break, then come back stronger.",
    "Don't forget to note your wins in the journal — celebrate progress.",
    "Remember why you chose these goals. Your reasons still hold."
  ];

  // --- Guilt-trip messages ---
  function getGuiltTripMessage() {
    if (!window.DayByDayApp) return null;
    const goals = window.DayByDayApp.getGoals();
    const dists = window.DayByDayApp.getDistractions();
    if (!goals.length || !dists.length) return null;

    const dh = dists.reduce((s, d) => s + (d.hours || 0), 0);
    if (dh <= 0) return null;

    const td = dists.reduce((m, d) => (d.hours || 0) > (m.hours || 0) ? d : m, dists[0]);
    const ng = goals.reduce((m, g) => (g.progress || 0) < (m.progress || 0) ? g : m, goals[0]);
    if ((td.hours || 0) <= 0) return null;

    const gh = goals.reduce((s, g) => s + (g.hours || 0), 0);
    const templates = [
      `You've spent ${td.hours}h on "${td.name}" today. Meanwhile, "${ng.name}" is at ${ng.progress || 0}%. What if you gave it just 30 minutes?`,
      `Honest check: ${dh}h on distractions vs ${gh}h on goals. "${ng.name}" is waiting — the work won't be perfect, but it'll be real.`,
      `"${td.name}" got ${td.hours}h of your life today. That time on "${ng.name}" could've been a breakthrough. It's not too late.`,
      `${td.hours}h on "${td.name}" — hours you can't get back. But the rest of today is still yours. "${ng.name}" needs you.`,
      `Your future self sees ${dh}h on distractions and "${ng.name}" at ${ng.progress || 0}%. What would they want you to do right now?`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // --- State ---
  let timersStarted = false;

  // --- DOM ---
  const nudgeBanner = document.getElementById('nudge-banner');
  const nudgeText = document.getElementById('nudge-text');
  const nudgeDismiss = document.getElementById('nudge-dismiss');

  // --- Init ---
  function init() {
    startTimers();

    // Banner dismiss — stays until user clicks X
    if (nudgeDismiss) {
      nudgeDismiss.addEventListener('click', () => {
        nudgeBanner.classList.add('hidden');
      });
    }

    // Show initial nudge after a moment
    setTimeout(() => {
      const all = [...wisdomMessages, ...motivationalMessages];
      showInAppNudge(all[Math.floor(Math.random() * all.length)]);
    }, 1500);
  }

  // --- In-app nudge banner ---
  // STAYS visible until user dismisses. New messages replace current text.
  function showInAppNudge(message) {
    if (!nudgeText || !nudgeBanner) return;
    nudgeText.textContent = message;
    nudgeBanner.classList.remove('hidden');
    // NO auto-hide — user must dismiss manually
  }

  // --- Timers ---
  function startTimers() {
    if (timersStarted) return;
    timersStarted = true;

    // Motivational + wisdom nudge every 25 min
    setInterval(() => {
      const all = [...motivationalMessages, ...wisdomMessages];
      const msg = all[Math.floor(Math.random() * all.length)];
      showInAppNudge(msg); // replaces current banner text
    }, NUDGE_INTERVAL_MS);

    // Guilt-trip check every 40 min
    setInterval(() => {
      const gm = getGuiltTripMessage();
      if (gm) {
        showInAppNudge(gm);
      } else {
        const msg = wisdomMessages[Math.floor(Math.random() * wisdomMessages.length)];
        showInAppNudge(msg);
      }
    }, GUILT_CHECK_INTERVAL_MS);
  }

  // --- Public API ---
  window.DayByDayNotifications = {
    onGoalsUpdated(goals) {
      if (goals.length === 5) showInAppNudge("All 5 goals set. Focus on #1 first — the rest can wait. You don't need to do everything at once.");
    },
    showNudge: showInAppNudge,
    getWisdom: () => wisdomMessages[Math.floor(Math.random() * wisdomMessages.length)]
  };

  // --- Start after app.js has loaded ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    setTimeout(init, 50);
  }

})();
