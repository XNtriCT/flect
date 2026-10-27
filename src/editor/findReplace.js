import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const findKey = new PluginKey('flectFind');

export function collectMatches(doc, term, caseSensitive = false) {
  const out = [];
  if (!term) return out;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      out.push({ from: pos + idx, to: pos + idx + needle.length });
      idx = hay.indexOf(needle, idx + Math.max(1, needle.length));
    }
  });
  return out;
}

function decorate(doc, matches, index) {
  return DecorationSet.create(doc, matches.map((m, i) => Decoration.inline(m.from, m.to, {
    class: i === index ? 'find-hit is-current' : 'find-hit',
  })));
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init: () => ({ term: '', index: 0, matches: [], set: DecorationSet.empty, caseSensitive: false }),
          apply: (tr, prev, _old, newState) => {
            const meta = tr.getMeta(findKey);
            if (meta) {
              const term = meta.term !== undefined ? meta.term : prev.term;
              const caseSensitive = meta.caseSensitive !== undefined ? meta.caseSensitive : prev.caseSensitive;
              const matches = collectMatches(newState.doc, term, caseSensitive);
              const index = matches.length ? Math.min(meta.index ?? 0, matches.length - 1) : 0;
              return { term, index, matches, caseSensitive, set: decorate(newState.doc, matches, index) };
            }
            if (tr.docChanged && prev.term) {
              const matches = collectMatches(newState.doc, prev.term, prev.caseSensitive);
              const index = matches.length ? Math.min(prev.index, matches.length - 1) : 0;
              return { ...prev, matches, index, set: decorate(newState.doc, matches, index) };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            return findKey.getState(state)?.set || DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export function setFind(editor, patch) {
  if (!editor) return;
  const state = findKey.getState(editor.state);
  editor.view.dispatch(editor.state.tr.setMeta(findKey, {
    term: state?.term ?? '',
    index: state?.index ?? 0,
    caseSensitive: state?.caseSensitive ?? false,
    ...patch,
  }));
}

export function getFind(editor) {
  return editor ? findKey.getState(editor.state) : null;
}
