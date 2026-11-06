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

// Deleting a focus session takes back the hours it gave its goal (and the
// goal's life area), and undo restores the session and the hours. Sessions
// saved before 2026-11 don't record what they added, so the fallback is the
// session's focused minutes, never more than the goal still holds.
await runSuite('Hours: focus-session delete and undo', 8308, async ({ page, check }) => {
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const session = (over) => Object.assign({
    timestamp: Date.now(), goalName: 'Write chapter', goalIndex: 0, category: 'career',
    totalMins: 60, focusPct: 100, focusMins: 60, distractMins: 0, isWin: true,
    midNotes: [],
  }, over);
  await page.evaluate(({ day, cats }) => {
    localStorage.clear();
    localStorage.setItem('daybyday_data', JSON.stringify(day));
    localStorage.setItem('daybyday_categories', JSON.stringify(cats));
    localStorage.setItem('daybyday_sidebar', 'collapsed');
  }, {
    day: {
      date: today, distractions: [], successes: [], failures: [], quickDone: [],
      goals: [{ name: 'Write chapter', hours: 2.5, progress: 40, category: 'career' }],
      focusSessions: [
        session({ timestamp: Date.now() - 7200e3 }),                        // pre-2026-11: no goalHoursAdded → 1h
        session({ timestamp: Date.now() - 3600e3, focusMins: 90, goalHoursAdded: 0.5 }), // capped save → 0.5h
      ],
    },
    cats: [
      { id: 'career', name: 'Career', emoji: '💼', color: '#2D6A4F', totalHours: 10 },
      { id: 'general', name: 'General', emoji: '⚡', color: '#8d99ae', totalHours: 0 },
    ],
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const goalHours = () => page.evaluate(() => window.DayByDayApp.getGoals()[0].hours);
  const sessionCount = () => page.evaluate(() => window.DayByDayApp.getState().focusSessions.length);
  const catHours = () => getCategoryHours(page, 'career');
  // Rows render newest first: row 0 is the capped session, row 1 the old one.
  const deleteRow = (i) => page.evaluate((n) => {
    document.querySelectorAll('.focus-session-entry .task-delete')[n].click();
  }, i);
  const undo = async () => { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); };

  await deleteRow(0);
  await page.waitForTimeout(300);
  check('deleting a session removes it', await sessionCount(), 1);
  check('goal loses exactly what the session recorded adding', await goalHours(), 2);
  check('area total loses the same', round(await catHours()), 9.5);

  await deleteRow(0); // the remaining (old-shape) session
  await page.waitForTimeout(300);
  check('old session falls back to its focused minutes', await goalHours(), 1);
  check('area total follows', round(await catHours()), 8.5);

  await undo();
  check('undo restores the session', await sessionCount(), 1);
  check('undo restores the goal hours', await goalHours(), 2);
  check('undo restores the area total', round(await catHours()), 9.5);
  await undo();
  check('second undo restores both sessions', await sessionCount(), 2);
  check('…and all the hours', [await goalHours(), round(await catHours())], [2.5, 10]);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('restored state persists across reload',
    [await sessionCount(), await goalHours(), round(await catHours())], [2, 2.5, 10]);

  // A session whose goal is gone gives nothing back: deleting the goal
  // already took its hours out of the area (see 'Hours: deletes and undo').
  await page.evaluate(() => {
    [...document.querySelectorAll('#goals-list .task-item')][0].querySelector('.task-delete').click();
  });
  await page.waitForTimeout(300);
  const afterGoalDelete = round(await catHours());
  await deleteRow(0);
  await page.waitForTimeout(300);
  check('session of a deleted goal leaves the area total alone', round(await catHours()), afterGoalDelete);
});
