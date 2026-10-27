import React, { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';

function outlineOf(editor) {
  const items = [];
  if (!editor) return items;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        level: node.attrs.level,
        text: node.textContent || 'Untitled section',
        pos,
      });
    }
    return true;
  });
  return items;
}

export default function Sidebar({ editor, open, recent, onOpenRecent, onNew, onOpen, onRestore, recovery }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!editor) return undefined;
    const update = () => setItems(outlineOf(editor));
    update();
    editor.on('update', update);
    return () => editor.off('update', update);
  }, [editor]);

  if (!open) return null;

  const jump = (item, i) => {
    setActive(i);
    editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__scroll">
        <div className="sidebar__section">
          <div className="sidebar__label">
            <span>Outline</span>
            <span className="sidebar__count">{items.length || ''}</span>
          </div>
          {items.length === 0 ? (
            <p className="sidebar__empty">Headings you mark in the page will gather here.</p>
          ) : (
            <nav className="outline">
              {items.map((item, i) => (
                <button
                  key={`${item.pos}-${i}`}
                  type="button"
                  className={`outline__item outline__item--${item.level}${active === i ? ' is-on' : ''}`}
                  onClick={() => jump(item, i)}
                  title={item.text}
                >
                  <span className="outline__dash" />
                  <span className="outline__text">{item.text}</span>
                </button>
              ))}
            </nav>
          )}
        </div>

        <div className="sidebar__section">
          <div className="sidebar__label"><span>Recent</span></div>
          {recent.length === 0 ? (
            <p className="sidebar__empty">Nothing opened yet.</p>
          ) : (
            <div className="recent">
              {recent.slice(0, 7).map((r) => (
                <button key={r.path} type="button" className="recent__item" onClick={() => onOpenRecent(r.path)} title={r.path}>
                  <Icon name="doc" size={14} />
                  <span className="recent__name">{r.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="sidebar__actions">
            <button type="button" className="btn btn--ghost btn--sm btn--wide" onClick={onOpen}>
              <Icon name="folder" size={14} /> Open file
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--wide" onClick={onNew}>
              <Icon name="plus" size={14} /> New document
            </button>
          </div>
        </div>

        {recovery && (
          <div className="sidebar__section">
            <div className="sidebar__label"><span>Recovery</span></div>
            <button type="button" className="recovery" onClick={onRestore}>
              <Icon name="refresh" size={14} />
              <span>
                <strong>{recovery.name || 'Untitled'}</strong>
                <em>snapshot {new Date(recovery.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</em>
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="sidebar__foot">
        <span className="sidebar__mark">FLECT</span>
        <span className="sidebar__tag">manuscript studio</span>
      </div>
    </aside>
  );
}
