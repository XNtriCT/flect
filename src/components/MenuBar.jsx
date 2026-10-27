import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

const SEP = { type: 'sep' };
const label = (text) => ({ type: 'label', text });

export default function MenuBar({ buildMenus, hasSelection }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  const menus = buildMenus(hasSelection);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <nav className="menubar" ref={ref}>
      <div className="menubar__items">
        {menus.map((menu) => (
          <div className="menubar__root" key={menu.label}>
            <button
              type="button"
              className={`menubar__btn${open === menu.label ? ' is-open' : ''}`}
              onClick={() => setOpen(open === menu.label ? null : menu.label)}
              onMouseEnter={() => { if (open) setOpen(menu.label); }}
            >
              {menu.label}
            </button>
            {open === menu.label && (
              <div className="ui-menu menubar__menu">
                {menu.items.map((item, i) => {
                  if (item.type === 'sep') return <div className="ui-menu__sep" key={`s${i}`} />;
                  if (item.type === 'label') return <div className="ui-menu__label" key={`l${i}`}>{item.text}</div>;
                  return (
                    <button
                      key={item.id || item.label}
                      type="button"
                      className={`ui-menu__item${item.disabled ? ' is-disabled' : ''}`}
                      disabled={item.disabled}
                      onClick={() => { close(); item.action?.(); }}
                      onMouseEnter={(e) => {
                        e.currentTarget.classList.add('is-hover');
                      }}
                      onMouseLeave={(e) => e.currentTarget.classList.remove('is-hover')}
                    >
                      <span className="ui-menu__check">
                        {item.check ? <Icon name="check" size={13} /> : item.icon ? <Icon name={item.icon} size={14} /> : null}
                      </span>
                      <span className="ui-menu__label">{item.label}</span>
                      {item.shortcut && <span className="ui-menu__shortcut">{item.shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
