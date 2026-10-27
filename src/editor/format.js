import { Extension } from '@tiptap/core';

/** Inline font size, stored on the text style mark. */
export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]/g, '') || null,
            renderHTML: (attributes) => (attributes.fontSize
              ? { style: `font-size: ${attributes.fontSize}` }
              : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain()
        .setMark('textStyle', { fontSize: null })
        .removeEmptyTextStyle()
        .run(),
    };
  },
});

/** Block line height for paragraphs and headings. */
export const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => (attributes.lineHeight
              ? { style: `line-height: ${attributes.lineHeight}` }
              : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight: (value) => ({ commands }) => this.options.types
        .every((type) => commands.updateAttributes(type, { lineHeight: value })),
    };
  },
});
