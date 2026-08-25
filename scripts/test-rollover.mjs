// Day rollover: no unfinished task may ever be silently dropped.
//
// architecture.md calls rescueCarryoverToBacklog() "the only place _carryover
// may be cleared" — every exit path routes through it so leftover work always
// lands in Top 5 or the backlog. This test holds that line on both exits.
import { runSuite, getGoals, getBacklog } from './harness.mjs';

// Seed a previous day with unfinished work, then reload to trigger the
// transition modal the same way a real overnight gap does.
async function seedPreviousDay(page, goals) {
  await page.evaluate((gs) => {
    localStorage.setItem('daybyday_data', JSON.stringify({
      date: '2020-01-01',
      goals: gs,
      distractions: [], successes: [], failures: [], quickDone: [], focusSessions: [],
    }));
    localStorage.removeItem('daybyday_store');
    localStorage.removeItem('daybyday_backlog');
  }, goals);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}

const LEFTOVERS = [
  { name: 'Write the report', hours: 2, progress: 60, category: 'career' },
  { name: 'Morning run', hours: 0, progress: 0, category: 'fitness' },
  { name: 'Fix the sink', hours: 0.5, progress: 20, category: 'chores' },
  { name: 'Finished thing', hours: 1, progress: 100, category: 'career' },
];

await runSuite('Day rollover safety', 8302, async ({ page, check }) => {
  // ── "Start fresh" must still rescue everything ──
  await seedPreviousDay(page, LEFTOVERS);
  check('transition modal opened', await page.evaluate(() => !!document.querySelector('.day-modal')), true);

  await page.evaluate(() => {
    [...document.querySelectorAll('.day-modal button')]
      .find((b) => b.textContent.includes('Start fresh')).click();
  });
  await page.waitForTimeout(600);

  const rescued = (await getBacklog(page)).map((b) => b.name).sort();
  check('"Start fresh" rescues every unfinished task to the backlog',
    rescued, ['Fix the sink', 'Morning run', 'Write the report']);
  check('completed tasks are not rescued', rescued.includes('Finished thing'), false);
  check('_carryover is cleared afterwards',
    await page.evaluate(() => !!window.DayByDayApp.getState()._carryover), false);

  // ── "Start my day" must also leave nothing behind ──
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await seedPreviousDay(page, LEFTOVERS);

  await page.evaluate(() => {
    [...document.querySelectorAll('.day-modal button')]
      .find((b) => b.textContent.includes('Start my day')).click();
  });
  await page.waitForTimeout(700);

  const inGoals = (await getGoals(page)).map((g) => g.name);
  const inBacklog = (await getBacklog(page)).map((b) => b.name);
  const accounted = [...inGoals, ...inBacklog];
  const unfinished = LEFTOVERS.filter((g) => g.progress < 100).map((g) => g.name);
  const missing = unfinished.filter((n) => !accounted.includes(n));

  check('"Start my day" leaves no unfinished task unaccounted for', missing, []);
  check('_carryover is cleared afterwards',
    await page.evaluate(() => !!window.DayByDayApp.getState()._carryover), false);
});
