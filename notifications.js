// === Day by Day — Browser Notifications & Nudge System ===

(function () {
  'use strict';

  // --- Config ---
  const NUDGE_INTERVAL_MS = 30 * 60 * 1000; // Every 30 minutes
  const FOCUS_CHECK_INTERVAL_MS = 45 * 60 * 1000; // Every 45 minutes

  // --- Motivational Messages ---
  const motivationalMessages = [
    "How's your top goal coming along? Small progress is still progress.",
    "Remember: focus beats multitasking every time.",
    "You set your goals for a reason. Trust that reason.",
    "Quick check-in: are you working on what matters most right now?",
    "The little things you do today add up to big results.",
    "Stay the course. Your future self will thank you.",
    "Is a distraction creeping in? Gently bring your focus back.",
    "You don't have to be perfect. Just be present with your task.",
    "One goal at a time. That's all it takes.",
    "How much progress have you made? Take a moment to log it.",
    "Every hour spent on your goals is an hour invested in your future.",
    "Feeling stuck? Take a 5-minute break, then come back stronger.",
    "You chose these goals for today. Honor that commitment.",
    "Distractions will always be there. Your goals won't wait forever.",
    "Check in: have you logged your hours? Tracking builds awareness."
  ];

  const focusCheckMessages = [
    "Focus check: What are you working on right now?",
    "Gentle reminder: your top priority is still waiting for you.",
    "Are you spending time on your goals or on a distraction?",
    "Time check — have you made progress on your #1 goal today?"
  ];

  // --- State ---
  let nudgeTimer = null;
  let focusCheckTimer = null;
  let notificationsEnabled = false;

  // --- DOM References ---
  const notificationPrompt = document.getElementById('notification-prompt');
  const enableBtn = document.getElementById('enable-notifications-btn');
  const dismissBtn = document.getElementById('dismiss-notifications-btn');
  const nudgeBanner = document.getElementById('nudge-banner');
  const nudgeText = document.getElementById('nudge-text');
  const nudgeDismiss = document.getElementById('nudge-dismiss');

  // --- Initialization ---
  function init() {
    // Check if we already have permission
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        notificationsEnabled = true;
        startNudgeTimers();
      } else if (Notification.permission === 'default') {
        // Show prompt after a short delay so the app loads first
        setTimeout(showNotificationPrompt, 3000);
      }
      // If 'denied', we won't bother asking
    }

    // In-app nudge banner dismiss
    nudgeDismiss.addEventListener('click', () => {
      nudgeBanner.classList.add('hidden');
    });

    // Permission prompt buttons
    enableBtn.addEventListener('click', requestPermission);
    dismissBtn.addEventListener('click', () => {
      notificationPrompt.classList.add('hidden');
    });

    // Show an initial in-app welcome nudge
    setTimeout(() => {
      showInAppNudge("Welcome back! Set your goals and let's make today count.");
    }, 1500);
  }

  function showNotificationPrompt() {
    notificationPrompt.classList.remove('hidden');
  }

  async function requestPermission() {
    notificationPrompt.classList.add('hidden');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        notificationsEnabled = true;
        startNudgeTimers();
        sendBrowserNotification('Day by Day', 'Notifications enabled! I\'ll send gentle reminders to keep you focused.');
      }
    } catch (e) {
      console.warn('Notification permission request failed:', e);
    }
  }

  // --- Browser Notifications ---
  function sendBrowserNotification(title, body) {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🎯</text></svg>',
        tag: 'daybyday-nudge',
        requireInteraction: false
      });
      // Auto-close after 8 seconds
      setTimeout(() => notification.close(), 8000);
    } catch (e) {
      console.warn('Failed to send notification:', e);
    }
  }

  // --- In-App Nudge Banner ---
  function showInAppNudge(message) {
    nudgeText.textContent = message;
    nudgeBanner.classList.remove('hidden');
    // Auto-hide after 15 seconds
    setTimeout(() => {
      nudgeBanner.classList.add('hidden');
    }, 15000);
  }

  // --- Timers ---
  function startNudgeTimers() {
    // Motivational nudge every 30 minutes
    nudgeTimer = setInterval(() => {
      const msg = getRandomMessage(motivationalMessages);
      sendBrowserNotification('Day by Day', msg);
      showInAppNudge(msg);
    }, NUDGE_INTERVAL_MS);

    // Focus check every 45 minutes (with goal-aware context)
    focusCheckTimer = setInterval(() => {
      const msg = getContextualFocusMessage();
      sendBrowserNotification('Focus Check', msg);
      showInAppNudge(msg);
    }, FOCUS_CHECK_INTERVAL_MS);
  }

  function getRandomMessage(messages) {
    return messages[Math.floor(Math.random() * messages.length)];
  }

  function getContextualFocusMessage() {
    // Try to reference the user's actual goals
    if (window.DayByDayApp) {
      const goals = window.DayByDayApp.getGoals();
      if (goals.length > 0) {
        // Find the goal with least progress
        const leastProgress = goals.reduce((min, g) =>
          (g.progress || 0) < (min.progress || 0) ? g : min, goals[0]);

        if ((leastProgress.progress || 0) < 50) {
          return `"${leastProgress.name}" is at ${leastProgress.progress || 0}% — can you move it forward?`;
        }

        // Find goal with no hours logged
        const noHours = goals.find(g => !g.hours || g.hours === 0);
        if (noHours) {
          return `You haven't logged any time on "${noHours.name}" yet. Even 15 minutes counts!`;
        }

        // General encouragement
        const totalProgress = Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length);
        return `You're at ${totalProgress}% average progress across your goals. Keep it up!`;
      }
    }
    return getRandomMessage(focusCheckMessages);
  }

  // --- Public API ---
  window.DayByDayNotifications = {
    onGoalsUpdated: function (goals) {
      // Could trigger a contextual notification here if desired
      if (goals.length === MAX_GOALS_COUNT) {
        showInAppNudge("All 5 goals set! Now focus on #1 first. One at a time.");
      }
    },
    showNudge: showInAppNudge,
    sendNotification: sendBrowserNotification
  };

  const MAX_GOALS_COUNT = 5;

  // --- Start ---
  init();

})();
