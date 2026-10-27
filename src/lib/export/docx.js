import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
  ExternalHyperlink, ShadingType, Footer, PageNumber, LevelFormat,
  convertInchesToTwip, TabStopType,
} from 'docx';

/* ------------------------------------------------------------------ *
 * HTML → DOCX
 * A DOM walk that keeps what writers actually care about: paragraphs,
 * headings, emphasis, colour, alignment, lists, tables, images, quotes.
 * ------------------------------------------------------------------ */

const HEADINGS = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
};

const FONT_FALLBACK = 'Palatino Linotype';

function parseStyle(el) {
  const raw = el.getAttribute && el.getAttribute('style');
  const out = {};
  if (!raw) return out;
  for (const chunk of raw.split(';')) {
    const i = chunk.indexOf(':');
    if (i < 0) continue;
    const k = chunk.slice(0, i).trim().toLowerCase();
    const v = chunk.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function toHex(color) {
  if (!color) return undefined;
  const c = String(color).trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    const [, a, b, d] = c;
    return (a + a + b + b + d + d).toUpperCase();
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (m) {
    return [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return undefined;
}

function halfPoints(size) {
  if (!size) return undefined;
  const s = String(size).trim();
  let pt = 0;
  if (/pt$/i.test(s)) pt = parseFloat(s);
  else if (/px$/i.test(s)) pt = parseFloat(s) * 0.75;
  else if (/em$/i.test(s)) pt = parseFloat(s) * 12;
  else if (/rem$/i.test(s)) pt = parseFloat(s) * 12;
  else pt = parseFloat(s);
  if (!Number.isFinite(pt) || pt <= 0) return undefined;
  return Math.round(pt * 2);
}

function firstFont(family) {
  if (!family) return undefined;
  const f = String(family).split(',')[0].replace(/["']/g, '').trim();
  return f || undefined;
}

function alignOf(style) {
  const t = (style['text-align'] || '').toLowerCase();
  if (t === 'center') return AlignmentType.CENTER;
  if (t === 'right') return AlignmentType.RIGHT;
  if (t === 'justify') return AlignmentType.JUSTIFIED;
  return undefined;
}

function imageInfo(img) {
  const src = img.getAttribute('src') || '';
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(src);
  if (!m) return null;
  let kind = m[1].toLowerCase();
  if (kind === 'jpg') kind = 'jpeg';
  if (!['png', 'jpeg', 'gif', 'bmp', 'svg'].includes(kind)) kind = 'png';
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const style = parseStyle(img);
  let width = parseInt(img.getAttribute('width') || '', 10) || parseFloat(style.width) || 0;
  let height = parseInt(img.getAttribute('height') || '', 10) || parseFloat(style.height) || 0;
  if (!width && !height) { width = 420; height = 300; }
  if (!width) width = Math.round(height * 1.4);
  if (!height) height = Math.round(width * 0.72);
  const max = 560;
  if (width > max) { height = Math.round(height * (max / width)); width = max; }
  return { data: bytes, type: kind === 'jpg' ? 'jpg' : kind, width, height };
}

function inlineRuns(node, inherited = {}) {
  const runs = [];
  const walk = (n, fmt) => {
    if (n.nodeType === 3) {
      const text = n.nodeValue.replace(/\u00a0/g, ' ').replace(/[\r\n\t]+/g, ' ');
      if (text) {
        runs.push(new TextRun({
          text,
          bold: fmt.bold || undefined,
          italics: fmt.italics || undefined,
          underline: fmt.underline ? {} : undefined,
          strike: fmt.strike || undefined,
          color: fmt.color,
          size: fmt.size,
          font: fmt.font,
          shading: fmt.highlight
            ? { type: ShadingType.CLEAR, fill: fmt.highlight, color: 'auto' }
            : undefined,
        }));
      }
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') {
      runs.push(new TextRun({ text: '', break: 1 }));
      return;
    }
    if (tag === 'SCRIPT' || tag === 'STYLE') return;

    const style = parseStyle(n);
    const next = { ...fmt };
    if (tag === 'STRONG' || tag === 'B') next.bold = true;
    if (tag === 'EM' || tag === 'I') next.italics = true;
    if (tag === 'U') next.underline = true;
    if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') next.strike = true;
    if (tag === 'MARK' || style['background-color']) {
      const hex = toHex(style['background-color']);
      if (hex) next.highlight = hex;
    }
    if (tag === 'CODE') { next.font = 'Consolas'; next.size = next.size || 20; }
    if (tag === 'SUP' || tag === 'SUB') next.size = next.size || 20;
    if (style.color) next.color = toHex(style.color);
    if (style['font-size']) next.size = halfPoints(style['font-size']) || next.size;
    if (style['font-family']) next.font = firstFont(style['font-family']) || next.font;
    if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      const inner = [];
      const before = runs.length;
      for (const child of n.childNodes) walk(child, { ...next, underline: true, color: next.color || '1F5FA8' });
      const made = runs.splice(before);
      if (/^https?:/i.test(href) && made.length) {
        runs.push(new ExternalHyperlink({ link: href, children: made }));
      } else {
        runs.push(...(made.length ? made : []));
      }
      return;
    }
    for (const child of n.childNodes) walk(child, next);
  };
  for (const child of node.childNodes) walk(child, inherited);
  return runs.length ? runs : [new TextRun({ text: '' })];
}

function paragraphFrom(node, opts, extra = {}) {
  const style = parseStyle(node);
  const alignment = alignOf(style) || extra.alignment;
  const spacing = { ...(opts.spacing || {}) };
  if (style['line-height']) {
    const lh = parseFloat(style['line-height']);
    if (Number.isFinite(lh) && lh > 0) spacing.line = Math.round(lh * 240);
  }
  if (style['margin-top'] || style['margin-bottom']) {
    const mt = parseFloat(style['margin-top']);
    const mb = parseFloat(style['margin-bottom']);
    if (Number.isFinite(mt)) spacing.before = Math.round(mt * 15);
    if (Number.isFinite(mb)) spacing.after = Math.round(mb * 15);
  }
  const indent = { ...(opts.indent || {}) };
  if (style['text-indent']) {
    const ti = parseFloat(style['text-indent']);
    if (Number.isFinite(ti)) indent.firstLine = Math.round(ti * 15);
  }
  return new Paragraph({
    children: inlineRuns(node, opts.baseFormat || {}),
    heading: extra.heading,
    alignment: alignment || undefined,
    spacing,
    indent: Object.keys(indent).length ? indent : undefined,
    bullet: extra.bullet,
    numbering: extra.numbering,
    border: extra.border,
    pageBreakBefore: extra.pageBreakBefore,
  });
}

function listItems(listEl, opts, level, ordered) {
  const out = [];
  let index = 1;
  for (const li of listEl.children) {
    if (li.tagName !== 'LI') continue;
    const nested = [...li.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    const clone = li.cloneNode(true);
    for (const n of [...clone.children]) {
      if (n.tagName === 'UL' || n.tagName === 'OL') n.remove();
    }
    const para = paragraphFrom(clone, opts, ordered
      ? { numbering: { reference: 'flect-ordered', level } }
      : { bullet: { level } });
    out.push(para);
    for (const sub of nested) {
      out.push(...listItems(sub, opts, Math.min(level + 1, 5), sub.tagName === 'OL'));
    }
    index += 1;
  }
  return out;
}

function tableFrom(node, opts) {
  const rows = [];
  for (const tr of node.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of tr.children) {
      if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
      const paras = [];
      const blocks = [...cell.children].filter((c) => /^(P|H[1-6]|BLOCKQUOTE|UL|OL)$/.test(c.tagName));
      if (blocks.length) {
        for (const b of blocks) {
          if (b.tagName === 'UL' || b.tagName === 'OL') paras.push(...listItems(b, opts, 0, b.tagName === 'OL'));
          else paras.push(paragraphFrom(b, opts));
        }
      } else {
        paras.push(new Paragraph({ children: inlineRuns(cell, opts.baseFormat || {}) }));
      }
      cells.push(new TableCell({
        children: paras,
        shading: cell.tagName === 'TH'
          ? { type: ShadingType.CLEAR, fill: 'F1EFE7', color: 'auto' }
          : undefined,
        margins: { top: 90, bottom: 90, left: 120, right: 120 },
      }));
    }
    if (cells.length) rows.push(new TableRow({ children: cells }));
  }
  if (!rows.length) return null;
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'BFB9AB' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFB9AB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'BFB9AB' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'BFB9AB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'D8D3C6' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'D8D3C6' },
    },
  });
}

function imageParagraph(img, opts) {
  const info = imageInfo(img);
  if (!info) return null;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [
      new ImageRun({
        data: info.data,
        transformation: { width: info.width, height: info.height },
        type: info.type === 'jpg' ? 'jpg' : info.type,
      }),
    ],
  });
}

