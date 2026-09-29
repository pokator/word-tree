import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: false,
    // agent worktrees live under .claude/worktrees -- don't run their copies
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
