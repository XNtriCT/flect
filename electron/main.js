'use strict';

const {
  app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu, clipboard, screen,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const isDev = process.argv.includes('--dev');
const APP_ID = 'com.flect.editor';

app.setAppUserModelId(APP_ID);
app.setName('FLECT');

/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {BrowserWindow|null} */
let printWindow = null;

/* Test seam: only active when FLECT_TEST_DIR is set by an automated run.
   Native dialogs are replaced with deterministic paths so the save/open
   pipeline can be exercised end to end without a human. */
const TEST_DIR = process.env.FLECT_TEST_DIR || '';
if (TEST_DIR) {
  try { fss.mkdirSync(TEST_DIR, { recursive: true }); } catch { /* ignore */ }
  dialog.showSaveDialog = async (_win, opts) => ({
    canceled: false,
    filePath: path.join(TEST_DIR, path.basename(opts?.defaultPath || 'untitled')),
  });
  ipcMain.handle('test:contextMenu', (_e, params) => {
    const menu = buildContextMenu(
      { editFlags: {}, dictionarySuggestions: [], ...params },
      mainWindow,
    );
    const out = [];
    for (const item of menu.items) {
      out.push(item.label || item.role || item.type);
      if (item.submenu) {
        for (const sub of item.submenu.items) out.push(sub.label || sub.role || sub.type);
      }
    }
    return out;
  });

  dialog.showOpenDialog = async () => {
    let list = [];
    const pointer = process.env.FLECT_TEST_OPEN_JSON;
    if (pointer && fss.existsSync(pointer)) {
      try {
        const payload = JSON.parse(fss.readFileSync(pointer, 'utf8'));
        list = Array.isArray(payload) ? payload : [payload.path];
      } catch { list = []; }
    } else {
      try { list = JSON.parse(process.env.FLECT_TEST_OPEN || '[]'); } catch { list = []; }
    }
    return { canceled: !list.length, filePaths: list.filter(Boolean) };
  };
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

const DEFAULTS = {
  ai: { baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '', shape: 'auto', sessionId: '' },
  prompts: {},
  page: {
    size: 'A4', margin: 1, font: 'Palatino Linotype', fontSize: 12,
    lineHeight: 1.65, indent: 0, spaceAfter: 0, tint: 'ivory', justify: false,
  },
  editor: {
    aiBareKeys: true, spellcheck: true, autosave: true, zoom: 1,
    sidebar: true, typewriter: false, focus: false,
  },
  recent: [],
  window: { width: 1480, height: 940, maximized: false },
};

let settingsCache = null;

async function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function mergeSettings(base, incoming) {
  const out = { ...base };
  for (const key of Object.keys(incoming || {})) {
    const v = incoming[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = { ...base[key], ...v };
    } else {
      out[key] = v;
    }
  }
  return out;
}

async function readSettings() {
  if (settingsCache) return settingsCache;
  let stored = {};
  try {
    stored = JSON.parse(await fs.readFile(await settingsPath(), 'utf8'));
  } catch {
    stored = {};
  }
  const merged = mergeSettings(DEFAULTS, stored);
  // decrypt key
  const enc = merged.ai.apiKeyEnc;
  if (typeof enc === 'string' && enc.startsWith('enc:')) {
    try {
      merged.ai.apiKey = safeStorage.decryptString(Buffer.from(enc.slice(4), 'base64'));
    } catch {
      merged.ai.apiKey = '';
    }
  } else if (typeof enc === 'string' && enc.startsWith('plain:')) {
    merged.ai.apiKey = enc.slice(6);
  }
  delete merged.ai.apiKeyEnc;
  const hadSession = Boolean(stored.ai && stored.ai.sessionId);
  if (!merged.ai.sessionId) merged.ai.sessionId = randomUUID();
  settingsCache = merged;
  if (!hadSession) writeSettings({}).catch(() => {});
  return merged;
}

async function persistSettings(merged) {
  const toDisk = JSON.parse(JSON.stringify(merged));
  const key = merged.ai && merged.ai.apiKey ? String(merged.ai.apiKey) : '';
  delete toDisk.ai.apiKey;
  if (key) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        toDisk.ai.apiKeyEnc = 'enc:' + safeStorage.encryptString(key).toString('base64');
      } else {
        toDisk.ai.apiKeyEnc = 'plain:' + key;
      }
    } catch {
      toDisk.ai.apiKeyEnc = 'plain:' + key;
    }
  } else if (toDisk.ai) {
    toDisk.ai.apiKeyEnc = '';
  }
  settingsCache = merged;
  await fs.mkdir(path.dirname(await settingsPath()), { recursive: true });
  await fs.writeFile(await settingsPath(), JSON.stringify(toDisk, null, 2), 'utf8');
  return merged;
}

