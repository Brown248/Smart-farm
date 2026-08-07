// ESLint 9 flat config.
// NOTE: the project spec listed `.eslintrc.cjs`; ESLint 9 no longer loads eslintrc
// by default, so the same rule set lives here instead. See docs/DESIGN_SOURCE.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: '18.3' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  /**
   * สคริปต์เครื่องมือของนักพัฒนา (`scripts/*.cjs`) — รันด้วย Node ตรงๆ ไม่ได้อยู่ในเว็บ
   * เป็น CommonJS เพราะ root package.json เป็น `"type": "module"`
   * และ `console.log` คือหน้าที่ของมัน ไม่ใช่เศษ debug ที่ลืมลบ
   */
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
);
