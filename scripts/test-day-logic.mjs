// What survives a new day.
//
// Pins the CURRENT behaviour of the day-boundary code: building `_carryover`
// from the day that ended, the two places it is consumed (the day-transition
// modal and the legacy banner), the delete-scrub, intentions resetting, and
// the summary picking the last day that actually had work. It was written
// before that code moved out of app.js, so a failure after the move means the
// move changed behaviour.
//
// Both rollover paths are covered: a reload on a later date (loadState at
// boot) and the tab being left open across midnight (checkForNewDay, driven
// with Playwright's fake clock).
//
// Where an assertion records a known gap rather than a design choice, it says
// so. Those are pinned on purpose: changing them is a behaviour change and
// belongs in its own commit, not in a refactor.
import { runSuite } from './harness.mjs';

const round = (n) => Math.round(n * 100) / 100;

// ── Page-side helpers ──────────────────────────────────────────────────

// Local YYYY-MM-DD for `offset` days from the page's own "now" (which is the
// fake clock once one is installed).
const pageDate = (page, offset = 0) => page.evaluate((o) => {
  const d = new Date();
  d.setDate(d.getDate() + o);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}, offset);

const CATEGORIES = [
  { id: 'fitness', name: 'Fitness', emoji: '💪', color: '#3a86ff', totalHours: 5 },
  { id: 'career', name: 'Career', emoji: '💼', color: '#2D6A4F', totalHours: 10 },
  { id: 'relationships', name: 'Relationships', emoji: '❤️', color: '#ff6b9d', totalHours: 0 },
  { id: 'chores', name: 'Chores', emoji: '🧹', color: '#f4a261', totalHours: 2 },
  { id: 'general', name: 'General', emoji: '⚡', color: '#8d99ae', totalHours: 0 },
];

// Write a stored day (plus optional history) and reload, exactly as if the
// app had last been closed on `day.date`. The store and backlog are dropped
// so they are rebuilt from the legacy keys.
async function seed(page, day, { history = [], backlog = [] } = {}) {
  await page.evaluate(({ d, h, b, cats }) => {
    localStorage.clear();
    localStorage.setItem('daybyday_data', JSON.stringify(Object.assign({
      goals: [], distractions: [], successes: [], failures: [], quickDone: [], focusSessions: [],
    }, d)));
    localStorage.setItem('daybyday_history', JSON.stringify(h));
    localStorage.setItem('daybyday_backlog', JSON.stringify(b));
    localStorage.setItem('daybyday_categories', JSON.stringify(cats));
    // Keep the sidebar collapsed so growth toasts never sit over the page.
    localStorage.setItem('daybyday_sidebar', 'collapsed');
  }, { d: day, h: history, b: backlog, cats: CATEGORIES });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
}

const appState = (page) => page.evaluate(() => {
  const s = window.DayByDayApp.getState();
  return JSON.parse(JSON.stringify(s));
});

// Goals as the view sees them, without the store's `_eid`.
const goalsView = (page) => page.evaluate(() => window.DayByDayApp.getGoals().map((g) => {
  const o = { name: g.name, hours: g.hours || 0, progress: g.progress || 0, repeatable: !!g.repeatable };
  if (g.prevHours != null) o.prevHours = g.prevHours;
  if (g.category) o.category = g.category;
  return o;
}));

// Backlog straight from the persisted store — what survives a reload.
const storedBacklog = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('daybyday_store') || '{}');
  return (s.backlogIds || []).map((id) => s.entities[id]).filter(Boolean).map((e) => ({
    name: e.name, hours: e.hours || 0, progress: e.progress || 0,
    repeatable: !!e.repeatable, category: e.category || null,
  }));
});

const categoryTotals = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('daybyday_store') || '{}');
  const out = {};
  (s.categories || []).forEach((c) => { out[c.id] = round(c.totalHours || 0); });
  return out;
  function round(n) { return Math.round(n * 100) / 100; }
});

const historyDates = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('daybyday_history') || '[]').map((d) => d.date));

const modalOpen = (page) => page.evaluate(() => !!document.querySelector('.day-modal'));

