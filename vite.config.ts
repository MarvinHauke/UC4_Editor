import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/UC4_Editor/' : '/',
  plugins: [svelte()],
  publicDir: 'static',
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
