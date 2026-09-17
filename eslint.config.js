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

// src/core/** and src/config/** are pure game logic and pure data: they must run
// under Vitest with no engine present (see spec §4 "Layering"). Without this rule
// a Phaser import there fails at test time with a confusing engine error instead
// of at lint time with a clear one.
//
// Two bans, because one rule does not cover both shapes: no-restricted-imports
// only inspects static import/export declarations, so dynamic import('phaser')
// slips past it and needs the no-restricted-syntax selector below.
const ENGINE_MESSAGE =
  'src/core and src/config must not import the engine. Keep Phaser in scenes/entities/systems/render (spec §4 Layering).';
const LAYER_MESSAGE =
  'src/core and src/config must not import engine layers. Dependencies point inward: scenes/entities/systems/render may import core, never the reverse (spec §4 Layering).';

const noEngineInCore = {
  'no-restricted-imports': [
    'error',
    {
      paths: [{ name: 'phaser', message: ENGINE_MESSAGE }],
      patterns: [
        { group: ['phaser/*'], message: ENGINE_MESSAGE },
        {
          group: ['**/scenes/**', '**/entities/**', '**/systems/**', '**/render/**'],
          message: LAYER_MESSAGE,
        },
      ],
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: 'ImportExpression > Literal[value=/^phaser($|\\/)/]',
      message: ENGINE_MESSAGE,
    },
    {
      selector: 'ImportExpression > Literal[value=/\\/(scenes|entities|systems|render)\\//]',
      message: LAYER_MESSAGE,
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
  {
    files: ['src/core/**/*.ts', 'src/config/**/*.ts'],
    rules: noEngineInCore,
  },
  prettier,
);
