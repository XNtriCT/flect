import React, { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
import markUrl from '../../assets/flect-mark.png';

const LAYOUTS = [
  { id: 'left', label: 'Left half', hint: 'Win + ←' },
  { id: 'right', label: 'Right half', hint: 'Win + →' },
  { id: 'top-left', label: 'Top-left quarter', hint: '' },
  { id: 'top-right', label: 'Top-right quarter', hint: '' },
  { id: 'bottom-left', label: 'Bottom-left quarter', hint: '' },
  { id: 'bottom-right', label: 'Bottom-right quarter', hint: '' },
  { id: 'maximize', label: 'Maximise', hint: '' },
];

export default function TitleBar({ title, dirty, savedLabel, onOpenSettings, onExport, onToggleSidebar }) {
  const api = window.flect;
  const [maximized, setMaximized] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);

  useEffect(() => {
    if (!layoutOpen) return undefined;
    const close = (e) => {
      if (!e.target.closest('.layout-wrap')) setLayoutOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [layoutOpen]);

  useEffect(() => {
    api?.app.isMaximized().then(setMaximized);
    return api?.app.onWindowState((s) => setMaximized(!!s.maximized));
  }, [api]);

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <img className="titlebar__logo" src={markUrl} alt="" />
        <span className="titlebar__wordmark">FLECT</span>
      </div>

      <button
        type="button"
        className="titlebar__sidetoggle no-drag"
        title="Toggle navigator"
        onClick={onToggleSidebar}
      >
        <Icon name="sidebar" size={16} />
      </button>

      <div className="titlebar__doc">
        <span className="titlebar__file" title={title}>{title}</span>
        {dirty && <span className="titlebar__dirty" title="Unsaved changes" />}
        <span className="titlebar__state">{savedLabel}</span>
      </div>

      <div className="titlebar__spacer" />

      <div className="titlebar__quick no-drag">
        <button type="button" className="titlebar__chip" onClick={onExport} title="Export">
          <Icon name="download" size={14} />
          <span>Export</span>
        </button>
        <div className="layout-wrap">
          <button
            type="button"
            className="titlebar__chip"
            onClick={() => setLayoutOpen((v) => !v)}
            title="Window layout"
          >
            <Icon name="grid" size={14} />
          </button>
          {layoutOpen && (
            <div className="ui-menu layout-menu">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="ui-menu__item"
                  onClick={() => { setLayoutOpen(false); api?.app.snap(l.id); }}
                >
                  <span className="ui-menu__check" />
                  <span className="ui-menu__label">{l.label}</span>
                  {l.hint && <span className="ui-menu__shortcut">{l.hint}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="titlebar__chip" onClick={onOpenSettings} title="Settings (Ctrl+,)">
          <Icon name="settings" size={14} />
        </button>
      </div>

      <div className="winctl no-drag">
        <button type="button" className="winctl__btn" title="Minimise" onClick={() => api?.app.minimize()}>
          <Icon name="minimize" size={14} />
        </button>
        <button
          type="button"
          className="winctl__btn"
          title={maximized ? 'Restore' : 'Maximise'}
          onClick={async () => setMaximized(await api?.app.maximize())}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={13} />
        </button>
        <button type="button" className="winctl__btn winctl__btn--close" title="Close" onClick={() => api?.app.close()}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  );
}
