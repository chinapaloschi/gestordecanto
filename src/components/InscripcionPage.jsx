import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, onSnapshot } from 'firebase/firestore';

/* ── constantes ────────────────────────────────────────── */
const WA   = 'https://wa.me/5492216141254?text=' + encodeURIComponent('Hola Sandra! Quiero consultar sobre las clases de canto 🎵');
const IG   = 'https://www.instagram.com/estudiodecantosandrapaloschi/';
const TT   = 'https://www.tiktok.com/@estudiodecantosandrapalo';

const DAY_S  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MON_S  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MON_L  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DAY_L  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function isoToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
function plusDays(s, n) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

/* ── iconos ─────────────────────────────────────────────── */
const IconWA = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
const IconIG = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;
const IconTT = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.05a8.19 8.19 0 004.79 1.53V7.13a4.85 4.85 0 01-1.02-.44z"/></svg>;

/* ════════════════════════════════════════════════════════ */
export function InscripcionPage({ db, appId }) {
  const [slots,      setSlots]      = useState([]);
  const [bookedKeys, setBookedKeys] = useState(new Set());
  const [trialKeys,  setTrialKeys]  = useState(new Set());
  const [step,       setStep]       = useState('browse');
  const [selected,   setSelected]   = useState(null);
  const [form,       setForm]       = useState({ name:'', whatsapp:'', email:'', notes:'' });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const formRef = useRef(null);

  const t0   = isoToday();
  const tEnd = plusDays(t0, 35);

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
    getDocs(query(collection(db,`artifacts/${appId}/scheduledClasses`),
      where('classDate','>=',t0), where('classDate','<=',tEnd)
    )).then(s => {
      const k = new Set();
      s.docs.forEach(d => { const c=d.data(); if(c.status!=='cancelled'&&c.classDate&&c.startTime) k.add(`${c.classDate}|${c.startTime}`); });
      setBookedKeys(k);
    }).catch(()=>{});
  }, [db, appId]);

  useEffect(() => {
    if (!db || !appId) return;
    const u = onSnapshot(
      query(collection(db,`artifacts/${appId}/trialRequests`), where('status','in',['pending','confirmed'])),
      s => { const k=new Set(); s.docs.forEach(d=>{const r=d.data();if(r.date&&r.startTime) k.add(`${r.date}|${r.startTime}`);}); setTrialKeys(k); }, ()=>{}
    );
    return u;
  }, [db, appId]);

  const cards = useMemo(() => {
    const out = [];
    slots.forEach(slot => {
      for (let i=1; i<=35; i++) {
        const date = plusDays(t0, i);
        const d    = new Date(date+'T12:00:00');
        if (d.getDay() === Number(slot.dayOfWeek)) {
          const key = `${date}|${slot.startTime}`;
          if (!bookedKeys.has(key) && !trialKeys.has(key))
            out.push({ date, startTime:slot.startTime, duration:Number(slot.duration), classType:slot.classType, slotId:slot.id });
        }
      }
    });
    return out.sort((a,b) => a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  }, [slots, bookedKeys, trialKeys, t0]);

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

  const scrollTo = id => { document.getElementById(id)?.scrollIntoView({behavior:'smooth'}); };

  /* ─── render ─────────────────────────────────────────── */
  return (
    <div style={{fontFamily:"'system-ui','-apple-system',sans-serif", color:'#111'}}>

      {/* ── NAV ──────────────────────────────────────────── */}
      <nav style={{borderBottom:'1px solid #f0f0f0'}}
        className="sticky top-0 z-50 bg-white flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="SP" className="w-8 h-8 object-contain" />
          <span className="font-black text-sm text-gray-900 hidden sm:block">Sandra Paloschi</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={WA} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-green-600 transition px-2 py-1.5">
            <IconWA /> WhatsApp
          </a>
          <button onClick={()=>scrollTo('reservar')}
            className="text-xs font-black text-white px-4 py-2 rounded-lg transition hover:opacity-90 active:scale-95"
            style={{background:'#db2777'}}>
            Reservar clase
          </button>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="bg-white px-6 pt-16 pb-20 max-w-lg mx-auto">
        <p className="text-xs font-black uppercase tracking-[0.2em] mb-4" style={{color:'#db2777'}}>
          Estudio de Canto · La Plata
        </p>
        <h1 className="font-black leading-[1.05] mb-6" style={{fontSize:'clamp(2.4rem,8vw,3.5rem)'}}>
          Aprendé a cantar<br/>
          <span style={{color:'#db2777'}}>a tu manera.</span>
        </h1>
        <p className="text-gray-500 text-base leading-relaxed mb-10 max-w-sm">
          Más de 10 años formando voces en La Plata y online. Todos los estilos, todos los niveles, adolescentes y adultos.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={()=>scrollTo('reservar')}
            className="font-black text-sm text-white px-7 py-3.5 rounded-xl transition hover:opacity-90 active:scale-95 shadow-md"
            style={{background:'#db2777'}}>
            Reservar mi primera clase →
          </button>
          <a href={WA} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 font-bold text-sm px-5 py-3.5 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition text-gray-700">
            <IconWA /> Consultar
          </a>
        </div>

        {/* stats */}
        <div className="flex gap-8 mt-14 pt-10 border-t border-gray-100">
          {[{n:'+10',l:'años de experiencia'},{n:'∞',l:'estilos musicales'},{n:'2',l:'modalidades'}].map((s,i)=>(
            <div key={i}>
              <p className="font-black text-2xl" style={{color:'#db2777'}}>{s.n}</p>
              <p className="text-xs text-gray-400 font-medium mt-0.5 leading-tight">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CLASES ───────────────────────────────────────── */}
      <section id="clases" className="bg-gray-50 px-6 py-16">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-black uppercase tracking-[0.2em] mb-3" style={{color:'#db2777'}}>Modalidades</p>
          <h2 className="font-black text-2xl mb-10">¿Cómo son las clases?</h2>

          <div className="space-y-4">

            {/* individual */}
            <div className="bg-white rounded-2xl p-6" style={{border:'1px solid #f3f4f6'}}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
                  style={{background:'#db2777'}}>1:1</div>
                <div>
                  <p className="font-black text-base">Individual</p>
                  <p className="text-xs font-bold mt-0.5 mb-2" style={{color:'#db2777'}}>1 hora</p>
                  <p className="text-sm text-gray-500 leading-relaxed">Atención 100% personalizada. Trabajamos con tu voz, tu repertorio y tus objetivos a tu propio ritmo.</p>
                </div>
              </div>
            </div>

            {/* grupal */}
            <div className="bg-white rounded-2xl p-6" style={{border:'1px solid #f3f4f6'}}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
                  style={{background:'#9d174d'}}>GRP</div>
                <div>
                  <p className="font-black text-base">Grupal</p>
                  <p className="text-xs font-bold mt-0.5 mb-2" style={{color:'#db2777'}}>1 hora 30 min · Grupos reducidos</p>
                  <p className="text-sm text-gray-500 leading-relaxed">Aprendés en compañía, con dinámicas grupales, juegos vocales y mucha energía compartida.</p>
                </div>
              </div>
            </div>

            {/* presencial / online */}
            <div className="grid grid-cols-2 gap-3">
              {[{label:'Presencial',sub:'La Plata, Bs. As.'},{label:'Online',sub:'Todo el país'}].map((m,i)=>(
                <div key={i} className="bg-white rounded-2xl p-5 text-center" style={{border:'1px solid #f3f4f6'}}>
                  <p className="font-black text-sm mb-1">{m.label}</p>
                  <p className="text-xs text-gray-400">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* géneros */}
            <div className="bg-white rounded-2xl p-5" style={{border:'1px solid #f3f4f6'}}>
              <p className="font-black text-sm mb-3">Todos los estilos</p>
              <div className="flex flex-wrap gap-2">
                {['Pop','Rock','Folklore','Tango','Lírico','Tropical','Cumbia','Jazz','Soul','R&B'].map(g=>(
                  <span key={g} className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{background:'#fdf2f8',color:'#db2777',border:'1px solid #fce7f3'}}>{g}</span>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── SOBRE MÍ ─────────────────────────────────────── */}
      <section id="sobre" className="bg-white px-6 py-16">
        <div className="max-w-lg mx-auto flex flex-col gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] mb-3" style={{color:'#db2777'}}>Sobre mí</p>
            <h2 className="font-black text-2xl mb-5">Hola, soy Sandra</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Profesora de canto con más de 10 años de experiencia formando voces en La Plata y online. Trabajo con adolescentes y adultos de todos los niveles, desde quienes cantan por primera vez hasta los que buscan perfeccionar su técnica. No importa el estilo — si es música, lo trabajamos.
            </p>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-2xl" style={{background:'#fdf2f8',border:'1px solid #fce7f3'}}>
            <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden">
              <img src="/logo.png" alt="SP" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-black text-sm text-gray-900">¿Necesito experiencia previa?</p>
              <p className="text-xs text-gray-500 mt-0.5">No. Las clases se adaptan a tu nivel, sea cual sea.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ──────────────────────────────────── */}
      <section id="testimonios" className="bg-gray-50 px-6 py-16">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-black uppercase tracking-[0.2em] mb-3" style={{color:'#db2777'}}>Testimonios</p>
          <h2 className="font-black text-2xl mb-10">Lo que dicen los alumnos</h2>
          <div className="space-y-4">
            {TESTIMONIOS.map((t,i) => (
              <div key={i} className="bg-white rounded-2xl p-5" style={{border:'1px solid #f3f4f6'}}>
                <p className="font-black text-3xl leading-none mb-3" style={{color:'#fce7f3'}}>"</p>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{t.texto}</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0"
                    style={{background:'#db2777'}}>{t.ini}</div>
                  <p className="text-xs font-bold text-gray-700">{t.nombre}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESERVAR ─────────────────────────────────────── */}
      <section id="reservar" className="bg-white px-6 py-16">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-black uppercase tracking-[0.2em] mb-3" style={{color:'#db2777'}}>Reservar</p>
          <h2 className="font-black text-2xl mb-2">Elegí tu horario</h2>
          <p className="text-sm text-gray-400 mb-10 leading-relaxed">
            Seleccioná un turno, dejá tus datos y Sandra te confirma por WhatsApp.
          </p>

          {step === 'success' ? (
            <div className="rounded-2xl p-10 text-center" style={{background:'#fdf2f8',border:'1px solid #fce7f3'}}>
              <p className="text-4xl mb-4">🎉</p>
              <p className="font-black text-lg mb-2">¡Solicitud enviada!</p>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">Sandra te contacta por WhatsApp para confirmar el turno y coordinar el pago.</p>
              {selected && (
                <div className="inline-block bg-white rounded-xl px-6 py-3" style={{border:'1px solid #fce7f3'}}>
                  <p className="font-black text-sm">{longDate(selected.date)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selected.startTime} hs · {selected.duration} min · {selected.classType==='individual'?'Individual':'Grupal'}</p>
                </div>
              )}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl p-10 text-center bg-gray-50" style={{border:'1px solid #f3f4f6'}}>
              <p className="text-4xl mb-3">📅</p>
              <p className="font-black mb-1">No hay turnos online disponibles</p>
              <p className="text-sm text-gray-400 mb-6">Escribinos y coordinamos el horario que más te convenga.</p>
              <a href={WA} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-white font-black text-sm px-6 py-3 rounded-xl transition hover:opacity-90"
                style={{background:'#22c55e'}}>
                <IconWA /> Consultar por WhatsApp
              </a>
            </div>
          ) : (
            <div className="space-y-3">

              {/* turnos */}
              {cards.map((card, i) => {
                const d   = new Date(card.date+'T12:00:00');
                const sel = selected?.date===card.date && selected?.startTime===card.startTime;
                return (
                  <button key={i} onClick={()=>pick(card)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                    style={{
                      border: sel ? '2px solid #db2777' : '1px solid #f3f4f6',
                      background: sel ? '#fdf2f8' : '#fff',
                    }}>
                    <div className="w-14 text-center flex-shrink-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{DAY_S[d.getDay()]}</p>
                      <p className="text-2xl font-black leading-none" style={{color: sel ? '#db2777' : '#111'}}>{d.getDate()}</p>
                      <p className="text-[11px] font-semibold text-gray-400">{MON_S[d.getMonth()]}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm" style={{color: sel ? '#db2777' : '#111'}}>{card.startTime} hs · {card.duration} min</p>
                      <p className="text-xs text-gray-400 mt-0.5">{card.classType==='individual'?'Individual':'Grupal'}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                );
              })}

              {/* formulario */}
              {step==='form' && selected && (
                <div ref={formRef} className="rounded-2xl p-5 mt-2" style={{border:'2px solid #db2777',background:'#fff'}}>
                  <div className="flex items-center justify-between mb-5 pb-4" style={{borderBottom:'1px solid #f3f4f6'}}>
                    <div>
                      <p className="font-black text-sm">{longDate(selected.date)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{selected.startTime} hs · {selected.duration} min · {selected.classType==='individual'?'Individual':'Grupal'}</p>
                    </div>
                    <button onClick={()=>{setStep('browse');setSelected(null);}}
                      className="text-xs font-bold hover:underline" style={{color:'#db2777'}}>Cambiar</button>
                  </div>
                  <form onSubmit={submit} className="space-y-4">
                    {[
                      {k:'name',     l:'Nombre completo *', t:'text',  p:'Tu nombre y apellido', a:'name'},
                      {k:'whatsapp', l:'WhatsApp *',         t:'tel',   p:'Ej: 221 614 1254',    a:'tel'},
                      {k:'email',    l:'Email (opcional)',   t:'email', p:'tu@email.com',         a:'email'},
                    ].map(f=>(
                      <div key={f.k}>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">{f.l}</label>
                        <input value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                          type={f.t} placeholder={f.p} autoComplete={f.a}
                          className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none bg-gray-50"
                          style={{border:'1px solid #e5e7eb'}}
                          onFocus={e=>e.target.style.borderColor='#db2777'}
                          onBlur={e=>e.target.style.borderColor='#e5e7eb'} />
                      </div>
                    ))}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">¿Alguna consulta? (opcional)</label>
                      <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
                        rows={2} placeholder="Experiencia previa, estilo musical, presencial u online..."
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none bg-gray-50 resize-none"
                        style={{border:'1px solid #e5e7eb'}}
                        onFocus={e=>e.target.style.borderColor='#db2777'}
                        onBlur={e=>e.target.style.borderColor='#e5e7eb'} />
                    </div>
                    {error && <p className="text-xs bg-red-50 text-red-600 px-3 py-2 rounded-xl">{error}</p>}
                    <button type="submit" disabled={saving}
                      className="w-full py-3.5 font-black text-sm text-white rounded-xl transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                      style={{background:'#db2777'}}>
                      {saving ? 'Enviando…' : '✓ Confirmar turno'}
                    </button>
                    <p className="text-[10px] text-gray-400 text-center">Sandra te contacta para confirmar el turno y coordinar el pago.</p>
                  </form>
                </div>
              )}

              {/* alternativa WA */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-gray-100"/>
                <p className="text-[11px] text-gray-400 font-medium whitespace-nowrap">o escribinos directamente</p>
                <div className="flex-1 h-px bg-gray-100"/>
              </div>
              <a href={WA} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 font-black text-sm text-white rounded-xl transition hover:opacity-90"
                style={{background:'#22c55e'}}>
                <IconWA /> Escribir por WhatsApp
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="bg-gray-900 px-6 py-12">
        <div className="max-w-lg mx-auto flex flex-col items-center gap-6 text-center">
          <img src="/icon-192-inverted.png" alt="SP" className="w-10 h-10 opacity-70" />
          <div>
            <p className="font-black text-white">Sandra Paloschi</p>
            <p className="text-sm text-gray-500 mt-0.5">Estudio de Canto · La Plata, Buenos Aires</p>
          </div>
          <div className="flex gap-3">
            <a href={WA} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition">
              <IconWA /> WhatsApp
            </a>
            <a href={IG} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition">
              <IconIG /> Instagram
            </a>
            <a href={TT} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition">
              <IconTT /> TikTok
            </a>
          </div>
          <p className="text-[10px] text-gray-600">© 2025 Estudio de Canto Sandra Paloschi</p>
        </div>
      </footer>

    </div>
  );
}
