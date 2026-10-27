import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

/*
 * The renderer libraries are ES modules living inside a CommonJS package,
 * because the Electron main process needs require(). Node decides module type
 * by extension, so the tests copy each real file to a .mjs scratch path and
 * import that. Nothing is duplicated: the bytes under test are the bytes that
 * ship.
 */
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'flect-unit-'));
async function loadRendererModule(rel) {
  const dest = path.join(scratch, path.basename(rel).replace(/\.js$/, '.mjs'));
  fs.copyFileSync(path.join(root, rel), dest);
  return import(pathToFileURL(dest).href);
}

const prompts = await loadRendererModule('src/lib/prompts.js');
const formats = await loadRendererModule('src/lib/formats.js');
const shapes = createRequire(import.meta.url)(path.join(root, 'electron/ai-shapes.js'));

const selection = {
  text: 'The rain fell on the roof and nobody spoke.',
  context: 'It was a cold night. The rain fell on the roof and nobody spoke. The lamp guttered.',
  full: 'Chapter one. It was a cold night. The rain fell on the roof and nobody spoke.',
};

/* ------------------------------------------------------------------ */
/* prompts                                                             */
/* ------------------------------------------------------------------ */

test('every action ships a system prompt and a task prompt', () => {
  for (const key of prompts.ACTION_ORDER) {
    const spec = prompts.defaultPrompt(key);
    assert.equal(typeof spec.system, 'string', `${key} system`);
    assert.equal(typeof spec.task, 'string', `${key} task`);
    assert.ok(spec.system.length > 80, `${key} system is substantive`);
    assert.ok(spec.task.length > 40, `${key} task is substantive`);
  }
});

test('the system prompt bans machine punctuation and machine diction', () => {
  const system = prompts.defaultPrompt('R').system.toLowerCase();
  assert.match(system, /em dash/);
  assert.match(system, /semicolon/);
  assert.match(system, /machine-written/);
  // the banned-word list is the product rule: it must not be silently emptied
  assert.match(system, /delve/);
  assert.match(system, /tapestry/);
});

test('buildMessages sends a system turn and a user turn containing the selection', () => {
  const messages = prompts.buildMessages('G', selection, {});
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.ok(messages[1].content.includes(selection.text));
  assert.ok(!messages[0].content.includes('{{selection}}'), 'system stays unresolved');
});

test('a task prompt without a selection placeholder still carries the text', () => {
  const messages = prompts.buildMessages('P', selection, {
    P: { task: 'Fix the punctuation.' },
  });
  assert.ok(messages[1].content.startsWith('Fix the punctuation.'));
  assert.ok(messages[1].content.includes(selection.text));
});

test('an override replaces one half and leaves the other alone', () => {
  const custom = prompts.buildMessages('L', selection, {
    L: { system: 'You split sentences.' },
  });
  assert.equal(custom[0].content, 'You split sentences.');
  const shipped = prompts.buildMessages('L', selection, {});
  assert.equal(custom[1].content, shipped[1].content, 'task half untouched');
});

test('an empty override falls back to the shipped prompt', () => {
  const shipped = prompts.buildMessages('R', selection, {});
  const blank = prompts.buildMessages('R', selection, { R: { system: '   ', task: '' } });
  assert.deepEqual(blank, shipped);
});

test('a custom instruction reaches the request', () => {
  const messages = prompts.buildMessages('C', { ...selection, instruction: 'Make it colder.' }, {});
  assert.ok(messages[1].content.includes('Make it colder.'));
});

test('isCustomised notices a changed half and ignores a clean one', () => {
  assert.equal(prompts.isCustomised({}, 'R'), false);
  assert.equal(prompts.isCustomised({ R: prompts.defaultPrompt('R') }, 'R'), false);
  assert.equal(prompts.isCustomised({ R: { task: 'Rewrite this.' } }, 'R'), true);
});

test('sweepDashes removes em and en dashes without leaving debris', () => {
  const cleaned = prompts.sweepDashes('He stopped—and waited—for the train.');
  assert.ok(!/[—–]/.test(cleaned));
  assert.doesNotMatch(cleaned, /,\s*,/);
  assert.doesNotMatch(cleaned, /,\s*\./);
  assert.match(cleaned, /stopped/);
});

