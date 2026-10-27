import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/* ------------------------------------------------------------------ *
 * Serializers: Markdown, plain text, RTF, standalone HTML, print HTML
 * ------------------------------------------------------------------ */

const dom = (html) => {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  return doc.getElementById('root');
};

/* ---------------------------- Markdown ---------------------------- */

/** Turndown's GFM table rule gives up on colspan/rowspan/colgroups, so
 *  flatten them first. Oversized data-URI images are dropped with a note
 *  rather than bloating a plain-text file by half a megabyte. */
function prepForMarkdown(html) {
  const root = dom(html);

  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:') && src.length > 120000) {
      const note = root.ownerDocument.createComment(
        ' image omitted in Markdown export (too large): use DOCX or HTML ',
      );
      img.replaceWith(note);
    }
  });

  root.querySelectorAll('table').forEach((table) => {
    table.querySelectorAll('colgroup').forEach((c) => c.remove());
    table.querySelectorAll('*').forEach((el) => {
      if (el.getAttribute('colspan') === '1') el.removeAttribute('colspan');
      if (el.getAttribute('rowspan') === '1') el.removeAttribute('rowspan');
      el.removeAttribute('style');
      el.removeAttribute('class');
    });
    table.querySelectorAll('td, th').forEach((cell) => {
      const paragraphs = [...cell.children].filter((c) => c.tagName === 'P');
      if (paragraphs.length) {
        const doc = cell.ownerDocument;
        cell.textContent = '';
        paragraphs.forEach((p, i) => {
          if (i) cell.appendChild(doc.createElement('br'));
          cell.appendChild(doc.createTextNode(p.textContent));
        });
      }
    });
  });

  return root.innerHTML;
}

export function toMarkdown(html) {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  td.use(gfm);
  td.keep(['u', 'mark']);
  td.addRule('strike', {
    filter: ['s', 'del'],
    replacement: (content) => `~~${content}~~`,
  });
  td.addRule('underline', {
    filter: ['u'],
    replacement: (content) => `<u>${content}</u>`,
  });
  td.addRule('hr', {
    filter: 'hr',
    replacement: () => '\n\n---\n\n',
  });
  td.addRule('shape', {
    filter: (node) => node.nodeName === 'DIV' && node.hasAttribute('data-flect-shape'),
    replacement: () => '\n\n<!-- shape -->\n\n',
  });
  const body = prepForMarkdown(html || '');
  return td.turndown(body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* --------------------------- Plain text ---------------------------- */

export function toPlainText(html) {
  const root = dom(html);
  const out = [];
  const blockTags = /^(P|H[1-6]|BLOCKQUOTE|LI|PRE|DIV|SECTION|TR|FIGURE|FIGCAPTION)$/;

  const walk = (node) => {
    for (const child of node.children) {
      if (child.tagName === 'BR') { out.push('\n'); continue; }
      if (child.tagName === 'HR') { out.push('\n\n* * *\n\n'); continue; }
      if (blockTags.test(child.tagName)) {
        const text = child.textContent.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
        if (text) out.push(text);
      } else if (child.children.length) {
        walk(child);
      } else {
        const text = child.textContent.trim();
        if (text) out.push(text);
      }
    }
  };
  walk(root);
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ------------------------------ RTF -------------------------------- */

function rtfEscape(text) {
  let out = '';
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\t') out += '\\tab ';
    else if (code < 128) out += ch;
    else if (code > 65535) {
      const s = ch;
      out += s;
    } else {
      out += `\\u${code}?`;
    }
  }
  return out;
}

function rtfRuns(node, fmt, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const text = child.nodeValue.replace(/\u00a0/g, ' ');
      if (!text) continue;
      if (fmt.bold) out.push('\\b ');
      if (fmt.italic) out.push('\\i ');
      if (fmt.underline) out.push('\\ul ');
      out.push(rtfEscape(text));
      if (fmt.underline) out.push('\\ulnone ');
      if (fmt.italic) out.push('\\i0 ');
      if (fmt.bold) out.push('\\b0 ');
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName;
    if (tag === 'BR') { out.push('\\line '); continue; }
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    const next = { ...fmt };
    if (tag === 'B' || tag === 'STRONG') next.bold = true;
    if (tag === 'I' || tag === 'EM') next.italic = true;
    if (tag === 'U') next.underline = true;
    rtfRuns(child, next, out);
  }
}

export function toRtf(html, options = {}) {
  const { font = 'Palatino Linotype', fontSize = 12, lineHeight = 1.6, marginIn = 1 } = options;
  const root = dom(html);
  const out = [];
  out.push('{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat');
  out.push(`{\\fonttbl{\\f0\\froman\\fcharset0 ${rtfEscape(font)};}{\\f1\\fswiss\\fcharset0 Segoe UI;}}`);
  out.push('{\\colortbl ;\\red23\\green26\\blue31;}');
  out.push('\\viewkind4\\uc1');
  const line = Math.round(lineHeight * 240);
  const left = Math.round(marginIn * 1440);

  const para = (children, extra = '') => {
    out.push(`\\pard\\plain\\f0\\fs${Math.round(fontSize * 2)}\\sl${line}\\slmult1\\li0\\ri0\\fi0\\sa180${extra} `);
    out.push(...children);
    out.push('\\par\n');
  };

  for (const node of root.children) {
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const size = Math.round(fontSize * 2 * (level === 1 ? 1.7 : level === 2 ? 1.4 : 1.15));
      const runs = [];
      rtfRuns(node, { bold: true }, runs);
      para(runs, `\\b\\fs${size}`);
      continue;
    }
    if (tag === 'UL' || tag === 'OL') {
      let i = 1;
      for (const li of node.children) {
        const runs = [];
        rtfRuns(li, {}, runs);
        para([rtfEscape(tag === 'OL' ? `${i}. ` : '\u2022  '), ...runs], `\\li${left / 2}\\fi-360`);
        i += 1;
      }
      continue;
    }
    if (tag === 'HR') { para([rtfEscape('* * *')], '\\qc'); continue; }
    if (tag === 'BLOCKQUOTE') {
      for (const p of node.children) {
        const runs = [];
        rtfRuns(p, { italic: true }, runs);
        para(runs, `\\li${left / 2}\\ri${left / 2}`);
      }
      continue;
    }
    if (tag === 'PRE') {
      for (const lineText of node.textContent.split('\n')) {
        para([`\\f1\\fs20 ${rtfEscape(lineText)}`]);
      }
      continue;
    }
    if (tag === 'IMG') { para([rtfEscape('[image]')], '\\qc'); continue; }
    if (tag === 'TABLE') {
      for (const tr of node.querySelectorAll('tr')) {
        const cells = [...tr.children].map((c) => c.textContent.trim()).join('  |  ');
        para([rtfEscape(cells)]);
      }
      continue;
    }
    const runs = [];
    rtfRuns(node, {}, runs);
    if (runs.length) para(runs);
  }
  out.push('}');
  return out.join('');
}

