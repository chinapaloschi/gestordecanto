import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, addDoc, onSnapshot } from 'firebase/firestore';
import { formatMoneyAr } from '../utils/money.js';

/* ── constantes ──────────────────────────────────────────── */
const WA_PHONE = '5492216141254';
const waLink = (text) => `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(text)}`;
const WA  = waLink('Hola Sandra! Quiero consultar sobre las clases de canto 🎵');
const IG  = 'https://www.instagram.com/estudiodecantosandrapaloschi/';
const TT  = 'https://www.tiktok.com/@estudiodecantosandrapalo';
const SPOTIFY_ARTIST_ID = '79GbrIGoiP0rF3zZazYgdL';
const SPOTIFY = `https://open.spotify.com/intl-es/artist/${SPOTIFY_ARTIST_ID}`;
const SPOTIFY_EMBED = `https://open.spotify.com/embed/artist/${SPOTIFY_ARTIST_ID}?utm_source=generator&theme=0`;

const DAY_S = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MON_S = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MON_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DAY_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function isoToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
function longDate(s) {
  const d = new Date(s + 'T12:00:00');
  return `${DAY_L[d.getDay()]} ${d.getDate()} de ${MON_L[d.getMonth()]}`;
}

const TESTIMONIOS = [
  { ini: 'V', nombre: 'Valentina M.', texto: 'Llegué sin saber absolutamente nada de canto y en pocos meses participé en la muestra. Sandra tiene una paciencia increíble.' },
  { ini: 'T', nombre: 'Tomás R.',     texto: 'Trabajamos con la música que a mí me gusta. No esperaba aprender tan rápido ni disfrutarlo tanto.' },
  { ini: 'F', nombre: 'Florencia G.', texto: 'Llevo dos años en el estudio y cada clase aprendo algo nuevo. Sandra me ayudó a encontrar una voz que no sabía que tenía.' },
  { ini: 'M', nombre: 'Martín S.',    texto: 'Pensé que era muy adulto para empezar. Me equivoqué. Las clases se adaptan perfectamente a mi ritmo.' },
];

const GENEROS = ['Pop','Rock','Folklore','Tango','Lírico','Tropical','Cumbia','Jazz','Soul','R&B'];

// Videos propios (mp4) en public/videos/, servidos directo sin pasar por Instagram.
// Si esta lista tiene contenido, se usa en lugar de los embeds de Instagram.
const GALERIA_VIDEOS = [
  { src: '/videos/reel-clase-1.mp4',        titulo: 'Clase de canto' },
  { src: '/videos/reel-clase-2.mp4',         titulo: 'Clase de canto II' },
  { src: '/videos/reel-ejercicio-1.mp4',     titulo: 'Ejercicio vocal' },
  { src: '/videos/reel-ejercicio-2.mp4',     titulo: 'Ejercicio vocal II' },
  { src: '/videos/reel-pensamientos.mp4',    titulo: 'Sobre el canto' },
  { src: '/videos/reel-proximo-video.mp4',   titulo: '¿Qué video querés ver?' },
  { src: '/videos/reel-muestra-2025.mp4',    titulo: 'Muestra de Canto 2025' },
  { src: '/videos/reel-alumnos-mardel.mp4',  titulo: 'Grabación con alumnos en Mar del Plata' },
  { src: '/videos/reel-improvisar.mp4',      titulo: 'Improvisando' },
];

// Fotos del espacio físico del estudio, en public/images/estudio/.
const ESTUDIO_FOTOS = [
  '/images/estudio/foto1.jpg',
  '/images/estudio/foto2.jpg',
  '/images/estudio/foto3.jpg',
  '/images/estudio/foto4.jpg',
  '/images/estudio/foto5.jpg',
  '/images/estudio/foto6.jpg',
];

// Posts/reels de Instagram a embeber en "Galería" — pegar acá los links que
// pase Sandra (https://www.instagram.com/p/XXXX/ o /reel/XXXX/).
const GALERIA_POSTS = [
  'https://www.instagram.com/reel/DZLKlVBvPT-/',
  'https://www.instagram.com/reel/DY7uDjAvrvd/',
  'https://www.instagram.com/reel/DY3CGsyRYjZ/',
  'https://www.instagram.com/reel/DXrtbzXEUPH/',
  'https://www.instagram.com/reel/DXZOO3CkbjB/',
  'https://www.instagram.com/reel/DWkWTVwDD7s/',
  'https://www.instagram.com/reel/DWZhbyUkQtl/',
  'https://www.instagram.com/reel/DWWkDLfEdJk/',
];

/* ── íconos ───────────────────────────────────────────────── */
const IconWA = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
const IconIG = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);
const IconSpotify = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.227.331-.654.43-.985.21-2.704-1.65-6.107-2.03-10.117-1.12-.396.09-.787-.144-.876-.54-.09-.396.144-.787.54-.876 4.392-.99 8.155-.55 11.193 1.33.331.227.43.654.21.985zm1.464-3.27c-.27.42-.83.55-1.25.28-3.09-1.9-7.81-2.45-11.47-1.34-.46.14-.95-.12-1.09-.58-.14-.46.12-.95.58-1.09 4.18-1.27 9.38-.64 12.95 1.53.42.27.55.83.28 1.25zm.13-3.4C15.24 8.4 8.84 8.2 5.5 9.23c-.55.17-1.13-.14-1.3-.69-.17-.55.14-1.13.69-1.3 3.83-1.17 11.04-.94 15.42 1.65.5.3.66.94.37 1.44-.3.5-.95.67-1.45.37z"/>
  </svg>
);
const IconTT = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.05a8.19 8.19 0 004.79 1.53V7.13a4.85 4.85 0 01-1.02-.44z"/>
  </svg>
);

function fmtDuration(sec) {
  if (!sec || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

// Captura un fotograma real del video con un <canvas> oculto (no depende de que
// el navegador "decida" pintar un cuadro solo con preload=metadata, que es lo
// que causaba las miniaturas negras). Devuelve una data URL de imagen + la duración.
function useVideoThumbnail(src) {
  const [thumb, setThumb] = useState(null);
  const [duration, setDuration] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement('video');
    video.src = src;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const onLoadedMeta = () => {
      if (cancelled) return;
      setDuration(video.duration);
      const target = Math.min(1, (video.duration || 2) * 0.1);
      try { video.currentTime = target; } catch {}
    };
    const onSeeked = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumb(canvas.toDataURL('image/jpeg', 0.72));
      } catch {}
    };
    video.addEventListener('loadedmetadata', onLoadedMeta);
    video.addEventListener('seeked', onSeeked);
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoadedMeta);
      video.removeEventListener('seeked', onSeeked);
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return { thumb, duration };
}

