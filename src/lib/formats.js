/* ------------------------------------------------------------------ *
 * File-format registry.
 *
 * Mirrors the way ONLYOFFICE splits its own matrix: a format is either
 * openable, saveable (editable in place), or export-only. Save As shows
 * every writable target as a grid, the native dialog is filtered to the
 * chosen type, and the payload is built for the extension the user
 * actually ends up with.
 * ------------------------------------------------------------------ */

export const WRITABLE = [
  {
    id: 'docx',
    label: 'Word document',
    ext: 'docx',
    note: 'Headings, tables, images, page numbers',
    icon: 'doc',
    filters: [{ name: 'Word document', extensions: ['docx'] }],
  },
  {
    id: 'pdf',
    label: 'PDF',
    ext: 'pdf',
    note: 'Print-ready, A4 or Letter, numbered pages',
    icon: 'book',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  },
  {
    id: 'epub',
    label: 'EPUB',
    ext: 'epub',
    note: 'EPUB 3, one chapter per level-1 heading',
    icon: 'book',
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
  },
  {
    id: 'md',
    label: 'Markdown',
    ext: 'md',
    note: 'GitHub-flavoured, tables preserved',
    icon: 'pen',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  },
  {
    id: 'txt',
    label: 'Plain text',
    ext: 'txt',
    note: 'Paragraphs separated by a blank line',
    icon: 'type',
    filters: [{ name: 'Plain text', extensions: ['txt'] }],
  },
  {
    id: 'html',
    label: 'Web page',
    ext: 'html',
    note: 'Standalone file with the type styles baked in',
    icon: 'external',
    filters: [{ name: 'Web page', extensions: ['html', 'htm'] }],
  },
  {
    id: 'rtf',
    label: 'Rich Text',
    ext: 'rtf',
    note: 'Readable by almost anything that edits text',
    icon: 'doc',
    filters: [{ name: 'Rich Text', extensions: ['rtf'] }],
  },
  {
    id: 'flect',
    label: 'FLECT package',
    ext: 'flect',
    note: 'Native: keeps page settings and every mark',
    icon: 'save',
    filters: [{ name: 'FLECT document', extensions: ['flect'] }],
  },
];

export const OPEN_FILTERS = [
  {
    name: 'All supported manuscripts',
    extensions: ['docx', 'docm', 'dotx', 'txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'flect'],
  },
  { name: 'Word documents', extensions: ['docx', 'docm', 'dotx'] },
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'Plain text', extensions: ['txt'] },
  { name: 'Web page', extensions: ['html', 'htm'] },
  { name: 'Rich Text', extensions: ['rtf'] },
  { name: 'FLECT document', extensions: ['flect'] },
  { name: 'All files', extensions: ['*'] },
];

/** Every writable type, in the order the native Save dialog lists them. */
export const SAVE_FILTERS = [
  ...WRITABLE.map((f) => f.filters[0]),
  { name: 'All files', extensions: ['*'] },
];

const ALIASES = {
  markdown: 'md',
  htm: 'html',
  docm: 'docx',
  dotx: 'docx',
};

/** Extension or dialog label → canonical writer id. */
export function asKind(value) {
  const raw = String(value || '').toLowerCase();
  return ALIASES[raw] || raw;
}

export function filtersFor(kind) {
  const spec = WRITABLE.find((f) => f.id === asKind(kind));
  return spec ? spec.filters : SAVE_FILTERS;
}

export function labelFor(kind) {
  const spec = WRITABLE.find((f) => f.id === asKind(kind));
  return spec ? spec.label : String(kind).toUpperCase();
}

/** Formats FLECT can write *and* read back, so the document can adopt them. */
export const REBINDABLE = new Set(['docx', 'flect', 'md', 'txt', 'html', 'rtf']);

export const OPENABLE = new Set([
  'docx', 'docm', 'dotx', 'dotm', 'md', 'markdown', 'txt', 'html', 'htm', 'rtf', 'flect',
]);
