
import React from "react";

export default function ParticipantEditorCompact({
  students = [], participants = [], getPid,
  selectedStudentId, setSelectedStudentId, addParticipantById,
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 mb-3">
      <div className="grow">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Agregar alumno
        </label>
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="w-full h-8 border border-pink-400 rounded-md px-2 text-xs leading-tight focus:outline-none focus:ring-1 focus:ring-pink-500"
        >
          <option value="">Seleccionar…</option>
          {(students || [])
            .filter((s) => !participants.some((p) => getPid(p) === s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.fullName || s.displayName}
              </option>
            ))}
        </select>
      </div>

      <button
        onClick={addParticipantById}
        className="shrink-0 h-8 px-3 rounded-md bg-gray-900 hover:bg-black text-white text-xs font-semibold"
      >
        Agregar
      </button>
    </div>
  );
}