/* --------------------------- Standalone HTML ----------------------- */

const PAGE_CSS = (s) => `@page { size: ${s.pageSize === 'Letter' ? 'Letter' : 'A4'}; margin: ${s.marginIn}in; }
* { box-sizing: border-box; }
html { background: #f3f0e9; }
body {
  margin: 0; padding: 0;
  font-family: ${s.font}, Palatino, Georgia, "Times New Roman", serif;
  font-size: ${s.fontSize}pt; line-height: ${s.lineHeight}; color: #191b1f;
  ${s.justify ? 'text-align: justify; hyphens: auto;' : ''}
}
h1 { font-size: 2.1em; line-height: 1.18; margin: 0 0 0.7em; font-weight: 600; letter-spacing: -0.01em; page-break-after: avoid; }
h2 { font-size: 1.5em; margin: 1.4em 0 0.5em; font-weight: 600; page-break-after: avoid; }
h3 { font-size: 1.2em; margin: 1.2em 0 0.4em; font-weight: 600; page-break-after: avoid; }
p { margin: 0 0 ${s.spaceAfter}em; ${s.firstLineIndent ? `text-indent: ${s.firstLineIndent}in;` : ''} orphans: 2; widows: 2; }
blockquote { margin: 1.2em 1.6em; font-style: italic; }
ul, ol { margin: 0 0 1em 1.4em; padding: 0; }
li { margin: 0.2em 0; }
hr { border: 0; height: 1px; background: #c9c3b4; margin: 2em 3em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
td, th { border: 1px solid #c5bfb0; padding: 0.45em 0.6em; vertical-align: top; }
th { background: #f0ece2; }
img { max-width: 100%; height: auto; }
figure { margin: 1.4em 0; text-align: center; }
figcaption { font-size: 0.85em; color: #5c5a54; margin-top: 0.4em; }
.flect-subtitle { font-style: italic; color: #5d5a52; font-size: 1.1em; }
mark { background: #f7e6a8; }
a { color: #1d5fa8; }
pre { background: #f2efe7; padding: 0.9em; border-radius: 6px; overflow: auto; font-family: Consolas, monospace; font-size: 0.9em; }
code { font-family: Consolas, monospace; font-size: 0.92em; }
.flect-shape { text-align: center; margin: 1em 0; }
`;

export function buildHtmlDocument(html, s, meta = {}) {
  const title = (meta.title || 'Untitled').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<meta name="generator" content="FLECT"/>
<style>
${PAGE_CSS(s)}
body { background: #fff; padding: ${s.marginIn}in 0; }
.wrap { max-width: ${s.pageSize === 'Letter' ? '6.5in' : '6.27in'}; margin: 0 auto; }
</style>
</head>
<body><div class="wrap">
${html}
</div></body>
</html>`;
}

export function buildPrintHtml(html, s, meta = {}) {
  const title = (meta.title || 'Untitled').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
${PAGE_CSS(s)}
body { background: #fff; }
h1 { break-before: page; }
h1:first-child { break-before: avoid; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

export function wordStats(html) {
  const text = toPlainText(html || '').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter(Boolean).length : 0;
  const chars = text.length;
  return { words, chars, readMinutes: Math.max(1, Math.round(words / 230)) };
}
