import React, { useState, useRef, useEffect, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { isPresent, isAbsent } from '../utils/studentHelpers.js';
import { mapClassTypeToSpanish, formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { PitchPanel } from './PitchPanel.jsx';

const extractYtId = (url) =>
  url?.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;

// Carga la API de YouTube IFrame una sola vez por sesión (singleton).
// La necesitamos (en vez de un <iframe src=...> simple) para poder detectar
// con onError cuándo el dueño del video desactivó la reproducción externa
// (códigos 101/150) y mostrar un aviso propio en vez del cartel feo de YouTube.
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

const fmtTime = (secs) => {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const fmtDuration = (secs) => {
  if (!secs) return '';
  return fmtTime(secs);
};

export const ClassScreen = ({ classGroup, students, db, appId, onClose, onAttendanceChanged }) => {
  const cls     = classGroup?.[0];
  const student = students?.find(s => s.id === cls?.studentId);
  const initials = (cls?.studentName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // ── Video ────────────────────────────────────────────────────────────────
  const [videoTab,      setVideoTab]      = useState('url');
  const [ytInput,       setYtInput]       = useState(cls?.topicLink || '');
  const [ytUrl,         setYtUrl]         = useState(cls?.topicLink || '');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [searchErr,     setSearchErr]     = useState('');

  // ── Attendance ───────────────────────────────────────────────────────────
  const [attendance, setAttendance] = useState(cls?.attendanceStatus || null);
  const [saving,     setSaving]     = useState(false);

  // ── Pitch detector ───────────────────────────────────────────────────────
  const [showPitch, setShowPitch] = useState(false);

  // ── Recording ────────────────────────────────────────────────────────────
  const [isRecording,     setIsRecording]     = useState(false);
  const [recordings,      setRecordings]      = useState([]);
  const [recTime,         setRecTime]         = useState(0);
  const [showDevPicker,   setShowDevPicker]   = useState(false);
  const [audioDevices,    setAudioDevices]    = useState([]);
  const [selectedDevId,   setSelectedDevId]   = useState('');
  const mediaRecRef  = useRef(null);
  const chunksRef    = useRef([]);
  const timerRef     = useRef(null);
  const audioRefs    = useRef({});

  const videoId = extractYtId(ytUrl);
  const [embedError, setEmbedError] = useState(false);
  const playerContainerRef = useRef(null);
  const playerInstanceRef = useRef(null);

  // Crear/destruir el reproductor de YouTube vía la IFrame API cada vez que
  // cambia el video, para poder detectar si el dueño bloqueó la reproducción
  // externa (onError 101/150) y mostrar un aviso propio en vez del cartel de YouTube.
  useEffect(() => {
    setEmbedError(false);
    if (!videoId) return;
    let destroyed = false;

    loadYouTubeApi().then(YT => {
      if (destroyed || !playerContainerRef.current) return;
      if (playerInstanceRef.current) {
        try { playerInstanceRef.current.destroy(); } catch {}
      }
      playerInstanceRef.current = new YT.Player(playerContainerRef.current, {
        videoId,
        playerVars: { autoplay: 1, rel: 0 },
        events: {
          onError: (e) => {
            if (e?.data === 101 || e?.data === 150) setEmbedError(true);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (playerInstanceRef.current) {
        try { playerInstanceRef.current.destroy(); } catch {}
        playerInstanceRef.current = null;
      }
    };
  }, [videoId]);

  // ── Marcar asistencia ────────────────────────────────────────────────────
  const markAttendance = async (status) => {
    setSaving(true);
    try {
      for (const c of classGroup) {
        await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, c.id), { attendanceStatus: status });
      }
      setAttendance(status);
      onAttendanceChanged?.(status);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ── Búsqueda YouTube: abre en nueva pestaña, usuario pega el link ──────────
  const doSearch = (q) => {
    const query = (q || searchQuery).trim();
    if (!query) return;
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
  };

  const quickSearch = (suffix) => {
    const q = `${cls?.studentName || ''} ${suffix}`.trim();
    setSearchQuery(q);
    setVideoTab('search');
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank');
  };

  // ── Grabación ─────────────────────────────────────────────────────────────
  // 1. Click en "Grabar" → pide permisos → enumera dispositivos → muestra picker
  const handleGrabarClick = async () => {
    try {
      // Necesitamos pedir permisos primero para obtener los labels de los dispositivos
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop()); // liberar inmediatamente

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs  = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(inputs);

      if (inputs.length <= 1) {
        // Solo un dispositivo → grabar directo
        startRecording(inputs[0]?.deviceId || '');
      } else {
        // Múltiples → mostrar picker
        setShowDevPicker(true);
      }
    } catch (err) {
      alert(`No se pudo acceder al micrófono.\n\nVerificá que el navegador tenga permiso para usar el micrófono.\n\nError: ${err.message}`);
    }
  };

  // 2. Empezar a grabar con el dispositivo elegido
  const startRecording = async (deviceId) => {
    setShowDevPicker(false);
    setSelectedDevId(deviceId);
    try {
      const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Elegir codec soportado
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecRef.current = mr;
      chunksRef.current   = [];
      setRecTime(0);

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        const dur  = recTime;
        setRecordings(prev => [{
          url, blob,
          label: new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' }),
          duration: dur,
        }, ...prev]);
        stream.getTracks().forEach(t => t.stop());
      };

      mr.start(500);
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch (err) {
      alert(`Error al iniciar grabación: ${err.message}`);
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const downloadRec = (rec) => {
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = `clase_${(cls?.studentName||'alumno').replace(/\s+/g,'_')}_${rec.label.replace(':','-')}.webm`;
    a.click();
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── DEVICE PICKER MODAL ───────────────────────────────────────────────────
  const DevicePicker = () => (
    <div className="fixed inset-0 z-[600] bg-black/70 flex items-center justify-center p-6" onClick={() => setShowDevPicker(false)}>
      <div className="bg-gray-800 rounded-2xl p-5 w-full max-w-sm space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 pb-2 border-b border-gray-700">
          <span className="text-2xl">🎤</span>
          <div>
            <h3 className="text-white font-black">Seleccionar micrófono</h3>
            <p className="text-gray-400 text-xs">Elegí la placa de sonido o micrófono</p>
          </div>
        </div>
        <div className="space-y-2">
          {audioDevices.map((d, i) => {
            const isUsb = /usb|scarlett|focusrite|steinberg|behringer|audient|motu|presonus|rode|blue/i.test(d.label);
            const isBuiltin = /built|built-in|internal|integrado|default|predeter/i.test(d.label);
            const icon = isUsb ? '🎛️' : isBuiltin ? '💻' : '🎤';
            const label = d.label || `Micrófono ${i + 1}`;
            const sublabel = isUsb ? 'Placa de sonido / USB' : isBuiltin ? 'Micrófono integrado' : 'Dispositivo de audio';
            return (
              <button key={d.deviceId}
                onClick={() => startRecording(d.deviceId)}
                className="w-full flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 active:bg-rose-600 rounded-xl text-left transition border border-gray-600 hover:border-rose-500 group">
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate group-hover:text-rose-200">{label}</p>
                  <p className="text-gray-400 text-[10px]">{sublabel}</p>
                </div>
                <svg className="w-4 h-4 text-gray-500 group-hover:text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            );
          })}
        </div>
        <button onClick={() => setShowDevPicker(false)}
          className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition">
          Cancelar
        </button>
      </div>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[500] bg-gray-950 flex flex-col">
      {showDevPicker && <DevicePicker />}

      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          Volver
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-sm truncate">{mapClassTypeToSpanish(cls?.studentType)} · {cls?.startTime} – {cls?.endTime}</h1>
          <p className="text-gray-500 text-xs">{formatDateToDDMMYYYY(cls?.classDate)}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isRecording && (
            <div className="flex items-center gap-1.5 bg-red-600/20 border border-red-500/40 rounded-full px-3 py-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
              <span className="text-red-400 text-xs font-bold tabular-nums">{fmtTime(recTime)}</span>
            </div>
          )}
          {isPresent(attendance) && <span className="text-xs font-bold text-green-400 bg-green-900/40 px-3 py-1 rounded-full">✓ Presente</span>}
          {isAbsent(attendance)  && <span className="text-xs font-bold text-red-400 bg-red-900/40 px-3 py-1 rounded-full">✗ Ausente</span>}
          <button
            onClick={() => setShowPitch(v => !v)}
            title="Detector de tono en tiempo real"
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition
              ${showPitch ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'}`}
          >
            🎵 Tono
          </button>
        </div>
      </div>

      {/* PANEL DETECTOR DE TONO (slide-in desde arriba) */}
      {showPitch && (
        <div className="bg-gray-950 border-b border-gray-800 p-4 flex justify-center flex-shrink-0">
          <div className="w-full max-w-sm">
            <PitchPanel darkMode={true} />
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* PANEL IZQUIERDO */}
        <div className="flex-shrink-0 lg:w-60 bg-gray-900 border-b lg:border-b-0 lg:border-r border-gray-800 flex flex-row lg:flex-col items-center gap-3 p-4 overflow-y-auto">
          {/* Foto */}
          <div className="w-12 h-12 lg:w-24 lg:h-24 rounded-full overflow-hidden bg-gray-800 flex-shrink-0 ring-4 ring-gray-700 shadow-xl">
            {student?.photoURL
              ? <img src={student.photoURL} alt="" className="w-full h-full object-cover"/>
              : <div className="w-full h-full flex items-center justify-center text-lg lg:text-3xl font-black text-gray-500">{initials}</div>}
          </div>

          <div className="flex-1 lg:text-center min-w-0">
            <h2 className="text-white font-black text-sm lg:text-base uppercase leading-tight truncate">{cls?.studentName}</h2>
            {student?.vocal && student.vocal !== 'Sin definir' && <p className="text-rose-400 text-xs font-semibold mt-0.5">{student.vocal}</p>}
            {student?.level && <p className="text-gray-500 text-xs">{student.level}</p>}
          </div>

          {/* Asistencia */}
          <div className="flex flex-row lg:flex-col gap-2 lg:w-full flex-shrink-0 lg:mt-2">
            <button onClick={() => markAttendance(isPresent(attendance) ? null : 'presente')} disabled={saving}
              className={`flex items-center justify-center gap-1 px-3 lg:px-4 py-2.5 rounded-xl font-bold text-sm transition lg:w-full
                ${isPresent(attendance) ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-800 text-green-400 border border-green-800 hover:bg-green-600 hover:text-white hover:border-green-600'}`}>
              ✓ Presente
            </button>
            <button onClick={() => markAttendance(isAbsent(attendance) ? null : 'ausente')} disabled={saving}
              className={`flex items-center justify-center gap-1 px-3 lg:px-4 py-2.5 rounded-xl font-bold text-sm transition lg:w-full
                ${isAbsent(attendance) ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-800 text-red-400 border border-red-900 hover:bg-red-600 hover:text-white hover:border-red-600'}`}>
              ✗ Ausente
            </button>
          </div>

          {/* Notas del alumno (solo desktop) */}
          {student?.notes && (
            <div className="hidden lg:block mt-1 p-3 bg-gray-800 rounded-xl border border-gray-700 w-full">
              <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-1">Notas</p>
              <p className="text-gray-300 text-xs leading-relaxed">{student.notes}</p>
            </div>
          )}

          {/* GRABACIÓN (desktop) */}
          <div className="hidden lg:flex flex-col gap-2 w-full mt-auto pt-3 border-t border-gray-800">
            <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Grabación</p>
            <button onClick={isRecording ? stopRecording : handleGrabarClick}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition
                ${isRecording
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-800 text-red-400 border border-red-900 hover:bg-red-600 hover:text-white hover:border-red-600'}`}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isRecording ? 'bg-white animate-pulse' : 'bg-red-500'}`}/>
              {isRecording ? `Detener · ${fmtTime(recTime)}` : '● Grabar clase'}
            </button>
            {recordings.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {recordings.map((rec, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 text-[10px] font-semibold">{rec.label}</p>
                      <p className="text-gray-500 text-[9px]">{fmtTime(rec.duration)}</p>
                    </div>
                    <audio ref={el => { if (el) audioRefs.current[i] = el; }} src={rec.url} className="hidden"/>
                    <button onClick={() => audioRefs.current[i]?.play()}
                      className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 text-xs transition">▶</button>
                    <button onClick={() => downloadRec(rec)}
                      className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 text-xs transition">⬇</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PANEL DERECHO — video */}
        <div className="flex-1 flex flex-col p-4 gap-3 min-h-0 overflow-y-auto">

          {/* Tabs URL / Buscar */}
          <div className="flex rounded-xl border border-gray-800 overflow-hidden flex-shrink-0">
            {[['url','▶ Pegar link'],['search','🔍 Buscar en YouTube']].map(([id, label]) => (
              <button key={id} onClick={() => setVideoTab(id)}
                className={`flex-1 py-2.5 text-xs font-bold transition ${videoTab === id ? 'bg-rose-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab URL */}
          {videoTab === 'url' && (
            <div className="flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={ytInput}
                onChange={e => setYtInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setYtUrl(ytInput); }}
                placeholder="Pegá un link de YouTube..."
                style={{ colorScheme: 'dark' }}
                className="input-dark-theme flex-1 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition"
              />
              <button onClick={() => setYtUrl(ytInput)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition flex-shrink-0">
                ▶ Play
              </button>
            </div>
          )}

          {/* Tab Buscar */}
          {videoTab === 'search' && (
            <div className="flex-shrink-0 space-y-3">
              {/* Instrucción */}
              <div className="p-3 bg-gray-800 border border-gray-700 rounded-xl text-xs text-gray-400 leading-relaxed">
                <p className="font-semibold text-gray-300 mb-1">¿Cómo funciona?</p>
                <p>1. Escribí la búsqueda → se abre YouTube en otra pestaña</p>
                <p>2. Encontrá el video → copiá el link (Ctrl+C en la barra de dirección)</p>
                <p>3. Volvé acá → pegalo en la pestaña <strong>▶ Pegar link</strong></p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doSearch(searchQuery); }}
                  placeholder="Karaoke, pista, ejercicio vocal..."
                  style={{ colorScheme: 'dark' }}
                  className="input-dark-theme flex-1 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition"
                />
                <button onClick={() => doSearch(searchQuery)}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition flex-shrink-0">
                  🔍 Buscar
                </button>
              </div>
              {/* Búsquedas rápidas */}
              <div className="flex gap-1.5 flex-wrap">
                {[['🎹 Karaoke','karaoke'],['🎵 Pista instrumental','pista instrumental'],['📖 Vocalización','ejercicio vocal vocalización']].map(([label, s]) => (
                  <button key={s} onClick={() => quickSearch(s)}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-xs font-semibold transition border border-gray-700 active:bg-rose-700 active:text-white active:border-rose-700">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Player YouTube (solo cuando hay URL pegada) */}
          {videoId ? (
            <div className="flex-1 rounded-xl overflow-hidden bg-black relative" style={{ minHeight: '240px' }}>
              <div ref={playerContainerRef} className="w-full h-full" style={{ minHeight: '240px' }} />
              {embedError && (
                <div className="absolute inset-0 bg-gray-900/97 flex flex-col items-center justify-center text-center p-6 gap-3">
                  <p className="text-rose-400 font-bold text-sm">⚠ Este video no se puede reproducir acá</p>
                  <p className="text-gray-400 text-xs max-w-xs">El dueño del video desactivó la reproducción fuera de YouTube. Pasa con algunos videos oficiales/discográficas — probá buscar otra versión (en vivo, lyric video, cover).</p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer"
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition">
                      ▶ Abrir en YouTube
                    </a>
                    <button onClick={() => setVideoTab('search')}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-lg transition border border-gray-700">
                      🔍 Buscar otra versión
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-800" style={{ minHeight: '200px' }}>
              <svg className="w-14 h-14 text-gray-700 mb-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <p className="text-gray-500 text-sm">Pegá el link en la pestaña <span className="text-gray-400 font-bold">▶ Pegar link</span></p>
            </div>
          )}

          {/* Grabación mobile */}
          <div className="lg:hidden flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button onClick={isRecording ? stopRecording : handleGrabarClick}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition
                ${isRecording ? 'bg-red-600 text-white' : 'bg-gray-800 text-red-400 border border-red-900 hover:bg-red-600 hover:text-white'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isRecording ? 'bg-white animate-pulse' : 'bg-red-500'}`}/>
              {isRecording ? `Detener · ${fmtTime(recTime)}` : '● Grabar'}
            </button>
            {recordings.map((rec, i) => (
              <div key={i} className="flex gap-1">
                <audio ref={el => { if (el) audioRefs.current[i] = el; }} src={rec.url} className="hidden"/>
                <button onClick={() => audioRefs.current[i]?.play()} className="px-3 py-2 bg-gray-800 rounded-lg text-gray-300 text-xs">▶ {rec.label}</button>
                <button onClick={() => downloadRec(rec)} className="px-2 py-2 bg-gray-800 rounded-lg text-gray-300 text-xs">⬇</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
