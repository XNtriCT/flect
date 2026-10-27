/* Vector shapes drawn as inline SVG, shared by the editor node view and
 * the HTML/print serializers. */

export const SHAPE_KINDS = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'round', label: 'Rounded' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'line', label: 'Rule' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'star', label: 'Star' },
];

export const SHAPE_FILLS = [
  '#E8C88C', '#D9A05B', '#C97B4A', '#B4573F',
  '#8FB3C9', '#5E8FA8', '#3C6480', '#2C3E50',
  '#D8D2C4', '#A8B5A2', '#7E9B84', '#4F6B58',
];

function star(cx, cy, outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function shapeSvg(kind, opts = {}) {
  const {
    width = 280, height = 160, fill = '#E8C88C', stroke = '#8A6A2F',
    radius = 16, strokeWidth = 2, opacity = 1,
  } = opts;
  const w = Math.max(8, width);
  const h = Math.max(8, height);
  const pad = strokeWidth;
  const inner = {
    x: pad, y: pad, w: w - pad * 2, h: h - pad * 2,
  };
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linejoin="round"`;

  let body = '';
  if (kind === 'ellipse') {
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(2, inner.w / 2)}" ry="${Math.max(2, inner.h / 2)}" ${common}/>`;
  } else if (kind === 'triangle') {
    body = `<polygon points="${w / 2},${pad} ${w - pad},${h - pad} ${pad},${h - pad}" ${common}/>`;
  } else if (kind === 'line') {
    body = `<line x1="${pad}" y1="${h / 2}" x2="${w - pad}" y2="${h / 2}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}" stroke-linecap="round"/>`;
  } else if (kind === 'arrow') {
    body = `<line x1="${pad}" y1="${h / 2}" x2="${w - pad - 10}" y2="${h / 2}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}" stroke-linecap="round"/>
      <polygon points="${w - pad},${h / 2} ${w - pad - 14},${h / 2 - 7} ${w - pad - 14},${h / 2 + 7}" fill="${stroke}"/>`;
  } else if (kind === 'star') {
    body = `<polygon points="${star(w / 2, h / 2, Math.min(w, h) / 2 - pad, Math.min(w, h) / 4.4)}" ${common}/>`;
  } else if (kind === 'round') {
    body = `<rect x="${pad}" y="${pad}" width="${inner.w}" height="${inner.h}" rx="${Math.min(radius, inner.h / 2)}" ry="${Math.min(radius, inner.h / 2)}" ${common}/>`;
  } else {
    body = `<rect x="${pad}" y="${pad}" width="${inner.w}" height="${inner.h}" ${common}/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="shape">${body}</svg>`;
}
