import React from "react";

export default function PrivateShell({ children, tab="home", onTab }) {
  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900 compact sm:compact-0">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-[700px] px-3 py-2 flex items-center justify-between">
          <div className="font-extrabold">Estudio · Panel</div>
          <button className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200">Cerrar sesión</button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[700px] px-3 py-3">
        {children}
      </main>

      {/* Tab bar móvil */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-gray-200">
        <div className="mx-auto max-w-[700px] grid grid-cols-4">
          {[
            ["alumnos","Alumnos","👥"],
            ["cal","Agenda","📅"],
            ["fin","Finanzas","💸"],
            ["mas","Más","⋯"],
          ].map(([id,label,icon])=>(
            <button key={id}
              onClick={()=>onTab?.(id)}
              className={`h-12 text-xs ${tab===id?"text-brand":"text-gray-600"}`}>
              <div className="leading-5">{icon}</div>
              {label}
            </button>
          ))}
        </div>
      </nav>
      <div className="h-12 sm:hidden" />
    </div>
  );
}
