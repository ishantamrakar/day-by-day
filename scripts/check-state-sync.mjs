// Guards one invariant that is silent when broken.
//
// `state` and `backlog` in app.js mirror bindings owned by js/core/state.js.
// Reassigning either without the matching CoreState.setState/setBacklog call
// leaves core holding a stale object — and nothing fails loudly: the app keeps
// working off app.js's copy while anything reading through core (or any future
// module that does) silently sees yesterday's data.
//
// A plain ESLint selector can't express "flagged only when unpaired", so this
// checks the pairing directly.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8').split('\n');
const problems = [];

src.forEach((line, i) => {
  const m = line.match(/^\s*(state|backlog)\s*=\s*/);
  if (!m) return;
  const name = m[1];
  const setter = name === 'state' ? 'setState' : 'setBacklog';
  // The sync call must be on this line or the next two.
  const window = src.slice(i, i + 3).join('\n');
  if (!window.includes(`CoreState.${setter}(`)) {
    problems.push(`app.js:${i + 1}  ${name} reassigned without CoreState.${setter}()\n    ${line.trim()}`);
  }
});

if (problems.length) {
  console.error('State/core sync check FAILED:\n');
  problems.forEach(p => console.error('  ' + p));
  console.error('\nReassigning state/backlog must be followed by the matching');
  console.error('CoreState setter, or js/core keeps a stale object.');
  process.exit(1);
}
console.log(`✅ State/core sync: all ${src.filter(l => /^\s*(state|backlog)\s*=\s*/.test(l)).length} reassignment(s) paired.`);