// Tarjeta de la grilla: miniatura real (fotograma capturado) + título + duración.
function VideoGridTile({ src, titulo, onClick }) {
  const { thumb, duration } = useVideoThumbnail(src);
  return (
    <button className="sp-vid-tile" onClick={onClick}>
      <div className="sp-vid-tile-media">
        {thumb ? <img src={thumb} alt={titulo} /> : <div className="sp-vid-tile-skeleton" />}
        <div className="sp-play-overlay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
        </div>
        {duration ? <span className="sp-vid-duration">{fmtDuration(duration)}</span> : null}
      </div>
      <p className="sp-vid-tile-title">{titulo}</p>
    </button>
  );
}

// Visor a pantalla completa: video grande + flechas para pasar al siguiente.
function VideoLightbox({ videos, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    if (index == null) return;
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, onPrev, onNext]);

  if (index == null) return null;
  return (
    <div className="sp-lightbox" onClick={onClose}>
      <button className="sp-lightbox-close" onClick={onClose}>✕</button>
      {index > 0 && (
        <button className="sp-lightbox-arrow sp-lightbox-prev" onClick={e=>{e.stopPropagation();onPrev();}}>‹</button>
      )}
      <video
        key={videos[index].src}
        src={videos[index].src}
        controls autoPlay playsInline
        className="sp-lightbox-video"
        onClick={e=>e.stopPropagation()}
      />
      {index < videos.length - 1 && (
        <button className="sp-lightbox-arrow sp-lightbox-next" onClick={e=>{e.stopPropagation();onNext();}}>›</button>
      )}
    </div>
  );
}

// Tarjeta de foto en la grilla "Conocé el estudio".
function PhotoGridTile({ src, onClick }) {
  return (
    <button className="sp-foto-tile" onClick={onClick}>
      <img src={src} alt="Estudio de Canto Sandra Paloschi" loading="lazy" />
    </button>
  );
}

// Visor a pantalla completa para las fotos del estudio.
function PhotoLightbox({ fotos, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    if (index == null) return;
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, onPrev, onNext]);

  if (index == null) return null;
  return (
    <div className="sp-lightbox" onClick={onClose}>
      <button className="sp-lightbox-close" onClick={onClose}>✕</button>
      {index > 0 && (
        <button className="sp-lightbox-arrow sp-lightbox-prev" onClick={e=>{e.stopPropagation();onPrev();}}>‹</button>
      )}
      <img
        key={fotos[index]}
        src={fotos[index]}
        alt="Estudio de Canto Sandra Paloschi"
        className="sp-lightbox-video"
        onClick={e=>e.stopPropagation()}
      />
      {index < fotos.length - 1 && (
        <button className="sp-lightbox-arrow sp-lightbox-next" onClick={e=>{e.stopPropagation();onNext();}}>›</button>
      )}
    </div>
  );
}

// Carga el script de embeds de Instagram una sola vez por sesión (singleton)
// y reprocesa los <blockquote class="instagram-media"> cada vez que cambian.
let igEmbedPromise = null;
function loadInstagramEmbed() {
  if (window.instgrm?.Embeds) return Promise.resolve(window.instgrm);
  if (igEmbedPromise) return igEmbedPromise;
  igEmbedPromise = new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.instagram.com/embed.js';
    tag.async = true;
    tag.onload = () => resolve(window.instgrm);
    document.body.appendChild(tag);
  });
  return igEmbedPromise;
}

function InstagramEmbed({ url }) {
  useEffect(() => {
    loadInstagramEmbed().then(ig => ig?.Embeds?.process());
  }, [url]);

  return (
    <blockquote
      className="instagram-media"
      data-instgrm-permalink={url}
      data-instgrm-version="14"
      style={{ background:'#FFF', border:0, margin:0, width:'100%' }}
    />
  );
}

