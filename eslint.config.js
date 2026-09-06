// Minimal flat config. The app is a browser IIFE in 'use strict' with no build
// step, so we keep rules permissive: catch genuine errors (undefined vars, dupe
// keys, unreachable code) without churning the existing ~4,600-line file on style.
import globals from 'globals';

export default [
  {
    // app.js is now an ES module; notifications.js is still a classic script.
    files: ['app.js', 'js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Cross-file globals the two scripts expose to each other.
        DayByDayApp: 'readonly',
        DayByDayNotifications: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-dupe-class-members': 'error',
      'no-func-assign': 'error',
      'valid-typeof': 'error',
      'no-unsafe-negation': 'error',
    },
  },
  {
    files: ['notifications.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        DayByDayApp: 'readonly',
        DayByDayNotifications: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    // THE PORTABILITY BOUNDARY, mechanically enforced.
    //
    // js/core holds the domain logic a native (iOS/Android) build reuses
    // verbatim. It must never touch a browser API: anything it needs from the
    // platform is passed in or imported from js/platform. Documentation alone
    // would decay, so the rule lives here — if this errors, the fix is to move
    // the browser call into js/platform, not to add an exception.
    files: ['js/core/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {}, // no browser globals: `document` etc. become no-undef errors
    },
    rules: {
      'no-undef': 'error',
      'no-restricted-globals': ['error',
        { name: 'window', message: 'js/core must stay portable — use js/platform.' },
        { name: 'document', message: 'js/core must stay portable — no DOM.' },
        { name: 'localStorage', message: 'js/core must stay portable — use js/platform/storage.js.' },
        { name: 'navigator', message: 'js/core must stay portable — use js/platform.' },
        { name: 'location', message: 'js/core must stay portable — use js/platform.' },
      ],
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../ui/*', '../../ui/*', '../platform/*', '../../platform/*'],
            message: 'js/core may not import from ui/ or platform/ — dependencies point inward.' },
        ],
      }],
    },
  },
  {
    // Node-based tooling files.
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
