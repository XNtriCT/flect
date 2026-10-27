/**
 * FLECT end-to-end harness.
 *
 * Boots the real packaged-style build (dist/) inside Electron with a mock
 * OpenAI-compatible streaming server, drives the genuine UI with Puppeteer,
 * and writes artefacts into a scratch directory for inspection.
 *
 * Run:  node scripts/e2e.mjs [--keep] [--stage=basics|ai|files|all]
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.e2e');
const SHOTS = path.join(OUT, 'shots');
const PORT = 8799;
const DEBUG_PORT = 9333;

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : (process.argv.includes(`--${name}`) ? true : fallback);
};
const STAGE = arg('stage', 'all');

const results = [];
let page;
const consoleErrors = [];

function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    ok(name, typeof detail === 'string' ? detail : '');
    return true;
  } catch (err) {
    fail(name, err.message.split('\n')[0]);
    // leave no modal, menu or popup open, so one failure cannot cascade
    try {
      for (let i = 0; i < 3; i += 1) {
        await page.keyboard.press('Escape');
        await sleep(90);
      }
      await page.evaluate(() => {
        document.querySelectorAll('.modal-scrim, .ai-scrim').forEach((n) => n.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true }),
        ));
      });
      await sleep(200);
    } catch { /* ignore */ }
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click into the sheet without hitting the welcome card that floats over it. */
async function focusPage() {
  await page.evaluate(() => {
    const s = document.querySelector('.stage__scroll');
    if (s) s.scrollTop = 0;
  });
  await sleep(80);
  const box = await page.$eval('.ProseMirror', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width };
  });
  await page.mouse.click(box.x + box.w / 2, box.y + 26);
  await sleep(140);
}

/* ------------------------------------------------------------------ */
/* mock provider                                                      */
/* ------------------------------------------------------------------ */

const REPHRASED = [
  'Rain came at the glass in long, deliberate sheets.',
  'The rain worked the window in slow, heavy drapes.',
  'Outside, rain arrived in sheets and stayed.',
  'Sheets of rain moved across the glass, unhurried.',
  'The glass took the rain in long, patient waves.',
];

function replyFor(body, shape = 'chat') {
  let user = '';
  if (shape === 'responses') {
    user = (body.input || []).flatMap((i) => (Array.isArray(i.content) ? i.content : []))
      .map((c) => c.text || '').join('\n');
    user = `${body.instructions || ''}\n${user}`;
  } else {
    user = (body.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    if (body.system) user = `${body.system}\n${user}`;
  }
  if (/five different ways/i.test(user)) {
    return REPHRASED.map((line, i) => `${i + 1}. ${line}`).join('\n\n');
  }
  if (/correct grammatical errors/i.test(user)) {
    return 'The rain fell on the glass, and the room stayed quiet. She turned the page.';
  }
  if (/repair the punctuation/i.test(user)) {
    // Deliberately leaves an em dash so the client-side sweep is exercised.
    return 'The rain fell — hard and steady — and the room stayed quiet; she turned the page.';
  }
  if (/split the overlong/i.test(user)) {
    return 'The rain fell on the glass. It came hard and steady, and the room stayed quiet. She turned the page.';
  }
  const instruction = /INSTRUCTION:\n"""([\s\S]*?)"""/.exec(user)?.[1]?.trim() || 'edited';
  return `Custom pass applied: ${instruction}. The rain kept on the glass.`;
}

const mockStats = { paths: [], sessions: new Set(), agents: new Set(), missingSession: 0, missingAgent: 0, lastUser: '', emptyAttempts: 0 };

function sse(res, frames) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  return {
    async send(shape, text) {
      for (const chunk of text.split(/(\s+)/)) {
        if (shape === 'messages') {
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`);
        } else if (shape === 'responses') {
          res.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: chunk })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
        }
        await sleep(4);
      }
      if (shape === 'messages') res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      else res.write('data: [DONE]\n\n');
      res.end();
    },
  };
}

function startMock() {
  const server = http.createServer((req, res) => {
    const session = req.headers['x-opencode-session'];
    const agent = String(req.headers['user-agent'] || '');

    if (req.url === '/__log') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        paths: mockStats.paths,
        sessions: [...mockStats.sessions],
        agents: [...mockStats.agents],
        missingSession: mockStats.missingSession,
        missingAgent: mockStats.missingAgent,
        lastUser: mockStats.lastUser,
        emptyAttempts: mockStats.emptyAttempts,
      }));
      return;
    }

    mockStats.paths.push(req.url.split('?')[0]);

    // Mirror OpenCode Go: a request without the session header cannot be routed.
    if (!session) {
      mockStats.missingSession += 1;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { message: 'Request is missing x-opencode-session and cannot be routed efficiently.' },
      }));
      return;
    }
    mockStats.sessions.add(String(session));
    mockStats.agents.add(agent);
    if (!/^FLECT\//.test(agent)) mockStats.missingAgent += 1;

    if (req.method === 'GET' && req.url.includes('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { id: 'mock-writer' }, { id: 'mock-editor' },
          { id: 'qwen3.8-max' }, { id: 'gpt-6-luna' }, { id: 'kimi-k3' },
          { id: 'mock-empty-then-good' },
        ],
      }));
      return;
    }

    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', async () => {
        let body = {};
        try { body = JSON.parse(raw); } catch { /* ignore */ }
        const shape = req.url.includes('/messages') ? 'messages'
          : req.url.includes('/responses') ? 'responses' : 'chat';
        mockStats.lastUser = shape === 'responses'
          ? (body.input || []).flatMap((i) => (Array.isArray(i.content) ? i.content : [])).map((c) => c.text || '').join('\n')
          : (body.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
        if (body.model === 'mock-empty-then-good') {
          mockStats.emptyAttempts += 1;
          if (mockStats.emptyAttempts === 1) {
            // spend the whole budget "thinking" and return no prose at all
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            for (const bit of ['Considering', ' the', ' line']) {
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: bit } }] })}\n\n`);
              await sleep(5);
            }
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        }
        const text = replyFor(body, shape);
        const stream = sse(res);
        await stream.send(shape, text);
      });
      return;
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', (err) => reject(new Error(`mock provider could not bind :${PORT} — ${err.message}`)));
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

