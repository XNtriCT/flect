import React, { useEffect } from 'react';
import { Icon } from './Icons.jsx';

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), toast.sticky ? 9000 : 3600);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div className={`toast toast--${toast.kind || 'info'}`}>
      <span className="toast__icon">
        <Icon name={toast.kind === 'error' ? 'info' : toast.kind === 'success' ? 'check' : 'sparkle'} size={15} />
      </span>
      <div className="toast__body">
        <p className="toast__title">{toast.title}</p>
        {toast.detail && <p className="toast__detail">{toast.detail}</p>}
      </div>
      {toast.action && (
        <button type="button" className="toast__action" onClick={toast.action.onClick}>{toast.action.label}</button>
      )}
      <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

export default function Toasts({ items, onDismiss }) {
  return (
    <div className="toasts">
      {items.map((t) => <Toast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
