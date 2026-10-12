/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error Node built-in module in config
import fs from 'node:fs';
// @ts-expect-error Node built-in module in config
import path from 'node:path';

function mediapipeSourcemapFix(): Plugin {
  return {
    name: 'mediapipe-sourcemap-fix',
    enforce: 'pre',
    load(id: string) {
      if (id.includes('@mediapipe') && id.endsWith('vision_bundle.mjs')) {
        const fileContent = fs.readFileSync(id, 'utf-8');
        // MediaPipe 0.10.x has a typo: refers to vision_bundle_mjs.js.map instead of vision_bundle.mjs.map
        // Ensure the alias file exists on disk as well
        const mapAlias = path.resolve(path.dirname(id), 'vision_bundle_mjs.js.map');
        const mapReal = path.resolve(path.dirname(id), 'vision_bundle.mjs.map');
        if (!fs.existsSync(mapAlias) && fs.existsSync(mapReal)) {
          try {
            fs.copyFileSync(mapReal, mapAlias);
          } catch {
            // ignore if permissions prevent copying
          }
        }
        return {
          code: fileContent.replace('sourceMappingURL=vision_bundle_mjs.js.map', 'sourceMappingURL=vision_bundle.mjs.map'),
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [mediapipeSourcemapFix()],
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

