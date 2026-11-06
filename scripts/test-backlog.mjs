// Backlog data integrity.
//
// Guards two regressions that actually shipped:
//   1. Newly typed entries vanished from the card the instant they were added
//      (no category -> defaulted to General -> hidden by the focus filter).
//   2. Demote/promote dropped hours and progress, silently resetting a
//      part-done task that was shelved for later.
import { runSuite, addGoal, addBacklogItem, getGoals, getBacklog } from './harness.mjs';
import { describeBackup } from '../js/core/backup.js';

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

  // ── 4. Demoting a goal can be undone, by button or by drag ──
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  for (const n of ['Alpha', 'Bravo', 'Charlie']) await addGoal(page, n);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#goals-list .task-item')].find((r) => r.textContent.includes('Bravo'));
    const sl = row.querySelector('.progress-slider');
    sl.value = '40';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const goalNames = async () => (await getGoals(page)).map((g) => g.name);
  const backlogNames = async () => (await getBacklog(page)).map((b) => b.name);
  const undo = async () => { await page.keyboard.press('Control+z'); await page.waitForTimeout(300); };

  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#goals-list .task-item')].find((r) => r.textContent.includes('Bravo'));
    row.querySelector('.btn-demote').click();
  });
  await page.waitForTimeout(300);
  check('demote button moves the goal to the backlog', [await goalNames(), await backlogNames()],
    [['Alpha', 'Charlie'], ['Bravo']]);
  await undo();
  check('undo puts it back in its old place', [await goalNames(), await backlogNames()],
    [['Alpha', 'Bravo', 'Charlie'], []]);
  check('…with its progress', (await getGoals(page)).find((g) => g.name === 'Bravo').progress, 40);

  // Drag Charlie out of Top 5 onto the backlog card.
  const from = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#goals-list .task-item')].find((r) => r.textContent.includes('Charlie'));
    const r = row.querySelector('.task-drag-handle').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const to = await page.evaluate(() => {
    const r = document.getElementById('backlog-list').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 10 };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  check('dragging a goal onto the backlog demotes it', [await goalNames(), await backlogNames()],
    [['Alpha', 'Bravo'], ['Charlie']]);
  await undo();
  check('undo reverses the drag too', [await goalNames(), await backlogNames()],
    [['Alpha', 'Bravo', 'Charlie'], []]);

  // ── 5. If Top 5 is full by the time the add-goal modal is confirmed, the
  // task goes to the backlog (quick-add's rule) instead of vanishing. A user
  // can't fill Top 5 while the modal is open, so the test does it directly.
  await page.fill('#goal-input', 'Renew passport');
  await page.click('#add-goal-btn');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const goals = window.DayByDayApp.getGoals();
    goals.push({ name: 'Filler 1', hours: 0, progress: 0 }, { name: 'Filler 2', hours: 0, progress: 0 });
  });
  await page.keyboard.press('Enter'); // confirms the modal
  await page.waitForTimeout(400);
  check('nothing beyond five goals in Top 5', (await getGoals(page)).filter((g) => g.progress < 100).length, 5);
  check('the task went to the backlog instead', (await backlogNames()).includes('Renew passport'), true);
  check('the add input is cleared', await page.inputValue('#goal-input'), '');
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

await runSuite('Small UI rules', 8310, async ({ page, check }) => {
  // ── The encouragement line agrees in number ──
  await addGoal(page, 'Only goal');
  await page.evaluate(() => {
    const s = document.querySelector('#goals-list .progress-slider');
    s.value = '100';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const line = await page.textContent('#encouragement-text');
  check('one finished goal is not "All 1 goals"', /All 1 goals/.test(line), false);
  check('the backup summary says "1 task", not "1 tasks"', describeBackup({ keys: {
    daybyday_store: JSON.stringify({ entities: { a: {} }, sessions: [{}], categories: [{}] }),
  } }), '1 task · 1 focus session · 1 life area');

  // ── An edit that changes nothing writes nothing ──
  await addGoal(page, 'Keep this name');
  const writesDuring = async (fn) => {
    await page.evaluate(() => {
      window.__writes = 0;
      if (!window.__origSetItem) {
        window.__origSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { window.__writes++; return window.__origSetItem.call(this, k, v); };
      }
    });
    await fn();
    await page.waitForTimeout(200);
    return page.evaluate(() => window.__writes);
  };
  const openEditor = () => page.evaluate(() => {
    [...document.querySelectorAll('#goals-list .task-name')].find((e) => e.textContent === 'Keep this name').click();
  });
  check('Escape after typing saves nothing', await writesDuring(async () => {
    await openEditor();
    await page.keyboard.type('Something else');
    await page.keyboard.press('Escape');
  }), 0);
  check('Enter with the name unchanged saves nothing', await writesDuring(async () => {
    await openEditor();
    await page.keyboard.press('Enter');
  }), 0);
  check('the name is unchanged', (await getGoals(page)).some((g) => g.name === 'Keep this name'), true);
  check('a real rename still saves', await writesDuring(async () => {
    await openEditor();
    await page.keyboard.type('New name');
    await page.keyboard.press('Enter');
  }) > 0, true);
  check('…and sticks', (await getGoals(page)).some((g) => g.name === 'New name'), true);
});
