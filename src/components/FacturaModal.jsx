import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Modal } from './Modal.jsx';
import { formatMoneyAr } from '../utils/money.js';

const TIPO_DOC = [
  { id: 99, label: 'Consumidor Final (sin CUIT/DNI)' },
  { id: 96, label: 'DNI' },
  { id: 80, label: 'CUIT' },
];

const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition';
const labelCls = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';

// Genera un QR como texto para el CAE (estándar AFIP)
const buildAfipQRText = (result, cuit) => {
  const data = {
    ver: 1,
    fecha: result.fecha.split('/').reverse().join('-'),
    cuit: parseInt(cuit || '0'),
    ptoVta: result.ptoVta,
    tipoCmp: result.tipoComprobante,
    nroCmp: result.nroFactura,
    importe: result.importeTotal,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: 99,
    nroDocRec: 0,
    tipoCodAut: 'E',
    codAut: parseInt(result.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(data))}`;
};

// Imprime / descarga la factura como HTML
const imprimirFactura = (result, formData, cuit) => {
  const vtoCAE = result.caeFchVto
    ? `${result.caeFchVto.slice(6,8)}/${result.caeFchVto.slice(4,6)}/${result.caeFchVto.slice(0,4)}`
    : '';
  const qrUrl = buildAfipQRText(result, cuit);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Factura C N° ${String(result.nroFactura).padStart(8,'0')}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:13px;margin:0;padding:20px;color:#111}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #333;pb:8px;mb:8px}
    .box{border:1px solid #333;padding:8px;margin-bottom:8px;border-radius:4px}
    .tipo{font-size:28px;font-weight:bold;text-align:center;border:2px solid #333;padding:8px 16px;display:inline-block;margin:8px auto}
    .row{display:flex;justify-content:space-between;margin:3px 0}
    .total{font-size:16px;font-weight:bold;border-top:2px solid #333;padding-top:6px;margin-top:6px}
    .cae{background:#f5f5f5;border:1px solid #ccc;padding:6px;font-size:11px;border-radius:4px;margin-top:8px}
    img.qr{width:80px;height:80px}
    @media print{button{display:none}}
  </style></head><body>
  <div class="header">
    <div><b>Estudio de Canto Sandra Paloschi</b><br>CUIT: ${cuit || '—'}<br>Monotributista</div>
    <div class="tipo">C</div>
    <div style="text-align:right"><b>FACTURA C</b><br>N° 0001-${String(result.nroFactura).padStart(8,'0')}<br>Fecha: ${result.fecha}</div>
  </div>
  <div class="box">
    <div class="row"><span><b>Receptor:</b> ${result.nombreReceptor || 'Consumidor Final'}</span></div>
    ${formData.docNro ? `<div class="row"><span><b>Doc:</b> ${TIPO_DOC.find(d=>d.id===formData.docTipo)?.label || ''} ${formData.docNro}</span></div>` : ''}
  </div>
  <div class="box">
    <div class="row"><span><b>Concepto:</b> ${formData.descripcion || 'Servicios de canto'}</span><span>${formatMoneyAr(result.importeTotal)}</span></div>
    <div class="row total"><span>TOTAL</span><span>${formatMoneyAr(result.importeTotal)}</span></div>
  </div>
  <div class="cae">
    <div class="row"><span><b>CAE:</b> ${result.cae}</span></div>
    <div class="row"><span><b>Vto CAE:</b> ${vtoCAE}</span></div>
    ${result.produccion === false ? '<div style="color:red;font-weight:bold">⚠️ MODO HOMOLOGACIÓN — NO VÁLIDO</div>' : ''}
  </div>
  <div style="text-align:center;margin-top:12px">
    <img class="qr" src="https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(qrUrl)}" alt="QR AFIP" />
    <div style="font-size:10px;color:#666">Verificá en AFIP</div>
  </div>
  <div style="text-align:center;margin-top:16px"><button onclick="window.print()">🖨 Imprimir</button></div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
};

export const FacturaModal = ({ isOpen, onClose, montoSugerido = '', alumnoSugerido = '', cuitEmisor = '' }) => {
  const [step, setStep]         = useState('form'); // 'form' | 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult]     = useState(null);

  const [docTipo,      setDocTipo]      = useState(99);
  const [docNro,       setDocNro]       = useState('');
  const [nombre,       setNombre]       = useState(alumnoSugerido);
  const [descripcion,  setDescripcion]  = useState('Servicio de clases de canto');
  const [monto,        setMonto]        = useState(montoSugerido ? String(montoSugerido) : '');

  const reset = () => { setStep('form'); setResult(null); setErrorMsg(''); };

  const handleEmitir = async (e) => {
    e.preventDefault();
    if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
      setErrorMsg('El monto debe ser mayor a 0.'); return;
    }
    setStep('loading');
    try {
      const functions = getFunctions();
      const emitir    = httpsCallable(functions, 'emitirFactura');
      const res = await emitir({
        tipoComprobante: 11,
        concepto:        2,
        docTipo:         docTipo,
        docNro:          docTipo === 99 ? 0 : parseInt((docNro || '0').replace(/\D/g, '')),
        nombreReceptor:  nombre || 'Consumidor Final',
        importeTotal:    parseFloat(String(monto).replace(/\./g, '').replace(',', '.')),
        descripcion,
      });
      setResult(res.data);
      setStep('success');
    } catch (err) {
      setErrorMsg(err.message || 'Error al emitir la factura');
      setStep('error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="sm">
      <div className="bg-white rounded-xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl text-white text-xl">🧾</div>
            <div>
              <h2 className="text-white font-bold text-base">Emitir Factura C</h2>
              <p className="text-blue-200 text-xs">Facturación Electrónica AFIP · Monotributista</p>
            </div>
          </div>
        </div>

        {/* ── FORMULARIO ── */}
        {step === 'form' && (
          <form onSubmit={handleEmitir} className="p-5 space-y-4">
            <div>
              <label className={labelCls}>Tipo de receptor</label>
              <div className="space-y-1.5">
                {TIPO_DOC.map(d => (
                  <label key={d.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition
                    ${docTipo === d.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}>
                    <input type="radio" name="docTipo" value={d.id} checked={docTipo === d.id}
                      onChange={() => { setDocTipo(d.id); setDocNro(''); }}
                      className="accent-blue-600" />
                    <span className="text-sm text-gray-700">{d.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {docTipo !== 99 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nombre del receptor</label>
                  <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                    className={inputCls} placeholder="Nombre y apellido" required />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>{docTipo === 96 ? 'DNI' : 'CUIT'}</label>
                  <input type="text" value={docNro} onChange={e => setDocNro(e.target.value)}
                    className={inputCls} placeholder={docTipo === 96 ? '30123456' : '20123456789'}
                    inputMode="numeric" required />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Descripción del servicio</label>
              <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
                className={inputCls} placeholder="Servicios de clases de canto" />
            </div>

            <div>
              <label className={labelCls}>Importe total</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                className={inputCls} placeholder="100000" min="1" step="0.01" required />
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{errorMsg}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { reset(); onClose(); }}
                className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
                Cancelar
              </button>
              <button type="submit"
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-black shadow-md shadow-blue-200 transition flex items-center justify-center gap-2">
                🧾 Emitir Factura C
              </button>
            </div>
          </form>
        )}

        {/* ── CARGANDO ── */}
        {step === 'loading' && (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 font-medium text-sm">Conectando con AFIP...</p>
            <p className="text-gray-400 text-xs">Puede tardar unos segundos</p>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div className="p-6 space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="font-bold text-red-800 mb-1">❌ Error al emitir</p>
              <p className="text-sm text-red-700">{errorMsg}</p>
              {errorMsg.includes('no configurado') && (
                <div className="mt-3 p-3 bg-white rounded-lg border border-red-100 text-xs text-gray-600 space-y-1">
                  <p className="font-bold text-gray-700">Para configurar AFIP ejecutá:</p>
                  <code className="block bg-gray-50 p-2 rounded text-[10px] font-mono">
                    firebase functions:config:set afip.cuit="TU_CUIT" afip.cert="$(cat cert.pem)" afip.key="$(cat private.key)" afip.pto_vta="1" afip.produccion="false"
                  </code>
                </div>
              )}
            </div>
            <button onClick={reset}
              className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
              Volver a intentar
            </button>
          </div>
        )}

        {/* ── ÉXITO ── */}
        {step === 'success' && result && (
          <div className="p-5 space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="font-black text-green-800 text-lg mb-1">✅ Factura emitida</p>
              <p className="text-green-700 text-sm">N° 0001-{String(result.nroFactura).padStart(8,'0')} · {result.fecha}</p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-gray-500 font-medium">CAE</span>
                <span className="font-black text-gray-800 font-mono">{result.cae}</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-gray-500 font-medium">Vto. CAE</span>
                <span className="font-semibold text-gray-800">
                  {result.caeFchVto ? `${result.caeFchVto.slice(6,8)}/${result.caeFchVto.slice(4,6)}/${result.caeFchVto.slice(0,4)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-gray-500 font-medium">Total</span>
                <span className="font-black text-green-700">{formatMoneyAr(result.importeTotal)}</span>
              </div>
            </div>

            {!result.produccion && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
                ⚠️ Modo homologación (prueba) — no es una factura válida todavía
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => imprimirFactura(result, { docTipo, docNro, descripcion }, cuitEmisor)}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition flex items-center justify-center gap-2">
                🖨 Ver e Imprimir
              </button>
              <button onClick={() => { reset(); onClose(); }}
                className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
                Cerrar
              </button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
};
