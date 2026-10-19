const tseslint = require('typescript-eslint');

const noDefaultExports = [
  'error',
  {
    selector: 'ExportDefaultDeclaration',
    message: 'Use named exports.',
  },
  {
    selector: "ExportSpecifier[exported.name='default']",
    message: 'Use named exports.',
  },
];

module.exports = tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts}'],
    rules: {
      'no-restricted-syntax': noDefaultExports,
    },
  },
  {
    files: ['eslint.config.js'],
    // Flat config uses CommonJS here so the project needs no default export.
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/client/vite.config.ts'],
    // Vite loads this configuration through its required default export.
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}/).+',
              message: 'Shared must not import external or workspace packages.',
            },
            {
              regex: '^\\.\\./\\.\\./',
              message: 'Shared imports must stay inside its own source tree.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}/|@shiftborn/shared$).+',
              message:
                'Sim may import only its own files and @shiftborn/shared.',
            },
            {
              regex: '^(?:\\.\\./)+(?:apps|tools|server|client|shared)(?:/|$)',
              message:
                'Use @shiftborn/shared; never import across workspace folders.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded world RNG.',
        },
        { object: 'Date', property: 'now', message: 'Use simulation ticks.' },
        {
          object: 'performance',
          property: 'now',
          message: 'Use simulation ticks.',
        },
      ],
      'no-restricted-globals': [
        'error',
        'setTimeout',
        'setInterval',
        'requestAnimationFrame',
        'document',
        'window',
        'console',
      ],
    },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:@shiftborn/client(?:/|$)|(?:\\.\\./)+client(?:/|$)|(?:\\.\\./)*apps/client(?:/|$))',
              message: 'Server must not import client code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/client/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:@shiftborn/server(?:/|$)|(?:\\.\\./)+server(?:/|$)|(?:\\.\\./)*apps/server(?:/|$))',
              message: 'Client must not import server code.',
            },
          ],
        },
      ],
    },
  },
);
