// src/components/MobileAgenda.jsx
import React from "react";

/**
 * events: Array de objetos:
 *   { id, dateISO: '2025-08-18', start: '08:00', end: '09:00', title: 'Campana Javier', note?, room? }
 *
 * currentDateISO: string 'YYYY-MM-DD' (día que se muestra)
 * onPrevDay / onNextDay: funciones para navegar días
 * onAddClass?: callback para botón flotante (+)
 */
export default function MobileAgenda({
  events = [],
  currentDateISO,
  onPrevDay,
  onNextDay,
  onAddClass,
}) {
  const day = React.useMemo(() => {
    try {
      const d = new Date(currentDateISO + "T00:00:00");
      return d.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      });
    } catch {
      return "";
    }
  }, [currentDateISO]);

  // Filtra y ordena eventos del día actual
  const items = React.useMemo(() => {
    const list = events.filter((e) => e.dateISO === currentDateISO);
    list.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    return list;
  }, [events, currentDateISO]);

  return (
    <div className="relative">
      {/* Header fijo con navegación */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur rounded-b-xl border-b p-2">
        <div className="flex items-center justify-between">
          <button
            onClick={onPrevDay}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border bg-white text-gray-800"
            aria-label="Día anterior"
            title="Día anterior"
          >
            ‹
          </button>

        <div className="text-center flex-1">
          <div className="text-sm font-semibold text-gray-900 capitalize">
            {day}
          </div>
          <div className="text-xs text-gray-600">
            {formatRangeHeader(currentDateISO)}
          </div>
        </div>

          <button
            onClick={onNextDay}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border bg-white text-gray-800"
            aria-label="Día siguiente"
            title="Día siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* Lista/agenda del día */}
      {items.length === 0 ? (
        <div className="p-4 text-sm text-gray-600">No hay clases para este día.</div>
      ) : (
        <ul className="p-2 space-y-2">
          {items.map((ev) => (
            <li
              key={ev.id}
              className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">
                    {ev.start} – {ev.end || "—"}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {ev.title || "Clase"}
                  </div>
                  {(ev.note || ev.room) && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      {ev.room ? `Aula: ${ev.room}` : ""}
                      {ev.room && ev.note ? " • " : ""}
                      {ev.note || ""}
                    </div>
                  )}
                </div>
                {ev.badge && (
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border bg-gray-50 text-gray-700">
                    {ev.badge}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Botón flotante para crear clase */}
      {typeof onAddClass === "function" && (
        <button
          onClick={onAddClass}
          className="fixed right-4 bottom-24 sm:bottom-8 inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-600 text-white shadow-lg"
          title="Nueva clase"
          aria-label="Nueva clase"
        >
          +
        </button>
      )}
    </div>
  );
}

function formatRangeHeader(dateISO) {
  try {
    const d = new Date(dateISO + "T00:00:00");
    // opcional: muestra semana (lun-dom) del día actual
    const dow = d.getDay(); // 0=Dom
    const deltaToMon = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + deltaToMon);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (x) =>
      x.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    return `${fmt(monday)} – ${fmt(sunday)}`;
  } catch {
    return "";
  }
}