function blocksFrom(root, opts) {
  const out = [];
  const push = (x) => { if (x) out.push(x); };

  for (const node of root.children) {
    const tag = node.tagName;
    if (!tag) continue;
    if (/^H[1-6]$/.test(tag)) {
      push(paragraphFrom(node, opts, { heading: HEADINGS[tag] }));
      continue;
    }
    if (tag === 'P') { push(paragraphFrom(node, opts)); continue; }
    if (tag === 'BLOCKQUOTE') {
      for (const child of node.children) {
        if (child.tagName === 'P') {
          push(new Paragraph({
            children: inlineRuns(child, { ...(opts.baseFormat || {}), italics: true }),
            indent: { left: 567, right: 567 },
            spacing: { ...(opts.spacing || {}), before: 120, after: 120 },
          }));
        } else {
          push(new Paragraph({
            children: inlineRuns(child, { ...(opts.baseFormat || {}), italics: true }),
            indent: { left: 567, right: 567 },
            spacing: { ...(opts.spacing || {}), before: 120, after: 120 },
          }));
        }
      }
      continue;
    }
    if (tag === 'UL' || tag === 'OL') {
      out.push(...listItems(node, opts, 0, tag === 'OL'));
      continue;
    }
    if (tag === 'PRE') {
      const text = node.textContent || '';
      for (const line of text.split('\n')) {
        push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })],
          shading: { type: ShadingType.CLEAR, fill: 'F4F2EC', color: 'auto' },
          spacing: { line: 240, before: 0, after: 0 },
        }));
      }
      continue;
    }
    if (tag === 'HR') {
      push(new Paragraph({
        text: '',
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9C2B2', space: 1 } },
        spacing: { before: 240, after: 240 },
      }));
      continue;
    }
    if (tag === 'TABLE') { push(tableFrom(node, opts)); continue; }
    if (tag === 'IMG') {
      const p = imageParagraph(node, opts);
      if (p) out.push(p);
      continue;
    }
    if (tag === 'FIGURE') {
      const img = node.querySelector('img');
      if (img) { const p = imageParagraph(img, opts); if (p) out.push(p); }
      const cap = node.querySelector('figcaption');
      if (cap) push(paragraphFrom(cap, opts, { alignment: AlignmentType.CENTER }));
      continue;
    }
    // generic container: recurse
    if (node.children.length) out.push(...blocksFrom(node, opts));
  }
  return out;
}

