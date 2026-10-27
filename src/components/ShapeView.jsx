import React, { useCallback, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { shapeSvg, SHAPE_FILLS, SHAPE_KINDS } from '../lib/shapes.js';

const KIND_GLYPH = {
  rect: 'M3 5h18v14H3z',
  round: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
  ellipse: 'M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z',
  triangle: 'M12 4l9 16H3z',
  line: 'M3 12h18',
  arrow: 'M3 12h16m0 0l-4-4m4 4l-4 4',
  star: 'M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3l1.3-6.1L3 9.6l6.3-.7z',
};

export default function ShapeView({ node, updateAttributes, selected, deleteNode }) {
  const dragRef = useRef(null);

  const startResize = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = node.attrs.width;
    const startH = node.attrs.height;

    const move = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const w = Math.max(40, Math.round(startW + dx));
      const h = Math.max(24, Math.round(startH + dy));
      dragRef.current = { w, h };
      if (dragRef.current.raf) cancelAnimationFrame(dragRef.current.raf);
      dragRef.current.raf = requestAnimationFrame(() => {
        updateAttributes({ width: w, height: h });
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [node.attrs.width, node.attrs.height, updateAttributes]);

  const { kind, fill, stroke, radius, opacity } = node.attrs;
  const width = node.attrs.width;
  const height = node.attrs.height;

  return (
    <NodeViewWrapper
      className={`flect-shape-node${selected ? ' is-selected' : ''}`}
      data-drag-handle
      style={{ margin: '18px 0' }}
    >
      <div className="flect-shape-canvas" style={{ width, height }}>
        <div
          className="flect-shape-art"
          dangerouslySetInnerHTML={{
            __html: shapeSvg(kind, { width, height, fill, stroke, radius, opacity }),
          }}
        />
        {selected && (
          <>
            <span className="flect-shape-tag">shape</span>
            <div
              className="flect-shape-resize"
              onPointerDown={startResize}
              role="presentation"
            />
          </>
        )}
      </div>

      {selected && (
        <div className="node-toolbar" contentEditable={false}>
          <div className="node-toolbar__group">
            {SHAPE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                title={k.label}
                className={`node-toolbar__icon${kind === k.id ? ' is-on' : ''}`}
                onClick={() => updateAttributes({ kind: k.id })}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d={KIND_GLYPH[k.id]} />
                </svg>
              </button>
            ))}
          </div>
          <span className="node-toolbar__sep" />
          <div className="node-toolbar__group">
            {SHAPE_FILLS.slice(0, 7).map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                className={`node-toolbar__swatch${fill === c ? ' is-on' : ''}`}
                style={{ background: c }}
                onClick={() => updateAttributes({ fill: c })}
              />
            ))}
          </div>
          <span className="node-toolbar__sep" />
          <button type="button" className="node-toolbar__icon danger" title="Delete shape" onClick={deleteNode}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
