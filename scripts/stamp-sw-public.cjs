// scripts/stamp-sw-public.cjs
const fs = require('fs');
const path = require('path');

const templatePath = path.resolve(__dirname, '../public/sw-public.template.js');
const outPath      = path.resolve(__dirname, '../public/sw-public.js');

// ID diferente en cada build
const now = new Date();
const BUILD_ID = [
  now.toISOString().replace(/[:.]/g, '-'),
  Math.random().toString(36).slice(2, 8)
].join('_');

let tpl = fs.readFileSync(templatePath, 'utf8');
tpl = tpl.replace(/%BUILD_ID%/g, BUILD_ID);

fs.writeFileSync(outPath, tpl, 'utf8');
console.log('[stamp-sw-public] wrote', outPath, 'with BUILD_ID =', BUILD_ID);
