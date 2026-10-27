import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

import { FontSize, LineHeight } from './format.js';
import { Shape } from './Shape.js';
import { FindReplace } from './findReplace.js';
import ImageView from '../components/ImageView.jsx';

/** Image with explicit width/height so resizing survives a save. */
const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
        parseHTML: (el) => el.getAttribute('width'),
      },
      height: {
        default: null,
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
        parseHTML: (el) => el.getAttribute('height'),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

export function cleanPastedHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\sclass="Mso[^"]*"/gi, '')
    .replace(/\s(?:lang|xml:lang)="[^"]*"/gi, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<span[^>]*>\s*<\/span>/gi, '');
}

export function createExtensions(placeholder = 'Begin here…') {
  return [
    StarterKit.configure({
      history: { depth: 6000, newGroupDelay: 350 },
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: { HTMLAttributes: { class: 'flect-code' } },
    }),
    Underline,
    TextStyle,
    Color,
    FontFamily.configure({ types: ['textStyle'] }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    SizedImage.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true, lastColumnResizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    Subscript,
    Superscript,
    FontSize,
    LineHeight,
    Shape,
    FindReplace,
  ];
}
