import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// `--mode single` inlines everything into one HTML file that works from file:// (see npm run build:single).
export default defineConfig(({ mode }) => ({
  base: './', // relative paths, so dist/ works from any static host or subpath
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: { include: ['tests/**/*.test.ts'] },
}));