test('parseAlternatives splits a numbered list, dedupes and caps at five', () => {
  const raw = [
    '1. The rain fell hard on the roof.',
    '2. Rain hammered the roof.',
    '3. Rain hammered the roof.', // duplicate, dropped
    '4. The roof took the rain.',
    '5. Water drummed overhead.',
    '6. A sixth option that must not survive.',
  ].join('\n');
  const out = prompts.parseAlternatives(raw);
  assert.equal(out.length, 5);
  assert.equal(out[0], 'The rain fell hard on the roof.');
  assert.equal(new Set(out).size, out.length);
});

test('parseAlternatives returns nothing for an empty answer', () => {
  assert.deepEqual(prompts.parseAlternatives(''), []);
  assert.deepEqual(prompts.parseAlternatives('   \n  '), []);
});

/* ------------------------------------------------------------------ */
/* provider routing                                                    */
/* ------------------------------------------------------------------ */

test('OpenCode Go models route to the protocol they actually speak', () => {
  const base = 'https://opencode.ai/zen/go/v1';
  assert.equal(shapes.pickShape(base, 'minimax-m3'), 'messages');
  assert.equal(shapes.pickShape(base, 'qwen3.8-max'), 'messages');
  assert.equal(shapes.pickShape(base, 'grok-4.7'), 'responses');
  assert.equal(shapes.pickShape(base, 'gpt-6-luna'), 'responses');
  assert.equal(shapes.pickShape(base, 'kimi-k3'), 'chat');
});

test('everything else speaks chat completions', () => {
  assert.equal(shapes.pickShape('https://api.openai.com/v1', 'gpt-6-luna'), 'chat');
  assert.equal(shapes.pickShape('http://127.0.0.1:11434/v1', 'llama3'), 'chat');
  assert.equal(shapes.pickShape('', ''), 'chat');
});

test('an explicit override beats detection', () => {
  const base = 'https://opencode.ai/zen/go/v1';
  assert.equal(shapes.pickShape(base, 'grok-4.7', 'chat'), 'chat');
  assert.equal(shapes.pickShape(base, 'kimi-k3', 'responses'), 'responses');
});

test('model ids lose the OpenCode prefix and keep their case-sensitivity trim', () => {
  assert.equal(shapes.normalizeModel('  opencode-go/kimi-k3 '), 'kimi-k3');
  assert.equal(shapes.normalizeModel(undefined), '');
});

test('endpoints are built from a root without doubling slashes', () => {
  assert.equal(shapes.endpointFor('chat', 'https://x.test/v1'), 'https://x.test/v1/chat/completions');
  assert.equal(shapes.endpointFor('messages', 'https://x.test/v1'), 'https://x.test/v1/messages');
  assert.equal(shapes.endpointFor('responses', 'https://x.test/v1'), 'https://x.test/v1/responses');
});

/* ------------------------------------------------------------------ */
/* format registry                                                     */
/* ------------------------------------------------------------------ */

test('the registry exposes every writable format', () => {
  const ids = formats.WRITABLE.map((f) => f.id).sort();
  assert.deepEqual(ids, ['docx', 'epub', 'flect', 'html', 'md', 'pdf', 'rtf', 'txt']);
  for (const spec of formats.WRITABLE) {
    assert.ok(spec.label, `${spec.id} label`);
    assert.ok(spec.ext, `${spec.id} extension`);
    assert.ok(Array.isArray(spec.filters) && spec.filters.length, `${spec.id} filters`);
  }
});

test('only formats FLECT can read back are rebindable', () => {
  const writable = new Set(formats.WRITABLE.map((f) => f.id));
  for (const id of formats.REBINDABLE) assert.ok(writable.has(id), `${id} is writable`);
  assert.equal(formats.REBINDABLE.has('pdf'), false);
  assert.equal(formats.REBINDABLE.has('epub'), false);
});

test('the open set matches what the main process can import', () => {
  for (const ext of ['docx', 'docm', 'dotx', 'md', 'markdown', 'txt', 'html', 'htm', 'rtf', 'flect']) {
    assert.ok(formats.OPENABLE.has(ext), `${ext} openable`);
  }
  assert.equal(formats.OPENABLE.has('pdf'), false);
});

test('aliases resolve to the canonical writer', () => {
  assert.equal(formats.asKind('markdown'), 'md');
  assert.equal(formats.asKind('docm'), 'docx');
  assert.equal(formats.asKind('htm'), 'html');
  assert.equal(formats.labelFor('md'), 'Markdown');
});
