// Minimal flat config. The app is a browser IIFE in 'use strict' with no build
// step, so we keep rules permissive: catch genuine errors (undefined vars, dupe
// keys, unreachable code) without churning the existing ~4,600-line file on style.
import globals from 'globals';

export default [
  {
    files: ['app.js', 'notifications.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
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
    // Node-based tooling files.
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
