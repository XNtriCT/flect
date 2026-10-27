import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons.jsx';

export function useClickOutside(onOut) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOut();
    };
    const esc = (e) => { if (e.key === 'Escape') onOut(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [onOut]);
  return ref;
}

export function Select({
  value, options, onChange, width = 120, title, className = '', disabled = false,
  renderValue, placeholder = '—', align = 'left',
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(close);
  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const current = list.find((o) => String(o.value) === String(value));

  return (
    <div className={`ui-select ${className}`} ref={ref} style={{ width }}>
      <button
        type="button"
        className={`ui-select__btn${open ? ' is-open' : ''}`}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ui-select__label" style={current?.style}>
          {current ? (renderValue ? renderValue(current) : current.label) : placeholder}
        </span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className={`ui-menu ui-select__menu${align === 'right' ? ' is-right' : ''}`}>
          {list.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className={`ui-menu__item${String(o.value) === String(value) ? ' is-active' : ''}`}
              style={o.style}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span className="ui-menu__check">
                {String(o.value) === String(value) && <Icon name="check" size={13} />}
              </span>
              <span className="ui-menu__label" style={o.labelStyle}>{o.label}</span>
              {o.meta && <span className="ui-menu__meta">{o.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SWATCHES = [
  '#171A1F', '#3B3F46', '#6B6F77', '#9AA0A8',
  '#8C2F2F', '#B4573F', '#C97B4A', '#D9A05B', '#E8C88C',
  '#4F6B58', '#6E8F63', '#2C6E6A', '#2F5C8F', '#3C6480', '#6A5A8F', '#8F4F72',
  '#FFFFFF',
];

export function ColorButton({ color, onChange, title = 'Colour', icon = 'colorText', allowNone = false }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(close);

  return (
    <div className="ui-color" ref={ref}>
      <button
        type="button"
        className={`tb-btn tb-btn--color${open ? ' is-open' : ''}`}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={icon} size={17} />
        <span className="tb-btn__bar" style={{ background: color || 'transparent' }} />
      </button>
      {open && (
        <div className="ui-menu ui-color__menu">
          <div className="ui-color__grid">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`ui-color__swatch${String(color).toLowerCase() === c.toLowerCase() ? ' is-on' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => { onChange(c); setOpen(false); }}
              />
            ))}
          </div>
          <div className="ui-color__row">
            <label className="ui-color__custom">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(color || '') ? color : '#171A1F'}
                onChange={(e) => { onChange(e.target.value); }}
              />
              <span>Custom</span>
            </label>
            {allowNone && (
              <button type="button" className="ui-menu__item ui-menu__item--inline" onClick={() => { onChange(null); setOpen(false); }}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="ui-toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle__track"><span className="ui-toggle__knob" /></span>
      <span className="ui-toggle__text">
        <span className="ui-toggle__label">{label}</span>
        {hint && <span className="ui-toggle__hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Field({ label, hint, children, wide = false }) {
  return (
    <div className={`ui-field${wide ? ' is-wide' : ''}`}>
      <div className="ui-field__head">
        <span className="ui-field__label">{label}</span>
        {hint && <span className="ui-field__hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text', monospace = false, onKeyDown, disabled }) {
  return (
    <input
      className={`ui-input${monospace ? ' is-mono' : ''}`}
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
