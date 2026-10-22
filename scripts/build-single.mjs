#!/usr/bin/env node
// Bundle index.html + css + js modules into dist/activity-tracker.html, which works when opened from file://
// (browsers refuse to load module files from file://). No dependencies; handles the import/export forms this
// codebase uses: `import { a, b as c } from`, `import * as x from`, `export function|async function|const|let|class`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'js/app.js');
const IMPORT_RE = /^import\s+([\s\S]*?)\s+from\s+['"](.+?)['"];?\s*$/gm;
const EXPORT_RE = /^export\s+((?:async\s+)?function\*?|const|let|class)\s+([\w$]+)/gm;

const order = [];
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const [, , spec] of src.matchAll(IMPORT_RE)) visit(resolve(dirname(file), spec));
  order.push(file);
}
visit(entry);

const key = (file) => relative(root, file);

function wrap(file) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(IMPORT_RE, (_, clause, spec) => {
    const dep = JSON.stringify(key(resolve(dirname(file), spec)));
    const ns = clause.match(/^\*\s+as\s+([\w$]+)$/);
    if (ns) return `const ${ns[1]} = __m[${dep}];`;
    const names = clause.replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${names.join(', ')} } = __m[${dep}];`;
  });
  const exported = [...src.matchAll(EXPORT_RE)].map((m) => m[2]);
  src = src.replace(/^export\s+/gm, '');
  if (/^\s*export\b/m.test(src) || /\bimport\s*\(/.test(src)) throw new Error(`Unsupported module syntax in ${key(file)}`);
  return `// ---- ${key(file)} ----\n__m[${JSON.stringify(key(file))}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const js = `'use strict';\nconst __m = {};\n${order.map(wrap).join('\n')}`.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'css/styles.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/\s*<link rel="stylesheet" href="css\/styles.css">/, () => `\n  <style>\n${css}</style>`)
  .replace(/<script type="module" src="js\/app.js"><\/script>/, '')
  .replace('</body>', () => `<script>\n${js}</script>\n</body>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/activity-tracker.html'), html);
console.log(`dist/activity-tracker.html (${order.length} modules, ${(html.length / 1024).toFixed(0)} KB)`);
