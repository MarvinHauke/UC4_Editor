import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'dumps/', '.venv/', 'site/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: ['src/app/storageKeys.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^uc4-editor-/]',
          message: 'Browser-storage keys live in src/app/storageKeys.ts.',
        },
        {
          selector: 'TemplateElement[value.raw=/^uc4-editor-/]',
          message: 'Browser-storage keys live in src/app/storageKeys.ts.',
        },
      ],
    },
  },
);
