import React from 'react';
import { isPresent, isAbsent } from '../utils/studentHelpers.js';

export const NextClassBadge = ({ student }) => {
  const padTime = (t) => {
    if (!t) return "00:00";
    const [H, M] = String(t).split(":");
    return `${String(H || "0").padStart(2, "0")}:${String(M || "0").padStart(2, "0")}`;
  };

  const normType = (v) => {
    const x = (v || "").toString().toLowerCase();
    if (x.startsWith("ind")) return "Individual";
    if (x.startsWith("gru")) return "Grupal";
    if (x.includes("tec")) return "Técnica";
    return v;
  };

  const next = React.useMemo(() => {
    try {
      const classList = student?.scheduledClassesDetailed || [];
      const unconsumedClasses = classList.filter(c =>
        (c?.status === "scheduled" || typeof c?.status === 'undefined' || c?.status === null) &&
        !isPresent(c?.attendanceStatus) && !isAbsent(c?.attendanceStatus)
      );
      if (unconsumedClasses.length === 0) return null;

      const sortedClasses = unconsumedClasses
        .map(c => {
          try {
            const d = new Date(`${c.classDate}T${padTime(c.startTime)}`);
            if (isNaN(d.getTime())) return null;
            return { ...c, __dt: d };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => a.__dt - b.__dt);

      if (sortedClasses.length === 0) return null;
      const now = new Date();
      return sortedClasses.find(c => c.__dt >= now) || null;
    } catch (e) {
      console.error("Error calculating next class:", e);
      return null;
    }
  }, [student?.scheduledClassesDetailed]);

  if (!next) {
    return (
      <div className="text-sm flex items-center gap-2 text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span>Sin próxima clase programada.</span>
      </div>
    );
  }

  const labelTipo = normType(next.studentType || next.classType || "");
  const when = (() => {
    try {
      const ds = next.__dt.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
      return `${ds} · ${padTime(next.startTime)} hs`;
    } catch { return `${next.classDate} · ${padTime(next.startTime)} hs`; }
  })();
  const isPast = next.__dt < new Date();

  return (
    <div className={`text-sm ${isPast ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 text-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V7a2 2 0 012-2h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H17z" /></svg>
        <div>
          <span>Próxima clase ({labelTipo || "—"}): </span>
          <span className="font-semibold">{when}</span>
          {isPast && <span className="text-xs text-rose-600 font-bold ml-1">(PASADA)</span>}
        </div>
      </div>
    </div>
  );
};
