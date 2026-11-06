// Sharing one focus session's time across several Top 5 tasks.
//
// A session started on one task often covers others too. At the end you can
// add those tasks and split the focused time between them by percent; each
// task (and its own life area) is credited its share, and deleting the
// session hands every share back. The arithmetic lives in js/core and is
// checked directly; the flow is driven through the real UI.
import { runSuite, addGoal, getCategoryHours } from './harness.mjs';
import { splitHours, evenPercents, rebalancePercents } from '../js/core/shared-time.js';
import { sessionReturns } from '../js/core/journal.js';

const round = (n) => Math.round(n * 100) / 100;
const sum = (xs) => round(xs.reduce((a, b) => a + b, 0));

await runSuite('Shared session time', 8312, async ({ page, check }) => {
  // ── 1. The arithmetic ──
  check('even split of 100 across 3', evenPercents(3), [34, 33, 33]);
  check('even split of 100 across 1', evenPercents(1), [100]);
  check('shares always add up to exactly the session hours',
    [splitHours(0.83, [60, 40]), sum(splitHours(0.83, [60, 40])),
     sum(splitHours(1.37, [34, 33, 33])), sum(splitHours(2, [50, 25, 25]))],
    [[0.5, 0.33], 0.83, 1.37, 2]);
  check('a 0% share gets nothing', splitHours(1, [100, 0]), [1, 0]);
  check('moving one slider rebalances the rest to keep 100%',
    [rebalancePercents([50, 50], 0, 60), rebalancePercents([34, 33, 33], 0, 50),
     rebalancePercents([100, 0, 0], 0, 40)],
    [[60, 40], [50, 25, 25], [40, 30, 30]]);
  check('…and is clamped to 0–100', rebalancePercents([50, 50], 1, 140), [0, 100]);

  check('a shared session hands each task back its own share', sessionReturns({
    goalName: 'Essay', goalIndex: 0, focusMins: 50, goalHoursAdded: 0.5,
    shares: [
      { goalName: 'Essay', category: 'career', pct: 60, hoursAdded: 0.5 },
      { goalName: 'Email', category: 'general', pct: 40, hoursAdded: 0.33 },
    ],
  }, [{ name: 'Essay', hours: 2 }, { name: 'Email', hours: 0.33 }]), [
    { goalIndex: 0, hours: 0.5 }, { goalIndex: 1, hours: 0.33 },
  ]);
  check('…never more than a task still holds, and nothing for a deleted one', sessionReturns({
    goalName: 'Essay', goalIndex: 0, shares: [
      { goalName: 'Essay', pct: 50, hoursAdded: 1 },
      { goalName: 'Gone', pct: 50, hoursAdded: 1 },
    ],
  }, [{ name: 'Essay', hours: 0.25 }]), [{ goalIndex: 0, hours: 0.25 }, { goalIndex: -1, hours: 0 }]);
  check('a session from before sharing still hands back one share', sessionReturns({
    goalName: 'Essay', goalIndex: 0, focusMins: 30,
  }, [{ name: 'Essay', hours: 2 }]), [{ goalIndex: 0, hours: 0.5 }]);

  // ── 2. The flow: bring a task in mid-session, split at the end ──
  const start = await page.evaluate(() => { const d = new Date(); d.setHours(10, 0, 0, 0); return d.getTime(); });
  await page.clock.install({ time: start });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('daybyday_sidebar', 'collapsed');
    localStorage.setItem('daybyday_categories', JSON.stringify([
      { id: 'career', name: 'Career', emoji: '💼', color: '#2D6A4F', totalHours: 10 },
      { id: 'fitness', name: 'Fitness', emoji: '💪', color: '#3a86ff', totalHours: 0 },
      { id: 'general', name: 'General', emoji: '⚡', color: '#8d99ae', totalHours: 0 },
    ]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await addGoal(page, 'Write the essay');
  await addGoal(page, 'Answer emails');
  await addGoal(page, 'Plan the run');
  await page.evaluate(() => { // file the essay under Career (others stay General)
    window.DayByDayApp.getGoals()[0].category = 'career';
  });
  const careerBefore = await getCategoryHours(page, 'career');
  const generalBefore = await getCategoryHours(page, 'general');

  await page.click('#goals-list .task-focus-btn'); // the essay
  await page.waitForTimeout(400);
  await page.click('.focus-enter-btn--secondary');
  await page.waitForTimeout(500);
  await page.click('.focus-skip-btn');
  await page.waitForTimeout(500);
  await page.click('.focus-skip-btn');
  await page.waitForTimeout(600);

  check('a "bring in a task" card sits under Focus tools', await page.evaluate(() =>
    !!document.querySelector('.focus-col-right .focus-share-card')), true);
  const shareChips = () => page.evaluate(() =>
    [...document.querySelectorAll('.focus-share-card .focus-entry-tag')].map((c) => c.textContent.trim()));
  await page.click('.focus-share-card .focus-tool-btn');
  await page.waitForTimeout(200);
  check('it offers the other Top 5 tasks, not the one in focus', await shareChips(), ['Answer emails', 'Plan the run']);
  await page.click('.focus-share-card .focus-entry-tag:has-text("Answer emails")');
  await page.waitForTimeout(200);

  await page.clock.fastForward(50 * 60 * 1000); // 50 minutes of work
  await page.waitForTimeout(300);
  await page.click('.focus-done-btn');
  await page.waitForTimeout(700);

  await page.evaluate(() => { // fully focused, to keep the numbers round
    const s = document.querySelector('.focus-pct-slider');
    s.value = '100';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('at the end, the brought-in task is already selected', await page.evaluate(() =>
    [...document.querySelectorAll('.focus-share-section .focus-entry-tag.selected')].map((c) => c.textContent.trim())),
    ['Answer emails']);
  const rows = () => page.evaluate(() =>
    [...document.querySelectorAll('.focus-share-row')].map((r) => r.querySelector('.focus-share-amount').textContent));
  check('time starts split evenly, shown as percent and hours', await rows(), ['50% · 25m', '50% · 25m']);

  await page.evaluate(() => { // give the essay 60%
    const s = document.querySelector('.focus-share-row .focus-pct-slider');
    s.value = '60';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('moving one share moves the other to keep 100%', await rows(), ['60% · 30m', '40% · 20m']);

  await page.click('.focus-exit-actions .focus-entry-start'); // Save & close
  await page.waitForTimeout(700);

  const hours = () => page.evaluate(() =>
    Object.fromEntries(window.DayByDayApp.getGoals().map((g) => [g.name, g.hours || 0])));
  check('each task gets its share of the 50 minutes',
    await hours(), { 'Write the essay': 0.5, 'Answer emails': 0.33, 'Plan the run': 0 });
  check('each share counts toward that task\'s own life area', [
    round(await getCategoryHours(page, 'career') - careerBefore),
    round(await getCategoryHours(page, 'general') - generalBefore),
  ], [0.5, 0.33]);
  check('one journal entry, noting the shared task', await page.evaluate(() => {
    const entries = document.querySelectorAll('.focus-session-entry');
    return [entries.length, entries[0].querySelector('.focus-session-name').textContent.includes('+ 1 task')];
  }), [1, true]);

  // ── 3. Deleting the session hands every share back; undo restores them ──
  await page.evaluate(() => document.querySelector('.focus-session-entry .task-delete').click());
  await page.waitForTimeout(300);
  check('delete hands both shares back', [await hours(),
    round(await getCategoryHours(page, 'career') - careerBefore),
    round(await getCategoryHours(page, 'general') - generalBefore)],
  [{ 'Write the essay': 0, 'Answer emails': 0, 'Plan the run': 0 }, 0, 0]);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check('undo restores both shares', [await hours(),
    round(await getCategoryHours(page, 'career') - careerBefore),
    round(await getCategoryHours(page, 'general') - generalBefore)],
  [{ 'Write the essay': 0.5, 'Answer emails': 0.33, 'Plan the run': 0 }, 0.5, 0.33]);
});
