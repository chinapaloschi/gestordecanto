#!/usr/bin/env node
// Falla el build si un service worker (sw-*.js) o manifest (manifest-*.webmanifest)
// en public/ no tiene su propia regla de Cache-Control: no-cache/no-store en
// firebase.json, en TODOS los hosting targets. Sin esto, cae en la regla
// genérica para *.js/*.css (Cache-Control: immutable, 1 año) y el navegador
// nunca vuelve a pedirlo para notar una actualización — pasó dos veces
// (sw-public.js primero, sw-admin.js y los manifests después) antes de que
// existiera este chequeo.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const firebaseJsonPath = path.join(root, 'firebase.json');

// *.template.js (ej. sw-public.template.js) son fuente para el prebuild, no
// se registran nunca como service worker — se excluyen.
const files = fs.readdirSync(publicDir).filter(
  f => (/^sw-.*\.js$/.test(f) && !f.endsWith('.template.js')) || /^manifest-.*\.webmanifest$/.test(f)
);

const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
const targets = Array.isArray(firebaseJson.hosting) ? firebaseJson.hosting : [firebaseJson.hosting];

let hasError = false;

for (const target of targets) {
  const targetName = target.target || target.site || '(default)';
  const headerRules = target.headers || [];
  for (const file of files) {
    const source = `/${file}`;
    const rule = headerRules.find(h => h.source === source);
    const cacheControl = rule?.headers?.find(h => h.key.toLowerCase() === 'cache-control')?.value || '';
    const isNoCache = /no-cache|no-store/i.test(cacheControl);
    if (!rule || !isNoCache) {
      hasError = true;
      console.error(`[check-sw-cache-headers] Falta regla "no-cache" para ${source} en el target "${targetName}" de firebase.json.`);
    }
  }
}

if (hasError) {
  console.error('\nAgregá un bloque en "headers" de ese target, ej:');
  console.error('  { "source": "/sw-nuevo.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }');
  process.exit(1);
}

console.log(`[check-sw-cache-headers] OK — ${files.length} archivo(s) cubierto(s) en ${targets.length} target(s).`);
