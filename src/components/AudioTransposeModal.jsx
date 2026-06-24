import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal } from './Modal.jsx';

// ── FFT (Cooley-Tukey) ──────────────────────────────────────────────────────
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;
  const h = n >> 1;
  const eR = new Float32Array(h), eI = new Float32Array(h);
  const oR = new Float32Array(h), oI = new Float32Array(h);
  for (let i = 0; i < h; i++) {
    eR[i] = re[i*2]; eI[i] = im[i*2];
    oR[i] = re[i*2+1]; oI[i] = im[i*2+1];
  }
  fft(eR, eI); fft(oR, oI);
  for (let k = 0; k < h; k++) {
    const a = -2 * Math.PI * k / n;
    const c = Math.cos(a), s = Math.sin(a);
    const tR = c*oR[k] - s*oI[k], tI = s*oR[k] + c*oI[k];
    re[k] = eR[k]+tR; im[k] = eI[k]+tI;
    re[k+h] = eR[k]-tR; im[k+h] = eI[k]-tI;
  }
}

// ── Chromagram ──────────────────────────────────────────────────────────────
function computeChroma(audioBuffer) {
  const sr = audioBuffer.sampleRate, N = 4096, hop = 2048;
  const nch = audioBuffer.numberOfChannels, len = audioBuffer.length;
  const mono = new Float32Array(len);
  for (let ch = 0; ch < nch; ch++) {
    const d = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += d[i] / nch;
  }
  const chroma = new Float32Array(12);
  for (let start = 0; start + N <= len; start += hop) {
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      re[i] = mono[start+i] * 0.5 * (1 - Math.cos(2*Math.PI*i/(N-1)));
    }
    fft(re, im);
    for (let bin = 1; bin < N/2; bin++) {
      const freq = bin * sr / N;
      if (freq < 65 || freq > 2100) continue;
      const pc = ((Math.round(12 * Math.log2(freq/440) + 69) % 12) + 12) % 12;
      chroma[pc] += Math.sqrt(re[bin]*re[bin] + im[bin]*im[bin]);
    }
  }
  const max = Math.max(...chroma) || 1;
  return chroma.map(v => v / max);
}

// ── Krumhansl-Schmuckler ────────────────────────────────────────────────────
const KS_MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KS_MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const NOTES_ES = ['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];

function pearson(a, b) {
  const n = a.length, ma = a.reduce((s,x)=>s+x,0)/n, mb = b.reduce((s,x)=>s+x,0)/n;
  let num=0, da=0, db=0;
  for (let i=0;i<n;i++) { const x=a[i]-ma,y=b[i]-mb; num+=x*y; da+=x*x; db+=y*y; }
  return num / Math.sqrt(da*db);
}

function findKey(chroma) {
  const arr = Array.from(chroma);
  let best=-Infinity, idx=0, mode='Mayor';
  for (let i=0; i<12; i++) {
    const rot = p => [...p.slice(i), ...p.slice(0,i)];
    const sm = pearson(arr, rot(KS_MAJ)); if (sm>best) { best=sm; idx=i; mode='Mayor'; }
    const sn = pearson(arr, rot(KS_MIN)); if (sn>best) { best=sn; idx=i; mode='Menor'; }
  }
  return { idx, mode, label: `${NOTES_ES[idx]} ${mode}` };
}

function transposedLabel(idx, mode, semi) {
  return `${NOTES_ES[((idx+semi)%12+12)%12]} ${mode}`;
}

// ── WAV encoder ─────────────────────────────────────────────────────────────
function encodeWav(buf) {
  const nch=buf.numberOfChannels, sr=buf.sampleRate, len=buf.length;
  const ab=new ArrayBuffer(44+len*nch*2); const v=new DataView(ab);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF'); v.setUint32(4,36+len*nch*2,true); ws(8,'WAVE');
  ws(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true);
  v.setUint16(22,nch,true); v.setUint32(24,sr,true);
  v.setUint32(28,sr*nch*2,true); v.setUint16(32,nch*2,true);
  v.setUint16(34,16,true); ws(36,'data'); v.setUint32(40,len*nch*2,true);
  let o=44;
  for (let i=0;i<len;i++) for (let ch=0;ch<nch;ch++) {
    const s=Math.max(-1,Math.min(1,buf.getChannelData(ch)[i]));
    v.setInt16(o,s<0?s*0x8000:s*0x7FFF,true); o+=2;
  }
  return new Blob([ab],{type:'audio/wav'});
}

// ── MP3 encoder (lamejs) ─────────────────────────────────────────────────────
async function encodeMp3(buf, kbps = 192) {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const nch = Math.min(buf.numberOfChannels, 2);
  const sr = buf.sampleRate;
  const encoder = new Mp3Encoder(nch, sr, kbps);

  const toInt16 = (f32) => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  };

  const left = toInt16(buf.getChannelData(0));
  const right = nch > 1 ? toInt16(buf.getChannelData(1)) : null;
  const BLOCK = 1152;
  const chunks = [];

  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const mp3buf = right
      ? encoder.encodeBuffer(l, right.subarray(i, i + BLOCK))
      : encoder.encodeBuffer(l);
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(end);

  return new Blob(chunks, { type: 'audio/mp3' });
}

