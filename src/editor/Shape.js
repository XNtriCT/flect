import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { shapeSvg } from '../lib/shapes.js';
import ShapeView from '../components/ShapeView.jsx';

const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const Shape = Node.create({
  name: 'flectShape',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'rect',
        parseHTML: (el) => el.getAttribute('data-kind') || 'rect',
        renderHTML: (a) => ({ 'data-kind': a.kind }),
      },
      fill: {
        default: '#E8C88C',
        parseHTML: (el) => el.getAttribute('data-fill') || '#E8C88C',
        renderHTML: (a) => ({ 'data-fill': a.fill }),
      },
      stroke: {
        default: '#8A6A2F',
        parseHTML: (el) => el.getAttribute('data-stroke') || '#8A6A2F',
        renderHTML: (a) => ({ 'data-stroke': a.stroke }),
      },
      width: {
        default: 280,
        parseHTML: (el) => int(el.getAttribute('data-w'), 280),
        renderHTML: (a) => ({ 'data-w': a.width }),
      },
      height: {
        default: 160,
        parseHTML: (el) => int(el.getAttribute('data-h'), 160),
        renderHTML: (a) => ({ 'data-h': a.height }),
      },
      radius: {
        default: 16,
        parseHTML: (el) => int(el.getAttribute('data-r'), 16),
        renderHTML: (a) => ({ 'data-r': a.radius }),
      },
      opacity: {
        default: 1,
        parseHTML: (el) => parseFloat(el.getAttribute('data-o') || '1'),
        renderHTML: (a) => ({ 'data-o': a.opacity }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-flect-shape]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-flect-shape': '',
        class: 'flect-shape',
      }),
      [
        'div',
        {
          innerHTML: shapeSvg(node.attrs.kind, node.attrs),
          style: 'line-height:0',
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShapeView);
  },

  addCommands() {
    return {
      insertShape: (attrs = {}) => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs,
      }),
    };
  },
});
