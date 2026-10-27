import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';

import TitleBar from './components/TitleBar.jsx';
import MenuBar from './components/MenuBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import FindBar from './components/FindBar.jsx';
import AIPopup from './components/AIPopup.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import ExportDialog from './components/ExportDialog.jsx';
import Toasts from './components/Toasts.jsx';
import { Icon } from './components/Icons.jsx';

import { createExtensions, cleanPastedHtml } from './editor/extensions.js';
import { buildDocx } from './lib/export/docx.js';
import { buildEpub } from './lib/export/epub.js';
import {
  toMarkdown, toPlainText, toRtf, buildHtmlDocument, buildPrintHtml, wordStats,
} from './lib/export/serialize.js';
import {
  SAVE_FILTERS, filtersFor, asKind, labelFor, REBINDABLE,
} from './lib/formats.js';

const API = window.flect;

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
};

function b64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

const splitName = (p) => {
  const name = String(p).split(/[\\/]/).pop();
  const dot = name.lastIndexOf('.');
  return { name, base: dot > 0 ? name.slice(0, dot) : name, ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '' };
};

function pageCfg(settings) {
  const p = settings.page;
  return {
    pageSize: p.size,
    marginIn: p.margin,
    font: p.font,
    fontSize: p.fontSize,
    lineHeight: p.lineHeight,
    firstLineIndent: p.indent,
    spaceAfter: p.spaceAfter,
    justify: p.justify,
    tint: p.tint,
  };
}

/* ------------------------------------------------------------------ */

function EditorSurface({ content, handlersRef, onReady }) {
  const editor = useEditor({
    extensions: createExtensions('Begin here…'),
    content: content || '<p></p>',
    editorProps: {
      attributes: { class: 'flect-doc', spellcheck: 'true', autocapitalize: 'off' },
      transformPastedHTML: cleanPastedHtml,
      handleKeyDown: (view, event) => handlersRef.current.keydown?.(view, event) || false,
    },
    onUpdate: ({ editor: ed }) => handlersRef.current.update?.(ed),
    onSelectionUpdate: ({ editor: ed }) => handlersRef.current.selection?.(ed),
  });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  return <EditorContent editor={editor} />;
}

/* ------------------------------------------------------------------ */

