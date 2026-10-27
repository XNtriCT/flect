// Non-interactive build wrapper so the renderer bundle can be produced from
// a single short-lived Node process (no dev server, no watch mode).
import { build } from 'vite';

try {
  const out = await build({ configFile: './vite.config.mjs', logLevel: 'info' });
  const results = Array.isArray(out) ? out : [out];
  for (const r of results) {
    const chunks = r?.output || [];
    console.log('BUILD OK — files:', chunks.length,
      'bytes:', chunks.reduce((n, c) => n + (c.code?.length || c.source?.length || 0), 0));
  }
  process.exit(0);
} catch (err) {
  console.error('BUILD FAILED');
  console.error(err?.stack || err);
  process.exit(1);
}
