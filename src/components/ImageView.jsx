import React, { useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';

export default function ImageView({ node, updateAttributes, selected }) {
  const imgRef = useRef(null);
  const { src, alt, width, height } = node.attrs;

  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const startX = event.clientX;
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.66;
    const startW = img.getBoundingClientRect().width;

    const move = (e) => {
      const w = Math.max(60, Math.round(startW + (e.clientX - startX)));
      updateAttributes({ width: w, height: Math.round(w * ratio) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <NodeViewWrapper className={`flect-image${selected ? ' is-selected' : ''}`} as="div">
      <div className="flect-image__frame" style={width ? { width: `${width}px` } : undefined}>
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          width={width || undefined}
          height={height || undefined}
          draggable={false}
        />
        {selected && (
          <span className="flect-image__handle" onPointerDown={startResize} role="presentation" />
        )}
      </div>
    </NodeViewWrapper>
  );
}
