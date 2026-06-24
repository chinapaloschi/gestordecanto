import React, { useEffect, useRef, useState, useCallback } from 'react';
import { detectPitch, freqToNoteInfo, NOTE_ES } from '../utils/pitchDetector.js';

// ── Piano keyboard (2 octaves: C3-B4) ──────────────────────────────────────
const OCTAVES  = [3, 4];
const WHITE    = ['C','D','E','F','G','A','B'];
const BLACK    = { C:'C#', D:'D#', F:'F#', G:'G#', A:'A#' };
const BK_POS   = { C:0.6, D:1.6, F:3.6, G:4.6, A:5.6 }; // position in white-key units

function PianoKeyboard({ activeNote, activeOctave }) {
  const whites = [];
  const blacks = [];

  OCTAVES.forEach(oct => {
    WHITE.forEach((n, wi) => {
      const idx = OCTAVES.indexOf(oct) * 7 + wi;
      const isActive = n === activeNote && oct === activeOctave;
      whites.push(
        <div key={`w${oct}${n}`}
          className={`relative border border-gray-300 rounded-b-md transition-colors duration-75
            ${isActive ? 'bg-rose-400 border-rose-500' : 'bg-white hover:bg-gray-50'}`}
          style={{ width: 22, height: 80, flexShrink: 0 }}
        />
      );
      if (BLACK[n]) {
        const bIsActive = BLACK[n] === activeNote && oct === activeOctave;
        blacks.push(
          <div key={`b${oct}${n}`}
            className={`absolute rounded-b-md z-10 transition-colors duration-75
              ${bIsActive ? 'bg-rose-500' : 'bg-gray-900'}`}
            style={{
              width: 13, height: 50,
              left: (OCTAVES.indexOf(oct) * 7 + BK_POS[n]) * 22 + 5,
              top: 0, position: 'absolute',
            }}
          />
        );
      }
    });
  });

  return (
    <div className="relative flex justify-center mt-2 select-none">
      <div className="relative flex">
        {whites}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          {blacks}
        </div>
      </div>
    </div>
  );
}

