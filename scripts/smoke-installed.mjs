/**
 * Smoke test for the *installed* application (not the source tree).
 * Verifies the packaged asar boots, the renderer paints, editing works and
 * the settings dialog opens. Usage: node scripts/smoke-installed.mjs "<path to FLECT.exe>"
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXE = process.argv[2];
const PORT = 9341;
const OUT = path.join(ROOT, '.smoke');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!EXE) {
  console.error('usage: node scripts/smoke-installed.mjs <FLECT.exe>');
  process.exit(2);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
const FILES = path.join(OUT, 'files');
await fs.mkdir(FILES, { recursive: true });
const SOURCE = path.join(ROOT, '.e2e', 'files');
try {
  await fs.cp(SOURCE, FILES, { recursive: true });
} catch {
  console.error(`no exported files at ${SOURCE}; run the e2e suite first`);
  process.exit(2);
}
const OPEN_POINTER = path.join(OUT, 'open.json');

const rows = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    rows.push({ name, ok: true, detail });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    rows.push({ name, ok: false, detail: err.message });
    console.log(`  FAIL  ${name} — ${err.message.split('\n')[0]}`);
  }
};

console.log(`launching ${EXE}`);
const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
  env: {
    ...process.env,
    FLECT_TEST_DIR: FILES,
    FLECT_TEST_OPEN_JSON: OPEN_POINTER,
  },
});
const stderr = [];
child.stderr.on('data', (d) => stderr.push(String(d)));

let browser;
let page;
const consoleErrors = [];

try {
  let up = false;
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) { up = true; break; }
    } catch { /* not yet */ }
    await sleep(250);
  }
  if (!up) throw new Error('devtools endpoint never opened');

  browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
    protocolTimeout: 120000,
  });
  const pages = await browser.pages();
  page = pages.find((p) => p.url().includes('index.html')) || pages[0];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await check('packaged window loads from app.asar', async () => {
    await page.waitForSelector('.ProseMirror', { timeout: 30000 });
    const url = page.url();
    if (!url.includes('app.asar')) throw new Error(`unexpected url ${url}`);
    return url.replace(/^.*app\.asar/, 'app.asar').slice(0, 60);
  });

  await check('chrome builds: title bar, toolbar, sidebar, status bar', async () => {
    for (const sel of ['.titlebar', '.tb-main', '.sidebar', '.statusbar', '.page']) {
      await page.waitForSelector(sel, { timeout: 8000 });
    }
    return 'all present';
  });

  await check('editing works in the installed build', async () => {
    const box = await page.$eval('.ProseMirror', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width };
    });
    await page.mouse.click(box.x + box.w / 2, box.y + 26);
    await page.keyboard.type('Installed build smoke test. The fog took the pier.', { delay: 4 });
    await sleep(600);
    const words = await page.$eval('.statusbar__num', (el) => el.textContent.trim());
    if (Number(words.replace(/,/g, '')) < 8) throw new Error(`word count ${words}`);
    return `${words} words`;
  });

  await check('settings dialog opens in the packaged renderer', async () => {
    await page.click('button[title="Settings (Ctrl+,)"]');
    await page.waitForSelector('.modal', { timeout: 8000 });
    const text = await page.$eval('.modal', (el) => el.innerText);
    if (!text.includes('AI provider')) throw new Error('dialog content missing');
    await page.keyboard.press('Escape');
    await sleep(300);
    return 'opens and closes';
  });

  for (const [name, ext] of [
    ['Untitled.md', 'MD'], ['Untitled.txt', 'TXT'], ['Untitled.html', 'HTML'],
    ['Untitled.rtf', 'RTF'], ['Untitled.docx', 'DOCX'], ['Untitled.flect', 'FLECT'],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await check(`packaged app opens ${name}`, async () => {
      await fs.writeFile(OPEN_POINTER, JSON.stringify({ path: path.join(FILES, name) }), 'utf8');
      await page.evaluate(() => {
        [...document.querySelectorAll('.menubar__btn')].find((b) => b.textContent.trim() === 'File').click();
      });
      await sleep(180);
      await page.evaluate(() => {
        const items = [...document.querySelectorAll('.ui-menu__item')];
        const open = items.find((i) => i.textContent.trim().startsWith('Open'));
        if (open) open.click();
      });
      await page.waitForFunction(
        (file) => document.querySelector('.titlebar__file')?.textContent.trim() === file,
        { timeout: 25000 },
        name,
      );
      await page.waitForFunction(
        () => (document.querySelector('.ProseMirror')?.innerText.trim().length || 0) > 10,
        { timeout: 15000 },
      );
      const chip = await page.$eval('.statusbar__format', (el) => el.textContent.trim());
      if (chip !== ext) throw new Error(`format chip ${chip}, expected ${ext}`);
      const toast = await page.evaluate(() => [...document.querySelectorAll('.toast__title')].map((t) => t.textContent).join(' | '));
      if (/Could not open/i.test(toast)) throw new Error(toast);
      return `chip ${chip}`;
    });
  }

  await check('no renderer errors on boot', async () => {
    if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 2).join(' | '));
    return 'clean console';
  });

  await page.screenshot({ path: path.join(OUT, 'installed.png') });
} catch (err) {
  rows.push({ name: 'smoke run', ok: false, detail: err.message });
  console.log(`  FAIL  smoke run — ${err.message}`);
} finally {
  try { await page?.evaluate(() => window.flect?.app?.forceClose()); } catch { /* ignore */ }
  await sleep(800);
  try { child.kill(); } catch { /* ignore */ }
  if (stderr.length) {
    const noise = stderr.join('').split('\n').filter((l) => l && !/DevTools listening/.test(l));
    if (noise.length) console.log(`\napp stderr:\n${noise.slice(0, 6).join('\n')}`);
  }
}

const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 2)).catch(() => {});
process.exit(failed ? 1 : 0);
