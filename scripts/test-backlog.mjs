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

  // ── 3. Every add path files a new goal under General ──
  // Enter used to save category: null while the + button saved 'general'.
  // Reads treat null as General, but the stored data should be one shape.
  await page.fill('#goal-input', 'Book the dentist');
  await page.press('#goal-input', 'Enter');
  await page.waitForTimeout(300);
  check('a goal added with Enter is stored under General', await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('daybyday_store') || '{}');
    const e = Object.values(s.entities || {}).find((x) => x.name === 'Book the dentist');
    return e ? e.category : 'missing';
  }), 'general');
});

function visibleRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#backlog-list .backlog-item .backlog-name')].map((e) => e.textContent));
}

// Finishing a goal (slider to 100) keeps its row on screen for a short
// completion animation before Top 5 re-renders. During that window the row is
// done but still drawn, so anything that maps screen rows to goals must skip
// it, and the delayed re-render must not tear down a drag or an edit.
await runSuite('Top 5: the moment a goal completes', 8309, async ({ page, check }) => {
  const reset = async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    for (const n of ['A', 'B', 'C', 'D']) await addGoal(page, `Goal ${n}`);
  };
  const rowSel = (n) => `[...document.querySelectorAll('#goals-list .task-item')].find((r) => r.querySelector('.task-name').textContent === 'Goal ${n}')`;
  const slide = (n, v) => page.evaluate(({ sel, val }) => {
    const s = eval(sel).querySelector('.progress-slider');
    s.value = String(val);
    s.dispatchEvent(new Event('input', { bubbles: true }));
  }, { sel: rowSel(n), val: v });
  const activeOrder = async () =>
    (await getGoals(page)).filter((g) => g.progress < 100).map((g) => g.name.slice(-1)).join('');
  const dragDown = async (n, rows) => {
    const b = await page.evaluate((sel) => {
      const row = eval(sel);
      const r = row.querySelector('.task-drag-handle').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: row.getBoundingClientRect().height };
    }, rowSel(n));
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(b.x, b.y + ((b.h + 10) * rows * i) / 10);
    await page.mouse.up();
    await page.waitForTimeout(500);
  };

  // ── 1. A drag right after a completion moves the row you grabbed ──
  await reset();
  await dragDown('B', 1);
  check('control: B dragged down one slot', await activeOrder(), 'ACBD');
  await reset();
  await slide('A', 100);
  check('completion animation still plays', await page.evaluate((sel) =>
    eval(sel).classList.contains('task-completing'), rowSel('A')), true);
  await dragDown('B', 1);
  await page.waitForTimeout(500);
  check('inside the window: B (not C) moves down one slot', await activeOrder(), 'CBD');

  // ── 2. A rename started in the window isn't thrown away ──
  await reset();
  await slide('A', 100);
  await page.evaluate((sel) => eval(sel).querySelector('.task-name').click(), rowSel('B'));
  await page.waitForTimeout(600); // well past the completion delay
  check('the editor is still open after the delay', await page.evaluate(() =>
    !!document.querySelector('#goals-list .inline-edit-input')), true);
  await page.evaluate(() => { // caret to the end (End doesn't do this on macOS)
    const i = document.querySelector('#goals-list .inline-edit-input');
    i.setSelectionRange(i.value.length, i.value.length);
  });
  await page.keyboard.type(' renamed');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  check('the rename is saved', (await getGoals(page)).map((g) => g.name).includes('Goal B renamed'), true);
  check('the completed goal still leaves Top 5 afterwards', await page.evaluate(() =>
    [...document.querySelectorAll('#goals-list .task-name')].map((e) => e.textContent).includes('Goal A')), false);
});
