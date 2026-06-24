import React from 'react';

// Barras de ecualización animadas — tema musical
export function SoundWave({ size = 'md', color = 'rose' }) {
  const heights = [3, 5, 4, 6, 3, 5, 4]; // alturas relativas
  const delays  = [0, 0.15, 0.3, 0.1, 0.4, 0.2, 0.35];

  const h   = size === 'sm' ? 16 : size === 'lg' ? 40 : 28;
  const w   = size === 'sm' ? 2  : size === 'lg' ? 4  : 3;
  const gap = size === 'sm' ? 2  : size === 'lg' ? 4  : 3;

  const barColor = color === 'rose'  ? '#e11d48'
                 : color === 'white' ? '#fff'
                 : color === 'gray'  ? '#9ca3af'
                 : '#e11d48';

  return (
    <div className="flex items-end" style={{ gap, height: h }}>
      {heights.map((rel, i) => (
        <div
          key={i}
          style={{
            width: w,
            height: `${Math.round(rel / 6 * h)}px`,
            backgroundColor: barColor,
            borderRadius: w,
            animationName: 'soundwave',
            animationDuration: '0.8s',
            animationDelay: `${delays[i]}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
          }}
        />
      ))}
      <style>{`
        @keyframes soundwave {
          from { transform: scaleY(0.2); opacity: 0.5; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Pantalla completa de carga — para app inicial
export function LoadingScreen({ text = '' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#ffe4e6_10%,_#fff_60%)] gap-5">
      <SoundWave size="lg" color="rose" />
      <div className="text-center">
        <p className="text-rose-600 font-bold text-sm tracking-wide">
          {text || 'Estudio de Canto Sandra Paloschi'}
        </p>
        {!text && <p className="text-gray-400 text-xs mt-0.5">Iniciando...</p>}
      </div>
    </div>
  );
}

// Loading inline — para usar dentro de componentes
export function InlineLoader({ text = '' }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <SoundWave size="md" color="rose" />
      {text && <p className="text-xs text-gray-400 font-medium">{text}</p>}
    </div>
  );
}