const modalHeader = (page) => page.evaluate(() => {
  const q = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
  return { greeting: q('.day-modal-greeting'), gap: q('.day-modal-gap-note') };
});

// Make exactly `ids` the selected focus areas, in that order.
async function selectFocus(page, ids) {
  await page.evaluate((want) => {
    document.querySelectorAll('.day-modal-cat-btn.selected').forEach((b) => b.click());
    want.forEach((id) => document.querySelector(`.day-modal-cat-btn[data-cat-id="${id}"]`).click());
  }, ids);
  await page.waitForTimeout(150);
}

const intentionInputs = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.day-modal .intention-input')].map((i) => i.value));

async function setIntention(page, catName, hours) {
  await page.evaluate(({ n, h }) => {
    const input = [...document.querySelectorAll('.day-modal .intention-input')]
      .find((i) => i.getAttribute('aria-label') === `Hours for ${n}`);
    input.value = String(h);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { n: catName, h: hours });
}

async function clickModalButton(page, label) {
  await page.evaluate((l) => {
    [...document.querySelectorAll('.day-modal button')].find((b) => b.textContent.includes(l)).click();
  }, label);
  await page.waitForTimeout(500);
}

// Log time on a Top 5 goal through the staged time ring, the way a user does.
async function logHours(page, goalName, chips) {
  await page.evaluate((n) => {
    const row = [...document.querySelectorAll('#goals-list .task-item')]
      .find((r) => r.textContent.includes(n));
    row.querySelector('.task-focus-btn').click();
  }, goalName);
  await page.waitForTimeout(450);
  for (const label of chips) {
    await page.evaluate((l) => {
      [...document.querySelectorAll('.time-ring-chip')].find((c) => c.textContent.trim() === l).click();
    }, label);
    await page.waitForTimeout(150);
  }
  await page.click('.focus-add-time-btn');
  await page.waitForTimeout(500);
}

// ── Fixtures ───────────────────────────────────────────────────────────

const PREV_GOALS = [
  // Part-done, already carried once before: prevHours must accumulate.
  { name: 'Write the report', hours: 2, progress: 60, prevHours: 1.5, category: 'career' },
  // A finished repeatable comes back reset to 0%.
  { name: 'Morning run', hours: 0.5, progress: 100, repeatable: true, category: 'fitness' },
  // An unfinished repeatable keeps its progress.
  { name: 'Stretch', hours: 0.25, progress: 30, repeatable: true, category: 'fitness' },
  // A finished one-off is done with; it must not come back.
  { name: 'Finished thing', hours: 1, progress: 100, category: 'career' },
  // Untouched, in an area that won't be focused today.
  { name: 'Call mum', hours: 0, progress: 0, category: 'relationships' },
];

const EXPECTED_CARRYOVER = [
  { name: 'Write the report', hours: 0, progress: 60, prevHours: 3.5, category: 'career', repeatable: false },
  { name: 'Morning run', hours: 0, progress: 0, prevHours: 0.5, category: 'fitness', repeatable: true },
  { name: 'Stretch', hours: 0, progress: 30, prevHours: 0.25, category: 'fitness', repeatable: true },
  { name: 'Call mum', hours: 0, progress: 0, prevHours: 0, category: 'relationships', repeatable: false },
];

const ORIGINAL_TOTALS = { fitness: 5, career: 10, relationships: 0, chores: 2, general: 0 };

await runSuite('Day boundary: carryover, intentions, multi-day gaps', 8305, async ({ page, check }) => {
  // ════ 1. Overnight, by reload (loadState at boot) ════
  console.log('  — overnight gap, app reopened next morning');
  const yesterday = await pageDate(page, -1);
  const today = await pageDate(page, 0);
  await seed(page, {
    date: yesterday,
    goals: PREV_GOALS,
    focusCategoryIds: ['career', 'fitness'],
    focusIntentions: { career: 3, fitness: 1 },
  });

  let s = await appState(page);
  check('state rolled to today', s.date, today);
  check('carryover: unfinished kept, done one-off dropped, done repeatable reset, prevHours cumulative',
    s._carryover, EXPECTED_CARRYOVER);
  check('today starts with an empty Top 5', s.goals, []);
  check('yesterday\'s intentions do not leak into today', s.focusIntentions, undefined);
  check('yesterday\'s focus areas do not leak into today', s.focusCategoryIds, undefined);
  check('yesterday archived to history', await historyDates(page), [yesterday]);
  check('rollover does not touch category totals', await categoryTotals(page), ORIGINAL_TOTALS);
  check('transition modal opened', await modalOpen(page), true);
  check('one-day gap greets as a normal morning', await modalHeader(page),
    { greeting: 'Good morning.', gap: null });

  await selectFocus(page, ['career', 'fitness']);
  check('intention fields start blank on a new day', await intentionInputs(page), ['', '']);
  await setIntention(page, 'Career', 2);
  await clickModalButton(page, 'Start my day');

  check('Top 5: checked repeatables first, then focused carryover, hours reset, progress + prevHours kept',
    await goalsView(page), [
      { name: 'Morning run', hours: 0, progress: 0, repeatable: true, category: 'fitness' },
      { name: 'Stretch', hours: 0, progress: 30, repeatable: true, category: 'fitness' },
      { name: 'Write the report', hours: 0, progress: 60, repeatable: false, prevHours: 3.5, category: 'career' },
    ]);
  // Known gap, pinned: a task rescued to the backlog keeps progress but not
  // prevHours (rescue copies `hours`, which is 0 on a carryover entry).
  check('unfocused leftover rescued to backlog', await storedBacklog(page), [
    { name: 'Call mum', hours: 0, progress: 0, repeatable: false, category: 'relationships' },
  ]);
  s = await appState(page);
  check('_carryover cleared', '_carryover' in s, false);
  check('focus areas saved in pick order', s.focusCategoryIds, ['career', 'fitness']);
  check('only the intention set today is kept', s.focusIntentions, { career: 2 });
  check('accepting carryover does not touch category totals', await categoryTotals(page), ORIGINAL_TOTALS);

  // Carried hours live in prevHours; only new time reaches totalHours.
  await logHours(page, 'Write the report', ['1h']);
  check('new time on a carried goal counts once in totalHours', await categoryTotals(page),
    Object.assign({}, ORIGINAL_TOTALS, { career: 11 }));
  check('carried goal: new hours separate from prevHours',
    (await goalsView(page)).find((g) => g.name === 'Write the report'),
    { name: 'Write the report', hours: 1, progress: 60, repeatable: false, prevHours: 3.5, category: 'career' });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('same-day reload shows no transition modal', await modalOpen(page), false);
  check('same-day reload keeps the intention', (await appState(page)).focusIntentions, { career: 2 });
  check('same-day reload keeps totals', (await categoryTotals(page)).career, 11);
  check('same-day reload keeps prevHours', (await goalsView(page)).find((g) => g.name === 'Write the report').prevHours, 3.5);

  // ════ 2. Multi-day gap, by reload ════
  console.log('  — three days away, app reopened');
  const threeAgo = await pageDate(page, -3);
  await seed(page, {
    date: threeAgo,
    goals: [
      { name: 'Draft chapter', hours: 1.5, progress: 40, prevHours: 1, category: 'career' },
      { name: 'Water plants', hours: 0.25, progress: 100, repeatable: true, category: 'chores' },
    ],
    focusIntentions: { career: 4 },
  });
  s = await appState(page);
  check('multi-day: prevHours accumulates once, not once per missed day', s._carryover, [
    { name: 'Draft chapter', hours: 0, progress: 40, prevHours: 2.5, category: 'career', repeatable: false },
    { name: 'Water plants', hours: 0, progress: 0, prevHours: 0.25, category: 'chores', repeatable: true },
  ]);
  check('multi-day: intentions reset', s.focusIntentions, undefined);
  check('multi-day: only the stored day is archived', await historyDates(page), [threeAgo]);
  check('multi-day: modal names the gap', await modalHeader(page), {
    greeting: 'Welcome back.',
    gap: 'That was 2 days ago. 2 days away, and today is still yours to use.',
  });
  await selectFocus(page, ['career', 'chores']);
  await clickModalButton(page, 'Start my day');
  check('multi-day: part-done goal resumes with progress and prevHours', await goalsView(page), [
    { name: 'Water plants', hours: 0, progress: 0, repeatable: true, category: 'chores' },
    { name: 'Draft chapter', hours: 0, progress: 40, repeatable: false, prevHours: 2.5, category: 'career' },
  ]);
  check('multi-day: totals untouched', await categoryTotals(page), ORIGINAL_TOTALS);

  // ════ 3. Idle last day: summary walks back to the last day with work ════
  console.log('  — last opened day was idle, real work four days ago');
  const oneAgo = await pageDate(page, -1);
  const fourAgo = await pageDate(page, -4);
  await seed(page, { date: oneAgo }, {
    history: [{
      date: fourAgo,
      goals: [{ name: 'Old work', hours: 2, progress: 100, category: 'career' }],
      distractions: [], successes: [], failures: [], focusSessions: [],
    }],
  });
  s = await appState(page);
  check('idle day carries nothing', s._carryover, []);
  check('idle day still archived', await historyDates(page), [fourAgo, oneAgo]);
  check('summary is the last active day, not the idle one', await modalHeader(page), {
    greeting: 'Welcome back.',
    gap: 'That was 3 days ago. 3 days away, and today is still yours to use.',
  });
  check('summary lists that day\'s work', await page.evaluate(() =>
    [...document.querySelectorAll('.day-modal-done-item .day-done-name')].map((e) => e.textContent)), ['Old work']);
  await clickModalButton(page, 'Start fresh');

  // ════ 4. Deleting a goal also scrubs it from _carryover ════
  console.log('  — delete while carryover is pending');
  await seed(page, { date: yesterday, goals: PREV_GOALS });
  await page.evaluate(() => {
    const input = document.getElementById('goal-input');
    input.value = 'Write the report';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#goals-list .task-item')]
      .find((r) => r.textContent.includes('Write the report'));
    row.querySelector('.task-delete').click();
  });
  await page.waitForTimeout(250);
  check('deleted goal removed from _carryover by name',
    (await appState(page))._carryover.map((g) => g.name), ['Morning run', 'Stretch', 'Call mum']);
  await clickModalButton(page, 'Start fresh');
  check('a deleted task is not resurrected into the backlog',
    (await storedBacklog(page)).map((b) => b.name), ['Morning run', 'Stretch', 'Call mum']);

  // ════ 5. Legacy banner: accept fills Top 5 up to the cap, rest rescued ════
  // The banner is superseded by the modal and practically unreachable from
  // boot, but its handlers are live and route through the rescue invariant.
  console.log('  — legacy carryover banner');
  const SIX = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => ({
    name: `Task ${n}`, hours: i * 0.5, progress: i * 10, category: 'career', repeatable: i === 1,
  }));
  await seed(page, { date: yesterday, goals: SIX }, {
    backlog: [{ name: 'Task F', category: 'career', hours: 0, progress: 0 }],
  });
  await page.evaluate(() => document.getElementById('carryover-accept').click());
  await page.waitForTimeout(300);
  check('banner accept: first five carried with prevHours, hours reset', await goalsView(page),
    SIX.slice(0, 5).map((g) => ({
      name: g.name, hours: 0, progress: g.progress, repeatable: g.repeatable, prevHours: g.hours, category: 'career',
    })));
  check('banner accept: overflow already in backlog is not duplicated',
    (await storedBacklog(page)).map((b) => b.name), ['Task F']);
  check('banner accept: _carryover cleared', '_carryover' in (await appState(page)), false);
  check('banner accept: banner hidden', await page.evaluate(() =>
    document.getElementById('carryover-banner').classList.contains('hidden')), true);

  await seed(page, { date: yesterday, goals: SIX.slice(0, 3) });
  await page.evaluate(() => document.getElementById('carryover-dismiss').click());
  await page.waitForTimeout(300);
  check('banner dismiss: nothing added to Top 5', await goalsView(page), []);
  check('banner dismiss: every leftover rescued with progress', await storedBacklog(page),
    SIX.slice(0, 3).map((g) => ({
      name: g.name, hours: 0, progress: g.progress, repeatable: g.repeatable, category: 'career',
    })));
});

