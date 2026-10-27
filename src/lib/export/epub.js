import JSZip from 'jszip';

/* ------------------------------------------------------------------ *
 * EPUB 3 export
 * Splits the manuscript at level-1 headings, so chapters land in the
 * spine instead of one enormous XHTML file.
 * ------------------------------------------------------------------ */

const esc = (s) => String(s)
  .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function voidFix(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '<br/>')
    .replace(/<hr\s*\/?>/gi, '<hr/>')
    .replace(/<img([^>]*?)\s*\/?>/gi, (m, attrs) => `<img${attrs.replace(/\s*\/$/, '')}/>`)
    .replace(/<input([^>]*?)\s*\/?>/gi, '<input$1/>');
}

function xhtmlBody(fragment) {
  let html = voidFix(fragment);
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  // bare ampersands inside text/attributes
  html = html.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;');
  return html;
}

function chapterTitle(node) {
  const h = node.querySelector ? node.querySelector('h1,h2,h3') : null;
  const t = (h ? h.textContent : node.textContent) || 'Chapter';
  return t.trim().split('\n')[0].slice(0, 80) || 'Chapter';
}

export async function buildEpub(html, meta = {}) {
  const {
    title = 'Untitled', author = 'Unknown', language = 'en',
  } = meta;

  const dom = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = dom.getElementById('root');

  // split at h1
  const chapters = [];
  let current = { title: title, nodes: [] };
  for (const node of [...root.children]) {
    if (node.tagName === 'H1' && current.nodes.length) {
      chapters.push(current);
      current = { title: chapterTitle(node), nodes: [node] };
    } else {
      current.nodes.push(node);
    }
  }
  if (current.nodes.length) chapters.push(current);
  if (!chapters.length) chapters.push({ title, nodes: [] });

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const images = new Map();
  let imgIndex = 0;

  const css = `@charset "utf-8";
html, body { margin: 0; padding: 0; }
body { font-family: "Palatino Linotype", Palatino, Georgia, serif; line-height: 1.6; color: #1a1a1a; }
h1 { font-size: 1.7em; line-height: 1.2; margin: 1.6em 0 0.8em; page-break-before: always; }
h1:first-child { page-break-before: avoid; }
h2 { font-size: 1.3em; margin: 1.4em 0 0.6em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.5em; }
p { margin: 0 0 0.9em; text-align: justify; text-indent: 0; }
blockquote { margin: 1.2em 2em; font-style: italic; }
hr { border: 0; border-top: 1px solid #999; margin: 1.6em 3em; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
td, th { border: 1px solid #bbb; padding: 0.4em 0.6em; }
figure { margin: 1.2em 0; text-align: center; }
figcaption { font-size: 0.85em; color: #555; }
.flect-subtitle { font-style: italic; color: #555; }
`;
  zip.file('OEBPS/styles.css', css);

  const manifest = [];
  const spine = [];

  chapters.forEach((ch, i) => {
    const id = `ch${i + 1}`;
    const name = `chapter-${String(i + 1).padStart(3, '0')}.xhtml`;
    const container = dom.createElement('div');
    for (const n of ch.nodes) container.appendChild(n.cloneNode(true));

    // hoist images out of the data URL
    container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(src);
      if (!m) return;
      let ext = m[1].toLowerCase().replace('jpeg', 'jpg');
      if (!/^(png|jpg|gif|svg|webp)$/.test(ext)) ext = 'png';
      imgIndex += 1;
      const fileName = `img-${imgIndex}.${ext}`;
      if (!images.has(fileName)) {
        images.set(fileName, { data: m[2], ext });
        manifest.push(`    <item id="img${imgIndex}" href="images/${fileName}" media-type="image/${ext === 'jpg' ? 'jpeg' : ext}"/>`);
      }
      img.setAttribute('src', `images/${fileName}`);
      img.removeAttribute('width');
      img.removeAttribute('height');
    });

    const body = xhtmlBody(container.innerHTML);
    const doc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}">
<head>
  <meta charset="utf-8"/>
  <title>${esc(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${body}
</body>
</html>`;
    zip.file(`OEBPS/${name}`, doc);
    manifest.push(`    <item id="${id}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`    <itemref idref="${id}"/>`);
  });

  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(language)}">
<head><meta charset="utf-8"/><title>Contents</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
  <nav epub:type="toc" id="toc"><h1>Contents</h1>
    <ol>
${chapters.map((ch, i) => `      <li><a href="chapter-${String(i + 1).padStart(3, '0')}.xhtml">${esc(ch.title)}</a></li>`).join('\n')}
    </ol>
  </nav>
</body>
</html>`);

  const uid = `urn:uuid:${(globalThis.crypto?.randomUUID?.() || 'flect-0000')}`;
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:creator>${esc(author)}</dc:creator>
    <dc:language>${esc(language)}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifest.join('\n')}
  </manifest>
  <spine>
${spine.join('\n')}
  </spine>
</package>`);

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>
${chapters.map((ch, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${esc(ch.title)}</text></navLabel>
      <content src="chapter-${String(i + 1).padStart(3, '0')}.xhtml"/>
    </navPoint>`).join('\n')}
  </navMap>
</ncx>`);

  for (const [fileName, info] of images) {
    zip.file(`OEBPS/images/${fileName}`, info.data, { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
  return new Uint8Array(await blob.arrayBuffer());
}
