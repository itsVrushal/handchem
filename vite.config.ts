/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Exclude MediaPipe from pre-bundling – it uses WASM and dynamic imports
  // that Vite's esbuild step cannot handle cleanly.
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
