// Builds the Similar apps page (similar/index.html) from docs/SIMILAR-TOOLS.md, so the doc stays the only copy: the
// page's `<!-- similar-tools -->` is replaced by the doc rendered to HTML, with the comparison table as one card per tool.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { marked, type Tokens } from 'marked';
import type { Plugin } from 'vite';

const SOURCE = fileURLToPath(new URL('../docs/SIMILAR-TOOLS.md', import.meta.url));
const MARK = '<!-- similar-tools -->';

const inline = (cell: Tokens.TableCell) => marked.parseInline(cell.text) as string;

/** A table row becomes a card: a "#" column is the rank, the next column the title, the one after it the subtitle,
 * and the rest labelled with their header. */
function cards(table: Tokens.Table): string {
  const ranked = table.header[0]?.text.trim() === '#';
  const [, subtitle, ...rest] = table.header.slice(ranked ? 1 : 0);
  const items = table.rows.map((row) => {
    const cells = row.slice(ranked ? 1 : 0);
    const details = rest.map((h, i) => `<dt>${inline(h)}</dt><dd>${inline(cells[i + 2])}</dd>`).join('');
    return `<li class="tool">
  <h2>${ranked ? `<span class="rank">${inline(row[0])}</span>` : ''}<span>${inline(cells[0])}</span></h2>
  ${subtitle ? `<p class="kind"><span class="sr">${inline(subtitle)}: </span>${inline(cells[1])}</p>` : ''}
  <dl>${details}</dl>
</li>`;
  });
  return `<ol class="tools">\n${items.join('\n')}\n</ol>\n`;
}

/** The doc as HTML; tables become card lists, everything else renders as usual. */
export function renderSimilarTools(markdown: string): string {
  return marked.lexer(markdown).map((t) => (t.type === 'table' ? cards(t as Tokens.Table) : marked.parser([t]))).join('');
}

export function similarTools(): Plugin {
  return {
    name: 'similar-tools',
    transformIndexHtml(html) {
      if (!html.includes(MARK)) return html;
      return html.replace(MARK, () => renderSimilarTools(readFileSync(SOURCE, 'utf8')));
    },
    // The doc isn't a module, so a change to it reloads the page by hand in dev.
    handleHotUpdate({ file, server }) {
      if (file === SOURCE) server.ws.send({ type: 'full-reload' });
    },
  };
}
