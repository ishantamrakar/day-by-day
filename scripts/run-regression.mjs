// Runs every regression suite and reports all results.
//
// Chaining with && would stop at the first failure and hide the rest — in CI
// you want the whole picture from one run.
import { spawn } from 'node:child_process';

const SUITES = [
  'scripts/test-backlog.mjs',
  'scripts/test-rollover.mjs',
  'scripts/test-hours.mjs',
  'scripts/test-growth.mjs',
];

const failed = [];
for (const suite of SUITES) {
  const code = await new Promise((resolve) => {
    spawn(process.execPath, [suite], { stdio: 'inherit' }).on('close', resolve);
  });
  if (code !== 0) failed.push(suite);
}

console.log('\n' + '─'.repeat(52));
if (failed.length) {
  console.error(`❌ ${failed.length}/${SUITES.length} suite(s) failed:`);
  failed.forEach((f) => console.error(`   ${f}`));
  process.exit(1);
}
console.log(`✅ All ${SUITES.length} regression suites passed.`);
