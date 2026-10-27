/**
 * Static checks that do not need Electron:
 *  1. provider routing table (OpenCode Go's three shapes)
 *  2. every bare require() in the main process is a declared runtime dependency
 *  3. the renderer bundle is base-relative (works from file:// inside asar)
 *  4. the format registry exposes a complete save grid
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const rows = [];
const check = async (name, fn) => {
  try {
    // Await: an async check must be able to fail the run, not resolve later
    // into an unhandled rejection after PASS has already been printed.
    const detail = await fn();
    rows.push({ name, ok: true, detail });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    rows.push({ name, ok: false, detail: err.message });
    console.log(`  FAIL  ${name} — ${err.message}`);
  }
};

const shapes = require(path.join(ROOT, 'electron', 'ai-shapes.js'));

await check('OpenCode Go routes each model to its documented endpoint', () => {
  const base = 'https://opencode.ai/zen/go/v1';
  const cases = [
    ['qwen3.8-max', 'messages'],
    ['qwen3.7-plus', 'messages'],
    ['minimax-m3', 'messages'],
    ['gpt-6-luna', 'responses'],
    ['grok-4.7', 'responses'],
    ['kimi-k3', 'chat'],
    ['deepseek-v4-pro', 'chat'],
    ['glm-5.3-flash', 'chat'],
  ];
  for (const [model, expected] of cases) {
    const got = shapes.pickShape(base, model, 'auto');
    if (got !== expected) throw new Error(`${model}: expected ${expected}, got ${got}`);
  }
  return `${cases.length} models routed`;
});

await check('other providers stay on chat completions', () => {
  for (const host of ['https://api.openai.com/v1', 'https://openrouter.ai/api/v1', 'http://localhost:11434/v1']) {
    const got = shapes.pickShape(host, 'gpt-6-luna', 'auto');
    if (got !== 'chat') throw new Error(`${host} → ${got}`);
  }
  return '3 hosts';
});

await check('explicit shape overrides auto-detection', () => {
  if (shapes.pickShape('https://opencode.ai/zen/go/v1', 'kimi-k3', 'messages') !== 'messages') throw new Error('override ignored');
  if (shapes.pickShape('https://api.openai.com/v1', 'qwen3.8-max', 'responses') !== 'responses') throw new Error('override ignored');
  return 'override wins';
});

await check('model ids pasted as opencode-go/<id> are normalised', () => {
  if (shapes.normalizeModel('opencode-go/kimi-k3') !== 'kimi-k3') throw new Error('prefix not stripped');
  return 'prefix stripped';
});

await check('endpoint paths match the documented table', () => {
  const root = 'https://opencode.ai/zen/go/v1';
  const map = {
    chat: `${root}/chat/completions`,
    messages: `${root}/messages`,
    responses: `${root}/responses`,
  };
  for (const [shape, url] of Object.entries(map)) {
    if (shapes.endpointFor(shape, root) !== url) throw new Error(`${shape} → ${shapes.endpointFor(shape, root)}`);
  }
  return '3 endpoints';
});

await check('main process requires only declared runtime dependencies', () => {
  const dir = path.join(ROOT, 'electron');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const declared = new Set(Object.keys(pkg.dependencies || {}));
  const builtin = new Set(['electron', 'fs', 'path', 'os', 'crypto', 'url', 'util', 'events', 'stream', 'buffer', 'child_process', 'http', 'https', 'net', 'zlib']);
  const missing = new Set();
  const used = new Set();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const name = m[1];
      if (name.startsWith('.') || name.startsWith('node:')) continue;
      const bare = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
      if (builtin.has(bare)) continue;
      used.add(bare);
      if (!declared.has(bare)) missing.add(`${bare} (${file})`);
    }
  }
  if (missing.size) throw new Error(`undeclared: ${[...missing].join(', ')}`);
  return `${used.size} modules: ${[...used].join(', ')}`;
});

await check('renderer bundle is base-relative for file:// loading', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  if (/src="\/(?!\/)/.test(html) || /href="\/(?!\/)/.test(html)) throw new Error('absolute asset path in index.html');
  if (!html.includes('./assets/')) throw new Error('no relative asset reference found');
  return 'relative';
});

await check('format registry covers the save grid', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'formats.js'), 'utf8');
  for (const id of ['docx', 'pdf', 'epub', 'md', 'txt', 'html', 'rtf', 'flect']) {
    if (!src.includes(`id: '${id}'`)) throw new Error(`missing writer ${id}`);
  }
  return '8 writers';
});

const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
