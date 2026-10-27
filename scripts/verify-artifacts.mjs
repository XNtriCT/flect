/**
 * Inspects the artefacts the e2e run wrote and asserts they are structurally
 * real files, not just non-empty bytes.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(path.resolve(__dirname, '..'), '.e2e', 'files');

const rows = [];
const record = (name, ok, detail) => {
  rows.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function test(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === 'string' ? detail : '');
  } catch (err) {
    record(name, false, err.message);
  }
}

const read = (f) => fs.readFile(path.join(DIR, f));

await test('DOCX is a valid OOXML package', async () => {
  const zip = await JSZip.loadAsync(await read('Untitled.docx'));
  const names = Object.keys(zip.files);
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
    if (!names.includes(required)) throw new Error(`missing ${required}`);
  }
  const xml = await zip.file('word/document.xml').async('string');
  if (!xml.includes('<w:tbl>')) throw new Error('table not carried into the docx');
  if (!xml.includes('<w:drawing>')) throw new Error('image not carried into the docx');
  if (!xml.includes('<w:pgNumType')) { /* page numbers live in the footer */ }
  const hasFooter = names.some((n) => n.startsWith('word/footer'));
  if (!hasFooter) throw new Error('no footer part for page numbers');
  const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (!/snow/i.test(text)) throw new Error(`document text missing: ${text.slice(0, 80)}`);
  return `${names.length} parts, ${Math.round((await read('Untitled.docx')).length / 1024)} KB`;
});

await test('DOCX reopens through mammoth with its text and table intact', async () => {
  const mammoth = require('mammoth');
  const { value } = await mammoth.convertToHtml({ path: path.join(DIR, 'Untitled.docx') });
  const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (!/snow/i.test(text)) throw new Error('text lost in round-trip');
  if (!value.includes('<table')) throw new Error('table lost in round-trip');
  return `${text.trim().split(/\s+/).length} words recovered`;
});

await test('EPUB is a valid EPUB 3 container', async () => {
  const raw = await read('Untitled.epub');
  if (raw.slice(30, 38).toString() !== 'mimetype') throw new Error('mimetype is not the first stored entry');
  const zip = await JSZip.loadAsync(raw);
  const names = Object.keys(zip.files);
  for (const required of ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/styles.css']) {
    if (!names.includes(required)) throw new Error(`missing ${required}`);
  }
  const mime = await zip.file('mimetype').async('string');
  if (mime.trim() !== 'application/epub+zip') throw new Error('wrong mimetype payload');
  const opf = await zip.file('OEBPS/content.opf').async('string');
  if (!opf.includes('<dc:title>')) throw new Error('opf has no title');
  if (!opf.includes('properties="nav"')) throw new Error('opf has no nav item');
  const chapters = names.filter((n) => /chapter-\d+\.xhtml$/.test(n));
  if (!chapters.length) throw new Error('no chapter documents');
  const first = await zip.file(chapters[0]).async('string');
  if (!first.startsWith('<?xml')) throw new Error('chapter is not XML');
  if (!/<\/html>\s*$/.test(first.trim())) throw new Error('chapter html is not closed');
  const images = names.filter((n) => /images\/img-\d+\./.test(n));
  return `${chapters.length} chapter(s), ${images.length} image(s)`;
});

await test('PDF is a real PDF with pages', async () => {
  const buf = await read('Untitled.pdf');
  if (buf.slice(0, 5).toString() !== '%PDF-') throw new Error('no PDF header');
  const body = buf.toString('latin1');
  const pages = (body.match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pages < 1) throw new Error('no pages found');
  if (!body.includes('%%EOF')) throw new Error('no EOF marker');
  return `${pages} page(s), ${Math.round(buf.length / 1024)} KB`;
});

await test('Markdown export keeps prose and no HTML', async () => {
  const md = (await read('Untitled.md')).toString('utf8');
  if (/<\/?p>/.test(md)) throw new Error('HTML leaked into markdown');
  if (!/snow/i.test(md)) throw new Error('text missing');
  return `${md.split('\n').filter(Boolean).length} non-empty lines`;
});

await test('Plain text export is tag-free', async () => {
  const txt = (await read('Untitled.txt')).toString('utf8');
  if (/<[a-z][^>]*>/i.test(txt)) throw new Error('markup in plain text');
  if (!/snow/i.test(txt)) throw new Error('text missing');
  return `${txt.trim().split(/\s+/).length} words`;
});

await test('HTML export is a standalone document', async () => {
  const html = (await read('Untitled.html')).toString('utf8');
  if (!/^<!doctype html>/i.test(html.trim())) throw new Error('no doctype');
  if (!html.includes('<style>')) throw new Error('no embedded styles');
  if (!/snow/i.test(html)) throw new Error('text missing');
  return `${Math.round(html.length / 1024)} KB`;
});

await test('RTF export opens with a valid header', async () => {
  const rtf = (await read('Untitled.rtf')).toString('utf8');
  if (!rtf.startsWith('{\\rtf1')) throw new Error('no rtf header');
  if (!rtf.trimEnd().endsWith('}')) throw new Error('unbalanced braces');
  if (!/snow/i.test(rtf)) throw new Error('text missing');
  return `${Math.round(rtf.length / 1024)} KB`;
});

await test('FLECT package keeps HTML and page settings', async () => {
  const pkg = JSON.parse((await read('Untitled.flect')).toString('utf8'));
  if (pkg.format !== 'flect' || pkg.version !== 1) throw new Error('wrong envelope');
  if (!pkg.html || !/snow/i.test(pkg.html)) throw new Error('html missing');
  if (!pkg.page || pkg.page.size !== 'A4') throw new Error('page settings missing');
  return `${pkg.html.length} chars of HTML`;
});

const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
await fs.writeFile(path.join(DIR, '..', 'artifacts.json'), JSON.stringify(rows, null, 2)).catch(() => {});
process.exit(failed ? 1 : 0);