export async function buildDocx(html, options = {}) {
  const {
    title = 'Untitled', pageSize = 'A4', marginIn = 1, font = FONT_FALLBACK,
    fontSize = 12, lineHeight = 1.65, firstLineIndent = 0, spaceAfter = 0,
  } = options;

  const dom = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = dom.getElementById('root');

  const opts = {
    spacing: { line: Math.round(lineHeight * 240), after: Math.round(spaceAfter * 240), before: 0 },
    indent: firstLineIndent > 0 ? { firstLine: Math.round(firstLineIndent * 1440) } : {},
    baseFormat: { font, size: Math.round(fontSize * 2) },
  };

  const children = blocksFrom(root, opts);
  if (!children.length) children.push(new Paragraph({ text: '' }));

  const pageDims = pageSize === 'Letter'
    ? { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) }
    : { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) };

  const m = Math.round(marginIn * 1440);

  const doc = new Document({
    creator: 'FLECT',
    title,
    description: 'Written in FLECT',
    styles: {
      default: {
        document: {
          run: { font, size: Math.round(fontSize * 2), color: '171A1F' },
          paragraph: { spacing: { line: Math.round(lineHeight * 240) } },
        },
        heading1: {
          run: { font, size: Math.round(fontSize * 2.6), bold: true, color: '14202F' },
          paragraph: { spacing: { before: 360, after: 180 } },
        },
        heading2: {
          run: { font, size: Math.round(fontSize * 1.9), bold: true, color: '14202F' },
          paragraph: { spacing: { before: 300, after: 140 } },
        },
        heading3: {
          run: { font, size: Math.round(fontSize * 1.45), bold: true, color: '233043' },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'flect-ordered',
          levels: [0, 1, 2, 3, 4, 5].map((lvl) => ({
            level: lvl,
            format: LevelFormat.DECIMAL,
            text: `%${lvl + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: { indent: { left: 720 + lvl * 360, hanging: 360 } },
              run: { font, size: Math.round(fontSize * 2) },
            },
          })),
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: pageDims.width, height: pageDims.height },
          margin: { top: m, right: m, bottom: m, left: m },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ children: [PageNumber.CURRENT], font, size: 18, color: '8A8578' }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const buf = new Uint8Array(await blob.arrayBuffer());
  return buf;
}