// ── Recortar un AudioBuffer entre dos tiempos (segundos) ────────────────────
function sliceBuffer(buf, startSec, endSec) {
  const sr = buf.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const endSample = Math.min(buf.length, Math.ceil(endSec * sr));
  const len = Math.max(1, endSample - startSample);
  const nch = buf.numberOfChannels;
  const ctx = new OfflineAudioContext(nch, len, sr);
  const out = ctx.createBuffer(nch, len, sr);
  for (let ch = 0; ch < nch; ch++) {
    out.getChannelData(ch).set(buf.getChannelData(ch).subarray(startSample, endSample));
  }
  return out;
}

// ── Picos de la forma de onda para dibujar el waveform ──────────────────────
function computePeaks(buf, numBars = 220) {
  const data = buf.getChannelData(0);
  const blockSize = Math.floor(data.length / numBars) || 1;
  const peaks = new Float32Array(numBars);
  for (let i = 0; i < numBars; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Build SoundTouch source from AudioBuffer ─────────────────────────────────
function buildSource(audioBuffer) {
  const nch = audioBuffer.numberOfChannels;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = nch > 1 ? audioBuffer.getChannelData(1) : ch0;
  const len = audioBuffer.length;
  return {
    extract(target, numFrames, position) {
      let count = 0;
      for (let i=0; i<numFrames; i++) {
        const idx = position + i;
        if (idx >= len) break;
        target[i*2]   = ch0[idx];
        target[i*2+1] = ch1[idx];
        count++;
      }
      return count;
    }
  };
}

// ── Offline pitch shift + WAV export ────────────────────────────────────────
async function shiftPitch(audioBuffer, semitones, onProgress) {
  const { SoundTouch, SimpleFilter } = await import('soundtouchjs');
  const nch = Math.min(audioBuffer.numberOfChannels, 2);
  const len = audioBuffer.length, sr = audioBuffer.sampleRate;
  const st = new SoundTouch(); st.pitch = Math.pow(2, semitones/12);
  const filter = new SimpleFilter(buildSource(audioBuffer), st);
  const CHUNK = 4096, maxOut = len + 8192;
  const L = new Float32Array(maxOut), R = new Float32Array(maxOut);
  let outPos = 0;
  while (outPos < maxOut - CHUNK) {
    const tmp = new Float32Array(CHUNK*2);
    const got = filter.extract(tmp, CHUNK);
    if (got === 0) break;
    for (let i=0; i<got && outPos+i<maxOut; i++) {
      L[outPos+i] = tmp[i*2]; R[outPos+i] = tmp[i*2+1];
    }
    outPos += got;
    if (onProgress) onProgress(Math.min(99, Math.round((outPos/len)*100)));
    if ((outPos/CHUNK) % 8 === 0) await new Promise(r=>setTimeout(r,0));
  }
  const outCtx = new OfflineAudioContext(nch, outPos, sr);
  const out = outCtx.createBuffer(nch, outPos, sr);
  out.getChannelData(0).set(L.subarray(0,outPos));
  if (nch>1) out.getChannelData(1).set(R.subarray(0,outPos));
  return out;
}

// ── Waveform con manijas de recorte (arrastrables con mouse/touch) ──────────
function TrimWaveform({ peaks, duration, trimStart, trimEnd, onChange }) {
  const containerRef = useRef(null);
  const draggingRef = useRef(null);

  const pctFromClientX = (clientX) => {
    const rect = containerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleDown = (which) => (e) => {
    e.preventDefault();
    draggingRef.current = which;

    const move = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const t = pctFromClientX(clientX) * duration;
      if (draggingRef.current === 'start') onChange(Math.min(t, trimEnd - 0.15), trimEnd);
      else onChange(trimStart, Math.max(t, trimStart + 0.15));
    };
    const up = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;

  return (
    <div ref={containerRef} className="relative h-16 bg-gray-100 rounded-lg overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0 flex items-center px-0.5 gap-px">
        {peaks && Array.from(peaks).map((p, i) => (
          <div key={i} className="flex-1 bg-violet-300 rounded-sm" style={{ height: `${Math.max(4, p * 100)}%` }} />
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 bg-white/70 pointer-events-none" style={{ width: `${startPct}%` }} />
      <div className="absolute inset-y-0 right-0 bg-white/70 pointer-events-none" style={{ width: `${100 - endPct}%` }} />
      <div className="absolute inset-y-0 border-x-2 border-violet-600 pointer-events-none" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
      <div onMouseDown={handleDown('start')} onTouchStart={handleDown('start')}
        className="absolute inset-y-0 w-4 -ml-2 bg-violet-600 rounded cursor-ew-resize flex items-center justify-center z-10"
        style={{ left: `${startPct}%` }}>
        <div className="w-0.5 h-7 bg-white/80 rounded" />
      </div>
      <div onMouseDown={handleDown('end')} onTouchStart={handleDown('end')}
        className="absolute inset-y-0 w-4 -ml-2 bg-violet-600 rounded cursor-ew-resize flex items-center justify-center z-10"
        style={{ left: `${endPct}%` }}>
        <div className="w-0.5 h-7 bg-white/80 rounded" />
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function AudioTransposeModal({ isOpen, onClose }) {
  const [tab, setTab] = useState('file');
  const [file, setFile] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [detectedKey, setDetectedKey] = useState(null);
  const [semitones, setSemitones] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [exportOk, setExportOk] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [isLoadingYt, setIsLoadingYt] = useState(false);
  const [ytCookie, setYtCookie] = useState(() => localStorage.getItem('yt_cookie') || '');
  const [showCookieSetup, setShowCookieSetup] = useState(false);
  const [cookieInput, setCookieInput] = useState('');

  // ── Estado captura de audio del tab ─────────────────────────────────────
  const [isCapturing,   setIsCapturing]   = useState(false);
  const [captureTime,   setCaptureTime]   = useState(0);
  const [captureError,  setCaptureError]  = useState('');
  const captureRecRef   = useRef(null);
  const captureChunks   = useRef([]);
  const captureTimerRef = useRef(null);
  // startCapture y stopCapture se declaran DESPUÉS de reset y loadAudioData

  // Preview state
  const [isPlaying, setIsPlaying] = useState(false);
  const previewCtxRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Recorte (trim) ───────────────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [peaks, setPeaks] = useState(null);
  const [exportFormat, setExportFormat] = useState('mp3');
  const [isTrimPlaying, setIsTrimPlaying] = useState(false);
  const trimAudioRef = useRef(null);

  // Stop preview on semitone change or close
  const stopPreview = useCallback(() => {
    if (previewCtxRef.current) {
      previewCtxRef.current.close().catch(() => {});
      previewCtxRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => { if (isPlaying) stopPreview(); }, [semitones]);
  useEffect(() => { if (!isOpen) { stopPreview(); } }, [isOpen]);

  const reset = useCallback(() => {
    stopPreview();
    setFile(null); setAudioBuffer(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(null);
    setDetectedKey(null); setSemitones(0);
    setIsAnalyzing(false); setIsExporting(false);
    setExportProgress(0); setError(''); setExportOk(false);
    setYtUrl('');
    setTrimStart(0); setTrimEnd(0); setPeaks(null); setIsTrimPlaying(false);
  }, [originalUrl, stopPreview]);

  // Analyze audio buffer → chromagram → key
  const analyzeBuffer = useCallback(async (decoded) => {
    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 0));
    try {
      const key = findKey(computeChroma(decoded));
      setDetectedKey(key);
    } catch { setError('Error al analizar la tonalidad.'); }
    finally { setIsAnalyzing(false); }
  }, []);

  const loadAudioData = useCallback(async (arrayBuf, fileName, mimeType) => {
    const blob = new Blob([arrayBuf], { type: mimeType || 'audio/mpeg' });
    setOriginalUrl(URL.createObjectURL(blob));
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    await ctx.close();
    setAudioBuffer(decoded);
    setPeaks(computePeaks(decoded));
    setTrimStart(0);
    setTrimEnd(decoded.length / decoded.sampleRate);
    await analyzeBuffer(decoded);
  }, [analyzeBuffer]);

  const processFile = useCallback(async (f) => {
    if (!f?.type?.startsWith('audio/')) {
      setError('Formato no soportado. Usá MP3, WAV, OGG, M4A o FLAC.'); return;
    }
    reset(); setFile(f);
    setError('');
    try {
      await loadAudioData(await f.arrayBuffer(), f.name, f.type);
    } catch { setError('No se pudo decodificar el archivo. Probá con otro formato.'); }
  }, [reset, loadAudioData]);

  // Real-time preview with SoundTouch
  const togglePreview = useCallback(async () => {
    if (isPlaying) { stopPreview(); return; }
    if (!audioBuffer) return;
    try {
      const fullDuration = audioBuffer.length / audioBuffer.sampleRate;
      const trimmed = trimStart > 0.01 || trimEnd < fullDuration - 0.01;
      const previewBuf = trimmed ? sliceBuffer(audioBuffer, trimStart, trimEnd) : audioBuffer;

      const { SoundTouch, SimpleFilter, getWebAudioNode } = await import('soundtouchjs');
      const ctx = new AudioContext();
      previewCtxRef.current = ctx;
      const st = new SoundTouch();
      st.pitch = Math.pow(2, semitones / 12);
      const filter = new SimpleFilter(buildSource(previewBuf), st);
      const node = getWebAudioNode(ctx, filter);
      node.connect(ctx.destination);
      setIsPlaying(true);
      // Auto-stop after la duración del recorte (o de todo el audio si no hay recorte)
      const duration = (previewBuf.length / previewBuf.sampleRate) * 1000 + 1000;
      setTimeout(() => { if (previewCtxRef.current === ctx) stopPreview(); }, duration);
    } catch (e) {
      setError('Error al iniciar la previsualización: ' + e.message);
      stopPreview();
    }
  }, [audioBuffer, semitones, isPlaying, stopPreview, trimStart, trimEnd]);

  // Export (recorte + pitch shift opcional → WAV o MP3)
  const handleExport = useCallback(async () => {
    if (!audioBuffer) return;
    setIsExporting(true); setExportProgress(0); setExportOk(false);
    try {
      let outBuf = audioBuffer;
      const fullDuration = audioBuffer.length / audioBuffer.sampleRate;
      const trimmed = trimStart > 0.01 || trimEnd < fullDuration - 0.01;
      if (trimmed) outBuf = sliceBuffer(outBuf, trimStart, trimEnd);
      if (semitones !== 0) outBuf = await shiftPitch(outBuf, semitones, setExportProgress);
      setExportProgress(100);

      const blob = exportFormat === 'mp3' ? await encodeMp3(outBuf) : encodeWav(outBuf);
      const baseName = (file?.name || 'audio').replace(/\.[^.]+$/, '');
      const suffix = semitones === 0 ? '' : `_${semitones > 0 ? '+' : ''}${semitones}st`;
      const trimSuffix = trimmed ? '_recortado' : '';
      const ext = exportFormat === 'mp3' ? 'mp3' : 'wav';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}${suffix}${trimSuffix}.${ext}`;
      a.click();
      setExportOk(true);
    } catch (e) { setError('Error al exportar: ' + e.message); }
    finally { setIsExporting(false); }
  }, [audioBuffer, semitones, file, trimStart, trimEnd, exportFormat]);

  // Reproducir solo el segmento recortado (usa el <audio> del original)
  const toggleTrimPreview = useCallback(() => {
    const el = trimAudioRef.current;
    if (!el) return;
    if (isTrimPlaying) { el.pause(); setIsTrimPlaying(false); return; }
    el.currentTime = trimStart;
    el.play();
    setIsTrimPlaying(true);
  }, [isTrimPlaying, trimStart]);

  useEffect(() => {
    const el = trimAudioRef.current;
    if (!el) return;
    const onTime = () => { if (el.currentTime >= trimEnd) { el.pause(); setIsTrimPlaying(false); } };
    const onEnded = () => setIsTrimPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('ended', onEnded); };
  }, [trimEnd]);


  // YouTube load handler — envía cookies al servidor para autenticación
  const handleYoutubeLoad = useCallback(async () => {
    const url = ytUrl.trim();
    if (!url) return;
    reset(); setIsLoadingYt(true); setError('');
    try {
      const res = await fetch('/api/ytDownload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, cookieStr: ytCookie }),
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      const arrayBuf = await res.arrayBuffer();
      const vidId = url.match(/[?&]v=([^&]+)|youtu\.be\/([^?]+)/);
      const fakeName = `youtube_${vidId?.[1] || vidId?.[2] || 'audio'}.m4a`;
      setFile({ name: fakeName, size: arrayBuf.byteLength, type: 'audio/mp4' });
      await loadAudioData(arrayBuf, fakeName, 'audio/mp4');
    } catch (e) {
      setError('No se pudo descargar: ' + e.message);
    } finally { setIsLoadingYt(false); }
  }, [ytUrl, ytCookie, reset, loadAudioData]);

  // ── Captura de audio del tab (declaradas DESPUÉS de reset y loadAudioData) ──
  const startCapture = useCallback(async () => {
    setCaptureError('');
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureError('Tu navegador no soporta esta función. Usá Chrome o Edge en computadora.');
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, frameRate: 1 },
        audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 },
      });
      displayStream.getVideoTracks().forEach(t => t.stop());
      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        setCaptureError('No se capturó audio. Asegurate de marcar "Compartir audio del sistema" o elegir "Esta pestaña".');
        return;
      }
      const audioStream = new MediaStream(audioTracks);
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4',''].find(t => !t || MediaRecorder.isTypeSupported(t));
      const opts = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(audioStream, opts);
      captureRecRef.current = recorder;
      captureChunks.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) captureChunks.current.push(e.data); };
      recorder.onstop = async () => {
        clearInterval(captureTimerRef.current);
        audioTracks.forEach(t => t.stop());
        setIsCapturing(false);
        const finalMime = mimeType || 'audio/webm';
        const blob = new Blob(captureChunks.current, { type: finalMime });
        const capturedFile = new File([blob], 'captura_audio.webm', { type: finalMime });
        reset(); setFile(capturedFile);
        try {
          const arrayBuf = await capturedFile.arrayBuffer();
          await loadAudioData(arrayBuf, capturedFile.name, finalMime);
        } catch { setCaptureError('No se pudo decodificar el audio capturado.'); }
      };
      audioTracks[0].onended = () => {
        if (captureRecRef.current?.state === 'recording') captureRecRef.current.stop();
      };
      recorder.start(200);
      setIsCapturing(true); setCaptureTime(0);
      let t = 0;
      captureTimerRef.current = setInterval(() => { t++; setCaptureTime(t); }, 1000);
    } catch (e) {
      if (e.name === 'NotAllowedError') setCaptureError('Cancelado. Seleccioná una pestaña o ventana para capturar su audio.');
      else setCaptureError('Error: ' + e.message);
    }
  }, [reset, loadAudioData]);

  const stopCapture = useCallback(() => {
    clearInterval(captureTimerRef.current);
    if (captureRecRef.current?.state === 'recording') captureRecRef.current.stop();
  }, []);

  const transLabel = detectedKey ? transposedLabel(detectedKey.idx, detectedKey.mode, semitones) : null;
  const hasAudio = !!audioBuffer && !!detectedKey && !isAnalyzing;
  const isTrimmedActive = !!audioBuffer && (trimStart > 0.01 || trimEnd < (audioBuffer.length / audioBuffer.sampleRate) - 0.01);

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="md">
      <div className="p-0">
        {/* Modal header */}
        <div className="bg-gradient-to-r from-violet-700 to-purple-600 px-6 py-4 rounded-t-xl flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Transposición de Audio</h2>
            <p className="text-purple-200 text-xs">Detectá la tonalidad, previsualizá y exportá</p>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Tabs */}
          {!file && (
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {[['file', '📁 Subir archivo'], ['youtube', '▶ YouTube']].map(([id, label]) => (
                <button key={id} onClick={() => { setTab(id); setError(''); }}
                  className={`flex-1 py-2.5 text-sm font-semibold transition ${tab===id
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* File upload tab */}
          {tab === 'file' && !file && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${isDragging ? 'border-violet-500 bg-violet-50' : 'border-gray-300 bg-gray-50 hover:border-violet-400 hover:bg-violet-50'}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-full ${isDragging ? 'bg-violet-200' : 'bg-gray-200'}`}>
                  <svg className={`w-10 h-10 ${isDragging ? 'text-violet-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-700">Arrastrá un archivo aquí</p>
                  <p className="text-sm text-gray-500 mt-1">o hacé clic para seleccionar</p>
                  <p className="text-xs text-gray-400 mt-2">MP3 · WAV · OGG · M4A · FLAC</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
                onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
            </div>
          )}

          {/* YouTube tab — reproducir + grabar en el mismo modal */}
          {tab === 'youtube' && !file && (() => {
            const ytId = ytUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
            return (
            <div className="space-y-3">
              {/* URL input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ytUrl}
                  onChange={e => setYtUrl(e.target.value)}
                  placeholder="Pegá el link de YouTube aquí..."
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {ytUrl && (
                  <button onClick={() => setYtUrl('')}
                    className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm font-bold transition">
                    ✕
                  </button>
                )}
              </div>

              {/* Player embebido */}
              {ytId ? (
                <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
                  <iframe
                    key={ytId}
                    src={`https://www.youtube.com/embed/${ytId}?rel=0`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    className="w-full h-full border-0"
                    title="YouTube player"
                  />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
                  <div className="text-center text-gray-400 space-y-2">
                    <svg className="w-12 h-12 mx-auto opacity-40" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.05a8.29 8.29 0 004.86 1.57V7.17a4.85 4.85 0 01-1.09-.48z"/>
                    </svg>
                    <p className="text-sm">Pegá un link de YouTube arriba</p>
                  </div>
                </div>
              )}

              {/* Controles de grabación */}
              {ytId && (
                <div className="space-y-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    <strong>Cómo usar:</strong> Dale <strong>▶ Play</strong> al video de arriba, luego hacé click
                    en <strong>"Iniciar grabación"</strong> y cuando aparezca el diálogo del browser
                    elegí <strong>"Esta pestaña"</strong>. Cuando termine la canción, presioná <strong>"Detener"</strong>.
                    Solo funciona en <strong>Chrome / Edge de escritorio</strong>.
                  </div>

                  {isCapturing ? (
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <div className="flex items-end gap-0.5" style={{ height: 20 }}>
                        {[3,5,4,6,3,5,4].map((h,i) => (
                          <div key={i} style={{ width:2, height:`${Math.round(h/6*18)}px`, backgroundColor:'#ef4444', borderRadius:2, animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate` }}/>
                        ))}
                      </div>
                      <span className="text-sm font-bold text-red-700 flex-1 tabular-nums">
                        {`${Math.floor(captureTime/60)}:${String(captureTime%60).padStart(2,'0')}`} — Grabando audio...
                      </span>
                      <button onClick={stopCapture}
                        className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition">
                        ⏹ Detener
                      </button>
                    </div>
                  ) : (
                    <button onClick={startCapture}
                      className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="12" cy="12" r="4"/>
                      </svg>
                      Iniciar grabación de esta pestaña
                    </button>
                  )}

                  {captureError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{captureError}</p>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {/* OLD YouTube tab — cookies setup (HIDDEN) */}
          {false && tab === 'youtube_old' && !file && (
            <div className="space-y-4">
              {/* Estado de cookies */}
              {!ytCookie ? (
                /* ── SIN COOKIES: mostrar setup ── */
                <div className="space-y-3">
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                    <p className="font-bold text-amber-800 text-sm">⚙️ Configuración única (extensión de Chrome)</p>
                    <p className="text-xs text-amber-700">
                      Necesitás exportar las cookies completas de YouTube. La extensión accede a TODAS las cookies incluyendo las de autenticación.
                    </p>

                    {/* Paso 1 */}
                    <div className="bg-white border border-amber-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-bold text-amber-800">Paso 1 — Instalá la extensión (solo una vez)</p>
                      <a
                        href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 underline hover:text-violet-900"
                      >
                        → Instalar "Get cookies.txt LOCALLY" en Chrome
                      </a>
                    </div>

                    {/* Paso 2 */}
                    <div className="bg-white border border-amber-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-bold text-amber-800">Paso 2 — Exportar cookies de YouTube</p>
                      <div className="space-y-1 text-xs text-amber-800">
                        <div className="flex gap-2"><span>1.</span><span>Abrí <strong>youtube.com</strong> (logueado con tu cuenta Google)</span></div>
                        <div className="flex gap-2"><span>2.</span><span>Hacé clic en el ícono de la extensión (<img src="https://www.gstatic.com/chrome/ntp/chrome_webstore_item.png" className="inline h-3 w-3"/> arriba a la derecha)</span></div>
                        <div className="flex gap-2"><span>3.</span><span>Seleccioná <strong>"For this Site"</strong> → luego <strong>"Export"</strong></span></div>
                        <div className="flex gap-2"><span>4.</span><span>Se descarga un archivo <code className="bg-amber-100 px-1 rounded">youtube.com_cookies.txt</code> — abrilo con el Bloc de notas y copiá TODO el contenido</span></div>
                      </div>
                    </div>

                    {/* Paso 3 */}
                    <div className="bg-white border border-amber-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-bold text-amber-800">Paso 3 — Pegalo acá abajo</p>
                      <p className="text-xs text-amber-700">El texto empieza con <code className="bg-amber-100 px-1 rounded"># Netscape HTTP Cookie File</code></p>
                    </div>
                  </div>
                  <textarea
                    value={cookieInput}
                    onChange={e => setCookieInput(e.target.value)}
                    placeholder="Pegá acá las cookies copiadas de la consola..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                  <button
                    onClick={() => {
                      const cookie = cookieInput.trim();
                      if (!cookie) return;
                      localStorage.setItem('yt_cookie', cookie);
                      setYtCookie(cookie);
                      setCookieInput('');
                    }}
                    disabled={!cookieInput.trim()}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm transition
                      ${!cookieInput.trim() ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}
                  >
                    Guardar cookies y continuar →
                  </button>
                </div>
              ) : (
                /* ── CON COOKIES: mostrar input de URL ── */
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-green-800">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                      </svg>
                      <span className="font-semibold">Cookies configuradas</span>
                      <span className="text-xs text-green-600">(la primera descarga tarda ~20 seg)</span>
                    </div>
                    <button
                      onClick={() => { localStorage.removeItem('yt_cookie'); setYtCookie(''); }}
                      className="text-xs text-green-600 hover:text-red-600 underline transition"
                    >
                      Cambiar
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleYoutubeLoad()}
                      placeholder="https://youtube.com/watch?v=..."
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <button
                      onClick={handleYoutubeLoad}
                      disabled={isLoadingYt || !ytUrl.trim()}
                      className={`px-4 py-2 rounded-xl font-semibold text-sm transition flex items-center gap-2 flex-shrink-0
                        ${isLoadingYt || !ytUrl.trim()
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-violet-600 hover:bg-violet-700 text-white'}`}
                    >
                      {isLoadingYt
                        ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/>Cargando...</>
                        : <>Cargar</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* File chip */}
          {file && (
            <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl border border-violet-200">
              <div className="p-2 bg-violet-100 rounded-lg flex-shrink-0">
                <svg className="w-5 h-5 text-violet-700" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-violet-900 text-sm truncate">{file.name}</p>
                <p className="text-xs text-violet-600">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button onClick={reset} className="text-violet-400 hover:text-violet-700 p-1 rounded transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Analyzing */}
          {(isAnalyzing || isLoadingYt) && (
            <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-xl border border-violet-100">
              <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full flex-shrink-0" />
              <div>
                <p className="font-medium text-violet-800 text-sm">
                  {isLoadingYt ? 'Descargando audio de YouTube...' : 'Analizando tonalidad...'}
                </p>
                <p className="text-xs text-violet-600">
                  {isLoadingYt ? 'Primera vez: ~20 seg (descarga el motor). Después es rápido.' : 'Análisis cromático FFT'}
                </p>
              </div>
            </div>
          )}

          {/* Main controls — only when audio is ready */}
          {hasAudio && (
            <>
              {/* Detected key */}
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Tonalidad detectada</p>
                <span className="text-3xl font-black text-emerald-800">{detectedKey.label}</span>
              </div>

              {/* Semitones control */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Transponer</p>
                <div className="flex items-center gap-4">
                  <button onClick={() => setSemitones(s => Math.max(-12,s-1))}
                    className="w-10 h-10 rounded-full bg-white border-2 border-gray-300 hover:border-violet-500 hover:bg-violet-50 font-bold text-xl text-gray-700 transition flex items-center justify-center shadow-sm">
                    −
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-black text-gray-800">
                      {semitones > 0 ? `+${semitones}` : semitones}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">st</span>
                    <input type="range" min={-12} max={12} value={semitones}
                      onChange={e => setSemitones(Number(e.target.value))}
                      className="w-full accent-violet-600 mt-2 block" />
                  </div>
                  <button onClick={() => setSemitones(s => Math.min(12,s+1))}
                    className="w-10 h-10 rounded-full bg-white border-2 border-gray-300 hover:border-violet-500 hover:bg-violet-50 font-bold text-xl text-gray-700 transition flex items-center justify-center shadow-sm">
                    +
                  </button>
                </div>
                {semitones !== 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm pt-1">
                    <span className="text-gray-500 font-medium">{detectedKey.label}</span>
                    <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                    </svg>
                    <span className="font-black text-violet-700 text-base">{transLabel}</span>
                  </div>
                )}
              </div>

              {/* Recortar audio */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recortar</p>
                  <button onClick={() => { setTrimStart(0); setTrimEnd(audioBuffer.length / audioBuffer.sampleRate); }}
                    className="text-xs text-violet-600 font-semibold hover:text-violet-800">
                    Restablecer
                  </button>
                </div>
                <TrimWaveform
                  peaks={peaks}
                  duration={audioBuffer.length / audioBuffer.sampleRate}
                  trimStart={trimStart}
                  trimEnd={trimEnd}
                  onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-gray-600">{fmtTime(trimStart)} → {fmtTime(trimEnd)}</span>
                  <span className="text-xs text-gray-400">Duración: {fmtTime(trimEnd - trimStart)}</span>
                </div>
                <button onClick={toggleTrimPreview}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-xs transition
                    ${isTrimPlaying
                      ? 'bg-rose-100 border-2 border-rose-400 text-rose-700 hover:bg-rose-200'
                      : 'bg-white border-2 border-gray-300 text-gray-600 hover:border-violet-400 hover:text-violet-700'}`}>
                  {isTrimPlaying ? (
                    <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>Detener</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Reproducir recorte</>
                  )}
                </button>
                {originalUrl && (
                  <audio ref={trimAudioRef} src={originalUrl} className="hidden" />
                )}
              </div>

              {/* Preview + original player */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {/* Real-time pitch-shifted preview */}
                  <button
                    onClick={togglePreview}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition flex-shrink-0
                      ${isPlaying
                        ? 'bg-rose-100 border-2 border-rose-400 text-rose-700 hover:bg-rose-200'
                        : 'bg-violet-100 border-2 border-violet-300 text-violet-700 hover:bg-violet-200'}`}
                  >
                    {isPlaying ? (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
                        </svg>
                        Detener
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        {semitones === 0
                          ? (isTrimmedActive ? 'Reproducir recorte' : 'Reproducir')
                          : `Previsualizar (${semitones>0?'+':''}${semitones} st)${isTrimmedActive ? ' — recorte' : ''}`}
                      </>
                    )}
                  </button>
                  {isPlaying && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                      Reproduciendo con pitch shift en tiempo real
                    </span>
                  )}
                </div>
                {/* Original player */}
                {originalUrl && !isPlaying && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Original sin modificar</p>
                    <audio controls src={originalUrl} className="w-full h-9" />
                  </div>
                )}
              </div>

              {/* Export progress */}
              {isExporting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Procesando...</span><span>{exportProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-violet-500 h-2 rounded-full transition-all" style={{width:`${exportProgress}%`}}/>
                  </div>
                  <p className="text-xs text-gray-400 text-center">Puede tardar según el tamaño del archivo</p>
                </div>
              )}

              {/* Formato de exportación */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {[['mp3', 'MP3'], ['wav', 'WAV']].map(([id, label]) => (
                  <button key={id} onClick={() => setExportFormat(id)}
                    className={`flex-1 py-2 text-sm font-semibold transition ${exportFormat === id
                      ? 'bg-violet-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Export button */}
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={`w-full py-3 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition
                  ${isExporting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-200'}`}
              >
                {isExporting
                  ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/>Exportando...</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Exportar {exportFormat.toUpperCase()}{semitones !== 0 ? ` → ${transLabel}` : ''}
                  </>
                }
              </button>

              {exportOk && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-800">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                  ¡Archivo exportado correctamente!
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
