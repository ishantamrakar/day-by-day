// Time logging integrity.
//
// Two things worth guarding:
//   1. The time-add ring is *staged* — nothing reaches the task until "Add".
//      Dismissing must add nothing; a regression here logs phantom hours.
//   2. category.totalHours is a running accumulator that is never recomputed
//      from history, so a double-count is permanent corruption.
import { runSuite, addGoal, getGoals, getCategoryHours } from './harness.mjs';

const openRing = async (page, name) => {
  await page.evaluate((n) => {
    const row = [...document.querySelectorAll('#goals-list .task-item')]
      .find((r) => r.textContent.includes(n));
    (row.querySelector('.btn-focus') || row.querySelector('[class*="focus"]')).click();
  }, name);
  await page.waitForTimeout(450);
};

const tapChip = async (page, label) => {
  await page.evaluate((l) => {
    [...document.querySelectorAll('.time-ring-chip')]
      .find((c) => c.textContent.trim() === l).click();
  }, label);
  await page.waitForTimeout(200);
};

const round = (n) => Math.round(n * 100) / 100;

const ringAmount = (page) =>
  page.evaluate(() => document.querySelector('.time-ring-amount').textContent);

await runSuite('Hours + time ring integrity', 8303, async ({ page, check }) => {
  await addGoal(page, 'Write the report');
  const catOf = (page) => page.evaluate(() =>
    window.DayByDayApp.getGoals().find((g) => g.name === 'Write the report').category || 'general');
  const cat = await catOf(page);
  const before = await getCategoryHours(page, cat);

  // ── 1. Staged: chips accumulate but commit nothing ──
  await openRing(page, 'Write the report');
  await tapChip(page, '30m');
  await tapChip(page, '1h');
  check('ring shows the staged total', await ringAmount(page), '1h 30m');
  check('nothing committed to the task yet',
    (await getGoals(page)).find((g) => g.name === 'Write the report').hours, 0);

  // Dismissing must discard.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('dismissing the modal adds nothing',
    (await getGoals(page)).find((g) => g.name === 'Write the report').hours, 0);
  check('dismissing does not touch category totals', await getCategoryHours(page, cat), before);

  // ── 2. Committing adds exactly once ──
  await openRing(page, 'Write the report');
  await tapChip(page, '1h');
  await tapChip(page, '30m');
  await page.click('.focus-add-time-btn');
  await page.waitForTimeout(500);
  check('Add commits the staged amount',
    (await getGoals(page)).find((g) => g.name === 'Write the report').hours, 1.5);
  check('category total gained exactly the committed hours',
    round(await getCategoryHours(page, cat) - before), 1.5);

  // ── 3. A second pass accumulates, it does not double-count ──
  await openRing(page, 'Write the report');
  await tapChip(page, '30m');
  await page.click('.focus-add-time-btn');
  await page.waitForTimeout(500);
  check('second commit accumulates on the task',
    (await getGoals(page)).find((g) => g.name === 'Write the report').hours, 2);
  check('category total tracks the task exactly',
    round(await getCategoryHours(page, cat) - before), 2);

  // ── 4. Values survive a reload (written to the store, not just memory) ──
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('logged hours persist across reload',
    (await getGoals(page)).find((g) => g.name === 'Write the report').hours, 2);
  check('category total persists across reload',
    round(await getCategoryHours(page, cat) - before), 2);
});

