import React, { useState, useRef, useEffect, useCallback } from 'react';
import { collection as fsCollection, addDoc, doc, updateDoc, serverTimestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig.js';
import { detectPitch, freqToNoteInfo, NOTE_ES } from '../utils/pitchDetector.js';
import { ChromaticTuner } from './PitchPanel.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Card wrapper colapsable
// ─────────────────────────────────────────────────────────────────────────────
function ToolCard({ icon, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-xl flex-shrink-0">{icon}</span>
        <span className="flex-1 font-bold text-gray-800 text-sm">{title}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && <div className="border-t border-gray-100 p-4">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. METRÓNOMO
// ─────────────────────────────────────────────────────────────────────────────
function Metronome() {
  const [bpm,        setBpm]        = useState(80);
  const [running,    setRunning]    = useState(false);
  const [beat,       setBeat]       = useState(0);
  const [timeSig,    setTimeSig]    = useState(4);
  const [tapTimes,   setTapTimes]   = useState([]);
  const ctxRef       = useRef(null);
  const nextTimeRef  = useRef(0);
  const beatRef      = useRef(0);
  const schedRef     = useRef(null);
  const bpmRef       = useRef(bpm);
  const sigRef       = useRef(timeSig);
  bpmRef.current = bpm; sigRef.current = timeSig;

  const scheduleNote = useCallback((b, time) => {
    const ctx = ctxRef.current; if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = b === 0 ? 1000 : 700;
    gain.gain.setValueAtTime(b === 0 ? 0.9 : 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time); osc.stop(time + 0.06);
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(() => setBeat(b), delay);
  }, []);

  const schedule = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    while (nextTimeRef.current < ctx.currentTime + 0.1) {
      scheduleNote(beatRef.current, nextTimeRef.current);
      nextTimeRef.current += 60 / bpmRef.current;
      beatRef.current = (beatRef.current + 1) % sigRef.current;
    }
    schedRef.current = setTimeout(schedule, 25);
  }, [scheduleNote]);

  const start = useCallback(() => {
    ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    nextTimeRef.current = ctxRef.current.currentTime + 0.05;
    beatRef.current = 0;
    setRunning(true); setBeat(0);
    schedule();
  }, [schedule]);

  const stop = useCallback(() => {
    clearTimeout(schedRef.current);
    ctxRef.current?.close(); ctxRef.current = null;
    setRunning(false); setBeat(-1);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const tap = () => {
    const now = Date.now();
    setTapTimes(prev => {
      const recent = [...prev, now].filter(t => now - t < 3000).slice(-6);
      if (recent.length >= 2) {
        const avg = (recent[recent.length-1] - recent[0]) / (recent.length - 1);
        setBpm(Math.round(Math.min(200, Math.max(30, 60000 / avg))));
      }
      return recent;
    });
  };

  const dots = Array.from({ length: timeSig }, (_, i) => i);

  return (
    <div className="space-y-4">
      {/* Dots */}
      <div className="flex justify-center gap-2">
        {dots.map(i => (
          <div key={i} className={`rounded-full transition-all duration-75
            ${i === beat && running
              ? i === 0 ? 'w-6 h-6 bg-rose-500 shadow-lg shadow-rose-300' : 'w-5 h-5 bg-rose-300'
              : 'w-4 h-4 bg-gray-200'}`}/>
        ))}
      </div>

      {/* BPM display */}
      <div className="text-center">
        <div className="text-5xl font-black text-gray-800 tabular-nums">{bpm}</div>
        <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">BPM</div>
      </div>

      {/* Slider */}
      <input type="range" min={30} max={200} value={bpm}
        onChange={e => setBpm(Number(e.target.value))}
        className="w-full accent-rose-500"/>
      <div className="flex justify-between text-[10px] text-gray-400 font-semibold -mt-2">
        <span>Lento (30)</span><span>Rápido (200)</span>
      </div>

      {/* Compás */}
      <div className="flex gap-2 justify-center">
        {[2,3,4,6].map(s => (
          <button key={s} onClick={() => setTimeSig(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border
              ${timeSig === s ? 'bg-rose-600 text-white border-rose-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-rose-300'}`}>
            {s}/4
          </button>
        ))}
      </div>

      {/* Botones */}
      <div className="flex gap-2">
        <button onClick={tap}
          className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition">
          👆 Tap
        </button>
        <button onClick={running ? stop : start}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition text-white
            ${running ? 'bg-red-500 hover:bg-red-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
          {running ? '⏹ Detener' : '▶ Iniciar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIANO VIRTUAL
// ─────────────────────────────────────────────────────────────────────────────
const PIANO_NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const PIANO_LABELS = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const PIANO_BLACK_DEFS = [
  { name: 'C#', label: 'Do#',  after: 0 },
  { name: 'D#', label: 'Re#',  after: 1 },
  { name: 'F#', label: 'Fa#',  after: 3 },
  { name: 'G#', label: 'Sol#', after: 4 },
  { name: 'A#', label: 'La#',  after: 5 },
];
function pianoNoteToMidi(name, octave) {
  return (octave + 1) * 12 + PIANO_NOTE_INDEX[name];
}

function VirtualPiano() {
  const [octave, setOctave] = useState(4);
  const [activeKey, setActiveKey] = useState(null);
  const ctxRef = useRef(null);

  useEffect(() => () => { if (ctxRef.current) { try { ctxRef.current.close(); } catch {} } }, []);

  const playNote = (midi, key) => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.setValueAtTime(0.25, t0 + 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + 0.9);
    osc.start(t0); osc.stop(t0 + 0.95);
    setActiveKey(key);
    setTimeout(() => setActiveKey(k => (k === key ? null : k)), 220);
  };

  const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(n => ({
    name: n, label: PIANO_LABELS[n], midi: pianoNoteToMidi(n, octave), key: `${n}${octave}`,
  }));
  const blackNotes = PIANO_BLACK_DEFS.map(b => ({
    ...b, midi: pianoNoteToMidi(b.name, octave), key: `${b.name}${octave}`,
  }));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Tocá las teclas para encontrar la nota de arranque de una canción o practicar intervalos de oído.</p>

      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setOctave(o => Math.max(2, o - 1))}
          className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg transition">−</button>
        <span className="text-sm font-bold text-gray-700 w-24 text-center">Octava {octave}</span>
        <button onClick={() => setOctave(o => Math.min(6, o + 1))}
          className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-lg transition">+</button>
      </div>

      <div className="relative h-44 select-none">
        <div className="absolute inset-0 flex">
          {whiteNotes.map(n => (
            <button key={n.key} onClick={() => playNote(n.midi, n.key)}
              className={`flex-1 border border-gray-300 rounded-b-lg flex items-end justify-center pb-2 transition-colors
                ${activeKey === n.key ? 'bg-rose-200' : 'bg-white hover:bg-rose-50'}`}>
              <span className="text-[11px] font-bold text-gray-500">{n.label}</span>
            </button>
          ))}
        </div>
        <div className="absolute inset-0 flex pointer-events-none">
          {whiteNotes.map((_, i) => {
            const black = blackNotes.find(b => b.after === i);
            return (
              <div key={i} className="flex-1 relative">
                {black && (
                  <button onClick={() => playNote(black.midi, black.key)}
                    className={`pointer-events-auto absolute top-0 right-0 translate-x-1/2 w-2/3 h-28 rounded-b-md z-10 flex items-end justify-center pb-1.5 transition-colors
                      ${activeKey === black.key ? 'bg-rose-700' : 'bg-gray-800 hover:bg-gray-700'}`}>
                    <span className="text-[9px] font-bold text-gray-200">{black.label}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center">Sonido generado en el momento — no necesita conexión a internet.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DETECTOR DE RANGO VOCAL
// ─────────────────────────────────────────────────────────────────────────────
const VOICE_TYPES = [
  { name: 'Soprano',      min: 60, max: 84,  color: 'text-pink-600' },
  { name: 'Mezzo-Soprano',min: 57, max: 81,  color: 'text-rose-600' },
  { name: 'Contralto',    min: 53, max: 77,  color: 'text-orange-600' },
  { name: 'Tenor',        min: 48, max: 72,  color: 'text-blue-600' },
  { name: 'Barítono',     min: 45, max: 69,  color: 'text-indigo-600' },
  { name: 'Bajo',         min: 40, max: 64,  color: 'text-purple-600' },
];

function guessVoiceType(lowestNum, highestNum) {
  if (!lowestNum || !highestNum) return null;
  let best = null, bestScore = Infinity;
  for (const vt of VOICE_TYPES) {
    const score = Math.abs(vt.min - lowestNum) + Math.abs(vt.max - highestNum);
    if (score < bestScore) { bestScore = score; best = vt; }
  }
  return best;
}

function VocalRangeDetector({ db, appId, student }) {
  const [phase,    setPhase]    = useState('idle'); // idle | scanning-low | scanning-high | done
  const [lowNote,  setLowNote]  = useState(null);
  const [highNote, setHighNote] = useState(null);
  const [detected, setDetected] = useState(null); // noteInfo
  const [saving,   setSaving]   = useState(false);
  const rafRef  = useRef(null);
  const ctxRef  = useRef(null);
  const bufRef  = useRef(null);
  const analyRef = useRef(null);
  const streamRef = useRef(null);
  const scanRef  = useRef([]); // collected frequencies

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    ctxRef.current = null; analyRef.current = null; bufRef.current = null;
  };

  const startScan = async (type) => {
    stopMic();
    scanRef.current = [];
    setDetected(null);
    setPhase(type === 'low' ? 'scanning-low' : 'scanning-high');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyRef.current = analyser;
      bufRef.current = new Float32Array(2048);

      const tick = () => {
        analyRef.current.getFloatTimeDomainData(bufRef.current);
        const f = detectPitch(bufRef.current, ctx.sampleRate);
        if (f) {
          const info = freqToNoteInfo(f);
          if (info) { scanRef.current.push(info.noteNum); setDetected(info); }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Auto-stop after 4 seconds
      setTimeout(() => {
        stopMic();
        const nums = scanRef.current;
        if (!nums.length) { setPhase('idle'); return; }
        const result = type === 'low'
          ? Math.min(...nums)
          : Math.max(...nums);
        const info = freqToNoteInfo(440 * Math.pow(2, (result - 69) / 12));
        if (type === 'low')  setLowNote(info);
        else                  setHighNote(info);
        setPhase(type === 'low' ? 'idle' : 'done');
      }, 4000);
    } catch { setPhase('idle'); alert('No se pudo acceder al micrófono.'); }
  };

  useEffect(() => () => stopMic(), []);

  const saveRange = async () => {
    if (!lowNote || !highNote || !db || !appId || !student?.id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, `artifacts/${appId}/students/${student.id}`), {
        vocalRange: { lowestNoteNum: lowNote.noteNum, lowestNote: lowNote.name + lowNote.octave, highestNoteNum: highNote.noteNum, highestNote: highNote.name + highNote.octave, updatedAt: new Date().toISOString() }
      });
      alert('Rango guardado correctamente.');
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const voiceType = guessVoiceType(lowNote?.noteNum, highNote?.noteNum);
  const isScanning = phase === 'scanning-low' || phase === 'scanning-high';

  const NoteTag = ({ info, label }) => (
    <div className="text-center">
      <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">{label}</div>
      {info ? (
        <div className="text-2xl font-black text-rose-600">{NOTE_ES[info.name]}{info.octave}</div>
      ) : (
        <div className="text-xl text-gray-300 font-bold">—</div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Cantá tu nota más grave y más aguda sostenidas. El sistema detecta automáticamente.</p>

      {/* Display */}
      <div className="flex justify-around items-center bg-gray-50 rounded-xl py-4 px-2">
        <NoteTag info={lowNote} label="Más grave" />
        <div className="text-gray-300 text-2xl">→</div>
        <NoteTag info={highNote} label="Más aguda" />
      </div>

      {/* Detección en curso */}
      {isScanning && (
        <div className="text-center space-y-2">
          <div className="flex justify-center gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>
            ))}
          </div>
          <p className="text-sm font-bold text-rose-600">
            {phase === 'scanning-low' ? '🎵 Cantá tu nota MÁS GRAVE...' : '🎵 Cantá tu nota MÁS AGUDA...'}
          </p>
          {detected && (
            <p className="text-lg font-black text-gray-700">{NOTE_ES[detected.name]}{detected.octave} · {detected.freq} Hz</p>
          )}
          <p className="text-xs text-gray-400">Se detiene en 4 segundos automáticamente</p>
        </div>
      )}

      {/* Botones */}
      {!isScanning && (
        <div className="flex gap-2">
          <button onClick={() => startScan('low')}
            className="flex-1 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition border border-indigo-200">
            ↓ Detectar nota grave
          </button>
          <button onClick={() => startScan('high')}
            className="flex-1 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs transition border border-orange-200">
            ↑ Detectar nota aguda
          </button>
        </div>
      )}

      {/* Resultado */}
      {voiceType && lowNote && highNote && (
        <div className="text-center bg-rose-50 rounded-xl py-3 border border-rose-100">
          <p className="text-xs text-gray-500 mb-1">Tipo de voz probable</p>
          <p className={`text-xl font-black ${voiceType.color}`}>{voiceType.name}</p>
          <button onClick={saveRange} disabled={saving}
            className="mt-2 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition disabled:opacity-50">
            {saving ? 'Guardando...' : '💾 Guardar mi rango'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALIZADOR DE VIBRATO
// ─────────────────────────────────────────────────────────────────────────────
function VibratoAnalyzer() {
  const [active,     setActive]     = useState(false);
  const [error,      setError]      = useState('');
  const [rate,       setRate]       = useState(null);   // ciclos por segundo (Hz)
  const [extent,     setExtent]     = useState(null);   // amplitud pico-a-pico, en cents
  const [wave,       setWave]       = useState([]);     // últimas oscilaciones, para graficar
  const rafRef      = useRef(null);
  const analyserRef = useRef(null);
  const streamRef   = useRef(null);
  const ctxRef      = useRef(null);
  const bufRef      = useRef(null);
  const historyRef  = useRef([]);
  const lastSampleRef = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (ctxRef.current) { try { ctxRef.current.close(); } catch {} }
    ctxRef.current = null; analyserRef.current = null;
    historyRef.current = [];
    setActive(false); setRate(null); setExtent(null); setWave([]);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(2048);
      historyRef.current = [];
      lastSampleRef.current = 0;
      setActive(true);

      const tick = () => {
        if (!analyserRef.current) return;
        const now = performance.now();
        analyserRef.current.getFloatTimeDomainData(bufRef.current);
        const freq = detectPitch(bufRef.current, ctx.sampleRate);
        if (freq && now - lastSampleRef.current > 30) {
          lastSampleRef.current = now;
          const semis = 12 * Math.log2(freq / 440) + 69;
          const hist = historyRef.current;
          hist.push({ t: now, semis });
          const cutoff = now - 3000;
          while (hist.length && hist[0].t < cutoff) hist.shift();

          if (hist.length >= 10) {
            const semisArr = hist.map(h => h.semis);
            const mean = semisArr.reduce((a, b) => a + b, 0) / semisArr.length;
            const deltas = semisArr.map(s => s - mean);
            let crossings = 0;
            for (let i = 1; i < deltas.length; i++) {
              if ((deltas[i - 1] < 0 && deltas[i] >= 0) || (deltas[i - 1] > 0 && deltas[i] <= 0)) crossings++;
            }
            const durationSec = (hist[hist.length - 1].t - hist[0].t) / 1000;
            const estRate = durationSec > 0 ? (crossings / 2) / durationSec : 0;
            const ampCents = (Math.max(...deltas) - Math.min(...deltas)) * 100;
            setRate(estRate);
            setExtent(ampCents);
            setWave(deltas.slice(-50));
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { setError('No se pudo acceder al micrófono.'); }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const classification = (() => {
    if (rate == null || extent == null) return null;
    if (extent < 25) return { label: 'Voz recta — vibrato muy sutil o ausente', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' };
    if (rate < 4) return { label: 'Oscilación lenta / irregular', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    if (rate <= 7) return { label: 'Vibrato regular 🎶', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    return { label: 'Vibrato rápido / nervioso', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' };
  })();

  const sparkPath = (() => {
    if (wave.length < 2) return '';
    const w = 280, h = 56;
    const max = Math.max(0.3, ...wave.map(Math.abs));
    return wave.map((v, i) => {
      const x = (i / (wave.length - 1)) * w;
      const y = h / 2 - (v / max) * (h / 2 - 6);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Sostené una nota cantando "aaa" sin cortar el aire. Medimos qué tan rápido y cuánto oscila tu vibrato.</p>

      {active && (
        <div className="bg-gray-50 rounded-xl p-3">
          <svg viewBox="0 0 280 56" className="w-full h-14">
            <line x1="0" y1="28" x2="280" y2="28" stroke="#e5e7eb" strokeWidth="1" />
            {sparkPath && <path d={sparkPath} fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </div>
      )}

      {(rate != null && extent != null) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-rose-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-rose-700">{rate.toFixed(1)} Hz</p>
            <p className="text-[10px] text-rose-500 font-semibold uppercase">Velocidad</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-amber-700">{Math.round(extent)}¢</p>
            <p className="text-[10px] text-amber-500 font-semibold uppercase">Amplitud</p>
          </div>
        </div>
      )}

      {classification && (
        <div className={`text-center rounded-xl p-3 border ${classification.bg} ${classification.border}`}>
          <p className={`font-black text-sm ${classification.color}`}>{classification.label}</p>
        </div>
      )}

      {error && <p className="text-xs text-rose-600 text-center">{error}</p>}

      <button onClick={active ? stop : start}
        className={`w-full py-3 rounded-xl font-bold text-sm transition text-white
          ${active ? 'bg-red-500 hover:bg-red-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
        {active ? '⏹ Detener' : '▶ Empezar a analizar'}
      </button>

      <p className="text-[11px] text-gray-400 text-center">El vibrato natural suele oscilar entre 4 y 7 veces por segundo. Es una estimación orientativa, no una medición clínica.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GRABADOR CON REPRODUCCIÓN
// ─────────────────────────────────────────────────────────────────────────────
function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=aac',
    'audio/mp4',
    'audio/mpeg',
    '',
  ];
  return types.find(t => t === '' || MediaRecorder.isTypeSupported(t)) ?? null;
}

function VoiceRecorder({ db, appId, student }) {
  const [isRec,      setIsRec]      = useState(false);
  const [recTime,    setRecTime]    = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [sending,    setSending]    = useState(null);
  const [recError,   setRecError]   = useState('');
  const mrRef    = useRef(null);
  const chunksRef = useRef([]);
  const timerRef  = useRef(null);

  const startRec = async () => {
    setRecError('');
    if (typeof MediaRecorder === 'undefined') {
      setRecError('Tu navegador no soporta grabación. Intentá desde Safari (iOS 14.3+) o Chrome.');
      return;
    }
    const mimeType = getSupportedMimeType();
    if (mimeType === null) {
      setRecError('No se encontró un formato de audio compatible con este dispositivo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const opts = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, opts);
      mrRef.current = mr; chunksRef.current = [];
      let t = 0;
      timerRef.current = setInterval(() => { t++; setRecTime(t); if (t >= 60) stopRec(); }, 1000);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(tr => tr.stop());
        clearInterval(timerRef.current);
        const finalMime = mimeType || 'audio/mpeg';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url  = URL.createObjectURL(blob);
        setRecordings(prev => [{ url, blob, duration: t, ts: new Date() }, ...prev].slice(0, 3));
        setRecTime(0);
      };
      mr.start(100);
      setIsRec(true);
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setRecError('Permiso de micrófono denegado. Andá a Configuración → Safari/Chrome → Micrófono → Permitir.');
      } else if (e.name === 'NotFoundError') {
        setRecError('No se encontró micrófono en este dispositivo.');
      } else {
        setRecError(`Error al iniciar: ${e.message}`);
      }
    }
  };

  const stopRec = () => { mrRef.current?.stop(); setIsRec(false); };

  const sendToSandra = async (rec, idx) => {
    if (!db || !appId || !student?.id) return;
    setSending(idx);
    try {
      const filename = `voz_${student.id}_${Date.now()}.webm`;
      const storePath = `artifacts/${appId}/studentVoice/${student.id}/${filename}`;
      const storageRef = stRef(storage, storePath);
      await new Promise((res, rej) => {
        const task = uploadBytesResumable(storageRef, rec.blob);
        task.on('state_changed', null, rej, res);
      });
      const url = await getDownloadURL(storageRef);
      await addDoc(fsCollection(db, `artifacts/${appId}/students/${student.id}/voiceNotes`), {
        url, filename, storagePath: storePath,
        durationSecs: rec.duration,
        createdAt: serverTimestamp(),
        studentId: student.id,
        status: 'pending_review',
      });
      alert('Grabación enviada a Sandra. ¡Ella la escuchará pronto!');
    } catch (e) { alert('Error al enviar: ' + e.message); }
    finally { setSending(null); }
  };

  const fmt = (secs) => `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Grabá hasta 60 segundos. Escuchate y opcionalmente enviá la grabación a Sandra.</p>

      {/* Rec button */}
      <div className="flex flex-col items-center gap-2">
        {isRec && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"/>
            <span className="text-red-600 font-black tabular-nums">{fmt(recTime)}</span>
            <span className="text-xs text-gray-400">/ 1:00</span>
          </div>
        )}
        <button onClick={isRec ? stopRec : startRec}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition font-bold
            ${isRec ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}>
          {isRec ? '⏹' : '🎙️'}
        </button>
        <p className="text-xs text-gray-400">{isRec ? 'Tocá para detener' : 'Tocá para grabar'}</p>
      </div>

      {recError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 text-center">
          {recError}
        </div>
      )}

      {/* List */}
      {recordings.length > 0 && (
        <div className="space-y-2">
          {recordings.map((r, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 border border-gray-200">
              <audio src={r.url} controls className="flex-1 h-8" style={{ minWidth: 0 }}/>
              <span className="text-[10px] text-gray-400 flex-shrink-0">{fmt(r.duration)}</span>
              <button onClick={() => sendToSandra(r, i)} disabled={sending === i}
                className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-[11px] font-bold transition disabled:opacity-50">
                {sending === i ? '...' : '📨'}
              </button>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 text-center">📨 = Enviar a Sandra</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARADOR ANTES/DESPUÉS — graba, guarda y compará dos muestras de tu voz
// (las grabaciones se guardan en IndexedDB, en el propio dispositivo)
// ─────────────────────────────────────────────────────────────────────────────
const COMPARATOR_DB_NAME = 'palosVoiceComparator';
const COMPARATOR_STORE = 'recordings';

function openComparatorDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible')); return; }
    const req = indexedDB.open(COMPARATOR_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(COMPARATOR_STORE)) idb.createObjectStore(COMPARATOR_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function comparatorGetAll() {
  const idb = await openComparatorDB();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(COMPARATOR_STORE, 'readonly').objectStore(COMPARATOR_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function comparatorPut(record) {
  const idb = await openComparatorDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(COMPARATOR_STORE, 'readwrite');
    tx.objectStore(COMPARATOR_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function comparatorDelete(id) {
  const idb = await openComparatorDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(COMPARATOR_STORE, 'readwrite');
    tx.objectStore(COMPARATOR_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function BeforeAfterComparator() {
  const [recordings,  setRecordings]  = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [isRec,       setIsRec]       = useState(false);
  const [recTime,     setRecTime]     = useState(0);
  const [recError,    setRecError]    = useState('');
  const [pendingRec,  setPendingRec]  = useState(null);
  const [pendingName, setPendingName] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [selectedA,   setSelectedA]   = useState('');
  const [selectedB,   setSelectedB]   = useState('');
  const [comparing,   setComparing]   = useState(null);
  const mrRef     = useRef(null);
  const chunksRef = useRef([]);
  const timerRef  = useRef(null);
  const urlsRef   = useRef([]);
  const audioARef = useRef(null);
  const audioBRef = useRef(null);

  const fmt = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const loadRecordings = useCallback(async () => {
    setLoadingList(true);
    try {
      const all = await comparatorGetAll();
      const sorted = all
        .map(r => { const url = URL.createObjectURL(r.blob); urlsRef.current.push(url); return { ...r, url }; })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setRecordings(sorted);
      setSelectedA(prev => (prev && sorted.some(r => r.id === prev)) ? prev : (sorted[0]?.id || ''));
      setSelectedB(prev => (prev && sorted.some(r => r.id === prev)) ? prev : (sorted[1]?.id || ''));
    } catch (e) {
      setRecError('No se pudieron cargar las grabaciones guardadas en este dispositivo.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);
  useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);
  useEffect(() => () => { if (pendingRec?.url) URL.revokeObjectURL(pendingRec.url); }, [pendingRec]);

  const recA = recordings.find(r => r.id === selectedA) || null;
  const recB = recordings.find(r => r.id === selectedB) || null;

  const stopPlayback = useCallback(() => {
    if (audioARef.current) { audioARef.current.pause(); audioARef.current.currentTime = 0; }
    if (audioBRef.current) { audioBRef.current.pause(); audioBRef.current.currentTime = 0; }
    setComparing(null);
  }, []);

  useEffect(() => { stopPlayback(); }, [selectedA, selectedB, stopPlayback]);

  useEffect(() => {
    const aEl = audioARef.current;
    if (!aEl) return;
    const onEnded = () => {
      if (comparing === 'alt' && audioBRef.current) {
        audioBRef.current.currentTime = 0;
        audioBRef.current.play().catch(() => {});
      }
    };
    aEl.addEventListener('ended', onEnded);
    return () => aEl.removeEventListener('ended', onEnded);
  }, [comparing]);

  useEffect(() => {
    const bEl = audioBRef.current;
    if (!bEl) return;
    const onEnded = () => { if (comparing) setComparing(null); };
    bEl.addEventListener('ended', onEnded);
    return () => bEl.removeEventListener('ended', onEnded);
  }, [comparing]);

  const playSimultaneous = () => {
    if (!recA || !recB || !audioARef.current || !audioBRef.current) return;
    stopPlayback();
    setComparing('sim');
    audioARef.current.currentTime = 0; audioBRef.current.currentTime = 0;
    audioARef.current.play().catch(() => {});
    audioBRef.current.play().catch(() => {});
  };

  const playAlternate = () => {
    if (!recA || !recB || !audioARef.current) return;
    stopPlayback();
    setComparing('alt');
    audioARef.current.currentTime = 0;
    audioARef.current.play().catch(() => {});
  };

  const startRec = async () => {
    setRecError('');
    if (typeof MediaRecorder === 'undefined') {
      setRecError('Tu navegador no soporta grabación. Probá desde Safari (iOS 14.3+) o Chrome.');
      return;
    }
    const mimeType = getSupportedMimeType();
    if (mimeType === null) {
      setRecError('No se encontró un formato de audio compatible con este dispositivo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const opts = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, opts);
      mrRef.current = mr; chunksRef.current = [];
      let t = 0;
      timerRef.current = setInterval(() => { t++; setRecTime(t); if (t >= 120) stopRec(); }, 1000);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(tr => tr.stop());
        clearInterval(timerRef.current);
        const finalMime = mimeType || 'audio/mpeg';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        setPendingRec({ blob, url, mimeType: finalMime, duration: t });
        setPendingName(`Muestra ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`);
        setRecTime(0);
      };
      mr.start(100);
      setIsRec(true);
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setRecError('Permiso de micrófono denegado. Activalo en la configuración del navegador.');
      } else if (e.name === 'NotFoundError') {
        setRecError('No se encontró micrófono en este dispositivo.');
      } else {
        setRecError(`Error al iniciar: ${e.message}`);
      }
    }
  };

  const stopRec = () => { mrRef.current?.stop(); setIsRec(false); };

  const discardPending = () => { setPendingRec(null); setPendingName(''); };

  const saveRecording = async () => {
    if (!pendingRec) return;
    const name = pendingName.trim() || `Muestra ${new Date().toLocaleDateString('es-AR')}`;
    setSaving(true);
    try {
      await comparatorPut({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        blob: pendingRec.blob,
        mimeType: pendingRec.mimeType,
        duration: pendingRec.duration,
        createdAt: new Date().toISOString(),
      });
      setPendingRec(null); setPendingName('');
      await loadRecordings();
    } catch (e) {
      setRecError('No se pudo guardar la grabación: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta grabación? No se puede deshacer.')) return;
    try {
      stopPlayback();
      await comparatorDelete(id);
      await loadRecordings();
    } catch (e) {
      setRecError('No se pudo eliminar la grabación.');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">
        Grabá una muestra de tu voz, guardala con un nombre y compará tu evolución escuchando dos grabaciones lado a lado.
      </p>

      <div className="flex flex-col items-center gap-2">
        {isRec && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"/>
            <span className="text-red-600 font-black tabular-nums">{fmt(recTime)}</span>
            <span className="text-xs text-gray-400">/ 2:00</span>
          </div>
        )}
        <button onClick={isRec ? stopRec : startRec}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition font-bold
            ${isRec ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}>
          {isRec ? '⏹' : '🎙️'}
        </button>
        <p className="text-xs text-gray-400">{isRec ? 'Tocá para detener' : 'Tocá para grabar una nueva muestra'}</p>
      </div>

      {recError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 text-center">{recError}</div>
      )}

      {pendingRec && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-2">
          <p className="text-xs font-bold text-rose-700">Ponele un nombre para guardarla (ej: "Escala en Do", "Canción X"):</p>
          <audio src={pendingRec.url} controls className="w-full h-8" />
          <input type="text" value={pendingName} onChange={e => setPendingName(e.target.value)}
            placeholder="Nombre de la grabación"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" />
          <div className="flex justify-end gap-2">
            <button onClick={discardPending} className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition">Descartar</button>
            <button onClick={saveRecording} disabled={saving} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar grabación'}
            </button>
          </div>
        </div>
      )}

      {recordings.length >= 2 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center">Comparar dos grabaciones</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Grabación A</label>
              <select value={selectedA} onChange={e => setSelectedA(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none">
                {recordings.map(r => <option key={r.id} value={r.id}>{r.name} · {fmtDate(r.createdAt)}</option>)}
              </select>
              {recA && <audio ref={audioARef} src={recA.url} controls className="w-full h-8" />}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Grabación B</label>
              <select value={selectedB} onChange={e => setSelectedB(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none">
                {recordings.map(r => <option key={r.id} value={r.id}>{r.name} · {fmtDate(r.createdAt)}</option>)}
              </select>
              {recB && <audio ref={audioBRef} src={recB.url} controls className="w-full h-8" />}
            </div>
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
            <button onClick={playSimultaneous} disabled={!recA || !recB}
              className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold transition disabled:opacity-50">▶️ Reproducir juntas</button>
            <button onClick={playAlternate} disabled={!recA || !recB}
              className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold transition disabled:opacity-50">🔁 Alternar A → B</button>
            {comparing && (
              <button onClick={stopPlayback} className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition">⏹ Detener</button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Grabaciones guardadas{recordings.length > 0 ? ` (${recordings.length})` : ''}
        </p>
        {loadingList ? (
          <p className="text-xs text-gray-400 text-center py-2">Cargando...</p>
        ) : recordings.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">Todavía no guardaste ninguna grabación. Grabá una muestra y ponele un nombre para empezar a comparar tu evolución.</p>
        ) : (
          recordings.map(r => (
            <div key={r.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{r.name}</p>
                  <p className="text-[10px] text-gray-400">{fmtDate(r.createdAt)} · {fmt(r.duration)}</p>
                </div>
                <button onClick={() => handleDelete(r.id)} className="flex-shrink-0 px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-red-500 hover:bg-red-50 transition text-xs font-bold" title="Eliminar grabación">🗑</button>
              </div>
              <audio src={r.url} controls className="w-full h-8" />
            </div>
          ))
        )}
        <p className="text-[10px] text-gray-400 text-center">Las grabaciones se guardan solo en este dispositivo/navegador.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONTADOR DE PRÁCTICA
// ─────────────────────────────────────────────────────────────────────────────
function PracticeTimer({ db, appId, student }) {
  const [running,  setRunning]  = useState(false);
  const [elapsed,  setElapsed]  = useState(0);
  const [weekMins, setWeekMins] = useState(null);
  const startRef = useRef(null);
  const rafRef   = useRef(null);

  // Load week total
  useEffect(() => {
    if (!db || !appId || !student?.id) return;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    getDocs(query(
      fsCollection(db, `artifacts/${appId}/students/${student.id}/practiceSessions`),
      where('createdAt', '>=', weekAgo),
      orderBy('createdAt', 'desc'), limit(100)
    )).then(snap => {
      const total = snap.docs.reduce((a, d) => a + (d.data().durationSecs || 0), 0);
      setWeekMins(Math.round(total / 60));
    }).catch(() => setWeekMins(0));
  }, [db, appId, student?.id]);

  const start = () => {
    startRef.current = Date.now() - elapsed * 1000;
    setRunning(true);
    const tick = () => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const pause = () => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
  };

  const save = async () => {
    pause();
    if (elapsed < 10 || !db || !appId || !student?.id) { setElapsed(0); return; }
    try {
      await addDoc(fsCollection(db, `artifacts/${appId}/students/${student.id}/practiceSessions`), {
        durationSecs: elapsed,
        createdAt: serverTimestamp(),
        studentId: student.id,
        date: new Date().toISOString().split('T')[0],
      });
      setWeekMins(prev => (prev ?? 0) + Math.round(elapsed / 60));
      setElapsed(0);
      alert(`¡Práctica guardada! ${Math.floor(elapsed/60)}m ${elapsed%60}s esta sesión.`);
    } catch (e) { alert('Error: ' + e.message); }
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const fmtTime = (s) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return (
    <div className="space-y-4">
      {/* Weekly summary */}
      {weekMins !== null && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
          <div className="text-2xl font-black text-green-700">{weekMins} min</div>
          <div className="text-[11px] text-green-600 font-semibold">practicados esta semana</div>
        </div>
      )}

      {/* Timer display */}
      <div className="text-center">
        <div className="text-5xl font-black text-gray-800 tabular-nums">{fmtTime(elapsed)}</div>
        {elapsed > 0 && !running && <p className="text-xs text-gray-400 mt-1">Pausado — guardá o continuá</p>}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        {!running ? (
          <button onClick={start}
            className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition">
            {elapsed > 0 ? '▶ Continuar' : '▶ Empezar a practicar'}
          </button>
        ) : (
          <button onClick={pause}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition">
            ⏸ Pausar
          </button>
        )}
        {elapsed >= 10 && !running && (
          <button onClick={save}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition">
            💾 Guardar sesión
          </button>
        )}
        {elapsed > 0 && !running && (
          <button onClick={() => setElapsed(0)}
            className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold text-sm transition">
            ✕
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-400 text-center">Tu profe puede ver tu tiempo de práctica semanal</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RESPIRACIÓN GUIADA
// ─────────────────────────────────────────────────────────────────────────────
const BREATH_PHASES = [
  { id: 'inhale', label: 'Inhalá',  secs: 4, color: '#3b82f6', textColor: 'text-blue-600',   hint: 'Llenate de aire' },
  { id: 'hold',   label: 'Sostené', secs: 4, color: '#8b5cf6', textColor: 'text-violet-600', hint: 'Mantené el aire' },
  { id: 'exhale', label: 'Exhalá',  secs: 6, color: '#10b981', textColor: 'text-emerald-600',hint: 'Soltá lentamente' },
];

function BreathingGuide() {
  const [running,    setRunning]    = useState(false);
  const [phaseIdx,   setPhaseIdx]   = useState(0);
  const [count,      setCount]      = useState(0);
  const [cycles,     setCycles]     = useState(0);
  const timerRef = useRef(null);

  const phase = BREATH_PHASES[phaseIdx];
  const progress = phase ? count / phase.secs : 0;

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    setRunning(false); setPhaseIdx(0); setCount(0);
  }, []);

  const start = useCallback(() => {
    setRunning(true); setPhaseIdx(0); setCount(0); setCycles(0);
    let pi = 0, c = 0;
    timerRef.current = setInterval(() => {
      c++;
      setCount(c);
      if (c >= BREATH_PHASES[pi].secs) {
        c = 0;
        pi = (pi + 1) % BREATH_PHASES.length;
        setPhaseIdx(pi);
        setCount(0);
        if (pi === 0) setCycles(prev => prev + 1);
      }
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const circumference = 2 * Math.PI * 48;
  const dashOffset    = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Círculo animado */}
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
          <circle cx="72" cy="72" r="48" fill="none" stroke="#f3f4f6" strokeWidth="8"/>
          <circle cx="72" cy="72" r="48" fill="none"
            stroke={running ? phase.color : '#e5e7eb'} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={running ? dashOffset : circumference}
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}/>
        </svg>
        <div className="text-center z-10">
          {running ? (
            <>
              <p className={`text-lg font-black ${phase.textColor}`}>{phase.label}</p>
              <p className="text-3xl font-black text-gray-800 tabular-nums">{phase.secs - count}</p>
              <p className="text-[10px] text-gray-400">{phase.hint}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-gray-400">Listo</p>
          )}
        </div>
      </div>

      {running && cycles > 0 && (
        <p className="text-xs text-gray-400">{cycles} ciclo{cycles !== 1 ? 's' : ''} completado{cycles !== 1 ? 's' : ''}</p>
      )}

      <div className="flex gap-2 w-full">
        {BREATH_PHASES.map(p => (
          <div key={p.id} className="flex-1 text-center">
            <div className="text-[10px] font-bold text-gray-400">{p.label}</div>
            <div className="text-[11px] text-gray-600 font-semibold">{p.secs}s</div>
          </div>
        ))}
      </div>

      <button onClick={running ? stop : start}
        className={`w-full py-3 rounded-xl font-bold text-sm transition text-white
          ${running ? 'bg-gray-500 hover:bg-gray-600' : 'bg-blue-500 hover:bg-blue-600'}`}>
        {running ? '⏹ Detener' : '▶ Iniciar ejercicio'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EJERCICIOS DE CALENTAMIENTO
// ─────────────────────────────────────────────────────────────────────────────
const WARMUP_EXERCISES = [
  { id: 'scale5',     name: 'Escala de 5 notas (ida y vuelta)', desc: 'Do-Re-Mi-Fa-Sol-Fa-Mi-Re-Do — ideal para arrancar y entrar en calor.', pattern: [0, 2, 4, 5, 7, 5, 4, 2, 0] },
  { id: 'arpeggio',   name: 'Arpegio mayor',                    desc: 'Do-Mi-Sol-Do — trabaja saltos limpios y resonancia.',                   pattern: [0, 4, 7, 12, 7, 4, 0] },
  { id: 'descending', name: 'Vocalizo descendente',             desc: 'Sol-Fa-Mi-Re-Do — relaja la laringe y suaviza el agudo.',                pattern: [7, 5, 4, 2, 0] },
  { id: 'siren',      name: 'Sirena (glissando)',               desc: 'Deslizá la voz de grave a agudo y de vuelta, sin "escalones" entre notas.', pattern: 'siren' },
];
const WARMUP_ROOTS = [
  { label: 'Do3', midi: 48 }, { label: 'Re3', midi: 50 }, { label: 'Mi3', midi: 52 }, { label: 'Fa3', midi: 53 },
  { label: 'Sol3', midi: 55 }, { label: 'Do4', midi: 60 }, { label: 'Re4', midi: 62 }, { label: 'Mi4', midi: 64 },
];
const WARMUP_SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
function warmupDegreeLabel(semi) {
  const idx = ((semi % 12) + 12) % 12;
  const oct = Math.floor(semi / 12);
  return WARMUP_SOLFEGE[idx] + (oct > 0 ? '′'.repeat(oct) : '');
}

function WarmupExercises() {
  const [exerciseId,  setExerciseId]  = useState(WARMUP_EXERCISES[0].id);
  const [rootMidi,    setRootMidi]    = useState(60);
  const [bpm,         setBpm]         = useState(80);
  const [playing,     setPlaying]     = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const ctxRef    = useRef(null);
  const timersRef = useRef([]);

  const exercise = WARMUP_EXERCISES.find(e => e.id === exerciseId);

  const stopExercise = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (ctxRef.current) { try { ctxRef.current.close(); } catch {} ctxRef.current = null; }
    setPlaying(false); setCurrentStep(-1);
  }, []);

  useEffect(() => () => stopExercise(), [stopExercise]);

  const playExercise = () => {
    if (playing) { stopExercise(); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const noteDur = 60 / bpm;
    setPlaying(true);
    setCurrentStep(0);

    if (exercise.pattern === 'siren') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const f0 = 440 * Math.pow(2, (rootMidi - 69) / 12);
      const f1 = 440 * Math.pow(2, (rootMidi + 12 - 69) / 12);
      const total = noteDur * 8;
      const now = ctx.currentTime + 0.05;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.15);
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.linearRampToValueAtTime(f1, now + total / 2);
      osc.frequency.linearRampToValueAtTime(f0, now + total);
      gain.gain.setValueAtTime(0.22, now + total - 0.2);
      gain.gain.linearRampToValueAtTime(0.0001, now + total);
      osc.start(now); osc.stop(now + total + 0.05);
      timersRef.current.push(setTimeout(() => { setPlaying(false); setCurrentStep(-1); }, (total + 0.2) * 1000));
    } else {
      const pattern = exercise.pattern;
      const startAt = ctx.currentTime + 0.1;
      pattern.forEach((semi, i) => {
        const t0 = startAt + i * noteDur;
        const freq = 440 * Math.pow(2, (rootMidi + semi - 69) / 12);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.04);
        gain.gain.setValueAtTime(0.22, t0 + noteDur - 0.08);
        gain.gain.linearRampToValueAtTime(0.0001, t0 + noteDur - 0.01);
        osc.start(t0); osc.stop(t0 + noteDur);
        const delayMs = Math.max(0, (t0 - ctx.currentTime) * 1000);
        timersRef.current.push(setTimeout(() => setCurrentStep(i), delayMs));
      });
      const totalMs = (startAt - ctx.currentTime + pattern.length * noteDur) * 1000 + 150;
      timersRef.current.push(setTimeout(() => { setPlaying(false); setCurrentStep(-1); }, totalMs));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Elegí un ejercicio, una nota de partida y un tempo cómodo. Escuchá la referencia y cantala junto con el sonido.</p>

      <div className="space-y-2">
        {WARMUP_EXERCISES.map(ex => (
          <button key={ex.id} onClick={() => { stopExercise(); setExerciseId(ex.id); }}
            className={`w-full text-left p-3 rounded-xl border transition ${exerciseId === ex.id ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <p className={`text-sm font-bold ${exerciseId === ex.id ? 'text-rose-700' : 'text-gray-800'}`}>{ex.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{ex.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Nota de partida</label>
          <select value={rootMidi} onChange={e => setRootMidi(Number(e.target.value))} disabled={playing}
            className="w-full mt-1 px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none disabled:opacity-50">
            {WARMUP_ROOTS.map(r => <option key={r.midi} value={r.midi}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase">Tempo: {bpm} BPM</label>
          <input type="range" min={50} max={120} value={bpm} onChange={e => setBpm(Number(e.target.value))} disabled={playing}
            className="w-full mt-2.5 accent-rose-500 disabled:opacity-50" />
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase text-center mb-2">Patrón</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {exercise.pattern !== 'siren' ? exercise.pattern.map((semi, i) => (
            <span key={i} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${currentStep === i ? 'bg-rose-600 text-white scale-110 shadow' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {warmupDegreeLabel(semi)}
            </span>
          )) : (
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${playing ? 'bg-rose-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {playing ? '🎵 Grave → agudo → grave...' : 'Glissando continuo'}
            </span>
          )}
        </div>
      </div>

      <button onClick={playExercise}
        className={`w-full py-3 rounded-xl font-bold text-sm transition text-white ${playing ? 'bg-red-500 hover:bg-red-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
        {playing ? '⏹ Detener' : '▶ Reproducir referencia'}
      </button>

      <p className="text-[11px] text-gray-400 text-center">Tip: empezá por una nota cómoda y, a medida que entres en calor, probá una más aguda.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. VU METER
// ─────────────────────────────────────────────────────────────────────────────
function VUMeter() {
  const [active, setActive]   = useState(false);
  const [level,  setLevel]    = useState(0);
  const [peak,   setPeak]     = useState(0);
  const [error,  setError]    = useState('');
  const rafRef      = useRef(null);
  const analyserRef = useRef(null);
  const streamRef   = useRef(null);
  const peakTimer   = useRef(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
    setActive(false); setLevel(0); setPeak(0);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let rms = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; rms += v * v; }
        const db = Math.min(100, Math.round(Math.sqrt(rms / buf.length) * 350));
        setLevel(db);
        setPeak(prev => {
          if (db > prev) { clearTimeout(peakTimer.current); peakTimer.current = setTimeout(() => setPeak(0), 1500); return db; }
          return prev;
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setActive(true);
    } catch { setError('No se pudo acceder al micrófono.'); }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const getColor = (v) => v > 70 ? '#ef4444' : v > 40 ? '#f59e0b' : '#22c55e';
  const label    = level > 70 ? 'Muy fuerte 🔴' : level > 40 ? 'Medio 🟡' : level > 5 ? 'Suave 🟢' : '—';

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Cantá para ver tu nivel de volumen en tiempo real</p>

      {/* Barra VU */}
      <div className="space-y-2">
        <div className="h-8 bg-gray-100 rounded-full overflow-hidden relative">
          <div className="h-full rounded-full transition-all duration-75"
            style={{ width: `${level}%`, backgroundColor: getColor(level) }}/>
          {peak > 0 && (
            <div className="absolute top-0 bottom-0 w-1 rounded-full bg-white/70"
              style={{ left: `${peak}%`, transition: 'left 0.1s' }}/>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-300 font-semibold px-1">
          <span>Suave</span><span>Medio</span><span>Fuerte</span>
        </div>
      </div>

      {/* Nivel */}
      <div className="text-center">
        <p className="text-2xl font-black" style={{ color: getColor(level) }}>{label}</p>
        {peak > 0 && <p className="text-[10px] text-gray-400">Pico: {peak}%</p>}
      </div>

      {error && <p className="text-xs text-rose-600 text-center">{error}</p>}

      <button onClick={active ? stop : start}
        className={`w-full py-3 rounded-xl font-bold text-sm transition text-white
          ${active ? 'bg-red-500 hover:bg-red-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
        {active ? '⏹ Detener' : '▶ Activar micrófono'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. PITCH MATCHING (juego de afinación)
// ─────────────────────────────────────────────────────────────────────────────
const PM_NOTES = [
  { name: 'Do', en: 'C',  midi: 60 }, { name: 'Re', en: 'D', midi: 62 },
  { name: 'Mi', en: 'E',  midi: 64 }, { name: 'Fa', en: 'F', midi: 65 },
  { name: 'Sol',en: 'G',  midi: 67 }, { name: 'La', en: 'A', midi: 69 },
  { name: 'Si', en: 'B',  midi: 71 },
];

function PitchMatching() {
  const [active,    setActive]    = useState(false);
  const [target,    setTarget]    = useState(null);
  const [detected,  setDetected]  = useState(null);
  const [hits,      setHits]      = useState(0);
  const [streak,    setStreak]    = useState(0);
  const [hitFrame,  setHitFrame]  = useState(false);
  const [error,     setError]     = useState('');
  const rafRef      = useRef(null);
  const analyserRef = useRef(null);
  const streamRef   = useRef(null);
  const hitLock     = useRef(false);

  const randomTarget = () => PM_NOTES[Math.floor(Math.random() * PM_NOTES.length)];

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
    setActive(false); setDetected(null); setTarget(null);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Float32Array(2048);
      const tgt = randomTarget();
      setTarget(tgt);
      setActive(true); setHits(0); setStreak(0);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, ctx.sampleRate);
        const info = freqToNoteInfo(freq);
        setDetected(info || null);
        // Check hit: mismo nombre de nota (cualquier octava), cents ±20
        if (info && !hitLock.current) {
          const match = info.name === tgt.en && Math.abs(info.cents) <= 20;
          if (match) {
            hitLock.current = true;
            setHitFrame(true);
            setHits(h => h + 1);
            setStreak(s => s + 1);
            setTimeout(() => {
              setHitFrame(false);
              const next = randomTarget();
              setTarget(next);
              // update tgt ref by re-capturing
              tgt.name = next.name; tgt.en = next.en; tgt.midi = next.midi;
              hitLock.current = false;
            }, 800);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { setError('No se pudo acceder al micrófono.'); }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const isHit = hitFrame;
  const detectedMatchesTarget = detected && target && detected.name === target.en;
  const cents = detected?.cents ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Cantá la nota que aparece. ¡A ver cuántas acertás!</p>

      {/* Target note — grande */}
      <div className={`rounded-2xl p-6 text-center transition-all ${isHit ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-50 border border-gray-200'}`}>
        {target ? (
          <>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cantá esta nota</p>
            <p className={`text-6xl font-black transition-colors ${isHit ? 'text-green-600' : 'text-gray-800'}`}>
              {target.name}
            </p>
            {isHit && <p className="text-green-600 font-bold mt-1 animate-bounce">¡Perfecto! ✓</p>}
          </>
        ) : (
          <p className="text-gray-400 text-sm">Presioná Iniciar</p>
        )}
      </div>

      {/* Tu nota detectada */}
      {active && (
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase">Tu nota</p>
            <p className={`text-2xl font-black ${detectedMatchesTarget ? 'text-green-600' : 'text-gray-600'}`}>
              {detected ? (NOTE_ES[detected.name] ?? detected.name) : '—'}
            </p>
          </div>
          {detected && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-bold uppercase">Afinación</p>
              <p className={`text-sm font-bold ${Math.abs(cents) <= 10 ? 'text-green-600' : Math.abs(cents) <= 25 ? 'text-amber-500' : 'text-red-500'}`}>
                {cents > 0 ? `+${cents}¢` : `${cents}¢`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Score */}
      {active && (
        <div className="flex gap-3">
          <div className="flex-1 bg-rose-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-rose-700">{hits}</p>
            <p className="text-[10px] text-rose-500 font-semibold">Aciertos</p>
          </div>
          <div className="flex-1 bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-amber-700">{streak}</p>
            <p className="text-[10px] text-amber-500 font-semibold">Racha</p>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-600 text-center">{error}</p>}

      <button onClick={active ? stop : start}
        className={`w-full py-3 rounded-xl font-bold text-sm transition text-white
          ${active ? 'bg-red-500 hover:bg-red-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
        {active ? '⏹ Detener' : '▶ Iniciar juego'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRENAMIENTO DE OÍDO
// ─────────────────────────────────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickOthers(list, exclude, n) {
  return shuffleArray(list.filter(x => x !== exclude)).slice(0, n);
}
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function playToneSequence(ctx, notes, dur) {
  notes.forEach(({ midi, at }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = midiToFreq(midi);
    const t0 = ctx.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.2, t0 + 0.04);
    gain.gain.setValueAtTime(0.2, t0 + dur - 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur - 0.01);
    osc.start(t0); osc.stop(t0 + dur);
  });
}

const EAR_MODES = [
  { id: 'intervals', label: 'Intervalos' },
  { id: 'chords',    label: 'Acordes' },
  { id: 'melodies',  label: 'Melodías' },
];
const EAR_INTERVALS = [
  { name: '2da menor', semis: 1 },  { name: '2da mayor', semis: 2 },
  { name: '3ra menor', semis: 3 },  { name: '3ra mayor', semis: 4 },
  { name: '4ta justa', semis: 5 },  { name: '5ta justa', semis: 7 },
  { name: '6ta mayor', semis: 9 },  { name: 'Octava',    semis: 12 },
];
const EAR_CHORDS = [
  { name: 'Mayor',      intervals: [0, 4, 7] },
  { name: 'Menor',      intervals: [0, 3, 7] },
  { name: 'Disminuido', intervals: [0, 3, 6] },
  { name: 'Aumentado',  intervals: [0, 4, 8] },
];
const EAR_MELODIES = [
  { name: 'Ascendente',              pattern: [0, 2, 4, 7] },
  { name: 'Descendente',             pattern: [7, 4, 2, 0] },
  { name: 'Ondulante (sube y baja)', pattern: [0, 4, 2, 7, 0] },
  { name: 'Arpegio',                 pattern: [0, 4, 7, 12] },
];

function buildEarQuestion(mode) {
  const root = 55 + Math.floor(Math.random() * 8); // entre Sol3 y Re4 aprox.
  if (mode === 'intervals') {
    const correct = EAR_INTERVALS[Math.floor(Math.random() * EAR_INTERVALS.length)];
    return {
      kind: 'intervals', answer: correct.name,
      options: shuffleArray([correct.name, ...pickOthers(EAR_INTERVALS, correct, 3).map(x => x.name)]),
      notes: [{ midi: root, at: 0 }, { midi: root + correct.semis, at: 0.7 }],
      dur: 0.6,
    };
  }
  if (mode === 'chords') {
    const correct = EAR_CHORDS[Math.floor(Math.random() * EAR_CHORDS.length)];
    return {
      kind: 'chords', answer: correct.name,
      options: shuffleArray([correct.name, ...pickOthers(EAR_CHORDS, correct, 3).map(x => x.name)]),
      notes: correct.intervals.map(iv => ({ midi: root + iv, at: 0 })),
      dur: 1.4,
    };
  }
  const correct = EAR_MELODIES[Math.floor(Math.random() * EAR_MELODIES.length)];
  return {
    kind: 'melodies', answer: correct.name,
    options: shuffleArray([correct.name, ...pickOthers(EAR_MELODIES, correct, 3).map(x => x.name)]),
    notes: correct.pattern.map((semi, i) => ({ midi: root + semi, at: i * 0.45 })),
    dur: 0.4,
  };
}

function EarTraining() {
  const [mode,     setMode]     = useState('intervals');
  const [question, setQuestion] = useState(() => buildEarQuestion('intervals'));
  const [selected, setSelected] = useState(null);
  const [hits,     setHits]     = useState(0);
  const [total,    setTotal]    = useState(0);
  const [streak,   setStreak]   = useState(0);
  const ctxRef = useRef(null);

  useEffect(() => () => { if (ctxRef.current) { try { ctxRef.current.close(); } catch {} } }, []);

  const switchMode = (m) => {
    setMode(m);
    setQuestion(buildEarQuestion(m));
    setSelected(null);
  };

  const playQuestion = () => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    playToneSequence(ctx, question.notes, question.dur);
  };

  const handleAnswer = (opt) => {
    if (selected) return;
    setSelected(opt);
    setTotal(t => t + 1);
    if (opt === question.answer) { setHits(h => h + 1); setStreak(s => s + 1); }
    else setStreak(0);
  };

  const next = () => { setQuestion(buildEarQuestion(mode)); setSelected(null); };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Escuchá con atención y elegí la opción correcta. Practicá tu oído musical de a poco.</p>

      <div className="flex gap-2">
        {EAR_MODES.map(m => (
          <button key={m.id} onClick={() => switchMode(m.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${mode === m.id ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50 rounded-lg p-2"><p className="text-lg font-black text-emerald-700">{hits}</p><p className="text-[9px] uppercase font-bold text-emerald-500">Aciertos</p></div>
        <div className="bg-gray-50 rounded-lg p-2"><p className="text-lg font-black text-gray-700">{total}</p><p className="text-[9px] uppercase font-bold text-gray-400">Total</p></div>
        <div className="bg-amber-50 rounded-lg p-2"><p className="text-lg font-black text-amber-700">{streak}🔥</p><p className="text-[9px] uppercase font-bold text-amber-500">Racha</p></div>
      </div>

      <button onClick={playQuestion} className="w-full py-3 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white transition">
        🔊 Reproducir
      </button>

      <div className="grid grid-cols-2 gap-2">
        {question.options.map(opt => {
          const isCorrect = opt === question.answer;
          const isSelected = opt === selected;
          let cls = 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50';
          if (selected) {
            if (isCorrect) cls = 'bg-emerald-50 border-emerald-300 text-emerald-700';
            else if (isSelected) cls = 'bg-rose-50 border-rose-300 text-rose-700';
          }
          return (
            <button key={opt} onClick={() => handleAnswer(opt)} disabled={!!selected}
              className={`p-2.5 rounded-xl border text-xs font-bold transition ${cls}`}>
              {opt}{selected && isCorrect ? ' ✓' : ''}{selected && isSelected && !isCorrect ? ' ✗' : ''}
            </button>
          );
        })}
      </div>

      {selected && (
        <button onClick={next} className="w-full py-2.5 rounded-xl font-bold text-sm bg-gray-800 hover:bg-gray-900 text-white transition">
          Siguiente →
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTOR DE NOTAS (SOLFEO)
// ─────────────────────────────────────────────────────────────────────────────
const STAFF_NOTES = [
  { name: 'Do',  en: 'C', midi: 60, pos: -2 }, { name: 'Re',  en: 'D', midi: 62, pos: -1 },
  { name: 'Mi',  en: 'E', midi: 64, pos: 0 },  { name: 'Fa',  en: 'F', midi: 65, pos: 1 },
  { name: 'Sol', en: 'G', midi: 67, pos: 2 },  { name: 'La',  en: 'A', midi: 69, pos: 3 },
  { name: 'Si',  en: 'B', midi: 71, pos: 4 },  { name: 'Do',  en: 'C', midi: 72, pos: 5 },
  { name: 'Re',  en: 'D', midi: 74, pos: 6 },  { name: 'Mi',  en: 'E', midi: 76, pos: 7 },
  { name: 'Fa',  en: 'F', midi: 77, pos: 8 },  { name: 'Sol', en: 'G', midi: 79, pos: 9 },
  { name: 'La',  en: 'A', midi: 81, pos: 10 },
];
const SOLFEGE_NAMES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

function randomStaffNote() {
  return STAFF_NOTES[Math.floor(Math.random() * STAFF_NOTES.length)];
}
function buildSolfegeOptions(correct) {
  return shuffleArray([correct.name, ...pickOthers(SOLFEGE_NAMES, correct.name, 3)]);
}

function StaffView({ note }) {
  const lineSpacing = 14;
  const staffTop = 22;
  const staffBottom = staffTop + lineSpacing * 4;
  const noteX = 130;
  const y = (pos) => staffBottom - pos * (lineSpacing / 2);
  const needsLedger = note && note.pos % 2 === 0 && (note.pos < 0 || note.pos > 8);

  return (
    <svg viewBox="0 0 200 110" className="w-full h-32">
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="20" y1={staffTop + i * lineSpacing} x2="180" y2={staffTop + i * lineSpacing} stroke="#9ca3af" strokeWidth="1.2" />
      ))}
      <text x="26" y={staffBottom - 4} fontSize="40" fill="#6b7280" fontFamily="serif">𝄞</text>
      {note && (
        <>
          {needsLedger && (
            <line x1={noteX - 11} y1={y(note.pos)} x2={noteX + 11} y2={y(note.pos)} stroke="#9ca3af" strokeWidth="1.2" />
          )}
          <ellipse cx={noteX} cy={y(note.pos)} rx="7.5" ry="6" fill="#e11d48" transform={`rotate(-18 ${noteX} ${y(note.pos)})`} />
        </>
      )}
    </svg>
  );
}

function SolfegeReader() {
  const [mode,     setMode]     = useState('identify'); // identify | sing
  const [note,     setNote]     = useState(randomStaffNote);
  const [options,  setOptions]  = useState(() => buildSolfegeOptions(note));
  const [selected, setSelected] = useState(null);
  const [hits,     setHits]     = useState(0);
  const [total,    setTotal]    = useState(0);

  const [listening, setListening] = useState(false);
  const [detected,  setDetected]  = useState(null);
  const [matched,   setMatched]   = useState(false);
  const [error,     setError]     = useState('');
  const rafRef      = useRef(null);
  const streamRef   = useRef(null);
  const analyserRef = useRef(null);
  const hitLock     = useRef(false);

  const stopListening = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const nextNote = () => {
    stopListening();
    const n = randomStaffNote();
    setNote(n);
    setOptions(buildSolfegeOptions(n));
    setSelected(null);
    setMatched(false);
    setDetected(null);
  };

  const handleChoice = (opt) => {
    if (selected) return;
    setSelected(opt);
    setTotal(t => t + 1);
    if (opt === note.name) setHits(h => h + 1);
  };

  const startListening = useCallback(async () => {
    setError(''); setMatched(false); setDetected(null);
    hitLock.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Float32Array(2048);
      setListening(true);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, ctx.sampleRate);
        const info = freqToNoteInfo(freq);
        setDetected(info || null);
        if (info && !hitLock.current && info.name === note.en && Math.abs(info.cents) <= 25) {
          hitLock.current = true;
          setMatched(true);
          setHits(h => h + 1);
          setTotal(t => t + 1);
          setTimeout(() => stopListening(), 1200);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { setError('No se pudo acceder al micrófono.'); }
  }, [note, stopListening]);

  const switchMode = (m) => {
    stopListening();
    setMode(m);
    setSelected(null); setMatched(false); setDetected(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 text-center">Mirá la nota en el pentagrama y {mode === 'sing' ? 'cantala' : 'elegí su nombre'}.</p>

      <div className="flex gap-2">
        <button onClick={() => switchMode('identify')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${mode === 'identify' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Identificar
        </button>
        <button onClick={() => switchMode('sing')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${mode === 'sing' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Cantar
        </button>
      </div>

      <div className="bg-gray-50 rounded-xl p-2">
        <StaffView note={note} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-lg p-2 text-center"><p className="text-lg font-black text-emerald-700">{hits}</p><p className="text-[9px] uppercase font-bold text-emerald-500">Aciertos</p></div>
        <div className="bg-gray-50 rounded-lg p-2 text-center"><p className="text-lg font-black text-gray-700">{total}</p><p className="text-[9px] uppercase font-bold text-gray-400">Total</p></div>
      </div>

      {mode === 'identify' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {options.map(opt => {
              const isCorrect = opt === note.name;
              const isSelected = opt === selected;
              let cls = 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50';
              if (selected) {
                if (isCorrect) cls = 'bg-emerald-50 border-emerald-300 text-emerald-700';
                else if (isSelected) cls = 'bg-rose-50 border-rose-300 text-rose-700';
              }
              return (
                <button key={opt} onClick={() => handleChoice(opt)} disabled={!!selected}
                  className={`p-2.5 rounded-xl border text-sm font-bold transition ${cls}`}>
                  {opt}{selected && isCorrect ? ' ✓' : ''}{selected && isSelected && !isCorrect ? ' ✗' : ''}
                </button>
              );
            })}
          </div>
          {selected && (
            <button onClick={nextNote} className="w-full py-2.5 rounded-xl font-bold text-sm bg-gray-800 hover:bg-gray-900 text-white transition">
              Siguiente nota →
            </button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-xl p-4 text-center transition-all ${matched ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-50 border border-gray-200'}`}>
            {listening ? (
              <>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Tu nota</p>
                <p className={`text-3xl font-black ${matched ? 'text-green-600' : 'text-gray-700'}`}>
                  {detected ? (NOTE_ES[detected.name] ?? detected.name) : '—'}
                </p>
                {matched && <p className="text-green-600 font-bold mt-1 animate-bounce">¡Muy bien! ✓</p>}
              </>
            ) : (
              <p className="text-gray-400 text-sm">Presioná "Escuchar" y cantá la nota del pentagrama</p>
            )}
          </div>
          {error && <p className="text-xs text-rose-600 text-center">{error}</p>}
          <div className="flex gap-2">
            <button onClick={listening ? stopListening : startListening}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition text-white ${listening ? 'bg-red-500 hover:bg-red-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
              {listening ? '⏹ Detener' : '🎤 Escuchar'}
            </button>
            <button onClick={nextNote}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-800 hover:bg-gray-900 text-white transition">
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export principal
// ─────────────────────────────────────────────────────────────────────────────
export function StudentTools({ db, appId, student }) {
  return (
    <div className="space-y-2">
      <ToolCard icon="🎵" title="Afinador en tiempo real">
        <ChromaticTuner />
      </ToolCard>
      <ToolCard icon="🎯" title="Juego de afinación">
        <PitchMatching />
      </ToolCard>
      <ToolCard icon="👂" title="Entrenamiento de oído">
        <EarTraining />
      </ToolCard>
      <ToolCard icon="🎶" title="Lector de notas (solfeo)">
        <SolfegeReader />
      </ToolCard>
      <ToolCard icon="🥁" title="Metrónomo">
        <Metronome />
      </ToolCard>
      <ToolCard icon="🎹" title="Piano virtual">
        <VirtualPiano />
      </ToolCard>
      <ToolCard icon="🔥" title="Ejercicios de calentamiento">
        <WarmupExercises />
      </ToolCard>
      <ToolCard icon="🫁" title="Respiración guiada">
        <BreathingGuide />
      </ToolCard>
      <ToolCard icon="📊" title="Nivel de voz (VU Meter)">
        <VUMeter />
      </ToolCard>
      <ToolCard icon="🎼" title="Detector de rango vocal">
        <VocalRangeDetector db={db} appId={appId} student={student} />
      </ToolCard>
      <ToolCard icon="〰️" title="Analizador de vibrato">
        <VibratoAnalyzer />
      </ToolCard>
      <ToolCard icon="🎙️" title="Grabador de voz">
        <VoiceRecorder db={db} appId={appId} student={student} />
      </ToolCard>
      <ToolCard icon="🆚" title="Comparador antes/después">
        <BeforeAfterComparator />
      </ToolCard>
      <ToolCard icon="⏱️" title="Contador de práctica">
        <PracticeTimer db={db} appId={appId} student={student} />
      </ToolCard>
    </div>
  );
}
