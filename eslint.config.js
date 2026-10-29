import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint rules are chosen to catch the mistakes that matter in a Worker:
 * floating promises, unchecked `any` crossing a trust boundary, and dead code.
 * Stylistic questions are Prettier's job, not ESLint's.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'worker-configuration.d.ts',
      '.wrangler/**',
      'eslint.config.js',
      // Compiled from src/shared/constants.ts and src/lib/dates.ts, which are linted.
      'public/js/constants.*',
      'public/js/dates.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // Shipped code and the build script keep every function to a screen. Tests
    // are exempt, since a describe block is a list of cases, not a unit of logic.
    files: ['src/**/*.ts', 'public/**/*.js', 'scripts/**/*.mjs'],
    rules: { 'max-lines-per-function': ['error', { max: 40 }] },
  },
  {
    // Front-end code runs in the browser and is plain JavaScript, typed through
    // JSDoc. tsconfig.app.json is the config that types it (DOM lib, checkJs),
    // so typed linting is pointed there, as for the jsdom tests below.
    files: ['public/**/*.js'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: false,
        project: './tsconfig.app.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { 'no-undef': 'error' },
  },
  {
    // The asset generator: plain JavaScript run by Node, outside every tsconfig.
    files: ['scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests that run in jsdom rather than workerd. They are excluded from the
    // root tsconfig on purpose — the Worker must not be able to reach for
    // `document` and still typecheck — so typed linting needs pointing at the
    // config that does have the DOM lib and Node's types.
    files: ['test/**/*.dom.test.ts', 'test/**/*.dom.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.dom.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Test doubles must be async to satisfy the interface they stand in for,
      // even when the fake implementation has nothing to await.
      '@typescript-eslint/require-await': 'off',
      // `expect(env.AI.run).not.toHaveBeenCalled()` reads a vi.fn() off the
      // stub object it was installed on. The rule is guarding against losing
      // `this`, which a spy has none of — it is a false positive here, and the
      // alternative is casting every assertion into unreadability.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