export default function App() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [appInfo, setAppInfo] = useState(null);
  const [session, setSession] = useState({ key: 0, html: '' });
  const [doc, setDoc] = useState({
    path: null, name: 'Untitled.docx', base: 'Untitled', ext: 'docx', dirty: false, savedAt: null,
  });
  const [editor, setEditor] = useState(null);
  const [stats, setStats] = useState({ words: 0, chars: 0, readMinutes: 1 });
  const [selectionWords, setSelectionWords] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [zen, setZen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [formatDialog, setFormatDialog] = useState(null); // 'save' | 'export' | null
  const [busy, setBusy] = useState(false);
  const [aiState, setAiState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [recent, setRecent] = useState([]);
  const [recovery, setRecovery] = useState(null);
  const [history, setHistory] = useState([]);
  const [welcomeHidden, setWelcomeHidden] = useState(false);

  const toastId = useRef(1);
  const handlersRef = useRef({});
  const docRef = useRef(doc);
  const statsTimer = useRef(null);
  const recoveryTimer = useRef(null);

  docRef.current = doc;

  const push = useCallback((title, detail, kind = 'info', extra = {}) => {
    const id = toastId.current++;
    setToasts((list) => [...list.slice(-3), { id, title, detail, kind, ...extra }]);
  }, []);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  /* ---------------------------------------------------------------- */
  /* boot                                                             */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, info, rec, last] = await Promise.all([
        API.settings.get(),
        API.app.info(),
        API.file.recent(),
        API.recovery.read(),
      ]);
      if (!alive) return;
      setSettings({
        ...DEFAULTS,
        ...s,
        ai: { ...DEFAULTS.ai, ...(s.ai || {}) },
        page: { ...DEFAULTS.page, ...(s.page || {}) },
        editor: { ...DEFAULTS.editor, ...(s.editor || {}) },
      });
      setAppInfo(info);
      setRecent(rec || []);
      if (last && last.html) setRecovery(last);
      setSidebarOpen((s?.editor?.sidebar) ?? true);
      setZoom(s?.editor?.zoom || 1);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.title = `${doc.dirty ? '• ' : ''}${doc.name} — FLECT`;
  }, [doc.name, doc.dirty]);

  useEffect(() => {
    API?.docState?.({ dirty: doc.dirty, name: doc.name });
  }, [doc.dirty, doc.name]);

  /* ---------------------------------------------------------------- */
  /* editor callbacks                                                 */
  /* ---------------------------------------------------------------- */
  const recompute = useCallback((ed) => {
    const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', '\n');
    const compact = text.replace(/\s+/g, ' ').trim();
    const words = compact ? compact.split(' ').length : 0;
    setStats({
      words,
      chars: compact.length,
      readMinutes: Math.max(1, Math.round(words / 230)),
    });
    const sel = ed.state.selection;
    if (sel.empty) setSelectionWords(0);
    else {
      const selText = ed.state.doc.textBetween(sel.from, sel.to, ' ').replace(/\s+/g, ' ').trim();
      setSelectionWords(selText ? selText.split(' ').length : 0);
    }
  }, []);

  const markDirty = useCallback(() => {
    setDoc((d) => (d.dirty ? d : { ...d, dirty: true }));
  }, []);

  const scheduleRecovery = useCallback((ed) => {
    if (!settings.editor.autosave) return;
    clearTimeout(recoveryTimer.current);
    recoveryTimer.current = setTimeout(() => {
      const html = ed.getHTML();
      const st = wordStats(html);
      if (!st.words) { API.recovery.clear(); setRecovery(null); return; }
      API.recovery.write({ html, name: docRef.current.name, path: docRef.current.path });
    }, 2500);
  }, [settings.editor.autosave]);

  handlersRef.current = {
    keydown: (view, event) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return false;
      if (event.ctrlKey || event.metaKey) return false;
      if (aiState) return false;
      const needAlt = !settings.editor.aiBareKeys;
      if (needAlt && !event.altKey) return false;
      if (!needAlt && event.altKey) return false;
      const key = (event.key || '').toLowerCase();
      const map = { r: 'R', g: 'G', p: 'P', l: 'L', c: 'C' };
      if (!map[key]) return false;
      const sel = view.state.selection;
      if (sel.empty) return false;
      event.preventDefault();
      openAI(map[key], view);
      return true;
    },
    update: (ed) => {
      markDirty();
      clearTimeout(statsTimer.current);
      statsTimer.current = setTimeout(() => recompute(ed), 220);
      scheduleRecovery(ed);
    },
    selection: (ed) => {
      const sel = ed.state.selection;
      if (sel.empty) setSelectionWords(0);
      else {
        const t = ed.state.doc.textBetween(sel.from, sel.to, ' ').replace(/\s+/g, ' ').trim();
        setSelectionWords(t ? t.split(' ').length : 0);
      }
    },
  };

  const onEditorReady = useCallback((ed) => {
    setEditor(ed);
    window.__flectEditor = ed;
    recompute(ed);
  }, [recompute]);

  /* ---------------------------------------------------------------- */
  /* AI                                                               */
  /* ---------------------------------------------------------------- */
  const openAI = useCallback((action, view) => {
    const { state } = view;
    const { from, to } = state.selection;
    const text = state.doc.textBetween(from, to, '\n');
    if (!text.trim()) return;
    const $from = state.doc.resolve(from);
    const $to = state.doc.resolve(to);
    let block = false;
    try {
      block = from === $from.start() && to === $to.end() && $from.sameParent($to);
    } catch { block = false; }
    const context = state.doc.textBetween($from.start(), $from.end(), '\n');
    const c = view.coordsAtPos(to);
    setAiState({
      action,
      from,
      to,
      text,
      context,
      block,
      coords: {
        left: c.left, right: c.right, top: c.top, bottom: c.bottom,
      },
    });
  }, []);

  const appliedAI = useCallback((entry) => {
    setHistory((h) => [entry, ...h].slice(0, 40));
    push(`${entry.label} applied`, `${entry.from.length} → ${entry.to.length} characters`, 'success');
  }, [push]);

  // Right-click → Ask FLECT. The native menu cannot know the selection, so it
  // asks the renderer to act on whatever is selected right now.
  useEffect(() => {
    if (!API?.app?.onAIMenu) return undefined;
    return API.app.onAIMenu((action) => {
      const view = editor?.view;
      if (!view) return;
      if (view.state.selection.empty) {
        push('Select text first', 'Highlight a passage, then choose an AI action.', 'info');
        return;
      }
      openAI(action, view);
    });
  }, [editor, openAI, push]);

  // Remember whether the navigator is collapsed.
  useEffect(() => {
    if (!API?.settings) return;
    const id = setTimeout(() => {
      API.settings.set({ editor: { sidebar: sidebarOpen } }).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [sidebarOpen]);

  /* ---------------------------------------------------------------- */
  /* files                                                            */
  /* ---------------------------------------------------------------- */
  const refreshRecent = useCallback(async () => {
    setRecent((await API.file.recent()) || []);
  }, []);

  const loadResult = useCallback((res) => {
    if (!res || res.error) {
      push('Could not open the file', res?.error || 'Unknown error', 'error');
      return;
    }
    setSession((s) => ({ key: s.key + 1, html: res.html || '<p></p>' }));
    setDoc({
      path: res.path,
      name: res.name,
      base: res.base || res.name,
      ext: res.ext || 'txt',
      dirty: false,
      savedAt: Date.now(),
    });
    refreshRecent();
    if (res.warnings?.length) {
      push('Opened with notes', res.warnings.join(' · '), 'info', { sticky: true });
    }
    API.recovery.clear();
    setRecovery(null);
  }, [push, refreshRecent]);

  const openFile = useCallback(async () => {
    try {
      const res = await API.file.open();
      if (!res) return;
      if (res.error) { push('Could not open that file', res.error, 'error', { sticky: true }); return; }
      loadResult(res);
    } catch (err) {
      push('Could not open that file', err.message, 'error', { sticky: true });
    }
  }, [loadResult, push]);

  const openPath = useCallback(async (p) => {
    try {
      const res = await API.file.read(p);
      if (res?.error) { push('Could not open that file', res.error, 'error', { sticky: true }); return; }
      loadResult(res);
    } catch (err) {
      push('Could not open that file', err.message, 'error', { sticky: true });
    }
  }, [loadResult, push]);

  const newDocument = useCallback(() => {
    setSession((s) => ({ key: s.key + 1, html: '<p></p>' }));
    setDoc({
      path: null, name: 'Untitled.docx', base: 'Untitled', ext: 'docx', dirty: false, savedAt: null,
    });
    push('New document', 'Nothing touches the old file.', 'info');
  }, [push]);

  const buildPayload = useCallback(async (kind, html, titleOverride) => {
    const page = pageCfg(settings);
    const title = titleOverride || docRef.current.base || 'Untitled';
    switch (kind) {
      case 'md':
        return { data: toMarkdown(html), encoding: 'utf8' };
      case 'txt':
        return { data: toPlainText(html), encoding: 'utf8' };
      case 'html':
        return { data: buildHtmlDocument(html, page, { title }), encoding: 'utf8' };
      case 'rtf':
        return { data: toRtf(html, page), encoding: 'utf8' };
      case 'docx': {
        const bytes = await buildDocx(html, page, { title });
        return { data: b64(bytes), encoding: 'base64' };
      }
      case 'epub': {
        const bytes = await buildEpub(html, { title, author: '' });
        return { data: b64(bytes), encoding: 'base64' };
      }
      case 'flect':
        return {
          data: JSON.stringify({
            format: 'flect',
            version: 1,
            title,
            html,
            page: settings.page,
            modified: new Date().toISOString(),
          }, null, 1),
          encoding: 'utf8',
        };
      default:
        return { data: toPlainText(html), encoding: 'utf8' };
    }
  }, [settings]);

  const writeTo = useCallback(async (path, kind, { silent = false, rebind = true } = {}) => {
    if (!editor) return false;
    const info = splitName(path);
    setBusy(true);
    try {
      const html = editor.getHTML();
      if (kind === 'pdf') {
        const printHtml = buildPrintHtml(html, pageCfg(settings), { title: info.base });
        const res = await API.exportPdf({
          html: printHtml,
          path,
          pageSize: settings.page.size,
          marginIn: settings.page.margin,
        });
        if (!res.ok) { push('PDF export failed', res.error || 'Unknown error', 'error'); return false; }
        if (!silent) push('Exported PDF', path, 'success');
        return true;
      }
      const payload = await buildPayload(kind, html, info.base);
      const res = await API.file.save({ filePath: path, ...payload });
      if (!res.ok) { push('Save failed', res.error, 'error'); return false; }
      if (rebind) {
        setDoc((d) => ({
          ...d,
          path,
          name: info.name,
          base: info.base,
          ext: info.ext || kind,
          dirty: false,
          savedAt: Date.now(),
        }));
      }
      refreshRecent();
      if (!silent) push(rebind ? 'Saved' : 'Copy written', path, 'success');
      return true;
    } catch (err) {
      push('Save failed', err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [editor, settings, buildPayload, push, refreshRecent]);

  /** Save As: choose a format in the grid, choose a path, then write. */
  const saveAsFormat = useCallback(async (kind) => {
    const info = docRef.current;
    const target = asKind(kind);
    const res = await API.file.chooseSave({
      defaultName: `${info.base || 'Untitled'}.${target}`,
      filters: filtersFor(target),
      title: `Save as ${labelFor(target)}`,
    });
    if (!res?.path) return false;
    const chosen = splitName(res.path);
    const finalKind = asKind(chosen.ext) || target;
    const rebind = REBINDABLE.has(finalKind);
    const ok = await writeTo(res.path, finalKind, { rebind });
    if (ok && !rebind) {
      push(`${labelFor(finalKind)} copy written`, `${info.name} is still the open document.`, 'info');
    }
    return ok;
  }, [writeTo, push]);

  const openSaveAs = useCallback(() => setFormatDialog('save'), []);
  const openExport = useCallback(() => setFormatDialog('export'), []);

  const save = useCallback(async () => {
    const info = docRef.current;
    if (!info.path) { setFormatDialog('save'); return false; }
    return writeTo(info.path, asKind(info.ext));
  }, [writeTo]);

  const exportAs = useCallback(async (kind) => {
    setFormatDialog(null);
    const info = docRef.current;
    const res = await API.file.chooseSave({
      defaultName: `${info.base || 'Untitled'}.${kind}`,
      filters: filtersFor(kind),
      title: `Export ${labelFor(kind)}`,
    });
    if (!res?.path) return;
    setBusy(true);
    try {
      if (kind === 'pdf') {
        await writeTo(res.path, 'pdf');
      } else {
        const html = editor?.getHTML() || '';
        const payload = await buildPayload(kind, html);
        const out = await API.file.save({ filePath: res.path, ...payload });
        if (out.ok) push(`Exported ${kind.toUpperCase()}`, res.path, 'success');
        else push('Export failed', out.error, 'error');
      }
    } catch (err) {
      push('Export failed', err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [editor, buildPayload, push, writeTo]);

  const pickImage = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const probe = new Image();
      probe.onload = () => {
        const max = 560;
        const scale = probe.width > max ? max / probe.width : 1;
        editor?.chain().focus()
          .setImage({
            src,
            width: Math.round(probe.width * scale),
            height: Math.round(probe.height * scale),
          })
          .run();
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }, [editor]);

  const applySettings = useCallback(async (draft) => {
    const merged = await API.settings.set(draft);
    setSettings({
      ...DEFAULTS,
      ...merged,
      ai: { ...DEFAULTS.ai, ...(merged.ai || {}) },
      page: { ...DEFAULTS.page, ...(merged.page || {}) },
      editor: { ...DEFAULTS.editor, ...(merged.editor || {}) },
    });
    setSettingsOpen(false);
    push('Settings saved', 'They apply to the next request and the next save.', 'success');
  }, [push]);

  const restoreSession = useCallback(() => {
    if (!recovery) return;
    setSession((s) => ({ key: s.key + 1, html: recovery.html }));
    setDoc((d) => ({
      ...d,
      path: recovery.path || null,
      name: recovery.name || 'Untitled.docx',
      base: splitName(recovery.name || 'Untitled').base,
      ext: recovery.path ? splitName(recovery.path).ext : 'docx',
      dirty: true,
      savedAt: null,
    }));
    setRecovery(null);
    push('Session restored', 'The snapshot is on the page. Save it to keep it.', 'success');
  }, [recovery, push]);

  /* ---------------------------------------------------------------- */
  /* shortcuts                                                        */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        if (aiState) { setAiState(null); return; }
        if (findOpen) { setFindOpen(false); return; }
        if (zen) { setZen(false); return; }
        if (formatDialog) { setFormatDialog(null); return; }
      }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); if (e.shiftKey) openSaveAs(); else save(); return; }
      if (k === 'o') { e.preventDefault(); openFile(); return; }
      if (k === 'n') { e.preventDefault(); newDocument(); return; }
      if (k === 'b' && e.shiftKey) { e.preventDefault(); setSidebarOpen((v) => !v); return; }
      if (k === 'f') { e.preventDefault(); setFindOpen(true); return; }
      if (k === 'p') { e.preventDefault(); exportAs('pdf'); return; }
      if (k === 'e') { e.preventDefault(); openExport(); return; }
      if (k === ',') { e.preventDefault(); setSettingsOpen(true); return; }
      if (k === 'k' && editor) {
        e.preventDefault();
        const prev = editor.getAttributes('link').href || '';
        const url = window.prompt('Link address', prev || 'https://');
        if (url === null) return;
        if (!url.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
        return;
      }
      if (k === '0' && !inField) { e.preventDefault(); setZoom(1); return; }
      if ((k === '=' || k === '+') && !inField) { e.preventDefault(); setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2))); return; }
      if (k === '-' && !inField) { e.preventDefault(); setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aiState, findOpen, zen, formatDialog, editor, save, openSaveAs, openExport, openFile, newDocument, exportAs]);

  useEffect(() => {
    if (!API?.app?.onSaveAndClose) return undefined;
    return API.app.onSaveAndClose(async () => {
      const ok = await save();
      if (ok || !docRef.current.dirty) API.app.forceClose();
    });
  }, [save]);

  /* ---------------------------------------------------------------- */
  /* menus                                                            */
  /* ---------------------------------------------------------------- */
  const aiReady = !!(settings.ai.baseUrl && settings.ai.apiKey && settings.ai.model);

  const buildMenus = useCallback((hasSelection) => {
    const c = editor?.chain().focus();
    const aiItem = (label, action, key) => ({
      label,
      shortcut: key,
      disabled: !hasSelection,
      action: () => {
        const view = editor?.view;
        if (view) openAI(action, view);
      },
    });
    return [
      {
        label: 'File',
        items: [
          { label: 'New document', shortcut: 'Ctrl+N', action: newDocument },
          { label: 'Open…', shortcut: 'Ctrl+O', action: openFile },
          { type: 'sep' },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => save() },
          { label: 'Save as…', shortcut: 'Ctrl+Shift+S', action: openSaveAs },
          { type: 'sep' },
          { label: 'Export…', shortcut: 'Ctrl+E', action: openExport },
          { label: 'Export PDF', shortcut: 'Ctrl+P', action: () => exportAs('pdf') },
          { type: 'sep' },
          ...(recent.length ? [{ type: 'label', text: 'Recent' }] : []),
          ...recent.slice(0, 5).map((r) => ({ label: r.name, action: () => openPath(r.path) })),
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo', shortcut: 'Ctrl+Z', action: () => c?.undo().run() },
          { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => c?.redo().run() },
          { type: 'sep' },
          { label: 'Cut', shortcut: 'Ctrl+X', action: () => API.edit('cut') },
          { label: 'Copy', shortcut: 'Ctrl+C', action: () => API.edit('copy') },
          { label: 'Paste', shortcut: 'Ctrl+V', action: () => API.edit('paste') },
          { label: 'Select all', shortcut: 'Ctrl+A', action: () => API.edit('selectAll') },
          { type: 'sep' },
          { label: 'Find and replace', shortcut: 'Ctrl+F', action: () => setFindOpen(true) },
        ],
      },
      {
        label: 'Insert',
        items: [
          { label: 'Image…', action: () => document.querySelector('.toolbar input[type=file]')?.click() },
          { label: 'Table', action: () => c?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
          { label: 'Horizontal rule', action: () => c?.setHorizontalRule().run() },
          { label: 'Quotation', action: () => c?.toggleBlockquote().run() },
          { type: 'sep' },
          { label: 'Link…', shortcut: 'Ctrl+K', action: () => {
            const url = window.prompt('Link address', 'https://');
            if (url) c?.extendMarkRange('link').setLink({ href: url }).run();
          } },
        ],
      },
      {
        label: 'Format',
        items: [
          { label: 'Title', action: () => c?.setParagraph().toggleHeading({ level: 1 }).run() },
          { label: 'Heading 1', action: () => c?.setParagraph().toggleHeading({ level: 2 }).run() },
          { label: 'Heading 2', action: () => c?.setParagraph().toggleHeading({ level: 3 }).run() },
          { label: 'Body text', action: () => c?.setParagraph().run() },
          { type: 'sep' },
          { label: 'Bold', shortcut: 'Ctrl+B', action: () => c?.toggleBold().run() },
          { label: 'Italic', shortcut: 'Ctrl+I', action: () => c?.toggleItalic().run() },
          { label: 'Underline', shortcut: 'Ctrl+U', action: () => c?.toggleUnderline().run() },
          { label: 'Clear formatting', action: () => c?.unsetAllMarks().clearNodes().run() },
        ],
      },
      {
        label: 'View',
        items: [
          { label: 'Navigator', shortcut: 'Ctrl+Shift+B', check: sidebarOpen, action: () => setSidebarOpen((v) => !v) },
          { label: 'Focus mode', shortcut: 'F9', check: zen, action: () => setZen((v) => !v) },
          { type: 'sep' },
          { label: 'Window: left half', action: () => API.app.snap('left') },
          { label: 'Window: right half', action: () => API.app.snap('right') },
          { label: 'Window: top-left quarter', action: () => API.app.snap('top-left') },
          { label: 'Window: bottom-right quarter', action: () => API.app.snap('bottom-right') },
          { type: 'sep' },
          { label: 'Zoom in', shortcut: 'Ctrl++', action: () => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2))) },
          { label: 'Zoom out', shortcut: 'Ctrl+-', action: () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))) },
          { label: 'Actual size', shortcut: 'Ctrl+0', action: () => setZoom(1) },
          { type: 'sep' },
          { label: 'Ivory paper', check: settings.page.tint === 'ivory', action: () => applySettings({ ...settings, page: { ...settings.page, tint: 'ivory' } }) },
          { label: 'Snow paper', check: settings.page.tint === 'snow', action: () => applySettings({ ...settings, page: { ...settings.page, tint: 'snow' } }) },
          { label: 'Sepia paper', check: settings.page.tint === 'sepia', action: () => applySettings({ ...settings, page: { ...settings.page, tint: 'sepia' } }) },
          { label: 'Slate paper', check: settings.page.tint === 'slate', action: () => applySettings({ ...settings, page: { ...settings.page, tint: 'slate' } }) },
        ],
      },
      {
        label: 'AI',
        items: [
          aiItem('Rephrase', 'R'),
          aiItem('Grammar and spelling', 'G'),
          aiItem('Punctuation', 'P'),
          aiItem('Split long sentences', 'L'),
          aiItem('Custom instruction', 'C'),
          { type: 'sep' },
          { label: aiReady ? `Model: ${settings.ai.model}` : 'Connect a model…', action: () => setSettingsOpen(true) },
          { label: 'AI settings…', action: () => setSettingsOpen(true) },
        ],
      },
      {
        label: 'Help',
        items: [
          { label: 'Keyboard shortcuts', action: () => setSettingsOpen(true) },
          { label: 'File formats', action: () => setSettingsOpen(true) },
          { type: 'sep' },
          { label: `About FLECT ${appInfo?.version || ''}`, action: () => push('FLECT', 'An AI manuscript studio. Built for authors who can hear their own voice.', 'info', { sticky: true }) },
        ],
      },
    ];
  }, [editor, recent, sidebarOpen, zen, settings, aiReady, appInfo, openAI, newDocument, openFile, save, openSaveAs, openExport, exportAs, openPath, applySettings, push]);

  /* ---------------------------------------------------------------- */
  /* render                                                           */
  /* ---------------------------------------------------------------- */
  const savedLabel = useMemo(() => {
    if (doc.dirty) return 'Unsaved changes';
    if (!doc.path) return 'Not saved yet';
    if (!doc.savedAt) return 'Saved';
    return `Saved ${new Date(doc.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [doc.dirty, doc.path, doc.savedAt]);

  const pageWidth = settings.page.size === 'Letter' ? 816 : 794;
  const pageStyle = {
    width: `${pageWidth}px`,
    '--page-pad': `${settings.page.margin * 96}px`,
    '--doc-font': settings.page.font,
    '--doc-size': `${settings.page.fontSize}pt`,
    '--doc-lh': settings.page.lineHeight,
    '--doc-indent': `${settings.page.indent}in`,
    '--doc-space': `${settings.page.spaceAfter}em`,
    '--doc-align': settings.page.justify ? 'justify' : 'left',
  };

  return (
    <div className={`app${zen ? ' is-zen' : ''}`} data-tint={settings.page.tint}>
      <TitleBar
        title={doc.name}
        dirty={doc.dirty}
        savedLabel={savedLabel}
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={openExport}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <MenuBar buildMenus={buildMenus} hasSelection={selectionWords > 0} />

      <Toolbar
        editor={editor}
        settings={settings}
        onPickImage={pickImage}
        onOpenFind={() => setFindOpen(true)}
        onOpenAIHelp={() => push('AI shortcuts', 'Select a passage first. R rephrase · G grammar · P punctuation · L split · C custom. Everything waits for your Confirm.', 'info', { sticky: true })}
      />

      <div className="workspace">
        <Sidebar
          editor={editor}
          open={sidebarOpen}
          recent={recent}
          onOpenRecent={openPath}
          onOpen={openFile}
          onNew={newDocument}
          onRestore={restoreSession}
          recovery={recovery}
        />

        <main className="stage">
          <button
            type="button"
            className={`sidebar-toggle${sidebarOpen ? '' : ' is-collapsed'}`}
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Collapse navigator (Ctrl+Shift+B)' : 'Show navigator (Ctrl+Shift+B)'}
            aria-label={sidebarOpen ? 'Collapse navigator' : 'Show navigator'}
          >
            <Icon name={sidebarOpen ? 'chevronLeft' : 'chevronRight'} size={13} />
          </button>
          <div className="stage__scroll" id="stage-scroll">
            <div
              className="page"
              style={{ ...pageStyle, zoom }}
              data-tint={settings.page.tint}
            >
              <div className="page__grain" />
              <EditorSurface
                key={session.key}
                content={session.html}
                handlersRef={handlersRef}
                onReady={onEditorReady}
              />
            </div>
            <div className="stage__tail" />
          </div>

          {stats.words === 0 && !doc.path && !welcomeHidden && (
            <div className="welcome">
              <div
                className="welcome__card"
                onMouseDown={(e) => {
                  if (!e.target.closest('button, a, input, textarea')) {
                    e.preventDefault();
                    editor?.commands.focus();
                  }
                }}
              >
                <button
                  type="button"
                  className="welcome__close"
                  title="Dismiss"
                  onClick={() => setWelcomeHidden(true)}
                >
                  <Icon name="close" size={13} />
                </button>
                <div className="welcome__mark">FLECT</div>
                <h2>A page, and five keys.</h2>
                <p>Select a passage and press one. Nothing reaches the page until you confirm.</p>
                <div className="welcome__keys">
                  {[['R', 'Rephrase'], ['G', 'Grammar'], ['P', 'Punctuation'], ['L', 'Split'], ['C', 'Custom']].map(([k, label]) => (
                    <span key={k}><kbd>{k}</kbd>{label}</span>
                  ))}
                </div>
                <div className="welcome__actions">
                  <button type="button" className="btn btn--gold" onClick={openFile}>
                    <Icon name="folder" size={14} /> Open manuscript
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setSettingsOpen(true)}>
                    <Icon name="sparkle" size={14} /> Connect a model
                  </button>
                </div>
                <p className="welcome__foot">DOCX, Markdown, text, HTML, RTF · export to PDF and EPUB</p>
              </div>
            </div>
          )}

          <FindBar editor={editor} open={findOpen} onClose={() => setFindOpen(false)} />
        </main>
      </div>

      <StatusBar
        stats={stats}
        doc={doc}
        model={settings.ai.model}
        aiReady={aiReady}
        selectionWords={selectionWords}
        onOpenSettings={() => setSettingsOpen(true)}
        zoom={zoom}
        onZoom={(d) => setZoom((z) => Math.max(0.5, Math.min(2, +(z + d).toFixed(2))))}
      />

      {aiState && (
        <AIPopup
          state={aiState}
          settings={settings}
          prompts={settings.prompts}
          editor={editor}
          onClose={() => setAiState(null)}
          onApplied={appliedAI}
          onOpenSettings={() => { setAiState(null); setSettingsOpen(true); }}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        appInfo={appInfo}
        onClose={() => setSettingsOpen(false)}
        onSave={applySettings}
      />

      <ExportDialog
        open={!!formatDialog}
        mode={formatDialog || 'export'}
        base={doc.base}
        busy={busy}
        onClose={() => setFormatDialog(null)}
        onPick={(kind) => {
          const mode = formatDialog;
          setFormatDialog(null);
          if (mode === 'save') saveAsFormat(kind);
          else exportAs(kind);
        }}
      />

      <Toasts items={toasts} onDismiss={dismiss} />

      {zen && (
        <button type="button" className="zen-exit" onClick={() => setZen(false)} title="Leave focus mode (Esc)">
          <Icon name="close" size={14} /> Focus
        </button>
      )}
    </div>
  );
}