/* ── estilos globales inyectados una sola vez ────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');

  .sp-page { font-family: 'DM Sans', system-ui, sans-serif; color: #0f0f0f; background: #fff; }
  .sp-page * { box-sizing: border-box; }

  .sp-serif { font-family: 'Cormorant Garamond', Georgia, serif; }

  /* nav */
  .sp-nav {
    position: sticky; top: 0; z-index: 50;
    background: rgba(255,255,255,0.96);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #e8e8e8;
    padding: 0 1.5rem;
    display: flex; align-items: center; justify-content: space-between;
    height: 60px;
  }
  .sp-nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .sp-nav-links { display: flex; align-items: center; gap: 0.5rem; }
  .sp-nav-link {
    font-size: 13px; font-weight: 500; color: #555;
    text-decoration: none; padding: 6px 12px; border-radius: 6px;
    transition: color 0.2s;
    background: none; border: none; cursor: pointer; font-family: inherit;
  }
  .sp-nav-link:hover { color: #0f0f0f; }
  .sp-nav-cta {
    font-size: 13px; font-weight: 600;
    color: #0f0f0f; border: 1.5px solid #c9a227;
    padding: 7px 18px; border-radius: 6px;
    text-decoration: none; transition: all 0.2s; cursor: pointer;
    background: transparent;
  }
  .sp-nav-cta:hover { background: #c9a227; color: #0f0f0f; }

  /* secciones */
  .sp-section { padding: 5rem 1.5rem; }
  .sp-section-inner { max-width: 1200px; margin: 0 auto; }
  .sp-section-alt { background: #f9f9f7; }

  .sp-eyebrow {
    font-size: 11px; font-weight: 600; letter-spacing: 0.18em;
    text-transform: uppercase; color: #c9a227;
    display: flex; align-items: center; gap: 10px; margin-bottom: 1rem;
  }
  .sp-eyebrow::before { content: '—'; color: #c9a227; }

  .sp-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: clamp(2rem, 5vw, 2.8rem);
    font-weight: 700; color: #0f0f0f; line-height: 1.15;
    margin-bottom: 1rem;
  }
  .sp-lead { font-size: 16px; color: #666; line-height: 1.75; margin-bottom: 2.5rem; max-width: 640px; }

  /* hero */
  .sp-hero { padding: 5rem 1.5rem 4rem; background: #fff; }
  .sp-hero-inner { max-width: 1200px; margin: 0 auto; }
  .sp-hero-text { max-width: 640px; }
  .sp-hero-gold-line { width: 40px; height: 2px; background: #c9a227; margin-bottom: 1.5rem; }
  .sp-hero-logo {
    width: 96px; height: 96px;
    margin: 0 auto 1.5rem;
    background-color: #c9a227;
    -webkit-mask-image: url('/images/logo-hero.png');
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-image: url('/images/logo-hero.png');
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    animation: sp-logo-pulse 2.8s ease-in-out infinite;
  }
  @keyframes sp-logo-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  .sp-h1 {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: clamp(3rem, 9vw, 4.5rem);
    font-weight: 700; line-height: 1.05;
    color: #0f0f0f; margin-bottom: 1.4rem;
  }
  .sp-h1 em { font-style: italic; color: #c9a227; }

  .sp-hero-desc { font-size: 17px; color: #666; line-height: 1.75; margin-bottom: 2rem; max-width: 500px; }

  .sp-btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    background: #0f0f0f; color: #fff;
    font-size: 14px; font-weight: 600;
    padding: 13px 26px; border-radius: 6px;
    text-decoration: none; border: none; cursor: pointer;
    transition: background 0.2s, transform 0.15s;
  }
  .sp-btn-primary:hover { background: #2a2a2a; transform: translateY(-1px); }

  .sp-btn-ghost {
    display: inline-flex; align-items: center; gap: 8px;
    color: #c9a227; font-size: 14px; font-weight: 600;
    text-decoration: none; border: none; background: none;
    cursor: pointer; padding: 13px 4px;
    transition: color 0.2s;
  }
  .sp-btn-ghost:hover { color: #a07c1a; }

  .sp-hero-actions { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 3rem; }

  .sp-stats { display: flex; gap: 2.5rem; padding-top: 2rem; border-top: 1px solid #ececec; flex-wrap: wrap; }
  .sp-stat-num {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 2rem; font-weight: 700; color: #0f0f0f; line-height: 1;
  }
  .sp-stat-label { font-size: 12px; color: #999; margin-top: 3px; }

  /* mi musica (spotify) */
  .sp-spotify-frame {
    border: 1.5px solid #c9a227; border-radius: 16px;
    padding: 1.75rem; background: #fdfcf7;
  }
  .sp-spotify-embed {
    border-radius: 12px; overflow: hidden;
    border: 1px solid #e8e0c8;
  }
  .sp-spotify-embed iframe { display: block; }
  @media (max-width: 600px) {
    .sp-spotify-frame { padding: 1rem; border-radius: 14px; }
  }

  /* modalidades */
  .sp-cards { display: flex; flex-direction: column; gap: 1px; border: 1px solid #e8e8e8; border-radius: 12px; overflow: hidden; }
  @media (min-width: 900px) {
    .sp-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; }
    .sp-card { border-bottom: 1px solid #e8e8e8; border-right: 1px solid #e8e8e8; }
    .sp-card:nth-child(2n) { border-right: none; }
    .sp-card:nth-last-child(-n+2) { border-bottom: none; }
  }
  .sp-card {
    background: #fff; padding: 1.75rem 2rem;
    border-bottom: 1px solid #e8e8e8;
    transition: background 0.15s;
  }
  .sp-card:last-child { border-bottom: none; }
  .sp-card:hover { background: #fafaf8; }
  .sp-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.8rem; }
  .sp-card-title { font-size: 17px; font-weight: 600; color: #0f0f0f; }
  .sp-card-tag {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #c9a227;
    border: 1px solid #c9a227; padding: 3px 8px; border-radius: 4px;
    white-space: nowrap; flex-shrink: 0;
  }
  .sp-card-desc { font-size: 14px; color: #777; line-height: 1.65; }
  .sp-card-meta { font-size: 13px; color: #999; margin-top: 0.6rem; }

  /* packs */
  .sp-pack-grid { display: flex; flex-direction: column; gap: 14px; margin-top: 0.5rem; }
  .sp-pack-card {
    border: 1px solid #e8e0c8; border-radius: 12px;
    padding: 1.25rem 1.5rem; background: #fff;
  }
  .sp-pack-title { font-size: 16px; font-weight: 600; color: #0f0f0f; margin-bottom: 0.4rem; }
  .sp-pack-desc { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 1rem; }
  .sp-pack-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .sp-pack-price {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.5rem; font-weight: 700; color: #0f0f0f;
  }
  .sp-pack-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 9px 16px; background: #25d366; color: #fff;
    font-size: 13px; font-weight: 600; border-radius: 6px;
    text-decoration: none; transition: background 0.2s; flex-shrink: 0;
  }
  .sp-pack-btn:hover { background: #1ebe5d; }
  @media (min-width: 900px) {
    .sp-pack-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  }

  /* generos */
  .sp-generos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 1.5rem; }
  .sp-genero {
    font-size: 12px; font-weight: 500;
    padding: 5px 12px; border-radius: 4px;
    border: 1px solid #e0e0e0; color: #555;
    background: #fff;
  }

  /* sobre mi */
  .sp-quote {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: clamp(1.4rem, 3.5vw, 1.9rem);
    font-style: italic; color: #0f0f0f;
    line-height: 1.45; margin-bottom: 1.5rem;
  }
  .sp-quote-line { width: 32px; height: 2px; background: #c9a227; margin-bottom: 1.5rem; }

  /* testimonios */
  .sp-testimonios { display: flex; flex-direction: column; gap: 2rem; }
  .sp-testimonio { padding-bottom: 2rem; border-bottom: 1px solid #ececec; }
  .sp-testimonio:last-child { border-bottom: none; padding-bottom: 0; }
  @media (min-width: 900px) {
    .sp-testimonios { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2.5rem 3rem; }
    .sp-testimonio:nth-last-child(-n+2) { border-bottom: none; padding-bottom: 0; }
  }
  .sp-testimonio-texto {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.25rem; font-style: italic;
    color: #333; line-height: 1.6; margin-bottom: 1rem;
  }
  .sp-testimonio-autor { font-size: 13px; font-weight: 600; color: #999; }

  /* galeria — grilla de placeholders (se usa solo si no hay posts de Instagram cargados) */
  .sp-galeria {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-top: 0.5rem;
  }
  .sp-galeria-item {
    aspect-ratio: 1;
    background: #f0ede8;
    border-radius: 6px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    color: #ccc; font-size: 12px;
    filter: grayscale(30%);
    transition: filter 0.3s, transform 0.3s;
    cursor: pointer;
  }
  .sp-galeria-item:hover { filter: grayscale(0%); transform: scale(1.02); }
  .sp-galeria-item img { width: 100%; height: 100%; object-fit: cover; }
  .sp-galeria-placeholder { font-size: 28px; opacity: 0.3; }

  /* miniaturas de video clickeables */
  .sp-galeria-thumb { position: relative; filter: none; }
  .sp-galeria-thumb video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; background: #000; }
  .sp-play-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.18); transition: background 0.2s;
  }
  .sp-play-overlay svg { filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
  .sp-galeria-thumb:hover .sp-play-overlay { background: rgba(0,0,0,0.32); }

  /* lightbox de video */
  .sp-lightbox {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.94);
    display: flex; align-items: center; justify-content: center;
    padding: 1.5rem;
  }
  .sp-lightbox-video { max-width: 100%; max-height: 90vh; border-radius: 8px; outline: none; }
  .sp-lightbox-close, .sp-lightbox-arrow {
    position: absolute; border-radius: 50%;
    background: rgba(255,255,255,0.12); color: #fff; border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
  }
  .sp-lightbox-close:hover, .sp-lightbox-arrow:hover { background: rgba(255,255,255,0.25); }
  .sp-lightbox-close { top: 1.25rem; right: 1.25rem; width: 38px; height: 38px; font-size: 16px; }
  .sp-lightbox-arrow { top: 50%; transform: translateY(-50%); width: 44px; height: 44px; font-size: 26px; }
  .sp-lightbox-prev { left: 0.75rem; }
  .sp-lightbox-next { right: 0.75rem; }
  @media (max-width: 600px) {
    .sp-lightbox-arrow { width: 36px; height: 36px; font-size: 20px; }
  }

  /* galeria — carrusel horizontal de posts/reels embebidos de Instagram */
  .sp-galeria-ig {
    display: flex; gap: 16px; margin-top: 0.5rem;
    overflow-x: auto; padding-bottom: 12px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }
  .sp-galeria-ig-item {
    flex: 0 0 auto; width: min(326px, 84vw);
    scroll-snap-align: start;
    border-radius: 8px; overflow: hidden;
    border: 1px solid #ececec; background: #fff;
  }

  /* galeria — grilla con miniaturas reales (fotograma capturado por canvas) */
  .sp-vid-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 0.5rem;
  }
  .sp-vid-tile {
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; text-align: left;
  }
  .sp-vid-tile-media {
    position: relative; aspect-ratio: 4/5;
    border-radius: 8px; overflow: hidden;
    background: #ece8e0;
  }
  .sp-vid-tile-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sp-vid-tile-skeleton {
    width: 100%; height: 100%;
    background: linear-gradient(100deg, #ece8e0 30%, #f5f2ec 50%, #ece8e0 70%);
    background-size: 200% 100%;
    animation: sp-shimmer 1.4s infinite;
  }
  @keyframes sp-shimmer { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
  .sp-play-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.12); transition: background 0.2s;
  }
  .sp-vid-tile:hover .sp-play-overlay { background: rgba(0,0,0,0.28); }
  .sp-play-overlay svg { filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); }
  .sp-vid-duration {
    position: absolute; bottom: 6px; right: 6px;
    background: rgba(0,0,0,0.6); color: #fff;
    font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
  }
  .sp-vid-tile-title {
    font-size: 12px; color: #555; margin: 0.5rem 0 0;
    line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  @media (max-width: 600px) {
    .sp-vid-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  }
  @media (min-width: 900px) {
    .sp-vid-grid { grid-template-columns: repeat(4, 1fr); gap: 14px; }
  }

  /* el espacio — grilla de fotos del estudio */
  .sp-foto-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 0.5rem;
  }
  .sp-foto-tile {
    background: none; border: none; padding: 0; cursor: pointer;
    aspect-ratio: 4/3; border-radius: 8px; overflow: hidden;
  }
  .sp-foto-tile img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform 0.3s;
  }
  .sp-foto-tile:hover img { transform: scale(1.05); }
  @media (max-width: 600px) {
    .sp-foto-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  }
  @media (min-width: 900px) {
    .sp-foto-grid { grid-template-columns: repeat(4, 1fr); gap: 12px; }
  }

  /* reservar / turnos */
  .sp-turno {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.25rem; border-radius: 8px;
    border: 1px solid #e8e8e8; background: #fff;
    cursor: pointer; transition: all 0.15s; text-align: left; width: 100%;
    margin-bottom: 8px;
  }
  .sp-turno:hover { border-color: #c9a227; background: #fdfcf7; }
  .sp-turno.selected { border: 2px solid #c9a227; background: #fdfcf7; }

  .sp-turno-fecha { min-width: 52px; text-align: center; }
  .sp-turno-dia { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; }
  .sp-turno-num {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 2rem; font-weight: 700; color: #0f0f0f; line-height: 1;
  }
  .sp-turno-num.selected { color: #c9a227; }
  .sp-turno-mes { font-size: 11px; font-weight: 500; color: #bbb; text-transform: lowercase; }
  .sp-turno-sep { width: 1px; height: 40px; background: #ececec; flex-shrink: 0; }
  .sp-turno-info { flex: 1; }
  .sp-turno-hora { font-size: 15px; font-weight: 600; color: #0f0f0f; }
  .sp-turno-hora.selected { color: #c9a227; }
  .sp-turno-tipo { font-size: 12px; color: #aaa; margin-top: 2px; }
  .sp-turno-arrow { color: #d0d0d0; font-size: 16px; flex-shrink: 0; }

  /* formulario */
  .sp-form-box {
    border: 1.5px solid #c9a227; border-radius: 10px;
    padding: 1.75rem; background: #fff; margin-top: 0.5rem;
  }
  .sp-form-selected {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 1.25rem; margin-bottom: 1.25rem;
    border-bottom: 1px solid #ececec;
  }
  .sp-label {
    display: block; font-size: 11px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: #999; margin-bottom: 6px;
  }
  .sp-input {
    width: 100%; padding: 11px 14px; border-radius: 6px;
    border: 1px solid #e0e0e0; font-size: 14px; font-family: inherit;
    color: #0f0f0f; background: #fff; transition: border-color 0.2s;
    outline: none;
  }
  .sp-input:focus { border-color: #c9a227; box-shadow: 0 0 0 3px rgba(201,162,39,0.12); }
  .sp-textarea { resize: none; }

  .sp-submit {
    width: 100%; padding: 14px;
    background: #0f0f0f; color: #fff;
    font-size: 15px; font-weight: 600; font-family: inherit;
    border: none; border-radius: 6px; cursor: pointer;
    transition: background 0.2s; margin-top: 0.5rem;
  }
  .sp-submit:hover:not(:disabled) { background: #2a2a2a; }
  .sp-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .sp-form-hint { font-size: 12px; color: #aaa; text-align: center; margin-top: 0.75rem; }
  .sp-error { font-size: 13px; color: #c0392b; background: #fdf0ee; padding: 10px 14px; border-radius: 6px; }

  /* divider wa */
  .sp-divider { display: flex; align-items: center; gap: 1rem; margin: 1.5rem 0; }
  .sp-divider-line { flex: 1; height: 1px; background: #ececec; }
  .sp-divider-text { font-size: 12px; color: #bbb; white-space: nowrap; }

  .sp-wa-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 13px;
    background: #25d366; color: #fff;
    font-size: 14px; font-weight: 600; font-family: inherit;
    border: none; border-radius: 6px; cursor: pointer;
    text-decoration: none; transition: background 0.2s;
  }
  .sp-wa-btn:hover { background: #1ebe5d; }

  /* success */
  .sp-success {
    text-align: center; padding: 3rem 2rem;
    background: #fdfcf7; border: 1px solid #e8e0c8;
    border-radius: 10px;
    max-width: 640px; margin: 0 auto;
  }
  .sp-success-icon { font-size: 3rem; margin-bottom: 1rem; }
  .sp-success-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.8rem; font-weight: 700; margin-bottom: 0.5rem;
  }
  .sp-success-sub { font-size: 14px; color: #777; line-height: 1.6; margin-bottom: 1.5rem; }
  .sp-success-card {
    display: inline-block; background: #fff;
    border: 1px solid #e8e0c8; border-radius: 8px;
    padding: 0.75rem 1.5rem; font-size: 14px;
  }

  /* sin turnos */
  .sp-empty {
    text-align: center; padding: 3rem 2rem;
    background: #f9f9f7; border: 1px solid #ececec;
    border-radius: 10px;
    max-width: 640px; margin: 0 auto;
  }

  /* cta final */
  .sp-cta { background: #0f0f0f; padding: 5rem 1.5rem; }
  .sp-cta-inner { max-width: 580px; margin: 0 auto; text-align: center; }
  .sp-cta .sp-eyebrow { justify-content: center; color: #c9a227; }
  .sp-cta .sp-eyebrow::before { color: #c9a227; }
  .sp-cta .sp-title { color: #fff; }
  .sp-cta-sub { font-size: 16px; color: rgba(255,255,255,0.5); line-height: 1.7; margin-bottom: 2.5rem; }
  .sp-btn-gold {
    display: inline-flex; align-items: center; gap: 8px;
    background: #c9a227; color: #0f0f0f;
    font-size: 15px; font-weight: 700; font-family: inherit;
    padding: 15px 32px; border-radius: 6px;
    text-decoration: none; border: none; cursor: pointer;
    transition: background 0.2s, transform 0.15s;
  }
  .sp-btn-gold:hover { background: #b8911f; transform: translateY(-1px); }

  .sp-social-links { display: flex; justify-content: center; gap: 1rem; margin-top: 2rem; flex-wrap: wrap; }
  .sp-social-link {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.4);
    text-decoration: none; padding: 8px 16px;
    border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
    transition: all 0.2s;
  }
  .sp-social-link:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.3); }

  /* footer */
  .sp-footer { background: #080808; padding: 2rem 1.5rem; }
  .sp-footer-inner {
    max-width: 680px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 1rem;
  }
  .sp-footer-copy { font-size: 12px; color: #444; }
  .sp-footer-links { display: flex; gap: 1rem; }
  .sp-footer-link { font-size: 12px; color: #444; text-decoration: none; transition: color 0.2s; }
  .sp-footer-link:hover { color: #c9a227; }

  /* wa flotante */
  .sp-wa-float {
    position: fixed; bottom: 24px; right: 24px; z-index: 200;
    width: 52px; height: 52px; border-radius: 50%;
    background: #25d366; color: #fff;
    display: flex; align-items: center; justify-content: center;
    text-decoration: none; box-shadow: 0 4px 16px rgba(37,211,102,0.35);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .sp-wa-float:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(37,211,102,0.45); }

  @media (max-width: 600px) {
    .sp-nav-links .sp-nav-link { display: none; }
    .sp-galeria { grid-template-columns: repeat(2, 1fr); }
    .sp-footer-inner { flex-direction: column; text-align: center; }
  }
`;

/* ════════════════════════════════════════════════════════ */
export function InscripcionPage({ db, appId }) {
  const [slots,      setSlots]      = useState([]);
  const [trialKeys,  setTrialKeys]  = useState(new Set());
  const [step,       setStep]       = useState('browse');
  const [selected,   setSelected]   = useState(null);
  const [form,       setForm]       = useState({ name:'', whatsapp:'', email:'', notes:'' });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(null);
  const [packs, setPacks] = useState([]);
  const formRef = useRef(null);

  const t0 = isoToday();

  useEffect(() => {
    if (!db || !appId) return;
    const u = onSnapshot(
      query(collection(db,`artifacts/${appId}/availableSlots`), where('isActive','==',true)),
      s => setSlots(s.docs.map(d=>({id:d.id,...d.data()}))), ()=>{}
    );
    return u;
  }, [db, appId]);

  useEffect(() => {
    if (!db || !appId) return;
    const u = onSnapshot(
      query(collection(db,`artifacts/${appId}/trialRequests`), where('status','in',['pending','confirmed'])),
      s => { const k=new Set(); s.docs.forEach(d=>{const r=d.data();if(r.date&&r.startTime) k.add(`${r.date}|${r.startTime}`);}); setTrialKeys(k); }, ()=>{}
    );
    return u;
  }, [db, appId]);

  useEffect(() => {
    if (!db || !appId) return;
    const u = onSnapshot(
      query(collection(db,`artifacts/${appId}/exercisePacks`), where('isActive','==',true)),
      s => setPacks(s.docs.map(d=>({id:d.id,...d.data()}))), ()=>{}
    );
    return u;
  }, [db, appId]);

  // Solo fechas puntuales cargadas a mano en Disponibilidad — sin repetir
  // automáticamente ningún día de la semana.
  const cards = useMemo(() => {
    const out = slots
      .filter(slot => slot.date && slot.date >= t0)
      .filter(slot => !trialKeys.has(`${slot.date}|${slot.startTime}`))
      .map(slot => ({ date: slot.date, startTime: slot.startTime, duration: Number(slot.duration), classType: slot.classType, slotId: slot.id }));
    return out.sort((a,b) => a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  }, [slots, trialKeys, t0]);

  const pick = card => {
    setSelected(card); setStep('form'); setError('');
    setTimeout(()=>formRef.current?.scrollIntoView({behavior:'smooth',block:'start'}), 80);
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.name.trim()||!form.whatsapp.trim()) { setError('Completá nombre y WhatsApp.'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db,`artifacts/${appId}/trialRequests`), {
        ...selected, ...form, name:form.name.trim(), whatsapp:form.whatsapp.trim(),
        email:form.email.trim(), notes:form.notes.trim(), status:'pending', createdAt:new Date()
      });
      setStep('success');
    } catch { setError('Ocurrió un error. Intentá de nuevo.'); }
    setSaving(false);
  };

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({behavior:'smooth'});

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="sp-page">

        {/* ── NAV ──────────────────────────────────────────── */}
        <nav className="sp-nav">
          <button onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} className="sp-nav-logo" style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
            <img src="/logo.png" alt="SP" style={{width:32,height:32,objectFit:'contain'}} />
            <span style={{fontFamily:"'Cormorant Garamond',Georgia,serif", fontSize:17, fontWeight:700, color:'#0f0f0f', letterSpacing:'0.02em'}}>
              Sandra Paloschi
            </span>
          </button>
          <div className="sp-nav-links">
            <button onClick={()=>scrollTo('sobre')}       className="sp-nav-link">Sobre mí</button>
            <button onClick={()=>scrollTo('musica')}      className="sp-nav-link">Mi música</button>
            <button onClick={()=>scrollTo('clases')}      className="sp-nav-link">Clases</button>
            {packs.length > 0 && <button onClick={()=>scrollTo('packs')} className="sp-nav-link">Packs</button>}
            <button onClick={()=>scrollTo('galeria')}     className="sp-nav-link">Galería</button>
            <button onClick={()=>scrollTo('testimonios')} className="sp-nav-link">Testimonios</button>
            <button onClick={()=>scrollTo('reservar')} className="sp-nav-cta">Reservar clase</button>
          </div>
        </nav>

        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="sp-hero">
          <div className="sp-hero-inner">
            <div className="sp-hero-text">
              <div className="sp-hero-logo" role="img" aria-label="Sandra Paloschi" />
              <div className="sp-hero-gold-line" />
              <h1 className="sp-h1">
                Aprendé a cantar<br/>
                <em>a tu manera.</em>
              </h1>
              <p className="sp-hero-desc">
                Más de 10 años formando voces en La Plata y online. Todos los estilos, todos los niveles, adolescentes y adultos.
              </p>
              <div className="sp-hero-actions">
                <button onClick={()=>scrollTo('reservar')} className="sp-btn-primary">
                  Reservar mi primera clase →
                </button>
                <a href={WA} target="_blank" rel="noreferrer" className="sp-btn-ghost">
                  <IconWA /> Consultar por WhatsApp
                </a>
              </div>
              <div className="sp-stats">
                {[{n:'+10',l:'años de experiencia'},{n:'∞',l:'estilos musicales'},{n:'4',l:'modalidades'}].map((s,i)=>(
                  <div key={i}>
                    <div className="sp-stat-num">{s.n}</div>
                    <div className="sp-stat-label">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SOBRE MÍ ─────────────────────────────────────── */}
        <section className="sp-section sp-section-alt" id="sobre">
          <div className="sp-section-inner">
            <div style={{maxWidth: 640}}>
              <p className="sp-eyebrow">Sobre mí</p>
              <div className="sp-quote-line" />
              <blockquote className="sp-quote">
                "No importa tu nivel ni tu estilo — si es música, lo trabajamos."
              </blockquote>
              <p style={{fontSize:15, color:'#666', lineHeight:1.8, marginBottom:'1.2rem'}}>
                Soy Sandra Paloschi — todos me dicen "China" —, profesora de canto con más de 10 años de experiencia formando voces en La Plata y online. Trabajo con adolescentes y adultos de todos los niveles, desde quienes cantan por primera vez hasta los que buscan perfeccionar su técnica.
              </p>
              <p style={{fontSize:15, color:'#666', lineHeight:1.8, marginBottom:'2rem'}}>
                Cada alumno tiene su propio proceso. Mi trabajo es acompañarlo con técnica, paciencia y el repertorio que más te representa.
              </p>
              <div className="sp-generos">
                {GENEROS.map(g => <span key={g} className="sp-genero">{g}</span>)}
              </div>
            </div>
          </div>
        </section>

        {/* ── MI MÚSICA ────────────────────────────────────── */}
        <section className="sp-section" id="musica">
          <div className="sp-section-inner">
            <p className="sp-eyebrow">Mi música</p>
            <h2 className="sp-title">Más allá de las clases</h2>
            <p className="sp-lead">Como cantante, también hago mi propia música. Escuchala en Spotify.</p>
            <div className="sp-spotify-frame">
              <div className="sp-spotify-embed">
                <iframe
                  title="Sandra Paloschi en Spotify"
                  src={SPOTIFY_EMBED}
                  width="100%"
                  height="352"
                  frameBorder="0"
                  allowFullScreen=""
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                />
              </div>
              <p style={{fontSize:12, color:'#bbb', textAlign:'center', marginTop:'1.25rem'}}>
                <a href={SPOTIFY} target="_blank" rel="noreferrer" style={{color:'#c9a227', textDecoration:'none', fontWeight:600}}>
                  Ver perfil completo en Spotify →
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ── CLASES ───────────────────────────────────────── */}
        <section className="sp-section" id="clases">
          <div className="sp-section-inner">
            <p className="sp-eyebrow">Modalidades</p>
            <h2 className="sp-title">¿Cómo son las clases?</h2>
            <p className="sp-lead">Cuatro formas de tomar clase: individual, grupal, coral o a distancia. Elegís lo que mejor te queda.</p>

            <div className="sp-cards">
              <div className="sp-card">
                <div className="sp-card-header">
                  <span className="sp-card-title">Individual</span>
                  <span className="sp-card-tag">1 hora</span>
                </div>
                <p className="sp-card-desc">Atención 100% personalizada. Trabajamos tu voz, tu repertorio y tus objetivos a tu propio ritmo, sin apuros.</p>
                <p className="sp-card-meta">Presencial · La Plata</p>
              </div>
              <div className="sp-card">
                <div className="sp-card-header">
                  <span className="sp-card-title">Grupal</span>
                  <span className="sp-card-tag">1 h 30 min</span>
                </div>
                <p className="sp-card-desc">Grupos reducidos con mucha energía compartida. Dinámicas vocales, juegos y preparación para la Muestra de Canto.</p>
                <p className="sp-card-meta">Presencial · La Plata &nbsp;·&nbsp; Grupos de hasta 8 personas</p>
              </div>
              <div className="sp-card">
                <div className="sp-card-header">
                  <span className="sp-card-title">Coral</span>
                  <span className="sp-card-tag">1 h 30 min</span>
                </div>
                <p className="sp-card-desc">Trabajo coral en conjunto: armonía vocal grupal y preparación de repertorio a varias voces.</p>
                <p className="sp-card-meta">Presencial · La Plata</p>
              </div>
              <div className="sp-card">
                <div className="sp-card-header">
                  <span className="sp-card-title">A distancia</span>
                  <span className="sp-card-tag">1 hora</span>
                </div>
                <p className="sp-card-desc">La misma atención personalizada de la clase individual, pero por videollamada desde donde estés.</p>
                <p className="sp-card-meta">Online · Todo el país</p>
              </div>
            </div>

            <div style={{marginTop:'2rem', padding:'1.25rem 1.5rem', background:'#fdfcf7', border:'1px solid #e8e0c8', borderRadius:8}}>
              <p style={{fontSize:13, fontWeight:600, color:'#0f0f0f', marginBottom:'0.4rem'}}>¿Necesito experiencia previa?</p>
              <p style={{fontSize:13, color:'#888', lineHeight:1.6}}>No. Las clases se adaptan a tu nivel, sea cual sea. Muchos alumnos arrancan desde cero.</p>
            </div>
          </div>
        </section>

        {/* ── PACKS ────────────────────────────────────────── */}
        {packs.length > 0 && (
          <section className="sp-section sp-section-alt" id="packs">
            <div className="sp-section-inner">
              <p className="sp-eyebrow">Packs</p>
              <h2 className="sp-title">Ejercicios para practicar en casa</h2>
              <p className="sp-lead">Rutinas y vocalizaciones grabadas en pack descargable. Pedís por WhatsApp y te los envío.</p>
              <div className="sp-pack-grid">
                {packs.map(pack => (
                  <div key={pack.id} className="sp-pack-card">
                    <p className="sp-pack-title">{pack.title}</p>
                    {pack.description && <p className="sp-pack-desc">{pack.description}</p>}
                    <div className="sp-pack-footer">
                      <span className="sp-pack-price">${formatMoneyAr(pack.price)}</span>
                      <a
                        href={waLink(`Hola Sandra! Quiero el pack "${pack.title}" ($${formatMoneyAr(pack.price)})`)}
                        target="_blank" rel="noreferrer" className="sp-pack-btn">
                        <IconWA /> Pedir
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── EL ESPACIO ───────────────────────────────────── */}
        <section className="sp-section sp-section-alt" id="espacio">
          <div className="sp-section-inner">
            <p className="sp-eyebrow">El espacio</p>
            <h2 className="sp-title">Conocé el estudio</h2>
            <p className="sp-lead">Así es el lugar donde damos las clases presenciales, en La Plata.</p>
            <div className="sp-foto-grid">
              {ESTUDIO_FOTOS.map((src, i) => (
                <PhotoGridTile key={src} src={src} onClick={() => setPhotoIndex(i)} />
              ))}
            </div>
          </div>
        </section>

        <PhotoLightbox
          fotos={ESTUDIO_FOTOS}
          index={photoIndex}
          onClose={() => setPhotoIndex(null)}
          onPrev={() => setPhotoIndex(i => Math.max(0, i - 1))}
          onNext={() => setPhotoIndex(i => Math.min(ESTUDIO_FOTOS.length - 1, i + 1))}
        />

        {/* ── GALERÍA ──────────────────────────────────────── */}
        <section className="sp-section sp-section-alt" id="galeria">
          <div className="sp-section-inner">
            <p className="sp-eyebrow">Galería</p>
            <h2 className="sp-title">La vida del estudio</h2>
            <p className="sp-lead">Cada año los alumnos suben al escenario en la Muestra de Canto. Estas son algunas de sus historias.</p>

            {GALERIA_VIDEOS.length > 0 ? (
              <div className="sp-vid-grid">
                {GALERIA_VIDEOS.map((v, i) => (
                  <VideoGridTile key={v.src} src={v.src} titulo={v.titulo} onClick={() => setLightboxIndex(i)} />
                ))}
              </div>
            ) : GALERIA_POSTS.length > 0 ? (
              <div className="sp-galeria-ig">
                {GALERIA_POSTS.map((url, i) => (
                  <div key={i} className="sp-galeria-ig-item">
                    <InstagramEmbed url={url} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="sp-galeria">
                {[...Array(6)].map((_,i) => (
                  <div key={i} className="sp-galeria-item">
                    <span className="sp-galeria-placeholder">🎵</span>
                  </div>
                ))}
              </div>
            )}

            <p style={{fontSize:12, color:'#bbb', textAlign:'center', marginTop:'1rem'}}>
              Seguinos en{' '}
              <a href={IG} target="_blank" rel="noreferrer" style={{color:'#c9a227', textDecoration:'none', fontWeight:600}}>
                Instagram
              </a>
              {' '}para ver más momentos del estudio
            </p>
          </div>
        </section>

        <VideoLightbox
          videos={GALERIA_VIDEOS}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex(i => Math.min(GALERIA_VIDEOS.length - 1, i + 1))}
        />

        {/* ── TESTIMONIOS ──────────────────────────────────── */}
        <section className="sp-section" id="testimonios">
          <div className="sp-section-inner">
            <p className="sp-eyebrow">Testimonios</p>
            <h2 className="sp-title">Lo que dicen los alumnos</h2>

            <div className="sp-testimonios">
              {TESTIMONIOS.map((t,i) => (
                <div key={i} className="sp-testimonio">
                  <p className="sp-testimonio-texto">"{t.texto}"</p>
                  <p className="sp-testimonio-autor">— {t.nombre}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── RESERVAR ─────────────────────────────────────── */}
        <section className="sp-section sp-section-alt" id="reservar">
          <div className="sp-section-inner">
            <p className="sp-eyebrow">Reservar</p>
            <h2 className="sp-title">Elegí tu primer turno</h2>
            <p className="sp-lead">Seleccioná un horario, dejá tus datos y Sandra te confirma por WhatsApp.</p>

            {step === 'success' ? (
              <div className="sp-success">
                <div className="sp-success-icon">✅</div>
                <h3 className="sp-success-title">¡Solicitud enviada!</h3>
                <p className="sp-success-sub">Sandra te contacta por WhatsApp para confirmar el turno y coordinar el pago.</p>
                {selected && (
                  <div className="sp-success-card">
                    <p style={{fontWeight:600, fontSize:15}}>{longDate(selected.date)}</p>
                    <p style={{fontSize:13, color:'#999', marginTop:3}}>{selected.startTime} hs · {selected.duration} min · {selected.classType==='individual'?'Individual':'Grupal'}</p>
                  </div>
                )}
              </div>

            ) : cards.length === 0 ? (
              <div className="sp-empty">
                <p style={{fontSize:32, marginBottom:'0.75rem'}}>📅</p>
                <p style={{fontWeight:600, marginBottom:'0.4rem'}}>No hay turnos online disponibles</p>
                <p style={{fontSize:14, color:'#aaa', marginBottom:'1.5rem'}}>Escribinos y coordinamos el horario que más te convenga.</p>
                <a href={WA} target="_blank" rel="noreferrer" className="sp-wa-btn" style={{maxWidth:300,margin:'0 auto'}}>
                  <IconWA /> Consultar por WhatsApp
                </a>
              </div>

            ) : (
              <div style={{maxWidth: 640}}>
                {cards.map((card, i) => {
                  const d   = new Date(card.date+'T12:00:00');
                  const sel = selected?.date===card.date && selected?.startTime===card.startTime;
                  return (
                    <button key={i} onClick={()=>pick(card)} className={`sp-turno${sel?' selected':''}`}>
                      <div className="sp-turno-fecha">
                        <div className="sp-turno-dia">{DAY_S[d.getDay()]}</div>
                        <div className={`sp-turno-num${sel?' selected':''}`}>{d.getDate()}</div>
                        <div className="sp-turno-mes">{MON_S[d.getMonth()]}</div>
                      </div>
                      <div className="sp-turno-sep" />
                      <div className="sp-turno-info">
                        <div className={`sp-turno-hora${sel?' selected':''}`}>{card.startTime} hs · {card.duration} min</div>
                        <div className="sp-turno-tipo">{card.classType==='individual'?'Individual':'Grupal'}</div>
                      </div>
                      <span className="sp-turno-arrow">›</span>
                    </button>
                  );
                })}

                {step === 'form' && selected && (
                  <div ref={formRef} className="sp-form-box">
                    <div className="sp-form-selected">
                      <div>
                        <p style={{fontWeight:600, fontSize:15}}>{longDate(selected.date)}</p>
                        <p style={{fontSize:13, color:'#aaa', marginTop:2}}>{selected.startTime} hs · {selected.duration} min · {selected.classType==='individual'?'Individual':'Grupal'}</p>
                      </div>
                      <button onClick={()=>{setStep('browse');setSelected(null);}}
                        style={{fontSize:13, fontWeight:600, color:'#c9a227', background:'none', border:'none', cursor:'pointer'}}>
                        Cambiar
                      </button>
                    </div>

                    <form onSubmit={submit}>
                      <div style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
                        {[
                          {k:'name',     l:'Nombre completo *', t:'text',  p:'Tu nombre y apellido'},
                          {k:'whatsapp', l:'WhatsApp *',         t:'tel',   p:'Ej: 221 614 1254'},
                          {k:'email',    l:'Email (opcional)',   t:'email', p:'tu@email.com'},
                        ].map(f=>(
                          <div key={f.k}>
                            <label className="sp-label">{f.l}</label>
                            <input
                              className="sp-input"
                              value={form[f.k]}
                              onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                              type={f.t} placeholder={f.p}
                            />
                          </div>
                        ))}
                        <div>
                          <label className="sp-label">¿Alguna consulta? (opcional)</label>
                          <textarea
                            className="sp-input sp-textarea"
                            rows={3}
                            value={form.notes}
                            onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
                            placeholder="Experiencia previa, estilo musical, presencial u online..."
                          />
                        </div>
                      </div>

                      {error && <p className="sp-error" style={{marginTop:'0.75rem'}}>{error}</p>}

                      <button type="submit" disabled={saving} className="sp-submit">
                        {saving ? 'Enviando…' : 'Confirmar turno'}
                      </button>
                      <p className="sp-form-hint">Sandra te contacta para confirmar el turno y coordinar el pago.</p>
                    </form>
                  </div>
                )}

                <div className="sp-divider">
                  <div className="sp-divider-line" />
                  <span className="sp-divider-text">o escribinos directamente</span>
                  <div className="sp-divider-line" />
                </div>
                <a href={WA} target="_blank" rel="noreferrer" className="sp-wa-btn">
                  <IconWA /> Escribir por WhatsApp
                </a>
              </div>
            )}
          </div>
        </section>

        {/* ── CTA FINAL ────────────────────────────────────── */}
        <section className="sp-cta">
          <div className="sp-cta-inner">
            <p className="sp-eyebrow" style={{justifyContent:'center'}}>Empezá hoy</p>
            <h2 className="sp-title">¿Querés formar parte del estudio?</h2>
            <p className="sp-cta-sub">Reservá tu primera clase o escribinos por cualquiera de estos canales. No importa tu nivel ni experiencia previa.</p>
            <button onClick={()=>scrollTo('reservar')} className="sp-btn-gold">
              Reservar mi primera clase
            </button>
            <div className="sp-social-links">
              <a href={WA} target="_blank" rel="noreferrer" className="sp-social-link"><IconWA /> WhatsApp</a>
              <a href={IG} target="_blank" rel="noreferrer" className="sp-social-link"><IconIG /> Instagram</a>
              <a href={TT} target="_blank" rel="noreferrer" className="sp-social-link"><IconTT /> TikTok</a>
              <a href={SPOTIFY} target="_blank" rel="noreferrer" className="sp-social-link"><IconSpotify /> Spotify</a>
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <footer className="sp-footer">
          <div className="sp-footer-inner">
            <span className="sp-footer-copy">© 2025 Estudio de Canto Sandra Paloschi · La Plata, Buenos Aires</span>
            <div className="sp-footer-links">
              <a href={IG} target="_blank" rel="noreferrer" className="sp-footer-link">Instagram</a>
              <a href={TT} target="_blank" rel="noreferrer" className="sp-footer-link">TikTok</a>
              <a href={SPOTIFY} target="_blank" rel="noreferrer" className="sp-footer-link">Spotify</a>
              <a href={WA} target="_blank" rel="noreferrer" className="sp-footer-link">WhatsApp</a>
            </div>
          </div>
        </footer>

        {/* ── WA FLOTANTE ──────────────────────────────────── */}
        <a href={WA} target="_blank" rel="noreferrer" className="sp-wa-float" title="Escribinos por WhatsApp">
          <IconWA />
        </a>

      </div>
    </>
  );
}