// ════ 6. Tab left open across midnight (checkForNewDay, fake clock) ════
// A separate app instance: the fake clock has to be installed before load.
await runSuite('Day boundary: live rollover with the tab open', 8306, async ({ page, check }) => {
  const start = await page.evaluate(() => {
    const d = new Date();
    d.setHours(23, 58, 30, 0);
    return d.getTime();
  });
  await page.clock.install({ time: start });
  await page.reload({ waitUntil: 'networkidle' });
  const day0 = await pageDate(page, 0);
  await seed(page, {
    date: day0,
    goals: PREV_GOALS,
    focusCategoryIds: ['career'],
    focusIntentions: { career: 3 },
  });
  check('fake clock in place, same day, no modal', await modalOpen(page), false);
  check('intention set for day 0', (await appState(page)).focusIntentions, { career: 3 });

  console.log('  — clock forward 1 day');
  await page.clock.fastForward(24 * 3600 * 1000);
  await page.waitForTimeout(600);
  const day1 = await pageDate(page, 0);
  let s = await appState(page);
  check('live: state rolled to the new date', s.date, day1);
  check('live: carryover identical to the boot path', s._carryover, EXPECTED_CARRYOVER);
  check('live: intentions reset', s.focusIntentions, undefined);
  check('live: focus areas reset', s.focusCategoryIds, undefined);
  check('live: day 0 archived', await historyDates(page), [day0]);
  check('live: totals untouched', await categoryTotals(page), ORIGINAL_TOTALS);
  check('live: modal opened', await modalOpen(page), true);
  await selectFocus(page, ['career']);
  check('live: intention field blank', await intentionInputs(page), ['']);
  await clickModalButton(page, 'Start my day');
  check('live: focused carryover in Top 5', await goalsView(page), [
    { name: 'Write the report', hours: 0, progress: 60, repeatable: false, prevHours: 3.5, category: 'career' },
  ]);
  // Repeatables outside today's focus are rescued as repeatables.
  check('live: everything else rescued to backlog', await storedBacklog(page), [
    { name: 'Morning run', hours: 0, progress: 0, repeatable: true, category: 'fitness' },
    { name: 'Stretch', hours: 0, progress: 30, repeatable: true, category: 'fitness' },
    { name: 'Call mum', hours: 0, progress: 0, repeatable: false, category: 'relationships' },
  ]);

  console.log('  — clock forward 3 more days');
  await page.clock.fastForward(72 * 3600 * 1000);
  await page.waitForTimeout(600);
  const day4 = await pageDate(page, 0);
  s = await appState(page);
  check('live multi-day: state rolled to the new date', s.date, day4);
  check('live multi-day: carried goal carried again, prevHours unchanged (no new time)', s._carryover, [
    { name: 'Write the report', hours: 0, progress: 60, prevHours: 3.5, category: 'career', repeatable: false },
  ]);
  check('live multi-day: only days the app saw are archived', await historyDates(page), [day0, day1]);
  check('live multi-day: modal names the gap', await modalHeader(page), {
    greeting: 'Welcome back.',
    gap: 'That was 2 days ago. 2 days away, and today is still yours to use.',
  });
  // Only ONE modal, even though the clock crossed several boundaries.
  check('live multi-day: a single modal', await page.evaluate(() =>
    document.querySelectorAll('.day-modal-overlay').length), 1);
  await clickModalButton(page, 'Start fresh');
  check('live multi-day: Start fresh rescues the carried goal',
    (await storedBacklog(page)).map((b) => b.name), ['Morning run', 'Stretch', 'Call mum', 'Write the report']);
  check('live multi-day: totals untouched', await categoryTotals(page), ORIGINAL_TOTALS);
});
