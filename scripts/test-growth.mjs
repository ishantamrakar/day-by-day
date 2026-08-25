// Growth-stage baselining.
//
// Every 24h invested advances a category's plant one stage, and crossing a
// stage shows a toast. Pre-existing hours must NOT fire that toast: without
// baselining, shipping the feature would greet a long-time user with a burst
// of milestones they didn't just earn.
//
// This also guards a boot-order dependency that is easy to break by moving a
// single line: baselineGrowthStages() must run AFTER store.categories is
// wired, or it baselines against stale totals.
import { runSuite } from './harness.mjs';

const seenStage = (page, id) =>
  page.evaluate((cid) => {
    const c = JSON.parse(localStorage.getItem('daybyday_categories') || '[]').find((x) => x.id === cid);
    return c ? (c.seenStage ?? null) : null;
  }, id);

const setHours = async (page, id, hours) => {
  await page.evaluate(([cid, h]) => {
    const c = JSON.parse(localStorage.getItem('daybyday_categories') || '[]');
    c.find((x) => x.id === cid).totalHours = h;
    localStorage.setItem('daybyday_categories', JSON.stringify(c));
  }, [id, hours]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};

const toast = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('.sidebar-growth-toast');
    return t ? t.textContent.trim() : null;
  });

const isOpen = (page) =>
  page.evaluate(() => !document.getElementById('life-sidebar').classList.contains('collapsed'));

await runSuite('Growth stage baselining', 8304, async ({ page, check }) => {
  check('sidebar starts open at desktop width', await isOpen(page), true);

  // 50h of existing Fitness work — 2 full days already invested.
  await setHours(page, 'fitness', 50);
  check('pre-existing hours are baselined, not celebrated', await toast(page), null);
  check('seenStage matches the plant it already stands at', await seenStage(page, 'fitness'), 2);

  // Collapse, grow past another stage, reopen: the milestone waited.
  await page.click('#sidebar-expand-btn');
  await page.waitForTimeout(300);
  check('sidebar collapsed', await isOpen(page), false);

  await setHours(page, 'fitness', 74); // 3 full days
  check('no toast while the sidebar is collapsed', await toast(page), null);
  check('milestone is NOT consumed while unseen', await seenStage(page, 'fitness'), 2);

  await page.click('#sidebar-expand-btn');
  await page.waitForTimeout(500);
  const shown = await toast(page);
  check('toast appears on reopen', typeof shown === 'string' && shown.includes('Fitness'), true);
  check('milestone acknowledged once shown', await seenStage(page, 'fitness'), 3);

  // And it does not repeat.
  await page.click('#sidebar-expand-btn'); await page.waitForTimeout(250);
  await page.click('#sidebar-expand-btn'); await page.waitForTimeout(400);
  check('toast does not repeat once seen', await toast(page), null);
});