async function writeSettings(next) {
  const patch = { ...(next || {}) };
  const current = await readSettings();
  // Prompts are a document, not a namespace: deleting one key must stay deleted.
  if (Object.prototype.hasOwnProperty.call(patch, 'prompts')) {
    const base = mergeSettings(current, {});
    base.prompts = patch.prompts || {};
    delete patch.prompts;
    return persistSettings(mergeSettings(base, patch));
  }
  return persistSettings(mergeSettings(current, patch));
}


/* ------------------------------------------------------------------ */
/* window                                                             */
/* ------------------------------------------------------------------ */

async function createWindow() {
  const s = await readSettings();
  const bounds = s.window || {};

  mainWindow = new BrowserWindow({
    width: bounds.width || 1480,
    height: bounds.height || 940,
    x: bounds.x,
    y: bounds.y,
    minWidth: 620,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: '#070e19',
    title: 'FLECT',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  if (bounds.maximized) mainWindow.maximize();

  const sendMax = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('win:state', { maximized: mainWindow.isMaximized() });
  };
  mainWindow.on('maximize', sendMax);
  mainWindow.on('unmaximize', sendMax);

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('close', async (e) => {
    try {
      const b = mainWindow.getNormalBounds();
      await writeSettings({ window: { ...b, maximized: mainWindow.isMaximized() } });
    } catch { /* ignore */ }

    if (allowClose || !docState.dirty) return;
    e.preventDefault();
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Unsaved changes',
      message: `Save changes to ${docState.name || 'this document'}?`,
      detail: 'Closing without saving keeps only the recovery snapshot.',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (res.response === 0) {
      mainWindow.webContents.send('app:save-and-close');
    } else if (res.response === 1) {
      allowClose = true;
      mainWindow.close();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = buildContextMenu(params, mainWindow);
    if (menu.items.length) menu.popup({ window: mainWindow });
  });

  // keep external links out of the app shell
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!/^file:/i.test(url) && !/^http:\/\/127\.0\.0\.1:5173/.test(url)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

/* ------------------------------------------------------------------ */
/* native menu (minimal, accelerators only)                           */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* file helpers                                                       */
/* ------------------------------------------------------------------ */

const WORD_EXTS = new Set(['docx', 'docm', 'dotx', 'dotm', 'txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'flect', 'xml']);

function extOf(p) {
  const m = /\.([a-z0-9]+)$/i.exec(p || '');
  return m ? m[1].toLowerCase() : '';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  return blocks.map((block) => {
    const trimmed = block.replace(/^\n+|\n+$/g, '');
    if (!trimmed.trim()) return '';
    const inner = trimmed.split('\n').map(esc).join('<br>');
    return `<p>${inner}</p>`;
  }).join('\n');
}

/* --- RTF (basic reader) ------------------------------------------- */

function rtfToHtml(rtf) {
  // drop destinations that carry no body text
  let src = String(rtf);
  const dropDest = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
    'footnote', 'object', 'themedata', 'colorschememapping', 'datastore', 'latentstyles',
    'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'filetbl',
    'revtbl', 'pgdsctbl', 'listtext', 'fldinst'];
  for (const d of dropDest) {
    src = src.replace(new RegExp('\\{\\\\\\*?\\\\?' + d + '[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}', 'gi'), '');
  }

  const cp1252 = {
    0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x96: '\u2013', 0x97: '\u2014',
    0x85: '\u2026', 0xA0: ' ', 0xE9: '\u00e9', 0xE8: '\u00e8', 0xEA: '\u00ea', 0xE1: '\u00e1',
    0xE0: '\u00e0', 0xED: '\u00ed', 0xF3: '\u00f3', 0xFA: '\u00fa', 0xF1: '\u00f1', 0xFC: '\u00fc',
    0xF6: '\u00f6', 0xE4: '\u00e4', 0xC9: '\u00c9',
  };

  return rtfToHtmlWithFormat(src, cp1252) || textToHtml(stripRtf(src));
}

function stripRtf(src) {
  return String(src)
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\\\*?\\[a-z]+[^{}]*\}/gi, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

function rtfToHtmlWithFormat(src, cp1252) {
  // second, formatting-aware pass (single pass, emits tags inline)
  let out = '';
  const stack = [];
  let bold = false, italic = false, underline = false;
  let openB = false, openI = false, openU = false;
  let i = 0;
  const sync = () => {
    if (bold && !openB) { out += '<strong>'; openB = true; }
    if (!bold && openB) { out += '</strong>'; openB = false; }
    if (italic && !openI) { out += '<em>'; openI = true; }
    if (!italic && openI) { out += '</em>'; openI = false; }
    if (underline && !openU) { out += '<u>'; openU = true; }
    if (!underline && openU) { out += '</u>'; openU = false; }
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') { stack.push({ bold, italic, underline }); i++; continue; }
    if (ch === '}') {
      const st = stack.pop();
      if (st) { bold = st.bold; italic = st.italic; underline = st.underline; }
      sync();
      i++; continue;
    }
    if (ch === '\\') {
      const rest = src.slice(i);
      let m;
      if ((m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rest))) {
        const word = m[1];
        if (word === 'par') { sync(); out += '\u0000'; }
        else if (word === 'line') { sync(); out += '\u0001'; }
        else if (word === 'tab') out += '\u0002';
        else if (word === 'b') { bold = Number(m[2] || 1) !== 0; sync(); }
        else if (word === 'i') { italic = Number(m[2] || 1) !== 0; sync(); }
        else if (word === 'ul') { underline = Number(m[2] || 1) !== 0; sync(); }
        else if (word === 'ulnone') { underline = false; sync(); }
        else if (word === 'u') {
          const code = parseInt(m[2] || '0', 10);
          out += String.fromCharCode(code < 0 ? code + 65536 : code);
        } else if (word === 'emdash') out += '\u2014';
        else if (word === 'endash') out += '\u2013';
        else if (word === 'lquote') out += '\u2018';
        else if (word === 'rquote') out += '\u2019';
        else if (word === 'ldblquote') out += '\u201C';
        else if (word === 'rdblquote') out += '\u201D';
        i += m[0].length;
        continue;
      }
      if ((m = /^\\'([0-9a-f]{2})/.exec(rest))) {
        const byte = parseInt(m[1], 16);
        out += cp1252[byte] || String.fromCharCode(byte);
        i += m[0].length;
        continue;
      }
      if ((m = /^\\([\\{}])/.exec(rest))) { out += esc(m[1]); i += m[0].length; continue; }
      const skip = /^\\[a-zA-Z]+-?\d* ?/.exec(rest);
      i += skip ? skip[0].length : 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') { i++; continue; }
    out += esc(ch);
    i++;
  }
  sync();

  const paras = out.split('\u0000');
  const html = paras.map((p) => {
    const cleaned = p.replace(/\u0001/g, '<br>').replace(/\u0002/g, '    ').trim();
    return cleaned ? `<p>${cleaned}</p>` : '';
  }).filter(Boolean).join('\n');
  return html && html.replace(/<[^>]+>/g, '').trim().length > 2 ? html : '';
}

/* ------------------------------------------------------------------ */
/* document readers                                                   */
/* ------------------------------------------------------------------ */

async function readDocument(filePath) {
  const ext = extOf(filePath);
  const name = path.basename(filePath);
  const base = name.replace(/\.[^.]+$/, '');
  const result = {
    path: filePath, name, base, ext, html: '', warnings: [], kind: ext,
    size: 0, mtime: 0,
  };
  const stat = await fs.stat(filePath);
  result.size = stat.size;
  result.mtime = stat.mtimeMs;

  if (ext === 'docx' || ext === 'docm' || ext === 'dotx' || ext === 'dotm') {
    const mammoth = require('mammoth');
    const parsed = await mammoth.convertToHtml(
      { path: filePath },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => p.flect-subtitle:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
        ],
        includeDefaultStyleMap: true,
      },
    );
    result.html = parsed.value || '';
    result.warnings = (parsed.messages || []).map((m) => m.message).slice(0, 6);
  } else if (ext === 'md' || ext === 'markdown') {
    const { marked } = require('marked');
    marked.setOptions({ gfm: true, breaks: false });
    result.html = marked.parse(await fs.readFile(filePath, 'utf8'));
  } else if (ext === 'html' || ext === 'htm' || ext === 'xml') {
    const raw = await fs.readFile(filePath, 'utf8');
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw);
    result.html = body ? body[1] : raw;
  } else if (ext === 'rtf') {
    const raw = await fs.readFile(filePath, 'utf8');
    result.html = rtfToHtml(raw);
    result.warnings.push('RTF reading is basic: text, paragraphs and emphasis are kept.');
  } else if (ext === 'flect') {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    result.html = raw.html || '';
    result.meta = raw.meta || {};
    result.kind = 'flect';
  } else {
    const raw = await fs.readFile(filePath, 'utf8');
    result.html = textToHtml(raw);
  }

  // strip anything the editor schema would refuse anyway, and script-ish payloads
  result.html = String(result.html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/ on[a-z]+="[^"]*"/gi, '')
    .replace(/ on[a-z]+='[^']*'/gi, '');
  return result;
}

/* ------------------------------------------------------------------ */
/* PDF                                                                */
/* ------------------------------------------------------------------ */

async function renderPdf(html, opts = {}) {
  if (printWindow && !printWindow.isDestroyed()) {
    printWindow.destroy();
    printWindow = null;
  }
  printWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false, sandbox: true },
  });
  const tmp = path.join(os.tmpdir(), `flect-print-${Date.now()}.html`);
  await fs.writeFile(tmp, html, 'utf8');
  try {
    await printWindow.loadFile(tmp);
    // give layout + font swap a beat
    await new Promise((r) => setTimeout(r, 400));
    const marginIn = typeof opts.marginIn === 'number' ? opts.marginIn : 1;
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: opts.pageSize === 'Letter' ? 'Letter' : 'A4',
      margins: {
        top: marginIn,
        bottom: marginIn + 0.12,
        left: marginIn,
        right: marginIn,
      },
      displayHeaderFooter: opts.pageNumbers !== false,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-family:Palatino,Georgia,serif;font-size:9px;color:#8a8578;text-align:center;margin:0 0 4px 0;"><span class="pageNumber"></span></div>',
      preferCSSPageSize: false,
    });
    return pdf;
  } finally {
    try {
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    } catch { /* ignore */ }
    printWindow = null;
    fs.unlink(tmp).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* AI proxy (streaming)                                               */
/* ------------------------------------------------------------------ */

function apiRoot(input) {
  let s = String(input || '').trim().replace(/\s+/g, '');
  if (!s) s = 'https://api.openai.com/v1';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/\/+$/, '');
  s = s.replace(/\/(chat\/completions|messages|responses)$/i, '');
  if (/\/v\d+$/i.test(s)) return s;
  return s + '/v1';
}

