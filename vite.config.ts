import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// A static site: the landing page at the root, the app (the PWA) under app/, and plain pages next to it. public/ holds
// the files copied as they are (favicon, the app's manifest and icons).
// `--mode single` builds only the app, inlined into one HTML file that works from file:// (see npm run build:single).
const pages = { landing: 'index.html', app: 'app/index.html', privacy: 'privacy/index.html', terms: 'terms/index.html' };
// The single file has no favicon or manifest next to it.
const dropSiteLinks = { name: 'drop-site-links', transformIndexHtml: (html: string) => html.replace(/\s*<link rel="(icon|manifest)"[^>]*>/g, '') };

export default defineConfig(({ mode }) => ({
  base: './', // relative paths, so dist/ works from any static host or subpath
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact(), ...(mode === 'single' ? [viteSingleFile(), dropSiteLinks] : [])],
  publicDir: mode === 'single' ? false : 'public',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    rollupOptions: { input: mode === 'single' ? { app: pages.app } : pages },
  },
  test: { include: ['tests/**/*.test.ts'] },
}));
