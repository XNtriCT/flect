'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const TEST_HOOKS = process.env.FLECT_TEST_DIR
  ? { contextMenu: (params) => ipcRenderer.invoke('test:contextMenu', params) }
  : undefined;

contextBridge.exposeInMainWorld('flect', {
  ...(TEST_HOOKS ? { test: TEST_HOOKS } : {}),
  isElectron: true,
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close'),
    forceClose: () => ipcRenderer.invoke('win:forceClose'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    fullscreen: () => ipcRenderer.invoke('win:fullscreen'),
    onWindowState: (cb) => on('win:state', cb),
    onSaveAndClose: (cb) => on('app:save-and-close', cb),
    onAIMenu: (cb) => on('menu:ai', cb),
    snap: (target) => ipcRenderer.invoke('win:snap', target),
    bounds: () => ipcRenderer.invoke('win:bounds'),
  },
  docState: (state) => ipcRenderer.invoke('doc:state', state),
  edit: (action) => ipcRenderer.invoke('edit:action', action),
  file: {
    open: () => ipcRenderer.invoke('file:open'),
    read: (p) => ipcRenderer.invoke('file:read', p),
    save: (payload) => ipcRenderer.invoke('file:save', payload),
    saveAs: (payload) => ipcRenderer.invoke('file:saveAs', payload),
    chooseSave: (payload) => ipcRenderer.invoke('file:chooseSave', payload),
    exists: (p) => ipcRenderer.invoke('file:exists', p),
    reveal: (p) => ipcRenderer.invoke('file:reveal', p),
    message: (payload) => ipcRenderer.invoke('dialog:message', payload),
    recent: () => ipcRenderer.invoke('recent:list'),
    addRecent: (p) => ipcRenderer.invoke('recent:add', p),
    clearRecent: () => ipcRenderer.invoke('recent:clear'),
  },
  recovery: {
    write: (payload) => ipcRenderer.invoke('recovery:write', payload),
    read: () => ipcRenderer.invoke('recovery:read'),
    clear: () => ipcRenderer.invoke('recovery:clear'),
  },
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (next) => ipcRenderer.invoke('settings:set', next),
  },
  ai: {
    models: (payload) => ipcRenderer.invoke('ai:models', payload),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
    cancel: (id) => ipcRenderer.invoke('ai:cancel', id),
    onEvent: (cb) => on('ai:event', cb),
  },
  shell: {
    external: (url) => ipcRenderer.invoke('shell:external', url),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  },
});
