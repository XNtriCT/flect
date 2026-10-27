import React, { useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WRITABLE, REBINDABLE } from '../lib/formats.js';

/**
 * One format grid for both intents, the way ONLYOFFICE's File panel does it:
 * "save as" adopts the chosen format when it can be read back, "export"
 * always writes a copy and leaves the open document alone.
 */
export default function ExportDialog({ open, mode = 'export', base, busy, onClose, onPick }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const saving = mode === 'save';

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal modal--export" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={saving ? 'Save as' : 'Export'}>
        <header className="modal__head">
          <div>
            <h3>{saving ? `Save ${base} as` : `Export ${base}`}</h3>
            <p>
              {saving
                ? 'Pick a format, then choose where it goes. Word, Markdown, text, HTML, RTF and FLECT become the document itself; PDF and EPUB are written as copies.'
                : 'Choose what the file should become. The manuscript on screen is untouched.'}
            </p>
          </div>
          <button type="button" className="modal__close" onClick={onClose}><Icon name="close" size={16} /></button>
        </header>
        <div className="export-grid">
          {WRITABLE.map((f) => {
            const keeps = REBINDABLE.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className="export-card"
                disabled={busy}
                onClick={() => onPick(f.id)}
              >
                <span className="export-card__icon"><Icon name={f.icon} size={18} /></span>
                <span className="export-card__body">
                  <span className="export-card__title">
                    {f.label}<em>.{f.ext}</em>
                    {saving && !keeps && <span className="export-card__tag">copy</span>}
                  </span>
                  <span className="export-card__note">{f.note}</span>
                </span>
                <Icon name="arrowRight" size={15} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
