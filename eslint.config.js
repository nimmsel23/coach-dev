import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';

export default [
  // Build-Ausgaben sind minifiziert und nicht lintbar.
  { ignores: ['**/dist/**', '**/dist-*/**', '**/.firebase/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,mjs}'],
    plugins: { react: reactPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off',             // catch {} ist in React-Code üblich
      'no-unsafe-finally': 'warn',
      'no-dupe-keys': 'error',
      'no-useless-assignment': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
