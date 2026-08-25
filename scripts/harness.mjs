// Shared harness for the regression tests.
//
// Each test file gets a booted app in a headless browser with a clean
// localStorage, plus assertion helpers. The tests guard *data integrity*
// invariants — the ones where a regression silently loses or corrupts a
// user's logged work. UI-level behaviour is deliberately not covered here:
// those breaks are visible and recoverable, and flaky UI tests get ignored.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Each test file uses its own port so they can run concurrently later.
export async function withApp(port, fn) {
  const url = `http://localhost:${port}/index.html`;
  const server = spawn('python3', ['-m', 'http.server', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  let browser;
  const failures = [];
  try {
    await waitForServer(url);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

    // A page error during a data test invalidates whatever it claims to prove.
    page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') failures.push(`console.error: ${m.text()}`);
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    await fn({ page, check: makeCheck(failures) });
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  return failures;
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('Static server did not start in time');
}

function makeCheck(failures) {
  return function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
      console.log(`  ✓ ${label}`);
    } else {
      console.log(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
      failures.push(`${label} — expected ${e}, got ${a}`);
    }
  };
}

// Standard entry point: run a named suite and exit non-zero on any failure.
export async function runSuite(name, port, fn) {
  console.log(`\n${name}`);
  let failures;
  try {
    failures = await withApp(port, fn);
  } catch (err) {
    console.error(`  ✗ suite errored: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (failures.length) {
    console.error(`\n❌ ${name}: ${failures.length} failure(s)`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${name}`);
  }
}

// ── App-specific helpers ──────────────────────────────────────────────
// Driving the app through its own UI (rather than writing localStorage
// directly) is what makes these tests meaningful: they exercise the same
// code paths a user does.

export async function addGoal(page, name) {
  await page.fill('#goal-input', name);
  await page.press('#goal-input', 'Enter');
  await page.waitForTimeout(300);
  // A category picker may open on add — confirm it.
  const confirm = await page.$('.modal button.btn-primary');
  if (confirm) {
    await confirm.click();
    await page.waitForTimeout(250);
  }
}

export async function addBacklogItem(page, name) {
  await page.fill('#backlog-input', name);
  await page.press('#backlog-input', 'Enter');
  await page.waitForTimeout(250);
}

export const getGoals = (page) =>
  page.evaluate(() => window.DayByDayApp.getGoals().map((g) => ({
    name: g.name, hours: g.hours || 0, progress: g.progress || 0,
  })));

export const getBacklog = (page) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('daybyday_store') || '{}');
    return (s.backlogIds || []).map((id) => s.entities[id]).filter(Boolean).map((e) => ({
      name: e.name, hours: e.hours || 0, progress: e.progress || 0,
    }));
  });

export const getCategoryHours = (page, id) =>
  page.evaluate((cid) => {
    const s = JSON.parse(localStorage.getItem('daybyday_store') || '{}');
    const c = (s.categories || []).find((x) => x.id === cid);
    return c ? c.totalHours || 0 : null;
  }, id);
