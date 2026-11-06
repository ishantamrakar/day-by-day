// Checkpoints: the moments a focus session was certainly being worked on.
//
// Every click, key press or scroll inside a running session is a checkpoint;
// starting the session is the first. Time up to the last checkpoint counts as
// certain. "Still working on this?" asks only after an hour with no
// checkpoint, a new checkpoint can't silently bridge such a gap, "I stepped
// away" trims only the time since the last checkpoint, Ultra Focus turns on
// once an hour is confirmed, and a session left running (crash, overnight) is
// counted up to its last checkpoint. The rules live in js/core and are checked
// directly; the behaviour is driven through the real UI on a fake clock.
import { runSuite, addGoal, getCategoryHours } from './harness.mjs';
import {
  ASK_AFTER_MS, ULTRA_AFTER_MS, attentionCheck, canAdvanceCheckpoint, trimToCheckpoint, confirmedMinutes,
} from '../js/core/checkpoints.js';
import { unattendedHours, makeUnattendedSession } from '../js/core/sessions.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

await runSuite('Focus checkpoints', 8313, async ({ page, check }) => {
  // ── 1. The rules ──
  check('asking and Ultra both wait an hour', [ASK_AFTER_MS, ULTRA_AFTER_MS], [HOUR, HOUR]);
  const at = (startMin, lastMin, nowMin, ultra = false) =>
    attentionCheck({ sessionStart: startMin * MIN, lastCheckpoint: lastMin * MIN, now: nowMin * MIN, ultra });
  check('active and under an hour: nothing happens', at(0, 30, 40), 'none');
  check('59 minutes since the last checkpoint: still nothing', at(0, 1, 60), 'none');
  check('an hour since the last checkpoint: ask', at(0, 10, 70), 'ask');
  check('an hour confirmed by a checkpoint: Ultra', at(0, 61, 62), 'ultra');
  check('an hour elapsed but not confirmed: not Ultra yet', at(0, 50, 65), 'none');
  check('already Ultra: nothing more to do', at(0, 61, 62, true), 'none');
  check('asking wins over Ultra', at(0, 61, 125), 'ask');
  check('a checkpoint can advance across a short gap', canAdvanceCheckpoint(10 * MIN, 69 * MIN), true);
  check('…but never across an hour-long one', canAdvanceCheckpoint(10 * MIN, 70 * MIN), false);
  check('trimming moves the start forward by the time since the last checkpoint',
    trimToCheckpoint(0, 10 * MIN, 75 * MIN), 65 * MIN);
  check('…and never past now', trimToCheckpoint(80 * MIN, 0, 75 * MIN), 75 * MIN);
  check('confirmed time runs from the start to the last checkpoint',
    [confirmedMinutes(0, 40 * MIN), confirmedMinutes(10 * MIN, 5 * MIN)], [40, 0]);

  const day = '2026-03-10';
  const t = (hh, mm) => new Date(`${day}T${hh}:${mm}:00`).getTime();
  const nextMorning = new Date('2026-03-11T08:00:00').getTime();
  check('left running overnight: counted up to the last checkpoint, uncapped',
    unattendedHours({ date: day, sessionStartTime: t('20', '00'), lastCheckpoint: t('22', '30') }, nextMorning), 2.5);
  check('…never past the end of its own day',
    unattendedHours({ date: day, sessionStartTime: t('23', '00'), lastCheckpoint: nextMorning }, nextMorning), 1);
  check('a snapshot from before checkpoints keeps the old 1-hour estimate',
    unattendedHours({ date: day, sessionStartTime: t('20', '00') }, nextMorning), 1);
  const rec = makeUnattendedSession({ date: day, goalName: 'Essay', sessionStartTime: t('20', '00'), lastCheckpoint: t('22', '30') }, 2.5);
  check('the overnight record says it was counted to the last activity, not estimated',
    [rec.unattended, rec.confirmedMins, rec.focusMins], [true, 150, 150]);

  // ── 2. In a running session (fake clock) ──
  const start = await page.evaluate(() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d.getTime(); });
  await page.clock.install({ time: start });
  const fresh = async () => {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('daybyday_sidebar', 'collapsed');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
  };
  const enterFocus = async () => {
    await page.click('#goals-list .task-focus-btn');
    await page.waitForTimeout(400);
    await page.click('.focus-enter-btn--secondary');
    await page.waitForTimeout(500);
    await page.click('.focus-skip-btn'); // intention
    await page.waitForTimeout(500);
    await page.click('.focus-skip-btn'); // check-in → session starts
    await page.waitForTimeout(600);
  };
  const work = async () => { // an explicit action: click into the notes and type
    await page.click('.focus-notes-input');
    await page.keyboard.type('x');
    await page.waitForTimeout(150);
  };
  const minutes = async (n) => { await page.clock.fastForward(n * MIN); await page.waitForTimeout(250); };
  const asking = () => page.evaluate(() => !!document.querySelector('.focus-idle-scrim'));
  const ultra = () => page.evaluate(() =>
    document.querySelector('body > .focus-fullscreen-overlay').classList.contains('focus-ultra'));
  const finish = async () => {
    await page.click('.focus-done-btn');
    await page.waitForTimeout(700);
    await page.evaluate(() => { // fully focused, so the minutes read directly
      const s = document.querySelector('.focus-pct-slider');
      s.value = '100';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const breakdown = () => page.evaluate(() =>
    document.querySelector('.focus-pct-section .focus-entry-sublabel').textContent);
  const clickByText = (sel, text) => page.evaluate(({ s, tx }) =>
    [...document.querySelectorAll(s)].find((b) => b.textContent.includes(tx)).click(), { s: sel, tx: text });

  // A. Working steadily: no question, Ultra arrives once the hour is confirmed.
  await fresh();
  await addGoal(page, 'Write the essay');
  await enterFocus();
  await minutes(20); await work();
  await minutes(20); await work();
  await minutes(20);
  check('active for 60 minutes: never asked', await asking(), false);
  check('…and not Ultra until an action confirms the hour', await ultra(), false);
  await work();
  check('the first action past the hour turns on Ultra, with no question', [await ultra(), await asking()], [true, false]);

  // B. Mouse movement isn't a checkpoint; the question comes an hour after the last one.
  await fresh();
  await addGoal(page, 'Write the essay');
  await enterFocus();
  await minutes(10); await work(); // last checkpoint: ~10 min
  await minutes(30);
  await page.mouse.move(300, 300);
  await page.mouse.move(700, 500);
  await page.mouse.move(900, 300);
  await minutes(29);
  check('59 minutes after the last checkpoint (mouse moved meanwhile): not asked yet', await asking(), false);
  await minutes(2);
  check('an hour after it: "Still working on this?"', await asking(), true);
  check('…naming the last activity', await page.evaluate(() =>
    document.querySelector('.focus-idle-away').textContent.toLowerCase().includes('last activity')), true);
  await clickByText('.focus-idle-btn', 'I stepped away');
  await page.waitForTimeout(300);
  await finish();
  check('"I stepped away" trims only the time since the last checkpoint', (await breakdown()).startsWith('10m focused'), true);
  check('…and the exit screen shows that time as confirmed', await page.evaluate(() =>
    document.querySelector('.focus-confirmed-line').textContent.startsWith('10m confirmed')), true);

  // C. After a sleep (no timers fire), the first click asks instead of counting the gap.
  await fresh();
  await addGoal(page, 'Write the essay');
  await enterFocus();
  await minutes(5); await work(); // last checkpoint: ~5 min
  const slept = await page.evaluate(() => Date.now() + 2 * 60 * 60 * 1000);
  await page.clock.setSystemTime(slept);
  await page.waitForTimeout(300);
  check('waking from sleep: nothing asked before you touch anything', await asking(), false);
  await page.click('.focus-notes-input');
  await page.waitForTimeout(300);
  check('the first click after the gap asks, rather than counting the gap', await asking(), true);
  await clickByText('.focus-idle-btn', 'I stepped away');
  await page.waitForTimeout(300);
  await finish();
  check('…so trimming still keeps just the 5 confirmed minutes', (await breakdown()).startsWith('5m focused'), true);

  // D. The exit screen line: confirmed time, and the time since the last activity.
  await fresh();
  await addGoal(page, 'Write the essay');
  await enterFocus();
  await minutes(40); await work(); // confirmed: ~40 min
  await minutes(30); // under an hour since: counted, but not confirmed
  await finish();
  check('exit line: "40m confirmed by your activity · 30m since your last activity"', await page.evaluate(() =>
    document.querySelector('.focus-confirmed-line').textContent),
  '40m confirmed by your activity · 30m since your last activity');

  // ── 3. Sessions left running ──
  const seed = async ({ dataDate, snap, goals }) => {
    await page.evaluate(({ d, s, g }) => {
      localStorage.clear();
      localStorage.setItem('daybyday_sidebar', 'collapsed');
      localStorage.setItem('daybyday_categories', JSON.stringify([
        { id: 'career', name: 'Career', emoji: '💼', color: '#2D6A4F', totalHours: 10 },
        { id: 'general', name: 'General', emoji: '⚡', color: '#8d99ae', totalHours: 0 },
      ]));
      localStorage.setItem('daybyday_data', JSON.stringify({
        date: d, goals: g, distractions: [], successes: [], failures: [], quickDone: [], focusSessions: [],
      }));
      localStorage.setItem('daybyday_focus_session', JSON.stringify(s));
    }, { d: dataDate, s: snap, g: goals });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
  };
  const pageNow = () => page.evaluate(() => Date.now());
  const pageDate = (offset = 0) => page.evaluate((o) => {
    const d = new Date(); d.setDate(d.getDate() + o);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, offset);
  const readGoal = () => page.evaluate(() =>
    window.DayByDayApp.getGoals().find((x) => x.name === 'Long read'));

  // E. A crashed session, wrapped up: counted up to its last checkpoint.
  let now = await pageNow();
  const today = await pageDate(0);
  await seed({
    dataDate: today,
    goals: [{ name: 'Long read', hours: 0, progress: 10, category: 'career' }],
    snap: { date: today, goalName: 'Long read', category: 'career', sessionStartTime: now - 3 * HOUR,
      lastCheckpoint: now - 2 * HOUR, savedAt: now - 2 * HOUR, sessionNotes: [] },
  });
  check('the crash prompt names the last activity', await page.evaluate(() =>
    document.querySelector('.focus-restore-overlay .focus-idle-away').textContent.toLowerCase().includes('last activity')), true);
  check('…and offers to log the confirmed hour', await page.evaluate(() =>
    [...document.querySelectorAll('.focus-restore-overlay .focus-idle-btn')].some((b) => b.textContent.includes('1h'))), true);
  await clickByText('.focus-restore-overlay .focus-idle-btn', 'Wrap it up');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const s = document.querySelector('.focus-pct-slider');
    s.value = '100';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('wrapping up counts the hour up to the last activity, not all three', (await breakdown()).startsWith('60m focused'), true);
  await page.click('.focus-exit-actions .focus-entry-start');
  await page.waitForTimeout(600);
  check('…and logs exactly that', (await readGoal()).hours, 1);

  // F. Resumed after a long gap: asked straight away.
  now = await pageNow();
  await seed({
    dataDate: today,
    goals: [{ name: 'Long read', hours: 0, progress: 10, category: 'career' }],
    snap: { date: today, goalName: 'Long read', category: 'career', sessionStartTime: now - 90 * MIN,
      lastCheckpoint: now - 70 * MIN, savedAt: now - 70 * MIN, sessionNotes: [] },
  });
  await clickByText('.focus-restore-overlay .focus-idle-btn', 'Resume');
  await page.waitForTimeout(800);
  check('resuming after more than an hour away asks right away', await asking(), true);

  // G. Left running overnight, reloaded next morning: counted to the last checkpoint.
  const yesterday = await pageDate(-1);
  const y = (hh, mm) => new Date(`${yesterday}T${hh}:${mm}:00`).getTime();
  const careerBefore = 10;
  await seed({
    dataDate: yesterday,
    goals: [{ name: 'Night essay', hours: 0, progress: 20, category: 'career' }],
    snap: { date: yesterday, goalName: 'Night essay', category: 'career', sessionStartTime: y('20', '00'),
      lastCheckpoint: y('22', '30'), savedAt: y('22', '30'), sessionNotes: [] },
  });
  const night = await page.evaluate((d) => {
    const h = JSON.parse(localStorage.getItem('daybyday_history') || '[]').find((x) => x.date === d);
    const g = h && h.goals.find((x) => x.name === 'Night essay');
    const s = h && (h.focusSessions || [])[0];
    return { hours: g && g.hours, unattended: s && s.unattended, confirmedMins: s && s.confirmedMins };
  }, yesterday);
  check('overnight: the 2h 30m up to the last checkpoint go to that day, not a flat hour',
    night, { hours: 2.5, unattended: true, confirmedMins: 150 });
  check('…and to the life area\'s total', Math.round((await getCategoryHours(page, 'career') - careerBefore) * 100) / 100, 2.5);
});