// ── Needle cents meter ─────────────────────────────────────────────────────
function CentsMeter({ cents }) {
  const angle = Math.max(-90, Math.min(90, (cents / 50) * 90));
  const inTune = Math.abs(cents) <= 10;
  const close  = Math.abs(cents) <= 25;
  const color  = inTune ? '#22c55e' : close ? '#f59e0b' : '#ef4444';
  const r = 54;
  const cx = 70, cy = 70;

  const marks = [-50, -25, 0, 25, 50].map(c => {
    const a = (c / 50) * 90;
    const rad = (a - 90) * Math.PI / 180;
    const x1 = cx + (r - 8) * Math.cos(rad);
    const y1 = cy + (r - 8) * Math.sin(rad);
    const x2 = cx + r * Math.cos(rad);
    const y2 = cy + r * Math.sin(rad);
    return { x1, y1, x2, y2, key: c, isCenter: c === 0 };
  });

  const needleRad = (angle - 90) * Math.PI / 180;
  const nx = cx + (r - 10) * Math.cos(needleRad);
  const ny = cy + (r - 10) * Math.sin(needleRad);

  return (
    <svg width={140} height={85} viewBox="0 0 140 85" className="overflow-visible">
      {/* Arc background */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth={8} strokeLinecap="round"/>
      {/* Colored arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${(Math.abs(cents) / 50) * (Math.PI * r / 2)} ${Math.PI * r}`}
        opacity={0.5}/>
      {/* Tick marks */}
      {marks.map(m => (
        <line key={m.key} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2}
          stroke={m.isCenter ? '#9ca3af' : '#d1d5db'}
          strokeWidth={m.isCenter ? 2 : 1.5}/>
      ))}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={color} strokeWidth={2.5} strokeLinecap="round"
        style={{ transition: 'all 0.08s ease-out' }}/>
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={4} fill={color}/>
      {/* Labels */}
      <text x={cx - r - 4} y={cy + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">-50</text>
      <text x={cx + r + 4} y={cy + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">+50</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={9} fill="#9ca3af">0</text>
    </svg>
  );
}

// ── Main PitchPanel ─────────────────────────────────────────────────────────
export function PitchPanel({ darkMode = false }) {
  const [active,    setActive]    = useState(false);
  const [noteInfo,  setNoteInfo]  = useState(null);
  const [error,     setError]     = useState('');
  const rafRef    = useRef(null);
  const analyserRef = useRef(null);
  const streamRef   = useRef(null);
  const bufRef      = useRef(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
    streamRef.current   = null;
    bufRef.current      = null;
    setActive(false);
    setNoteInfo(null);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      streamRef.current = stream;
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      setActive(true);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(bufRef.current);
        const freq = detectPitch(bufRef.current, ctx.sampleRate);
        const info = freqToNoteInfo(freq);
        setNoteInfo(info || null);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError('No se pudo acceder al micrófono. Verificá los permisos.');
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const bg      = darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900';
  const subtext = darkMode ? 'text-gray-400' : 'text-gray-500';
  const border  = darkMode ? 'border-gray-700' : 'border-gray-200';

  const inTune  = noteInfo && Math.abs(noteInfo.cents) <= 10;
  const noteColor = !noteInfo ? (darkMode ? '#6b7280' : '#d1d5db')
    : inTune ? '#22c55e'
    : Math.abs(noteInfo.cents) <= 25 ? '#f59e0b'
    : '#ef4444';

  return (
    <div className={`${bg} rounded-2xl border ${border} p-4 flex flex-col items-center gap-3 w-full max-w-xs mx-auto shadow-lg`}
      style={{ minHeight: 340 }}>

      {/* Title */}
      <div className="flex items-center gap-2 w-full flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center text-base flex-shrink-0">🎵</div>
        <h3 className="font-bold text-sm">Detector de tono</h3>
        <div className="flex-1"/>
        <button
          onClick={active ? stop : start}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0
            ${active
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-rose-600 hover:bg-rose-700 text-white'}`}
        >
          {active ? '⏹ Detener' : '▶ Iniciar'}
        </button>
      </div>

      {/* Big note — fixed height always */}
      <div className="text-center flex-shrink-0" style={{ height: 76 }}>
        <div className="text-6xl font-black tabular-nums leading-none" style={{ color: noteColor, transition: 'color 0.08s' }}>
          {noteInfo ? NOTE_ES[noteInfo.name] ?? noteInfo.name : '—'}
        </div>
        <div className={`text-sm font-semibold mt-1 ${subtext}`}>
          {noteInfo ? `${noteInfo.name}${noteInfo.octave}  ·  ${noteInfo.freq} Hz`
            : active ? 'Esperando señal...'
            : 'Permitir micrófono y cantá'}
        </div>
      </div>

      {/* Cents meter — siempre renderizado, invisible sin nota */}
      <div className="flex-shrink-0" style={{ height: 85, opacity: noteInfo ? 1 : 0.15, transition: 'opacity 0.12s' }}>
        <CentsMeter cents={noteInfo?.cents ?? 0} />
      </div>

      {/* Label cents — altura fija */}
      <p className="text-xs font-bold flex-shrink-0" style={{ minHeight: 16, color: noteColor }}>
        {noteInfo
          ? noteInfo.cents === 0 ? '● En tono'
            : noteInfo.cents > 0 ? `▲ +${noteInfo.cents} cents (agudo)`
            : `▼ ${noteInfo.cents} cents (grave)`
          : ''}
      </p>

      {/* Piano — siempre visible, atenuado cuando inactivo */}
      <div className="w-full overflow-x-auto flex-shrink-0"
        style={{ opacity: active ? 1 : 0.2, transition: 'opacity 0.2s' }}>
        <PianoKeyboard
          activeNote={noteInfo?.name ?? null}
          activeOctave={noteInfo?.octave ?? null}
        />
      </div>

      {error && <p className="text-red-400 text-xs text-center flex-shrink-0">{error}</p>}
    </div>
  );
}

// ── Standalone full-screen tuner for student portal ─────────────────────────
export function ChromaticTuner() {
  return (
    <div className="py-4 px-2">
      <PitchPanel darkMode={false} />
    </div>
  );
}
