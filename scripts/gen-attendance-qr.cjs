// scripts/gen-attendance-qr.cjs
// Genera la imagen del QR fijo de "presente en sala" para imprimir.
const path = require('path');
const QRCode = require('qrcode');

// El QR de la sala es una URL: al leerlo con la cámara nativa del teléfono
// abre el portal del alumno y marca el presente automáticamente.
const CODE   = 'SANDRA-PALOSCHI-SALA-PRESENTE';
const APP_ID = '1:786390581865:web:ed47531cf7415ae5ca18f8';
const URL    = `https://estudiosandrapaloschi.web.app/#/checkin?a=${APP_ID}&present=${CODE}`;
const outPath = path.resolve(__dirname, '../public/qr-presente-sala.png');

QRCode.toFile(outPath, URL, { width: 800, margin: 2, errorCorrectionLevel: 'H' }, (err) => {
  if (err) { console.error('Error generando QR:', err); process.exit(1); }
  console.log('[gen-attendance-qr] QR generado en', outPath, '— URL:', URL);
});
