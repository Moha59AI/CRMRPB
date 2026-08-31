import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Les fichiers .sql de supabase/tests s'executent dans le SQL Editor,
    // pas ici : ils testent les politiques RLS cote base.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
