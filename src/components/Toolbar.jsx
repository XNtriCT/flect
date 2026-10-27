import React, { useEffect, useRef, useState } from 'react';
import { Icon, Glyph } from './Icons.jsx';
import { Select, ColorButton } from './ui/Controls.jsx';
import { SHAPE_KINDS } from '../lib/shapes.js';

const FONTS = [
  'Palatino Linotype', 'Georgia', 'Garamond', 'Book Antiqua', 'Cambria',
  'Times New Roman', 'Iowan Old Style', 'Baskerville', 'Constantia',
  'Segoe UI', 'Inter', 'Calibri', 'Consolas', 'Courier New',
];
const SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];

function TB({ icon, glyph, active, disabled, title, onClick, children, wide }) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? ' is-on' : ''}${wide ? ' is-wide' : ''}`}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={17} />}
      {glyph && <Glyph kind={glyph} />}
      {children}
    </button>
  );
}

const Divider = () => <span className="tb-div" />;

export default function Toolbar({
  editor, settings, onPickImage, onOpenFind, onOpenAIHelp,
}) {
  const [blockStyle, setBlockStyle] = useState('p');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isActive('heading', { level: 1 })) setBlockStyle('h1');
      else if (editor.isActive('heading', { level: 2 })) setBlockStyle('h2');
      else if (editor.isActive('heading', { level: 3 })) setBlockStyle('h3');
      else if (editor.isActive('blockquote')) setBlockStyle('quote');
      else if (editor.isActive('codeBlock')) setBlockStyle('code');
      else setBlockStyle('p');
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  if (!editor) return <div className="toolbar toolbar--empty" />;

  const chain = () => editor.chain().focus();
  const textStyle = editor.getAttributes('textStyle') || {};
  const para = editor.getAttributes('paragraph') || {};
  const heading = editor.getAttributes('heading') || {};
  const lineHeight = (heading.lineHeight || para.lineHeight || settings.page.lineHeight || 1.65).toString();

  const applyBlock = (value) => {
    const c = chain();
    if (value === 'p') c.setParagraph().run();
    else if (value === 'h1') c.toggleHeading({ level: 1 }).run();
    else if (value === 'h2') c.toggleHeading({ level: 2 }).run();
    else if (value === 'h3') c.toggleHeading({ level: 3 }).run();
    else if (value === 'quote') c.toggleBlockquote().run();
    else if (value === 'code') c.toggleCodeBlock().run();
  };

  return (
    <div className="toolbar">
      <div className="tb-main">
      <div className="tb-group">
        <TB icon="undo" title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
        <TB icon="redo" title="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
      </div>

      <Divider />

      <div className="tb-group tb-group--grow">
        <Select
          title="Paragraph style"
          width={132}
          value={blockStyle}
          onChange={applyBlock}
          options={[
            { value: 'p', label: 'Body text', style: { fontSize: '12.5px' } },
            { value: 'h1', label: 'Title', style: { fontSize: '15px', fontWeight: 600 } },
            { value: 'h2', label: 'Heading 1', style: { fontSize: '13.5px', fontWeight: 600 } },
            { value: 'h3', label: 'Heading 2', style: { fontSize: '12.5px', fontWeight: 600 } },
            { value: 'quote', label: 'Quotation' },
            { value: 'code', label: 'Code block' },
          ]}
        />
        <Select
          title="Typeface"
          width={148}
          value={textStyle.fontFamily || settings.page.font}
          onChange={(v) => { if (v) chain().setFontFamily(v).run(); else chain().unsetFontFamily().run(); }}
          options={FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
        />
        <Select
          title="Size"
          width={66}
          value={String(textStyle.fontSize || `${settings.page.fontSize}pt`).replace('pt', '')}
          onChange={(v) => chain().setFontSize(`${v}pt`).run()}
          options={SIZES.map((s) => ({ value: String(s), label: String(s) }))}
        />
      </div>

      <Divider />

      <div className="tb-group">
        <TB glyph="bold" title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
        <TB glyph="italic" title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
        <TB glyph="underline" title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
        <TB glyph="strike" title="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
        <ColorButton
          title="Text colour"
          color={textStyle.color || '#171A1F'}
          onChange={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())}
        />
        <ColorButton
          title="Highlight"
          icon="highlight"
          color={editor.getAttributes('highlight').color || '#F3D27A'}
          allowNone
          onChange={(c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run())}
        />
      </div>

      <Divider />

      <div className="tb-group">
        <TB icon="alignLeft" title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} />
        <TB icon="alignCenter" title="Centre" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} />
        <TB icon="alignRight" title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} />
        <TB icon="alignJustify" title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => chain().setTextAlign('justify').run()} />
      </div>

      <Divider />

      <div className="tb-group">
        <TB icon="bulletList" title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
        <TB icon="orderedList" title="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
        <TB icon="outdent" title="Decrease indent" onClick={() => chain().liftListItem('listItem').run()} />
        <TB icon="indent" title="Increase indent" onClick={() => chain().sinkListItem('listItem').run()} />
        <Select
          title="Line spacing"
          width={62}
          value={lineHeight}
          onChange={(v) => chain().setLineHeight(v).run()}
          options={['1', '1.15', '1.3', '1.5', '1.65', '1.8', '2'].map((v) => ({ value: v, label: v === '1' ? '1.0' : v }))}
        />
      </div>

      <Divider />

      <div className="tb-group">
        <TB icon="link" title="Insert link (Ctrl+K)" active={editor.isActive('link')} onClick={() => {
          const prev = editor.getAttributes('link').href || '';
          const url = window.prompt('Link address', prev || 'https://');
          if (url === null) return;
          if (!url.trim()) { chain().extendMarkRange('link').unsetLink().run(); return; }
          chain().extendMarkRange('link').setLink({ href: url.trim() }).run();
        }} />
        <TB icon="image" title="Insert image" onClick={() => fileRef.current?.click()} />
        <TB icon="table" title="Insert table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <Select
          title="Insert shape"
          width={44}
          value=""
          placeholder={<Icon name="shape" size={17} />}
          onChange={(kind) => chain().insertShape({ kind }).run()}
          options={SHAPE_KINDS.map((k) => ({ value: k.id, label: k.label }))}
        />
        <TB icon="rule" title="Scene break / horizontal rule" onClick={() => chain().setHorizontalRule().run()} />
        <TB icon="quote" title="Quotation block" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
      </div>

      <Divider />

      <button type="button" className="tb-ai" title="AI actions — select text, then press R, G, P, L or C" onClick={onOpenAIHelp}>
        <Icon name="sparkle" size={16} />
        <span>AI</span>
      </button>
      </div>

      <div className="tb-right">
        <TB icon="search" title="Find and replace (Ctrl+F)" onClick={onOpenFind} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickImage(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
