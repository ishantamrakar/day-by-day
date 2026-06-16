// Smoke test: the cheapest guard against "a refactor broke boot".
// Serves the static app, loads it in headless Chromium, and asserts:
//   1. no console errors / page errors during load
//   2. window.DayByDayApp is exposed (app.js finished its IIFE)
//   3. the goals list rendered
//
// Run: node scripts/smoke-test.mjs   (needs `npx playwright install chromium` once)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 8123;
const URL = `http://localhost:${PORT}/index.html`;

function startServer() {
  const proc = spawn('python3', ['-m', 'http.server', String(PORT)], {
    stdio: 'ignore',
  });
  return proc;
}

async function waitForServer(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Static server did not start in time');
}

async function run() {
  const server = startServer();
  let browser;
  const errors = [];

  try {
    await waitForServer();

    browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto(URL, { waitUntil: 'networkidle' });

    // app.js should have finished and exposed its public API.
    const hasApi = await page.evaluate(
      () => typeof window.DayByDayApp === 'object' && window.DayByDayApp !== null,
    );
    if (!hasApi) errors.push('window.DayByDayApp was not exposed');

    // The goals list container should exist and the app should have rendered.
    const goalsRendered = await page.evaluate(() => !!document.querySelector('#goals-list'));
    if (!goalsRendered) errors.push('#goals-list did not render');

    if (errors.length) {
      console.error('❌ Smoke test failed:\n' + errors.map((e) => '  - ' + e).join('\n'));
      process.exitCode = 1;
    } else {
      console.log('✅ Smoke test passed: app boots, no console errors, API exposed.');
    }
  } catch (err) {
    console.error('❌ Smoke test errored:', err.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();
