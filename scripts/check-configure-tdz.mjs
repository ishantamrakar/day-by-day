// Guards a hazard specific to the injected-context pattern.
//
// A `Module.configure({ ... })` object literal is evaluated where it appears.
// Function DECLARATIONS referenced inside it are fine — they hoist. But a
// `const`/`let` binding declared later (including one destructured from a
// module, e.g. `const { setupTaskDrag } = Drag`) is in its temporal dead zone,
// and the app dies at boot with "Cannot access X before initialization".
//
// The fix is a getter — `get x() { return x; }` — which defers the read to
// first use. This check finds the cases that need one.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8').split('\n');

// Where each const/let binding is declared (function decls are excluded: they hoist).
const tdzDecl = new Map();
src.forEach((line, i) => {
  const single = line.match(/^\s*(?:const|let)\s+(\w+)\s*=/);
  if (single && !tdzDecl.has(single[1])) tdzDecl.set(single[1], i);
  const destructured = line.match(/^\s*(?:const|let)\s*\{([^}]+)\}\s*=/);
  if (destructured) {
    for (const raw of destructured[1].split(',')) {
      const name = raw.trim().split(':').pop().trim();
      if (name && !tdzDecl.has(name)) tdzDecl.set(name, i);
    }
  }
});

const problems = [];
src.forEach((line, i) => {
  if (!/\.configure\(\{/.test(line)) return;
  let depth = 0, j = i;
  const buf = [];
  while (j < src.length) {
    buf.push(src[j]);
    depth += (src[j].match(/\{/g) || []).length - (src[j].match(/\}/g) || []).length;
    if (depth <= 0 && j > i) break;
    j++;
  }
  const block = buf.join('\n');
  for (const [name, declLine] of tdzDecl) {
    if (declLine <= i) continue;
    // Single/double-letter locals (a, e, el) are loop and callback variables,
    // not injected dependencies — matching them is all noise.
    if (name.length <= 2) continue;
    if (new RegExp(`get ${name}\\(\\)`).test(block)) continue; // already deferred
    if (new RegExp(`(?<![\\w.])${name}(?![\\w])`).test(block)) {
      problems.push(`app.js:${i + 1}  ${line.trim()} passes '${name}', declared later at line ${declLine + 1}`);
    }
  }
});

if (problems.length) {
  console.error('configure() temporal-dead-zone check FAILED:\n');
  problems.forEach(p => console.error('  ' + p));
  console.error('\nWrap each in a getter so the read is deferred:');
  console.error('  get name() { return name; },');
  process.exit(1);
}
console.log('✅ configure() TDZ: no eagerly-read late bindings.');
