import { defineConfig } from 'vitest/config';

/** Testes do servidor (API + SQLite), em ambiente Node. Os do painel rodam via `ng test`. */
export default defineConfig({
  test: {
    include: ['server/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
