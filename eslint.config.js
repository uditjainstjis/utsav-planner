import js from '@eslint/js';
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
    // Shipped code keeps every function to a screen; tests are exempt, since a
    // describe block is a list of cases, not a unit of logic.
    files: ['src/**/*.ts', 'public/**/*.js'],
    rules: { 'max-lines-per-function': ['error', { max: 40 }] },
  },
  {
    // Front-end code runs in the browser and is plain JavaScript, typechecked
    // through JSDoc by tsconfig.app.json rather than linted with type information.
    files: ['public/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        TextDecoder: 'readonly',
        requestAnimationFrame: 'readonly',
        performance: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        Intl: 'readonly',
        AbortSignal: 'readonly',
        // Element classes the front end checks its lookups against (see public/js/dom.js).
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTemplateElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        RadioNodeList: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
  {
    // Tests that run in jsdom rather than workerd. They are excluded from the
    // root tsconfig on purpose — the Worker must not be able to reach for
    // `document` and still typecheck — so typed linting needs pointing at the
    // config that does have the DOM lib and Node's types.
    files: ['test/**/*.dom.test.ts'],
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
