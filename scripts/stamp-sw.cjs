// scripts/stamp-sw.cjs
// Reemplaza const SW_VERSION = '...'; por un timestamp único en los SW
const fs   = require('fs');
const path = require('path');

const now = Date.now().toString();
const re  = /const\s+SW_VERSION\s*=\s*'[^']*';/;

const files = [
  path.join(process.cwd(), 'public', 'service-worker.js'),
  path.join(process.cwd(), 'public', 'sw-admin.js'),
];

files.forEach(swPath => {
  try {
    let src = fs.readFileSync(swPath, 'utf8');
    if (!re.test(src)) {
      console.log('[stamp-sw] No se encontró SW_VERSION en', path.basename(swPath));
      return;
    }
    fs.writeFileSync(swPath, src.replace(re, `const SW_VERSION = '${now}';`), 'utf8');
    console.log('[stamp-sw] Service Worker version =>', now, '|', path.basename(swPath));
  } catch (e) {
    console.error('[stamp-sw] Error:', e.message);
  }
});