const {
  pickShape, endpointFor, normalizeModel,
} = require('./ai-shapes');

function headersFor(shape, apiKey, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': `FLECT/${app.getVersion()} (Windows; Electron ${process.versions.electron})`,
    'x-opencode-session': sessionId,
  };
  if (shape === 'messages') {
    headers['x-api-key'] = apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${apiKey || ''}`;
  }
  return headers;
}

function splitSystem(messages) {
  const system = (messages || []).filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = (messages || []).filter((m) => m.role !== 'system');
  const user = rest.map((m) => m.content).join('\n\n');
  return { system, user };
}

function bodyFor(shape, { model, messages, temperature, maxTokens }) {
  const id = normalizeModel(model);
  if (shape === 'messages') {
    const { system, user } = splitSystem(messages);
    const body = {
      model: id,
      max_tokens: Math.min(Math.max(maxTokens || 1200, 64), 8000),
      messages: [{ role: 'user', content: user }],
      stream: true,
    };
    if (system) body.system = system;
    if (typeof temperature === 'number') body.temperature = temperature;
    return body;
  }
  if (shape === 'responses') {
    const { system, user } = splitSystem(messages);
    const body = {
      model: id,
      input: [{ role: 'user', content: [{ type: 'input_text', text: user }] }],
      max_output_tokens: Math.min(Math.max(maxTokens || 1200, 64), 8000),
      stream: true,
    };
    if (system) body.instructions = system;
    return body;
  }
  const body = {
    model: id,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    stream: true,
  };
  if (maxTokens) body.max_tokens = Math.min(maxTokens, 8000);
  return body;
}

function deltaOf(shape, obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (shape === 'messages') {
    if (obj.type === 'content_block_delta') return obj.delta?.text || obj.delta?.thinking || '';
    if (obj.type === 'message_delta' && obj.delta?.stop_reason) return '';
    return '';
  }
  if (shape === 'responses') {
    if (obj.type === 'response.output_text.delta') return obj.delta || '';
    if (obj.type === 'response.refusal.delta') return obj.delta || '';
    return '';
  }
  const choice = obj.choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '';
}

function textFromJson(shape, json) {
  if (!json || typeof json !== 'object') return '';
  if (shape === 'messages') {
    if (Array.isArray(json.content)) return json.content.map((c) => c.text || '').join('');
    return '';
  }
  if (shape === 'responses') {
    if (typeof json.output_text === 'string') return json.output_text;
    const out = Array.isArray(json.output) ? json.output : [];
    return out.flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .map((c) => c.text || '').join('');
  }
  const choice = json.choices?.[0];
  return choice?.message?.content ?? choice?.text ?? '';
}

function errorText(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.error === 'string') return obj.error;
  if (obj.error?.message) return obj.error.message;
  if (obj.type === 'error' && obj.error) return JSON.stringify(obj.error).slice(0, 400);
  if (obj.type === 'response.failed') return obj.response?.error?.message || 'the response failed';
  if (obj.message) return String(obj.message);
  return '';
}

const activeRequests = new Map();

function abortAll() {
  for (const ctrl of activeRequests.values()) {
    try { ctrl.abort(); } catch { /* ignore */ }
  }
  activeRequests.clear();
}

ipcMain.handle('ai:models', async (_e, { baseUrl, apiKey }) => {
  const root = apiRoot(baseUrl);
  const settings = await readSettings();
  const url = root + '/models';
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey || ''}`,
      'x-api-key': apiKey || '',
      'User-Agent': `FLECT/${app.getVersion()} (Windows)`,
      'x-opencode-session': settings.ai.sessionId || 'flect-session',
    },
  }).catch((err) => ({ ok: false, status: 0, statusText: err.message }));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status} ${res.statusText || ''}`.trim(),
      url,
    };
  }
  const json = await res.json();
  const list = (json.data || json.models || [])
    .map((m) => (typeof m === 'string' ? m : m.id || m.name))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));
  return { ok: true, models: list, url };
});

ipcMain.handle('ai:chat', async (event, payload) => {
  const { id, baseUrl, apiKey, model, messages, temperature, maxTokens, shape: shapeOverride } = payload;
  const ctrl = new AbortController();
  activeRequests.set(id, ctrl);
  const sender = event.sender;
  const emit = (data) => {
    if (!sender.isDestroyed()) sender.send('ai:event', { id, ...data });
  };

  const settings = await readSettings();
  const sessionId = settings.ai.sessionId || 'flect-session';
  const shape = pickShape(baseUrl, model, shapeOverride || settings.ai.shape);
  const root = apiRoot(baseUrl);
  const headers = headersFor(shape, apiKey, sessionId);

  async function attempt(budget) {
    const url = endpointFor(shape, root);
    const body = JSON.stringify(bodyFor(shape, { model, messages, temperature, maxTokens: budget }));
    let res;
    let usedUrl = url;
    try {
      res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body });
      if (res.status === 404 && /\/v1$/.test(root)) {
        const alt = root.replace(/\/v1$/, '');
        const altUrl = endpointFor(shape, alt);
        const altRes = await fetch(altUrl, { method: 'POST', signal: ctrl.signal, headers, body });
        if (altRes.ok) { res = altRes; usedUrl = altUrl; }
      }
    } catch (err) {
      return { networkError: err, url, status: 0 };
    }

    if (!res.ok) {
      let detail = '';
      try {
        const text = await res.text();
        try { detail = errorText(JSON.parse(text)) || text; } catch { detail = text; }
      } catch { /* ignore */ }
      return { status: res.status, detail, url: usedUrl, empty: true };
    }

    let text = '';
    let raw = '';
    let sawFrame = false;
    let sawReasoning = false;
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        raw += chunk;
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line || line.startsWith(':') || line.startsWith('event:')) continue;
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          sawFrame = true;
          try {
            const json = JSON.parse(data);
            const err = errorText(json);
            if (err) return { status: 200, detail: err, url: usedUrl, empty: true };
            const choice = json.choices?.[0];
            if (choice?.delta && (choice.delta.reasoning_content || choice.delta.reasoning)) sawReasoning = true;
            if (json.type === 'content_block_delta' && json.delta?.thinking) sawReasoning = true;
            const delta = deltaOf(shape, json);
            if (delta) { text += delta; emit({ type: 'chunk', text: delta }); }
          } catch { /* partial frame */ }
        }
      }
    } catch (err) {
      return { networkError: err, url: usedUrl, status: 0, empty: true, text };
    }

    if (!sawFrame && raw.trim()) {
      try {
        const json = JSON.parse(raw);
        const err = errorText(json);
        if (err) return { status: 200, detail: err, url: usedUrl, empty: true };
        const parsed = textFromJson(shape, json);
        if (parsed) { text = parsed; emit({ type: 'chunk', text: parsed }); }
      } catch { /* not JSON */ }
    }

    return { text, raw, url: usedUrl, status: 200, sawReasoning, empty: !text.trim() };
  }

  const first = await attempt(maxTokens);
  let result = first;

  if (result.networkError) {
    activeRequests.delete(id);
    if (result.networkError.name === 'AbortError') { emit({ type: 'cancelled' }); return { ok: false, cancelled: true }; }
    emit({
      type: 'error',
      message: `Could not reach ${first.url}. ${result.networkError.message}`,
      hint: 'Check the base URL and the connection.',
    });
    return { ok: false, error: result.networkError.message };
  }

  if (result.status && result.status !== 200) {
    activeRequests.delete(id);
    let hint = '';
    if (result.status === 401 || result.status === 403) hint = 'The key was rejected.';
    else if (result.status === 404) hint = `No endpoint at ${result.url}. Check the base URL and the API shape.`;
    else if (result.status === 429) hint = 'Rate limited by the provider.';
    emit({
      type: 'error',
      message: `HTTP ${result.status}. ${String(result.detail || '').slice(0, 500)} ${hint}`.trim(),
      url: result.url,
      shape,
    });
    return { ok: false, status: result.status };
  }

  // An empty stream usually means the model spent its whole budget before
  // producing prose (reasoning models do this). One retry with a wider budget
  // is cheaper than making the author press R again.
  if (!result.text.trim() && !ctrl.signal.aborted) {
    const wider = Math.min(8000, Math.max(1200, Math.round((maxTokens || 1200) * 2.4)));
    const second = await attempt(wider);
    if (second.networkError && second.networkError.name === 'AbortError') {
      activeRequests.delete(id);
      emit({ type: 'cancelled' });
      return { ok: false, cancelled: true };
    }
    if (second.text && second.text.trim()) result = second;
    else if (!result.detail) result = { ...second, detail: second.detail || result.detail };
  }

  activeRequests.delete(id);

  if (!result.text.trim()) {
    const bytes = result.raw ? result.raw.length : 0;
    const preview = (result.detail || result.raw || '').replace(/\s+/g, ' ').slice(0, 220);
    emit({
      type: 'error',
      message: `The provider answered with no prose. ${result.sawReasoning ? 'It spent the budget on reasoning tokens. ' : ''}shape=${shape} · model=${normalizeModel(model)} · ${bytes} bytes received${preview ? ` · ${preview}` : ''}`,
      hint: 'Try another model, raise the budget, or force a different API shape in Settings → AI provider.',
      shape,
      url: result.url,
    });
    return { ok: false, empty: true };
  }

  emit({ type: 'done', text: result.text, url: result.url, shape });
  return { ok: true, text: result.text, url: result.url, shape };
});

ipcMain.handle('ai:cancel', (_e, id) => {
  const ctrl = activeRequests.get(id);
  if (ctrl) {
    try { ctrl.abort(); } catch { /* ignore */ }
    activeRequests.delete(id);
    return true;
  }
  return false;
});

/* ------------------------------------------------------------------ */
/* IPC: app + window                                                  */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  name: 'FLECT',
  platform: process.platform,
  electron: process.versions.electron,
  userData: app.getPath('userData'),
  home: app.getPath('documents'),
}));

ipcMain.handle('win:minimize', () => mainWindow?.minimize());
ipcMain.handle('win:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('win:close', () => mainWindow?.close());

let docState = { dirty: false, name: 'Untitled' };
let allowClose = false;

ipcMain.handle('doc:state', (_e, state) => {
  if (state && typeof state === 'object') docState = state;
  return true;
});

ipcMain.handle('win:forceClose', () => {
  allowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  return true;
});

ipcMain.handle('edit:action', (_e, action) => {
  const wc = mainWindow?.webContents;
  if (!wc) return false;
  if (action === 'cut') wc.cut();
  else if (action === 'copy') wc.copy();
  else if (action === 'paste') wc.paste();
  else if (action === 'selectAll') wc.selectAll();
  else return false;
  return true;
});
ipcMain.handle('win:isMaximized', () => !!mainWindow?.isMaximized());
ipcMain.handle('win:fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

/* ------------------------------------------------------------------ */
/* Context menu                                                       */
/* ------------------------------------------------------------------ */

function buildContextMenu(params, win) {
  const hasSelection = !!String(params.selectionText || '').trim();
  const flags = params.editFlags || {};
  const items = [];

  const spell = [];
  if (params.misspelledWord) {
    const suggestions = params.dictionarySuggestions || [];
    if (suggestions.length) {
      for (const word of suggestions.slice(0, 5)) {
        spell.push({ label: word, click: () => win.webContents.replaceMisspelling(word) });
      }
    } else {
      spell.push({ label: 'No suggestions', enabled: false });
    }
    spell.push({ type: 'separator' });
    spell.push({
      label: `Add “${params.misspelledWord}” to dictionary`,
      click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    spell.push({ type: 'separator' });
  }
  items.push(...spell);

  if (params.isEditable) {
    items.push(
      { label: 'Undo', role: 'undo', enabled: flags.canUndo },
      { label: 'Redo', role: 'redo', enabled: flags.canRedo },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: flags.canCut },
      { label: 'Copy', role: 'copy', enabled: flags.canCopy },
      { label: 'Paste', role: 'paste', enabled: flags.canPaste },
      { label: 'Paste as plain text', role: 'pasteAndMatchStyle', enabled: flags.canPaste },
    );
  } else if (hasSelection) {
    items.push({ label: 'Copy', role: 'copy', enabled: flags.canCopy });
  }

  if (hasSelection) {
    items.push(
      { type: 'separator' },
      {
        label: 'Ask FLECT',
        submenu: [
          { label: 'Rephrase five ways', accelerator: 'R', click: () => win.webContents.send('menu:ai', 'R') },
          { label: 'Grammar and spelling', accelerator: 'G', click: () => win.webContents.send('menu:ai', 'G') },
          { label: 'Punctuation', accelerator: 'P', click: () => win.webContents.send('menu:ai', 'P') },
          { label: 'Split long sentences', accelerator: 'L', click: () => win.webContents.send('menu:ai', 'L') },
          { type: 'separator' },
          { label: 'Custom instruction…', accelerator: 'C', click: () => win.webContents.send('menu:ai', 'C') },
        ],
      },
    );
  }

  if (params.linkURL) {
    items.push(
      { type: 'separator' },
      { label: 'Open link in browser', click: () => shell.openExternal(params.linkURL) },
      { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
    );
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ type: 'separator' }, { label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) });
  }

  items.push({ type: 'separator' }, { label: 'Select all', role: 'selectAll', enabled: flags.canSelectAll });

  return Menu.buildFromTemplate(items);
}

/* ------------------------------------------------------------------ */
/* Window snapping                                                    */
/* ------------------------------------------------------------------ */

function snapBounds(target) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const wa = display.workArea;
  const halfW = Math.round(wa.width / 2);
  const halfH = Math.round(wa.height / 2);
  const map = {
    left: { x: wa.x, y: wa.y, width: halfW, height: wa.height },
    right: { x: wa.x + halfW, y: wa.y, width: wa.width - halfW, height: wa.height },
    'top-left': { x: wa.x, y: wa.y, width: halfW, height: halfH },
    'top-right': { x: wa.x + halfW, y: wa.y, width: wa.width - halfW, height: halfH },
    'bottom-left': { x: wa.x, y: wa.y + halfH, width: halfW, height: wa.height - halfH },
    'bottom-right': { x: wa.x + halfW, y: wa.y + halfH, width: wa.width - halfW, height: wa.height - halfH },
  };
  if (target === 'maximize') { mainWindow.maximize(); return { bounds: mainWindow.getBounds(), workArea: wa }; }
  if (target === 'restore') { mainWindow.unmaximize(); return { bounds: mainWindow.getBounds(), workArea: wa }; }
  const bounds = map[target];
  if (!bounds) return null;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setBounds(bounds, true);
  return { bounds: mainWindow.getBounds(), workArea: wa };
}

ipcMain.handle('win:snap', (_e, target) => snapBounds(target));
ipcMain.handle('win:bounds', () => (mainWindow ? mainWindow.getBounds() : null));

/* ------------------------------------------------------------------ */
/* IPC: files                                                         */
/* ------------------------------------------------------------------ */

ipcMain.handle('file:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Open manuscript',
    properties: ['openFile'],
    filters: [
      { name: 'All supported', extensions: ['docx', 'docm', 'txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'flect'] },
      { name: 'Word documents', extensions: ['docx', 'docm'] },
      { name: 'Text and Markdown', extensions: ['txt', 'md', 'markdown'] },
      { name: 'Web page', extensions: ['html', 'htm'] },
      { name: 'Rich Text', extensions: ['rtf'] },
      { name: 'FLECT document', extensions: ['flect'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    return await readDocument(res.filePaths[0]);
  } catch (err) {
    return { error: err.message, path: res.filePaths[0] };
  }
});

ipcMain.handle('file:read', async (_e, filePath) => {
  try {
    return await readDocument(filePath);
  } catch (err) {
    return { error: err.message, path: filePath };
  }
});

ipcMain.handle('file:save', async (_e, { filePath, data, encoding }) => {
  try {
    if (encoding === 'base64') {
      await fs.writeFile(filePath, Buffer.from(data, 'base64'));
    } else {
      await fs.writeFile(filePath, data, 'utf8');
    }
    const stat = await fs.stat(filePath);
    await addRecent(filePath);
    return { ok: true, path: filePath, mtime: stat.mtimeMs };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:chooseSave', async (_e, { defaultName, filters, title }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: title || 'Save manuscript',
    defaultPath: defaultName,
    filters: filters || [{ name: 'FLECT document', extensions: ['flect'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  return { path: res.filePath };
});

ipcMain.handle('file:saveAs', async (_e, { defaultName, filters, data, encoding }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save manuscript',
    defaultPath: defaultName,
    filters: filters || [{ name: 'FLECT document', extensions: ['flect'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try {
    if (encoding === 'base64') await fs.writeFile(res.filePath, Buffer.from(data, 'base64'));
    else await fs.writeFile(res.filePath, data, 'utf8');
    await addRecent(res.filePath);
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ----------------------------- recovery ---------------------------- */

ipcMain.handle('recovery:write', async (_e, payload) => {
  try {
    const target = path.join(app.getPath('userData'), 'recovery.json');
    await fs.writeFile(target, JSON.stringify({ ...payload, at: Date.now() }), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('recovery:read', async () => {
  try {
    const target = path.join(app.getPath('userData'), 'recovery.json');
    const data = JSON.parse(await fs.readFile(target, 'utf8'));
    if (!data || !data.html) return null;
    return data;
  } catch {
    return null;
  }
});

ipcMain.handle('recovery:clear', async () => {
  try {
    await fs.unlink(path.join(app.getPath('userData'), 'recovery.json'));
  } catch { /* already gone */ }
  return true;
});

ipcMain.handle('file:exists', async (_e, p) => {
  try { await fs.access(p); return true; } catch { return false; }
});

ipcMain.handle('file:reveal', async (_e, p) => {
  if (p && fss.existsSync(p)) shell.showItemInFolder(p);
});

ipcMain.handle('dialog:message', async (_e, { type = 'info', title, message, detail, buttons }) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type, title, message, detail,
    buttons: buttons || ['OK'],
    defaultId: 0, cancelId: (buttons || ['OK']).length - 1,
  });
  return res.response;
});

/* ------------------------------------------------------------------ */
/* IPC: pdf                                                           */
/* ------------------------------------------------------------------ */

ipcMain.handle('export:pdf', async (_e, { html, path: target, pageSize, marginIn, pageNumbers }) => {
  try {
    const pdf = await renderPdf(html, { pageSize, marginIn, pageNumbers });
    let outPath = target;
    if (!outPath) {
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Export PDF',
        defaultPath: 'manuscript.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      outPath = res.filePath;
    }
    await fs.writeFile(outPath, pdf);
    return { ok: true, path: outPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ------------------------------------------------------------------ */
/* recent                                                             */
/* ------------------------------------------------------------------ */

async function addRecent(filePath) {
  const s = await readSettings();
  const name = path.basename(filePath);
  const recent = [{ path: filePath, name, at: Date.now() }, ...(s.recent || []).filter((r) => r.path !== filePath)].slice(0, 12);
  await writeSettings({ recent });
}

ipcMain.handle('recent:list', async () => {
  const s = await readSettings();
  const out = [];
  for (const r of s.recent || []) {
    try { await fs.access(r.path); out.push(r); } catch { /* skip missing */ }
  }
  return out;
});

ipcMain.handle('recent:add', async (_e, p) => { await addRecent(p); return true; });
ipcMain.handle('recent:clear', async () => { await writeSettings({ recent: [] }); return true; });

/* ------------------------------------------------------------------ */
/* IPC: settings + shell                                              */
/* ------------------------------------------------------------------ */

ipcMain.handle('settings:get', async () => readSettings());
ipcMain.handle('settings:set', async (_e, next) => writeSettings(next));
ipcMain.handle('shell:external', (_e, url) => {
  if (/^https?:/i.test(url)) shell.openExternal(url);
});
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));

/* ------------------------------------------------------------------ */
/* lifecycle                                                          */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    abortAll();
    if (process.platform !== 'darwin') app.quit();
  });
}