/* ------------------------------------------------------------------ */
/* boot                                                               */
/* ------------------------------------------------------------------ */

async function waitForDevtools() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('DevTools endpoint never came up');
}

async function connect() {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: null,
    protocolTimeout: 120000,
  });
  const pages = await browser.pages();
  const target = pages.find((p) => p.url().includes('index.html')) || pages[0];
  target.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  target.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  await target.waitForSelector('.ProseMirror', { timeout: 25000 });
  await sleep(700);
  return { browser, page: target };
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                         */
/* ------------------------------------------------------------------ */

const editorText = () => page.$eval('.ProseMirror', (el) => el.innerText.replace(/\s+/g, ' ').trim());
const wordCount = () => page.$eval('.statusbar__num', (el) => el.textContent.trim());

async function selectAll() {
  await focusPage();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await sleep(120);
}

async function pressAI(key) {
  await page.keyboard.press(`Key${key.toUpperCase()}`);
  try {
    await page.waitForSelector('.ai-pop', { timeout: 20000 });
  } catch (err) {
    const diag = await page.evaluate(() => {
      const ed = window.__flectEditor;
      return {
        modal: !!document.querySelector('.modal'),
        pop: !!document.querySelector('.ai-pop'),
        textLen: document.querySelector('.ProseMirror')?.innerText.length ?? -1,
        selEmpty: ed ? ed.state.selection.empty : 'no-editor',
        selSize: ed ? ed.state.selection.to - ed.state.selection.from : -1,
        active: document.activeElement?.className || document.activeElement?.tagName,
        toasts: [...document.querySelectorAll('.toast__title')].map((t) => t.textContent).join(' | '),
      };
    });
    throw new Error(`${err.message.split('\n')[0]} :: ${JSON.stringify(diag)}`);
  }
}

async function closePopup() {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.ai-pop'), { timeout: 8000 });
}

async function clickMenuItem(label) {
  const clicked = await page.evaluate((text) => {
    const items = [...document.querySelectorAll('.ui-menu__item, .ui-menu button')];
    const hit = items.find((b) => b.textContent.trim().startsWith(text));
    if (hit) { hit.click(); return true; }
    return false;
  }, label);
  if (!clicked) throw new Error(`menu item "${label}" not found`);
  await sleep(250);
}

async function openMenu(label) {
  const clicked = await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('.menubar__btn')].find((b) => b.textContent.trim() === name);
    if (btn) { btn.click(); return true; }
    return false;
  }, label);
  if (!clicked) throw new Error(`menu "${label}" not found`);
  await sleep(180);
}

async function shot(name) {
  // Screenshots are evidence, not assertions: never let a slow compositor
  // fail the suite. Two attempts, then move on.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.bringToFront();
      await sleep(150);
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`), captureBeyondViewport: false });
      return;
    } catch (err) {
      if (attempt === 1) console.log(`  (screenshot ${name} skipped: ${err.message.split('\n')[0]})`);
      await sleep(500);
    }
  }
}

async function setField(labelText, optionText) {
  const opened = await page.evaluate((label) => {
    const field = [...document.querySelectorAll('.ui-field')]
      .find((f) => f.querySelector('.ui-field__label')?.textContent.trim().toLowerCase().startsWith(label.toLowerCase()));
    const btn = field?.querySelector('.ui-select__btn');
    if (!btn) return false;
    btn.click();
    return true;
  }, labelText);
  if (!opened) throw new Error(`field "${labelText}" has no select`);
  await sleep(220);
  const picked = await page.evaluate((opt) => {
    const item = [...document.querySelectorAll('.ui-select__menu .ui-menu__item')]
      .find((i) => i.textContent.trim().toLowerCase().startsWith(opt.toLowerCase()));
    if (!item) return false;
    item.click();
    return true;
  }, optionText);
  if (!picked) throw new Error(`option "${optionText}" not offered`);
  await sleep(200);
}

async function configureAI({ model, shape }) {
  await page.click('button[title="Settings (Ctrl+,)"]');
  await page.waitForSelector('.modal', { timeout: 8000 });
  await page.evaluate(() => {
    [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Fetch models')).click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('models found'), { timeout: 15000 });
  if (shape) await setField('API shape', shape);
  if (model) await setField('Model', model);
  await page.evaluate(() => {
    [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Save settings')).click();
  });
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 8000 });
  await sleep(250);
}

async function mockLog() {
  const res = await fetch(`http://127.0.0.1:${PORT}/__log`);
  return res.json();
}

