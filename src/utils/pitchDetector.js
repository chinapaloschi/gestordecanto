// Pitch detection usando el algoritmo YIN (optimizado para voz humana)
// Rango útil: 60-1200 Hz (voz cantada)

export function detectPitch(floatBuffer, sampleRate) {
  const SIZE   = floatBuffer.length;
  const minHz  = 60;
  const maxHz  = 1200;
  const minTau = Math.floor(sampleRate / maxHz);
  const maxTau = Math.min(Math.ceil(sampleRate / minHz), Math.floor(SIZE / 2));

  // Chequear que haya señal (RMS)
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += floatBuffer[i] * floatBuffer[i];
  if (Math.sqrt(rms / SIZE) < 0.008) return null;

  // Diferencia cuadrática (solo en el rango de tau útil)
  const diff = new Float32Array(maxTau);
  for (let tau = minTau; tau < maxTau; tau++) {
    const limit = SIZE - maxTau;
    for (let i = 0; i < limit; i++) {
      const d = floatBuffer[i] - floatBuffer[i + tau];
      diff[tau] += d * d;
    }
  }

  // Diferencia cuadrática media acumulada normalizada (CMNDF)
  const cmndf = new Float32Array(maxTau);
  cmndf[0] = 1;
  let runSum = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    runSum += diff[tau];
    cmndf[tau] = runSum > 0 ? diff[tau] * tau / runSum : 0;
  }

  // Buscar el primer mínimo por debajo del umbral
  const THRESHOLD = 0.18;
  let tau = minTau;
  while (tau < maxTau - 1) {
    if (cmndf[tau] < THRESHOLD) {
      while (tau + 1 < maxTau && cmndf[tau + 1] < cmndf[tau]) tau++;
      break;
    }
    tau++;
  }
  if (tau >= maxTau - 1) return null;

  // Interpolación parabólica para mayor precisión
  const x1 = cmndf[tau - 1] ?? cmndf[tau];
  const x2 = cmndf[tau];
  const x3 = cmndf[tau + 1] ?? cmndf[tau];
  const denom = 2 * x2 - x1 - x3;
  const betterTau = denom !== 0 ? tau + (x3 - x1) / (2 * denom) : tau;

  return sampleRate / betterTau;
}

// Convierte frecuencia a información de nota musical
export function freqToNoteInfo(freq) {
  if (!freq || freq <= 0) return null;
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  // A4 = 440 Hz = semitono 69 sobre MIDI
  const semis   = 12 * Math.log2(freq / 440) + 69;
  const noteNum = Math.round(semis);
  const cents   = Math.round((semis - noteNum) * 100);
  const octave  = Math.floor(noteNum / 12) - 1;
  const name    = noteNames[((noteNum % 12) + 12) % 12];
  return { name, octave, cents, noteNum, freq: Math.round(freq) };
}

export const NOTE_ES = {
  C:'Do', 'C#':'Do#', D:'Re', 'D#':'Re#',
  E:'Mi', F:'Fa', 'F#':'Fa#', G:'Sol',
  'G#':'Sol#', A:'La', 'A#':'La#', B:'Si',
};
