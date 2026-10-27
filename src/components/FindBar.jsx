import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { getFind, setFind } from '../editor/findReplace.js';

export default function FindBar({ editor, open, onClose }) {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [, setTick] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => setTick((t) => t + 1);
    editor.on('transaction', bump);
    return () => editor.off('transaction', bump);
  }, [editor]);

  // Focus synchronously on open: a deferred focus lets the first keystroke
  // escape into the document, which is exactly the bug this panel exists to fix.
  useLayoutEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  useEffect(() => {
    if (!open && editor) setFind(editor, { term: '', index: 0 });
  }, [open, editor]);

  useEffect(() => {
    if (!editor || !open) return;
    const id = setTimeout(() => setFind(editor, { term, index: 0, caseSensitive }), 90);
    return () => clearTimeout(id);
  }, [term, caseSensitive, editor, open]);

  if (!open || !editor) return null;

  const state = getFind(editor) || { matches: [], index: 0 };
  const total = state.matches.length;

  const go = (delta) => {
    if (!total) return;
    const next = (state.index + delta + total) % total;
    setFind(editor, { index: next });
    const m = state.matches[next];
    if (m) {
      editor.chain().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run();
    }
  };

  const replaceOne = () => {
    const m = state.matches[state.index];
    if (!m) return;
    editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, replacement || ' ').run();
    setTimeout(() => setFind(editor, { index: Math.min(state.index, Math.max(0, total - 2)) }), 10);
  };

  const replaceAll = () => {
    const matches = [...state.matches].reverse();
    if (!matches.length) return;
    let chain = editor.chain().focus();
    for (const m of matches) {
      chain = chain.insertContentAt({ from: m.from, to: m.to }, replacement || ' ');
    }
    chain.run();
  };

  return (
    <div className="findbar" role="search">
      <div className="findbar__row">
        <div className="findbar__field">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={term}
            placeholder="Find in manuscript"
            spellCheck={false}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
              if (e.key === 'Escape') onClose();
            }}
          />
          <span className="findbar__count">{total ? `${state.index + 1} / ${total}` : 'no matches'}</span>
        </div>
        <button
          type="button"
          className={`findbar__btn${caseSensitive ? ' is-on' : ''}`}
          title="Match case"
          onClick={() => setCase((v) => !v)}
        >
          Aa
        </button>
        <button type="button" className="findbar__btn" title="Previous (Shift+Enter)" onClick={() => go(-1)}>
          <Icon name="chevronLeft" size={15} />
        </button>
        <button type="button" className="findbar__btn" title="Next (Enter)" onClick={() => go(1)}>
          <Icon name="chevronRight" size={15} />
        </button>
        <button type="button" className="findbar__btn" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="findbar__row">
        <div className="findbar__field">
          <Icon name="pen" size={15} />
          <input
            value={replacement}
            placeholder="Replace with"
            spellCheck={false}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={replaceOne} disabled={!total}>Replace</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={replaceAll} disabled={!total}>All</button>
      </div>
    </div>
  );
}
