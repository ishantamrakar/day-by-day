// === Day by Day — Notifications & Nudge System ===
// Handles browser notifications, in-app nudges, guilt-trip messages,
// and 4000 Weeks philosophy integration.

(function () {
  'use strict';

  // --- Config ---
  const NUDGE_INTERVAL_MS = 25 * 60 * 1000;  // Every 25 minutes
  const GUILT_CHECK_INTERVAL_MS = 40 * 60 * 1000; // Every 40 minutes
  const PREFS_KEY = 'daybyday_prefs';

  // --- 4000 Weeks Wisdom ---
  // Insights from Oliver Burkeman's "Four Thousand Weeks"
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
    "The seconds are ticking whether you use them or not. But only the present moment is actually yours.",
    "Stop waiting for motivation. Action creates motivation, not the other way around.",
    "Your goals don't need to be done perfectly. They need to be done by you, imperfectly, today.",
    "The discomfort you feel when starting? That's the feeling of doing something that matters."
  ];

  // --- Motivational Messages (encouraging) ---
  const motivationalMessages = [
    "How's your top goal coming along? Small progress is still progress.",
    "You set your goals for a reason. Trust that reason.",
    "Quick check-in: are you working on what matters most right now?",
    "The little things you do today add up to big results.",
    "One goal at a time. That's all it takes.",
    "How much progress have you made? Take a moment to log it.",
    "Every hour spent on your goals is an hour invested in your future.",
    "Feeling stuck? Take a 5-minute break, then come back stronger.",
    "You chose these goals for today. Honor that commitment.",
    "Don't forget to note your wins in the journal — celebrate your progress."
  ];

  // --- Guilt-Trip Messages (specific, goal-aware) ---
  function getGuiltTripMessage() {
    if (!window.DayByDayApp) return null;

    const goals = window.DayByDayApp.getGoals();
    const distractions = window.DayByDayApp.getDistractions();

    if (goals.length === 0 || distractions.length === 0) return null;

    const distHours = distractions.reduce((sum, d) => sum + (d.hours || 0), 0);
    const goalHours = goals.reduce((sum, g) => sum + (g.hours || 0), 0);

    if (distHours <= 0) return null;

    // Find the biggest distraction and the most neglected goal
    const topDist = distractions.reduce((max, d) =>
      (d.hours || 0) > (max.hours || 0) ? d : max, distractions[0]);
    const neglectedGoal = goals.reduce((min, g) =>
      (g.progress || 0) < (min.progress || 0) ? g : min, goals[0]);

    if ((topDist.hours || 0) <= 0) return null;

    const templates = [
      `You've spent ${topDist.hours}h on "${topDist.name}" today. Meanwhile, "${neglectedGoal.name}" is sitting at ${neglectedGoal.progress || 0}%. What if you gave it just 30 minutes right now?`,
      `Honest check: ${distHours}h on distractions vs ${goalHours}h on goals. "${neglectedGoal.name}" is waiting. The work won't be perfect, but it'll be real.`,
      `"${topDist.name}" got ${topDist.hours}h of your life today. That same time on "${neglectedGoal.name}" could've been a breakthrough. It's not too late to shift.`,
      `${topDist.hours} hours on "${topDist.name}" — that's ${topDist.hours} hours you can't get back. But the rest of today? That's still yours. "${neglectedGoal.name}" needs you.`,
      `Your future self is watching. They see ${distHours}h on distractions and "${neglectedGoal.name}" at ${neglectedGoal.progress || 0}%. What would they want you to do right now?`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  // --- State ---
  let nudgeTimer = null;
  let guiltTimer = null;
  let notificationsEnabled = false;

  // --- DOM References ---
  const notificationPrompt = document.getElementById('notification-prompt');
  const enableBtn = document.getElementById('enable-notifications-btn');
  const dismissBtn = document.getElementById('dismiss-notifications-btn');
  const nudgeBanner = document.getElementById('nudge-banner');
  const nudgeText = document.getElementById('nudge-text');
  const nudgeDismiss = document.getElementById('nudge-dismiss');

  // --- Preferences ---
  function loadPrefs() {
    try {
      if (window.DayByDayApp && window.DayByDayApp.storageGet) {
        const raw = window.DayByDayApp.storageGet(PREFS_KEY);
        return raw ? JSON.parse(raw) : {};
      }
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function savePrefs(prefs) {
    try {
      if (window.DayByDayApp && window.DayByDayApp.storageSet) {
        window.DayByDayApp.storageSet(PREFS_KEY, JSON.stringify(prefs));
      } else {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      }
    } catch (e) {}
  }

  // --- Initialization ---
  function init() {
    const prefs = loadPrefs();

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        startTimers();
      } else if (Notification.permission === 'default' && !prefs.notificationsDismissed) {
        // Only show prompt if user hasn't dismissed before
        setTimeout(showNotificationPrompt, 3000);
      }
      // If 'denied' or previously dismissed, don't pester
    } else {
      // Browser doesn't support notifications — start in-app only timers
      startTimers();
    }

    // Banner dismiss
    if (nudgeDismiss) {
      nudgeDismiss.addEventListener('click', () => {
        nudgeBanner.classList.add('hidden');
      });
    }

    // Permission prompt buttons
    if (enableBtn) enableBtn.addEventListener('click', requestPermission);
    if (dismissBtn) dismissBtn.addEventListener('click', () => {
      notificationPrompt.classList.add('hidden');
      const prefs = loadPrefs();
      prefs.notificationsDismissed = true;
      savePrefs(prefs);
    });

    // Welcome nudge
    setTimeout(() => {
      const allMessages = [...wisdomMessages, ...motivationalMessages];
      showInAppNudge(allMessages[Math.floor(Math.random() * allMessages.length)]);
    }, 2000);
  }

  function showNotificationPrompt() {
    if (notificationPrompt) notificationPrompt.classList.remove('hidden');
  }

  async function requestPermission() {
    if (notificationPrompt) notificationPrompt.classList.add('hidden');

    const prefs = loadPrefs();
    prefs.notificationsDismissed = true; // Don't show prompt again regardless
    savePrefs(prefs);

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        notificationsEnabled = true;
        startTimers();
        sendBrowserNotification('Day by Day', "Notifications on! I'll nudge you gently to stay focused.");
      }
    } catch (e) {
      console.warn('Notification permission failed:', e);
    }
  }

  // --- Browser Notifications ---
  function sendBrowserNotification(title, body) {
    if (!notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body: body,
        tag: 'daybyday-' + Date.now(),
        requireInteraction: false,
        silent: false
      });
      setTimeout(() => n.close(), 10000);
    } catch (e) {
      console.warn('Notification failed:', e);
    }
  }

  // --- In-App Nudge Banner ---
  function showInAppNudge(message) {
    if (!nudgeText || !nudgeBanner) return;
    nudgeText.textContent = message;
    nudgeBanner.classList.remove('hidden');
    setTimeout(() => {
      nudgeBanner.classList.add('hidden');
    }, 20000);
  }

  // --- Timers ---
  function startTimers() {
    // Combined motivational + wisdom nudges
    nudgeTimer = setInterval(() => {
      const allMessages = [...motivationalMessages, ...wisdomMessages];
      const msg = allMessages[Math.floor(Math.random() * allMessages.length)];
      sendBrowserNotification('Day by Day', msg);
      showInAppNudge(msg);
    }, NUDGE_INTERVAL_MS);

    // Guilt-trip check (uses actual goal/distraction data)
    guiltTimer = setInterval(() => {
      const guiltMsg = getGuiltTripMessage();
      if (guiltMsg) {
        sendBrowserNotification('Focus Check', guiltMsg);
        showInAppNudge(guiltMsg);
      } else {
        // Fall back to wisdom if no guilt message applies
        const msg = wisdomMessages[Math.floor(Math.random() * wisdomMessages.length)];
        sendBrowserNotification('Day by Day', msg);
        showInAppNudge(msg);
      }
    }, GUILT_CHECK_INTERVAL_MS);
  }

  // --- Public API ---
  window.DayByDayNotifications = {
    onGoalsUpdated: function (goals) {
      if (goals.length === 5) {
        showInAppNudge("All 5 goals set. Now focus on #1 first — the rest can wait. You don't need to do everything at once.");
      }
    },
    showNudge: showInAppNudge,
    sendNotification: sendBrowserNotification,
    getWisdom: function () {
      return wisdomMessages[Math.floor(Math.random() * wisdomMessages.length)];
    }
  };

  // --- Start ---
  // Delay init slightly so app.js can expose DayByDayApp first
  // (notifications.js loads before app.js in the HTML)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
  } else {
    setTimeout(init, 100);
  }

})();
