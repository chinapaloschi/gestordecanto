import React from "react";

// Hook con variables de calendario
export const useCalendarVars = (initialView) => {
  const [view, setView] = React.useState(initialView ?? (window.innerWidth < 640 ? "agenda" : "week"));
  const [density, setDensity] = React.useState("compact"); // compact|cozy|comfy
  const [zoom, setZoom] = React.useState(1);               // 0.85..1.2
  const style = {
    "--cal-zoom": zoom,
    "--slot-h": density==="compact" ? "32px" : density==="cozy" ? "40px" : "52px",
    "--slot-gap": density==="compact" ? "1px" : "2px",
  };
  return { view, setView, density, setDensity, zoom, setZoom, style };
};

// Toolbar de controles
export function CalendarToolbar({ view, setView, density, setDensity, zoom, setZoom, goToday }) {
  return (
    <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200 px-3 py-2 flex items-center gap-2">
      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
        {["agenda","day","week"].map(v=>(
          <button key={v}
            onClick={()=>setView(v)}
            className={`px-3 py-1.5 text-sm ${view===v?"bg-rose-100 text-rose-700":"bg-white text-gray-700 hover:bg-gray-50"}`}>
            {v==="agenda"?"Agenda":v==="day"?"Día":"Semana"}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2 text-xs">
        <select className="border border-gray-300 rounded-md px-2 py-1"
                value={density} onChange={(e)=>setDensity(e.target.value)}>
          <option value="compact">Compacto</option>
          <option value="cozy">Medio</option>
          <option value="comfy">Cómodo</option>
        </select>
        <button className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200" onClick={goToday}>Hoy</button>
      </div>
    </div>
  );
}

// Vista semanal con scroll horizontal
export const WeekGrid = ({ days, hours, renderCell, style }) => (
  <div className="relative" style={style}>
    {/* encabezado de días */}
    <div className="sticky top-10 z-10 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="pl-12 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(220px, 1fr))` }}>
        {days.map(d => (
          <div key={d.key} className="px-2 py-2 text-center text-xs sm:text-sm font-semibold">
            {d.label}
          </div>
        ))}
      </div>
    </div>
    <div className="flex">
      {/* columna de horas */}
      <div className="sticky left-0 z-10 bg-white border-r border-gray-200 w-12">
        {hours.map(h => (
          <div key={h} className="h-[var(--slot-h)] flex items-start justify-end pr-1 text-[10px] sm:text-xs text-gray-500"
               style={{ transform: "scale(var(--cal-zoom))", transformOrigin:"top right" }}>{h}</div>
        ))}
      </div>
      {/* columnas de días */}
      <div className="overflow-x-auto snap-x snap-mandatory sm:snap-none" style={{ scrollSnapType: "x mandatory" }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(220px, 1fr))` }}>
          {days.map((d) => (
            <div key={d.key} className="relative snap-start border-r border-gray-100 last:border-r-0 px-1" style={{ width: 220 }}>
              {hours.map((h) => (
                <div key={h} className="h-[var(--slot-h)] border-b border-gray-100" style={{ marginBottom: "var(--slot-gap)" }}>
                  {renderCell?.(d, h)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Vista día
export const DayView = ({ day, hours, renderCell, style }) => (
  <div className="px-2" style={style}>
    <div className="text-sm font-semibold mb-2">{day.fullLabel}</div>
    {hours.map(h => (
      <div key={h} className="flex border-b border-gray-100" style={{ marginBottom: "var(--slot-gap)" }}>
        <div className="w-12 pr-1 text-[10px] sm:text-xs text-gray-500 h-[var(--slot-h)] flex items-start justify-end"
             style={{ transform: "scale(var(--cal-zoom))", transformOrigin:"top right" }}>{h}</div>
        <div className="flex-1 h-[var(--slot-h)]">{renderCell?.(day, h)}</div>
      </div>
    ))}
  </div>
);

// Vista agenda
export const AgendaView = ({ items }) => (
  <ul className="divide-y divide-gray-100">
    {items.map(ev => (
      <li key={ev.id} className="p-3">
        <div className="text-xs text-gray-500">{ev.dayLabel} · {ev.timeLabel}</div>
        <div className="text-sm font-medium truncate">{ev.title}</div>
        {ev.subtitle && <div className="text-xs text-gray-600 truncate">{ev.subtitle}</div>}
      </li>
    ))}
  </ul>
);
