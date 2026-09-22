import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Scratch agent worktrees (e.g. .kilo/) are not part of this repo's
    // suite: they duplicate every test file, double run time, and report
    // stale failures for code that no longer exists on this branch.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.kilo/**'],
  }
})
