import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Share Vite's React transforms with Vitest so tests execute the same component syntax.
export default defineConfig({
  plugins: [react()],
  // Only development traffic is proxied. The production FastAPI app serves /api and dist together.
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: {
    // jsdom exercises DOM behavior, not actual layout or the browser's native focus trap.
    environment: 'jsdom',
    // Register accessible DOM matchers and the minimal dialog shim before each test file.
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // A test's spies must not leak implementation changes into later tests.
    restoreMocks: true,
  },
})
