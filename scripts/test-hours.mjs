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


// Deleting an item takes its hours back out of the life area's total, and
// undo puts them back. Without this, every deleted quick win or goal leaves
// its hours in category.totalHours forever (roadmap.md, found 2026-11).
await runSuite('Hours: deletes and undo', 8307, async ({ page, check }) => {
  const undo = async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
  };
  const goalCat = (name) => page.evaluate((n) =>
    window.DayByDayApp.getGoals().find((g) => g.name === n).category || 'general', name);
  const addHoursToGoal = async (name, chip) => {
    await openRing(page, name);
    await tapChip(page, chip);
    await page.click('.focus-add-time-btn');
    await page.waitForTimeout(500);
  };
  const deleteIn = (listSel, name) => page.evaluate(({ sel, n }) => {
    const row = [...document.querySelectorAll(sel)].find((r) => r.textContent.includes(n));
    row.querySelector('.task-delete').click();
  }, { sel: listSel, n: name });

  // ── 1. Quick win logged with hours ──
  const qBefore = await getCategoryHours(page, 'general');
  await page.click('#add-quick-btn');
  await page.waitForTimeout(300);
  await page.fill('.quick-add-input', 'Fixed the sink');
  await page.fill('.quick-add-hours-input', '2');
  await page.click('.quick-add-actions .btn-primary');
  await page.waitForTimeout(400);
  check('logging a quick win adds its hours', round(await getCategoryHours(page, 'general') - qBefore), 2);

  await deleteIn('#done-list .done-item-quick', 'Fixed the sink');
  await page.waitForTimeout(300);
  check('deleting the quick win takes its hours back out',
    round(await getCategoryHours(page, 'general') - qBefore), 0);

  await undo();
  check('undo restores the quick win', await page.evaluate(() =>
    document.querySelector('#done-list').textContent.includes('Fixed the sink')), true);
  check('undo puts its hours back', round(await getCategoryHours(page, 'general') - qBefore), 2);

  // ── 2. Active goal with hours ──
  await addGoal(page, 'Plan the trip');
  const tripCat = await goalCat('Plan the trip');
  const gBefore = await getCategoryHours(page, tripCat);
  await addHoursToGoal('Plan the trip', '1h');
  check('goal hours reach the area', round(await getCategoryHours(page, tripCat) - gBefore), 1);

  await deleteIn('#goals-list .task-item', 'Plan the trip');
  await page.waitForTimeout(300);
  check('deleting an active goal takes its hours back out',
    round(await getCategoryHours(page, tripCat) - gBefore), 0);
  await undo();
  check('undo puts the goal\'s hours back', round(await getCategoryHours(page, tripCat) - gBefore), 1);

  // ── 3. Completed goal, deleted from Done Today ──
  await addGoal(page, 'Send the invoice');
  const invCat = await goalCat('Send the invoice');
  const cBefore = await getCategoryHours(page, invCat);
  await addHoursToGoal('Send the invoice', '30m');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#goals-list .task-item')]
      .find((r) => r.textContent.includes('Send the invoice'));
    const s = row.querySelector('.progress-slider');
    s.value = '100';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(800); // completion re-renders after a short delay
  await deleteIn('#done-list .done-item-goal', 'Send the invoice');
  await page.waitForTimeout(300);
  check('deleting a completed goal takes its hours back out',
    round(await getCategoryHours(page, invCat) - cBefore), 0);

  // ── 4. The corrected totals are what gets saved ──
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('corrected total persists across reload',
    round(await getCategoryHours(page, invCat) - cBefore), 0);
});