async function openViaPointer(filePath) {
  await fs.writeFile(path.join(OUT, 'open.json'), JSON.stringify({ path: filePath }), 'utf8');
  await openMenu('File');
  await clickMenuItem('Open');
}

async function openSaveAsDialog() {
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyS');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.waitForSelector('.export-grid', { timeout: 8000 });
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

let server;
let child;

try {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  await fs.mkdir(path.join(OUT, 'files'), { recursive: true });

  server = await startMock();
  console.log(`mock provider on :${PORT}`);

  const seedPath = path.join(OUT, 'files', 'Seed.md');
  await fs.writeFile(seedPath, [
    '# The Lamplighter',
    '',
    'The harbour smelled of tar and cold iron. Mara counted the boats twice.',
    '',
    '## Chapter Two',
    '',
    'By morning the fog had taken the pier, and the bell rang for nobody.',
    '',
  ].join('\n'), 'utf8');

  child = spawn(
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['.', `--remote-debugging-port=${DEBUG_PORT}`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FLECT_TEST_DIR: path.join(OUT, 'files'),
        FLECT_TEST_OPEN: JSON.stringify([seedPath]),
        FLECT_TEST_OPEN_JSON: path.join(OUT, 'open.json'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  await waitForDevtools();
  ({ page } = await connect());
  console.log('connected to renderer\n');

  /* ---------------------------- shell ---------------------------- */
  await check('window renders with title bar, toolbar and page', async () => {
    await page.waitForSelector('.titlebar', { timeout: 10000 });
    await page.waitForSelector('.toolbar .tb-ai', { timeout: 10000 });
    await page.waitForSelector('.page .ProseMirror', { timeout: 10000 });
    const size = await page.$eval('.page', (el) => el.getBoundingClientRect().width);
    if (size < 700) throw new Error(`page width ${size}`);
    return `${Math.round(size)}px sheet`;
  });

  await shot('01-empty');

  await check('welcome card shows on the empty page', async () => {
    await page.waitForSelector('.welcome__card', { timeout: 5000 });
    return 'shown';
  });

  await check('File > Open loads a Markdown manuscript', async () => {
    await openMenu('File');
    await clickMenuItem('Open');
    await page.waitForFunction(
      () => document.querySelector('.ProseMirror h1')?.innerText.includes('Lamplighter'),
      { timeout: 20000 },
    );
    const name = await page.$eval('.titlebar__file', (el) => el.textContent);
    if (!name.includes('Seed.md')) throw new Error(`title bar shows "${name}"`);
    const outline = await page.$$eval('.outline__item', (els) => els.length);
    return `${name}, ${outline} outline entries`;
  });

  await check('New document resets to a blank page', async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('.menubar__btn')].find((b) => b.textContent.trim() === 'File').click();
    });
    await sleep(150);
    await clickMenuItem('New document');
    await page.waitForFunction(
      () => document.querySelector('.ProseMirror').innerText.trim() === '',
      { timeout: 8000 },
    );
    const name = await page.$eval('.titlebar__file', (el) => el.textContent);
    if (!name.includes('Untitled')) throw new Error(`title bar shows "${name}"`);
    return 'blank';
  });

  /* ---------------------------- typing --------------------------- */
  const PARA = 'The rain fell on the window. She turned the page and waited for the room to settle.';

  await check('typing into the page updates the word count', async () => {
    await focusPage();
    await page.keyboard.type(PARA, { delay: 12 });
    await sleep(700);
    const words = await wordCount();
    if (Number(words.replace(/,/g, '')) < 10) throw new Error(`word count ${words}`);
    if (!(await page.$('.welcome__card')) === false) throw new Error('welcome card still visible');
    return `${words} words`;
  });

  await check('placeholder and welcome overlay clear once text exists', async () => {
    const welcome = await page.$('.welcome__card');
    if (welcome) throw new Error('welcome card should be gone');
    return 'cleared';
  });

  await check('bold button applies a real mark', async () => {
    await focusPage();
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.click('button[title="Bold (Ctrl+B)"]');
    const strongs = await page.$$eval('.ProseMirror strong', (n) => n.length);
    if (!strongs) throw new Error('no <strong> produced');
    await page.click('button[title="Bold (Ctrl+B)"]');
    return `${strongs} run(s)`;
  });

  /* --------------------------- settings -------------------------- */
  await check('AI provider can be configured through the settings dialog', async () => {
    await page.click('button[title="Settings (Ctrl+,)"]');
    await page.waitForSelector('.modal', { timeout: 8000 });
    await page.evaluate((url) => {
      const input = document.querySelector('input[placeholder="https://api.openai.com/v1"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, url);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, `http://127.0.0.1:${PORT}/v1`);
    await sleep(120);
    await page.type('input[placeholder^="sk-"]', 'test-key', { delay: 2 });
    const values = await page.evaluate(() => [...document.querySelectorAll('.modal input')].map((i) => i.value));
    await page.evaluate(() => {
      [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Fetch models')).click();
    });
    try {
      await page.waitForFunction(() => document.body.innerText.includes('models found'), { timeout: 10000 });
    } catch {
      const hints = await page.evaluate(() => [...document.querySelectorAll('.ui-field__hint')]
        .map((n) => n.textContent).join(' | '));
      throw new Error(`fetch did not return: values=${JSON.stringify(values)} hints=${hints}`);
    }
    const modelBtn = await page.$('.form .ui-select__btn');
    if (modelBtn) {
      await modelBtn.click();
      await sleep(200);
      await clickMenuItem('mock-writer');
    }
    await page.evaluate(() => {
      [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Save settings')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 8000 });
    const chip = await page.$eval('.statusbar__model', (el) => el.textContent.trim());
    if (!chip.includes('mock')) throw new Error(`status chip says "${chip}"`);
    return chip;
  });

  /* ------------------------------ AI ----------------------------- */
  await check('R opens five distinct alternatives', async () => {
    await selectAll();
    await pressAI('R');
    await page.waitForFunction(() => document.querySelectorAll('.ai-alt').length >= 3, { timeout: 20000 });
    const alts = await page.$$eval('.ai-alt__text', (els) => els.map((e) => e.textContent.trim()));
    if (alts.length !== 5) throw new Error(`got ${alts.length} alternatives`);
    if (new Set(alts).size !== 5) throw new Error('alternatives are not distinct');
    await shot('02-rephrase');
    return `5 alternatives, ${alts[0].slice(0, 32)}…`;
  });

  await check('choosing an alternative replaces the selection', async () => {
    const before = await editorText();
    await page.click('.ai-alt');
    await page.waitForFunction(() => !document.querySelector('.ai-pop'), { timeout: 8000 });
    await sleep(300);
    const after = await editorText();
    if (after === before) throw new Error('text unchanged');
    if (!after.includes('Rain came at the glass')) throw new Error(`unexpected text: ${after.slice(0, 60)}`);
    return 'replaced';
  });

  await check('undo restores the pre-AI text in one step', async () => {
    const before = await editorText();
    const html = await page.$eval('.ProseMirror', (el) => el.innerHTML.slice(0, 300));
    await focusPage();
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyZ');
    await page.keyboard.up('Control');
    await sleep(500);
    const text = await editorText();
    if (!text.includes('The rain fell on the window')) {
      throw new Error(`undo left "${text.slice(0, 60)}" (was "${before.slice(0, 60)}", html ${html.slice(0, 120)})`);
    }
    return 'restored';
  });

  await check('G returns an editable correction with Confirm', async () => {
    await selectAll();
    await pressAI('G');
    await page.waitForSelector('.ai-canvas', { timeout: 20000 });
    await sleep(300);
    const value = await page.$eval('.ai-canvas', (el) => el.value);
    if (!value.trim()) throw new Error('empty result');
    await shot('03-grammar');
    return `${value.split(/\s+/).length} words returned`;
  });

  await check('manual edits inside the popup are what gets applied', async () => {
    await page.click('.ai-canvas');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    const HAND = 'Edited by hand in the popup.';
    await page.keyboard.type(HAND, { delay: 25 });
    let typed = await page.$eval('.ai-canvas', (el) => el.value);
    if (typed !== HAND) {
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.type(HAND, { delay: 45 });
      typed = await page.$eval('.ai-canvas', (el) => el.value);
    }
    if (typed !== HAND) throw new Error(`canvas holds "${typed}"`);
    await page.evaluate(() => {
      [...document.querySelectorAll('.ai-pop .btn')].find((b) => b.textContent.includes('Confirm')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.ai-pop'), { timeout: 8000 });
    await sleep(300);
    const text = await editorText();
    if (!text.includes('Edited by hand in the popup')) throw new Error(`got "${text.slice(0, 60)}"`);
    return 'hand-edited text applied';
  });

  await check('P removes dashes and reports the sweep', async () => {
    await selectAll();
    await pressAI('P');
    await page.waitForSelector('.ai-canvas', { timeout: 20000 });
    await sleep(400);
    const value = await page.$eval('.ai-canvas', (el) => el.value);
    if (/[—–]/.test(value)) throw new Error('dashes survived');
    const note = await page.$('.ai-note');
    if (!note) throw new Error('no sweep note shown');
    await shot('04-punctuation');
    return 'dashes converted, note shown';
  });

  await check('confirming punctuation rewrites the page', async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('.ai-pop .btn')].find((b) => b.textContent.includes('Confirm')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.ai-pop'), { timeout: 8000 });
    await sleep(250);
    const text = await editorText();
    if (/[—–]/.test(text)) throw new Error('dashes remain on page');
    return 'page clean';
  });

  await check('L splits long sentences via the popup', async () => {
    await selectAll();
    await pressAI('L');
    await page.waitForSelector('.ai-canvas', { timeout: 20000 });
    await sleep(300);
    const value = await page.$eval('.ai-canvas', (el) => el.value);
    if (value.split('.').length < 3) throw new Error('not split');
    await page.evaluate(() => {
      [...document.querySelectorAll('.ai-pop .btn')].find((b) => b.textContent.includes('Confirm')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.ai-pop'), { timeout: 8000 });
    return 'split applied';
  });

  await check('C sends a custom brief and returns an editable canvas', async () => {
    await selectAll();
    await pressAI('C');
    await page.waitForSelector('.ai-canvas--brief', { timeout: 8000 });
    await page.type('.ai-canvas--brief', 'Make it colder and shorter.', { delay: 2 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.ai-pop .btn')].find((b) => b.textContent.includes('Send')).click();
    });
    await page.waitForFunction(() => {
      const c = document.querySelector('.ai-canvas');
      return c && !c.classList.contains('ai-canvas--brief') && c.value.trim().length > 0;
    }, { timeout: 20000 });
    await shot('05-custom');
    const value = await page.$eval('.ai-canvas', (el) => el.value);
    if (!value.includes('Custom pass applied')) throw new Error('mock instruction not echoed');
    await page.evaluate(() => {
      [...document.querySelectorAll('.ai-pop .btn')].find((b) => b.textContent.includes('Confirm')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.ai-pop'), { timeout: 8000 });
    await sleep(250);
    return 'custom result applied';
  });

  await check('Escape dismisses a popup without touching the text', async () => {
    const before = await editorText();
    await selectAll();
    await pressAI('R');
    await sleep(400);
    await closePopup();
    const after = await editorText();
    if (before !== after) throw new Error('text changed on cancel');
    return 'unchanged';
  });

  /* ------------------------ provider protocols -------------------- */
  await check('every AI request carries the OpenCode Go session header', async () => {
    const log = await mockLog();
    if (log.missingSession > 0) throw new Error(`${log.missingSession} request(s) arrived without x-opencode-session`);
    if (!log.sessions.length) throw new Error('no session id was sent');
    if (log.missingAgent > 0) throw new Error(`${log.missingAgent} request(s) carried a generic user agent`);
    return `session ${String(log.sessions[0]).slice(0, 8)}… · agent ${String(log.agents[0]).split(' ')[0]}`;
  });

  await check('Anthropic-shaped model routes to /messages', async () => {
    await configureAI({ model: 'qwen3.8-max', shape: 'Anthropic messages' });
    await selectAll();
    await pressAI('R');
    await page.waitForFunction(() => document.querySelectorAll('.ai-alt').length >= 3, { timeout: 25000 });
    const log = await mockLog();
    if (!log.paths.some((p) => p.endsWith('/messages'))) throw new Error(`paths: ${[...new Set(log.paths)].join(', ')}`);
    const count = await page.$$eval('.ai-alt', (els) => els.length);
    await closePopup();
    return `${count} alternatives over /messages`;
  });

  await check('Responses-shaped model routes to /responses', async () => {
    await configureAI({ model: 'gpt-6-luna', shape: 'OpenAI responses' });
    await selectAll();
    await pressAI('G');
    await page.waitForSelector('.ai-canvas', { timeout: 25000 });
    const log = await mockLog();
    if (!log.paths.some((p) => p.endsWith('/responses'))) throw new Error(`paths: ${[...new Set(log.paths)].join(', ')}`);
    const value = await page.$eval('.ai-canvas', (el) => el.value);
    if (!value.trim()) throw new Error('empty response body');
    await closePopup();
    return `${value.trim().split(/\s+/).length} words over /responses`;
  });

  await check('auto shape returns to /chat/completions for chat models', async () => {
    await configureAI({ model: 'kimi-k3', shape: 'Auto-detect (recommended)' });
    const before = (await mockLog()).paths.length;
    await selectAll();
    await pressAI('P');
    await page.waitForSelector('.ai-canvas', { timeout: 25000 });
    const log = await mockLog();
    const fresh = log.paths.slice(before);
    if (!fresh.some((p) => p.endsWith('/chat/completions'))) throw new Error(`paths: ${fresh.join(', ')}`);
    await closePopup();
    return 'auto → chat';
  });

  await check('an empty answer is retried instead of failing the request', async () => {
    await configureAI({ model: 'mock-empty-then-good', shape: 'Auto-detect (recommended)' });
    const before = (await mockLog()).emptyAttempts;
    await selectAll();
    await pressAI('R');
    await page.waitForFunction(() => document.querySelectorAll('.ai-alt').length >= 3, { timeout: 30000 });
    const log = await mockLog();
    if (log.emptyAttempts < before + 2) throw new Error(`no retry happened (${before} → ${log.emptyAttempts})`);
    const count = await page.$$eval('.ai-alt', (els) => els.length);
    await closePopup();
    await configureAI({ model: 'kimi-k3', shape: 'Auto-detect (recommended)' });
    return `${count} alternatives after ${log.emptyAttempts - before} attempts`;
  });

  /* ------------------------ prompts + menu + chrome --------------- */
  await check('context menu offers editing and AI actions', async () => {
    const labels = await page.evaluate(() => window.flect.test.contextMenu({
      isEditable: true,
      selectionText: 'The rain fell',
      editFlags: {
        canCut: true, canCopy: true, canPaste: true, canSelectAll: true, canUndo: true, canRedo: true,
      },
      dictionarySuggestions: ['the', 'then'],
      misspelledWord: 'teh',
    }));
    for (const want of ['Cut', 'Copy', 'Paste', 'Select all', 'Ask FLECT']) {
      if (!labels.includes(want)) throw new Error(`missing "${want}" in ${labels.join('|')}`);
    }
    if (!labels.includes('Rephrase five ways')) throw new Error('AI submenu empty');
    if (!labels.includes('teh') && !labels.includes('the')) throw new Error('no spelling suggestions');
    return `${labels.length} entries`;
  });

  await check('a custom prompt reaches the model, and reset restores it', async () => {
    const MARK = 'MARKER-9f2';
    await page.click('button[title="Settings (Ctrl+,)"]');
    await page.waitForSelector('.modal', { timeout: 8000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.modal__tab')].find((b) => b.textContent.includes('Prompts')).click();
    });
    await page.waitForSelector('.prompts', { timeout: 6000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.prompts__tab')].find((b) => b.textContent.includes('Grammar')).click();
    });
    await sleep(250);
    await page.evaluate((mark) => {
      const box = document.querySelector('.prompts__area');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(box, `Task: correct grammatical errors and misspellings. ${mark}\n\n{{selection}}`);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }, MARK);
    await page.evaluate(() => {
      [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Save settings')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 8000 });

    await selectAll();
    await pressAI('G');
    await page.waitForSelector('.ai-canvas', { timeout: 25000 });
    const log = await mockLog();
    if (!String(log.lastUser).includes(MARK)) throw new Error('the edited prompt never reached the provider');
    await closePopup();

    await page.click('button[title="Settings (Ctrl+,)"]');
    await page.waitForSelector('.modal', { timeout: 8000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.modal__tab')].find((b) => b.textContent.includes('Prompts')).click();
    });
    await page.waitForSelector('.prompts', { timeout: 6000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.prompts__tab')].find((b) => b.textContent.includes('Grammar')).click();
    });
    await sleep(200);
    await page.evaluate(() => {
      [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Reset')).click();
    });
    await page.evaluate(() => {
      [...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('Save settings')).click();
    });
    await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 8000 });

    await selectAll();
    await pressAI('G');
    await page.waitForSelector('.ai-canvas', { timeout: 25000 });
    const after = await mockLog();
    if (String(after.lastUser).includes(MARK)) throw new Error('reset did not reach the provider');
    await closePopup();
    return 'override sent, reset restored';
  });

  await check('sidebar collapses from the stage edge and returns', async () => {
    const read = () => page.evaluate(() => ({
      stage: Math.round(document.querySelector('.stage').getBoundingClientRect().width),
      sidebar: !!document.querySelector('.sidebar'),
    }));
    if (!(await read()).sidebar) {
      await page.click('.sidebar-toggle');
      await sleep(400);
    }
    const open = await read();
    if (!open.sidebar) throw new Error('sidebar never opened');

    await page.click('.sidebar-toggle');
    await sleep(450);
    const closed = await read();
    if (closed.sidebar) throw new Error('sidebar still mounted after the toggle');
    if (closed.stage <= open.stage + 80) throw new Error(`stage ${open.stage} → ${closed.stage}, no room reclaimed`);

    await page.click('.sidebar-toggle');
    await sleep(450);
    const back = await read();
    if (!back.sidebar) throw new Error('sidebar did not come back');
    return `${open.stage} → ${closed.stage} px`;
  });

  /* --------------------------- structure ------------------------- */
  await check('table inserts and accepts typing', async () => {
    await focusPage();
    await page.keyboard.press('End');
    await page.click('button[title="Insert table"]');
    await page.waitForSelector('.ProseMirror table', { timeout: 6000 });
    await page.keyboard.type('Cell', { delay: 5 });
    const cells = await page.$$eval('.ProseMirror td, .ProseMirror th', (els) => els.length);
    return `${cells} cells`;
  });

  await check('shape node inserts with its resize handle', async () => {
    await focusPage();
    await page.click('button[title="Insert shape"]');
    await sleep(250);
    await clickMenuItem('Rectangle');
    await page.waitForSelector('.flect-shape-node svg', { timeout: 6000 });
    const box = await page.$eval('.flect-shape-node svg', (el) => el.getBoundingClientRect().width);
    return `${Math.round(box)}px wide`;
  });

  await check('image inserts as a resizable node', async () => {
    const input = await page.$('input[type=file]');
    await input.uploadFile(path.join(ROOT, 'assets', 'flect-mark.png'));
    await page.waitForSelector('.flect-image img', { timeout: 8000 });
    await sleep(200);
    const w = await page.$eval('.flect-image img', (el) => el.getBoundingClientRect().width);
    return `${Math.round(w)}px wide`;
  });

  await shot('06-structure');

  await check('find and replace locates and replaces text', async () => {
    await page.click('button[title="Find and replace (Ctrl+F)"]');
    await page.waitForSelector('.findbar input', { timeout: 6000 });
    await page.click('.findbar input');
    await page.keyboard.type('rain', { delay: 25 });
    await sleep(450);
    let termValue = await page.$eval('.findbar input', (el) => el.value);
    if (termValue !== 'rain') {
      // one retry: a keystroke can be dropped while the compositor is busy
      await page.click('.findbar input');
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.type('rain', { delay: 60 });
      await sleep(450);
      termValue = await page.$eval('.findbar input', (el) => el.value);
    }
    if (termValue !== 'rain') throw new Error(`find field holds "${termValue}"`);
    const count = await page.$eval('.findbar__count', (el) => el.textContent);
    if (!/\d/.test(count)) throw new Error(`count "${count}"`);
    const inputs = await page.$$('.findbar input');
    await inputs[1].type('snow', { delay: 8 });
    await page.evaluate(() => {
      [...document.querySelectorAll('.findbar .btn')].find((b) => b.textContent.trim() === 'All').click();
    });
    await sleep(500);
    const text = await editorText();
    if (!text.includes('snow')) throw new Error('replacement did not land');
    if (/rsnow|snown|sno/.test(text.replace(/snow/g, ''))) throw new Error(`mangled replacement: ${text.slice(0, 60)}`);
    await page.keyboard.press('Escape');
    return `matched ${count}`;
  });

  /* ----------------------------- save ---------------------------- */
  await check('Save as Word writes a real DOCX to disk', async () => {
    await openSaveAsDialog();
    await page.evaluate(() => {
      [...document.querySelectorAll('.export-card')].find((c) => c.textContent.includes('.docx')).click();
    });
    const target = path.join(OUT, 'files', 'Untitled.docx');
    try { await fs.unlink(target); } catch { /* first run */ }
    await page.waitForFunction(
      () => [...document.querySelectorAll('.toast__title')].some((t) => /Saved|Copy written/.test(t.textContent)),
      { timeout: 30000 },
    );
    let st = null;
    for (let i = 0; i < 40; i += 1) {
      try { st = await fs.stat(target); break; } catch { await sleep(250); }
    }
    if (!st) throw new Error('no docx was written');
    if (st.size < 3000) throw new Error(`docx only ${st.size} bytes`);
    return `${Math.round(st.size / 1024)} KB`;
  });

  /* --------------------------- save as --------------------------- */
  await check('Save as offers every writable format', async () => {
    await openSaveAsDialog();
    const cards = await page.$$eval('.export-card', (els) => els.map((e) => e.textContent));
    if (cards.length !== 8) throw new Error(`${cards.length} formats offered`);
    for (const want of ['.docx', '.pdf', '.epub', '.md', '.txt', '.html', '.rtf', '.flect']) {
      if (!cards.some((c) => c.includes(want))) throw new Error(`missing ${want}`);
    }
    return cards.length === 8 ? '8 formats' : '';
  });

  await check('choosing Markdown writes a .md and adopts it', async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('.export-card')].find((c) => c.textContent.includes('.md')).click();
    });
    await page.waitForFunction(
      () => document.querySelector('.titlebar__file')?.textContent.trim().endsWith('.md'),
      { timeout: 25000 },
    );
    const md = await fs.readFile(path.join(OUT, 'files', 'Untitled.md'), 'utf8');
    if (/<\/?p>/.test(md)) throw new Error('HTML leaked into the markdown');
    if (!/snow/i.test(md)) throw new Error('prose missing from the markdown');
    const chip = await page.$eval('.statusbar__format', (el) => el.textContent.trim());
    if (chip !== 'MD') throw new Error(`format chip says ${chip}`);
    return `${md.split('\n').filter(Boolean).length} lines, chip ${chip}`;
  });

  await check('Ctrl+S keeps writing the adopted Markdown format', async () => {
    const target = path.join(OUT, 'files', 'Untitled.md');
    await fs.unlink(target);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Control');
    for (let i = 0; i < 40; i += 1) {
      try { await fs.access(target); break; } catch { await sleep(200); }
    }
    const md = await fs.readFile(target, 'utf8');
    if (!/snow/i.test(md)) throw new Error('wrong content written back');
    return 'rewritten as .md';
  });

  await check('Save as Word adopts the document back to .docx', async () => {
    await openSaveAsDialog();
    await page.evaluate(() => {
      [...document.querySelectorAll('.export-card')].find((c) => c.textContent.includes('.docx')).click();
    });
    await page.waitForFunction(
      () => document.querySelector('.titlebar__file')?.textContent.trim().endsWith('.docx'),
      { timeout: 25000 },
    );
    const st = await fs.stat(path.join(OUT, 'files', 'Untitled.docx'));
    return `${Math.round(st.size / 1024)} KB`;
  });

  /* ---------------------------- exports -------------------------- */
  const kinds = ['Markdown', 'EPUB', 'PDF', 'Plain text', 'Web page', 'Rich Text', 'FLECT package'];

  for (const kind of kinds) {
    // eslint-disable-next-line no-await-in-loop
    await check(`export ${kind}`, async () => {
      await sleep(350);
      await page.click('.titlebar__chip');
      await page.waitForSelector('.export-grid', { timeout: 6000 });
      const clicked = await page.evaluate((label) => {
        const card = [...document.querySelectorAll('.export-card')]
          .find((c) => c.textContent.includes(label));
        if (!card) return false;
        card.click();
        return true;
      }, kind);
      if (!clicked) throw new Error('export card missing');
      await sleep(2500);
      return 'written';
    });
  }

  const files = await fs.readdir(path.join(OUT, 'files'));
  ok('export directory now holds every format', files.sort().join(', '));

  for (const [name, ext] of [
    ['Untitled.md', 'md'], ['Untitled.txt', 'txt'], ['Untitled.html', 'html'],
    ['Untitled.rtf', 'rtf'], ['Untitled.docx', 'docx'], ['Untitled.flect', 'flect'],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await check(`re-opens ${name}`, async () => {
      await openViaPointer(path.join(OUT, 'files', name));
      await page.waitForFunction(
        (file) => document.querySelector('.titlebar__file')?.textContent.trim() === file,
        { timeout: 25000 },
        name,
      );
      await page.waitForFunction(() => document.querySelector('.ProseMirror')?.innerText.trim().length > 10, { timeout: 15000 });
      const text = await editorText();
      const chip = await page.$eval('.statusbar__format', (el) => el.textContent.trim());
      if (chip.toLowerCase() !== ext) throw new Error(`format chip says ${chip}, expected ${ext}`);
      return `${text.split(' ').length} words, chip ${chip}`;
    });
  }

  await shot('07-exported');

  /* ------------------------- dialogs / undo ---------------------- */
  await check('settings dialog reopens with the saved model', async () => {
    await page.click('button[title="Settings (Ctrl+,)"]');
    await page.waitForSelector('.modal', { timeout: 8000 });
    const state = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('.modal input')].map((i) => i.value),
      text: document.querySelector('.modal').innerText,
    }));
    const modelValue = state.inputs.find((v) => /^(mock|qwen|gpt|kimi|glm|deepseek)/i.test(v)) || '';
    if (!modelValue) throw new Error(`model not in dialog: ${JSON.stringify(state.inputs)}`);
    await page.keyboard.press('Escape');
    await sleep(300);
    if (await page.$('.modal')) throw new Error('dialog did not close on Escape');
    return 'persisted';
  });

  await check('focus mode hides the chrome', async () => {
    await page.evaluate(() => {
      [...document.querySelectorAll('.menubar__btn')].find((b) => b.textContent.trim() === 'View').click();
    });
    await sleep(200);
    await clickMenuItem('Focus mode');
    await sleep(300);
    const visible = await page.$eval('.toolbar', (el) => getComputedStyle(el).display);
    if (visible !== 'none') throw new Error('toolbar still visible');
    await page.keyboard.press('Escape');
    await sleep(300);
    return 'toggled';
  });

  await check('window snaps to half and quarter of the work area', async () => {
    const left = await page.evaluate(() => window.flect.app.snap('left'));
    await sleep(450);
    const half = Math.round(left.workArea.width / 2);
    if (Math.abs(left.bounds.width - half) > 8) {
      throw new Error(`left half ${left.bounds.width}px, expected ~${half}px of ${left.workArea.width}`);
    }
    if (Math.abs(left.bounds.x - left.workArea.x) > 2) throw new Error(`left half x ${left.bounds.x}`);

    const quarter = await page.evaluate(() => window.flect.app.snap('bottom-right'));
    await sleep(450);
    const qw = quarter.workArea.width - Math.round(quarter.workArea.width / 2);
    if (Math.abs(quarter.bounds.width - qw) > 8) throw new Error(`quarter width ${quarter.bounds.width}`);
    if (quarter.bounds.x <= left.bounds.x || quarter.bounds.y <= left.bounds.y) {
      throw new Error('quarter is not offset from the top-left');
    }

    await page.evaluate(() => window.flect.app.snap('maximize'));
    await sleep(400);
    return `${left.bounds.width}px half · quarter ${quarter.bounds.width}×${quarter.bounds.height}`;
  });

  await shot('08-final');

  if (consoleErrors.length) {
    fail('renderer console stayed clean', consoleErrors.slice(0, 3).join(' | '));
  } else {
    ok('renderer console stayed clean');
  }
} catch (err) {
  fail('harness completed', err.message);
  console.error(err);
  try { await shot('99-failure'); } catch { /* ignore */ }
} finally {
  try { await page?.evaluate(() => window.flect?.app?.forceClose()); } catch { /* ignore */ }
  await sleep(600);
  try { child?.kill(); } catch { /* ignore */ }
  try { server?.close(); } catch { /* ignore */ }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${passed} passed, ${failed} failed`);
  await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify({ results, consoleErrors }, null, 2)).catch(() => {});
  process.exit(failed ? 1 : 0);
}
