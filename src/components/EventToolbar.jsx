
import React from "react";

export default function EventToolbar({
  onCreate, onClose, query, setQuery, scope, setScope,
}) {
  return (
    <div className="text-sm">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        {/* Botones */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onCreate}
            className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          >
            + Crear evento
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold"
          >
            Cerrar
          </button>
        </div>

        {/* Buscador */}
        <div className="w-full md:max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título o participante…"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setScope('upcoming')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${scope==='upcoming' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Próximos
        </button>
        <button
          onClick={() => setScope('past')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${scope==='past' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Pasados
        </button>
        <button
          onClick={() => setScope('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${scope==='all' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Todos
        </button>
      </div>

      <div className="h-px bg-gray-200 mb-3" />
    </div>
  );
}
