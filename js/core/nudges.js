// Core: what the nudge banner says. The message lists, the reflective
// "where did the time go" message, and how often each kind comes round.
//
// PORTABLE — no DOM, no browser APIs. A native build can schedule its own
// notifications from the same lists and intervals.

export const NUDGE_INTERVAL_MS = 25 * 60 * 1000;
export const GUILT_CHECK_INTERVAL_MS = 40 * 60 * 1000;

export const GOALS_FULL_MESSAGE = "All 5 goals set. Focus on #1 first — the rest can wait. You don't need to do everything at once.";

// --- 4000 Weeks Wisdom ---
export const wisdomMessages = [
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

export const motivationalMessages = [
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

// One element of `list`, uniformly. `random` is injectable for tests.
export function pickRandom(list, random = Math.random) {
  return list[Math.floor(random() * list.length)];
}

// The reflective focus check: weighs today's distraction hours against the
// goal with the least progress. null when there is nothing to reflect on
// (no goals, no distractions, or no distraction time logged), in which case
// the caller falls back to a wisdom message. `random` is only drawn when a
// message is actually built, so a null result consumes no randomness.
export function buildGuiltTripMessage(goals, dists, random = Math.random) {
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
  return pickRandom(templates, random);
}
