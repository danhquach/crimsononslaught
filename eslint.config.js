import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Every use of Math.random is banned. Runs must be reproducible from a seed, so
// the only randomness source is src/core/rng.ts (CO-004), which is the one
// place allowed to call it (or not — it may use a pure PRNG instead).
const noMathRandom = {
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message: 'Use the seeded RNG from src/core/rng.ts instead of Math.random.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: noMathRandom,
  },
  {
    files: ['src/core/rng.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  prettier,
);
