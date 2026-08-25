// Backlog data integrity.
//
// Guards two regressions that actually shipped:
//   1. Newly typed entries vanished from the card the instant they were added
//      (no category -> defaulted to General -> hidden by the focus filter).
//   2. Demote/promote dropped hours and progress, silently resetting a
//      part-done task that was shelved for later.
import { runSuite, addGoal, addBacklogItem, getGoals, getBacklog } from './harness.mjs';

await runSuite('Backlog integrity', 8301, async ({ page, check }) => {
  // ── 1. A newly added entry stays visible, even under a focus filter ──
  await addBacklogItem(page, 'Buy running shoes');
  check('new entry is visible on the card', await visibleRows(page), ['Buy running shoes']);

  // Set a focus that does NOT include General. The entry must survive:
  // General is the backlog's inbox and is never filtered away.
  await page.evaluate(() => { window.DayByDayApp.getState().focusCategoryIds = ['fitness']; });
  await addBacklogItem(page, 'Typed under a focus');
  check('entry added under a non-General focus stays visible',
    await visibleRows(page), ['Buy running shoes', 'Typed under a focus']);

  await page.evaluate(() => { window.DayByDayApp.getState().focusCategoryIds = []; });

  // ── 2. Hours and progress survive Top 5 -> backlog -> Top 5 ──
  await addGoal(page, 'Write the report');
  await page.evaluate(() => {
    const g = window.DayByDayApp.getGoals().find((x) => x.name === 'Write the report');
    g.hours = 2.5; g.progress = 60;
  });
  // Force the save+render path the app itself uses.
  await addBacklogItem(page, '__tmp__');
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#backlog-list .backlog-item')];
    const tmp = rows.find((r) => r.textContent.includes('__tmp__'));
    if (tmp) tmp.querySelector('.task-delete').click();
  });
  await page.waitForTimeout(300);

  // Demote via the real button.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#goals-list .task-item')]
      .find((r) => r.textContent.includes('Write the report'));
    row.querySelector('.btn-demote').click();
  });
  await page.waitForTimeout(400);

  const shelved = (await getBacklog(page)).find((b) => b.name === 'Write the report');
  check('demote preserves hours + progress', shelved && { h: shelved.hours, p: shelved.progress },
    { h: 2.5, p: 60 });

  // Reload — proves it persisted through the store, not just in memory.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const afterReload = (await getBacklog(page)).find((b) => b.name === 'Write the report');
  check('shelved values survive a reload', afterReload && { h: afterReload.hours, p: afterReload.progress },
    { h: 2.5, p: 60 });

  // Promote back.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#backlog-list .backlog-item')]
      .find((r) => r.textContent.includes('Write the report'));
    row.querySelector('.btn-promote').click();
  });
  await page.waitForTimeout(400);
  const restored = (await getGoals(page)).find((g) => g.name === 'Write the report');
  check('promote restores hours + progress', restored && { h: restored.hours, p: restored.progress },
    { h: 2.5, p: 60 });
});

function visibleRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#backlog-list .backlog-item .backlog-name')].map((e) => e.textContent));
}
