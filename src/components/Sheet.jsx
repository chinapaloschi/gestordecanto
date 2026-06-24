import React from "react";

export default function Sheet({ open, onClose, children }){
  return (
    <div className={`fixed inset-0 z-40 ${open?"pointer-events-auto":"pointer-events-none"}`}>
      <div className={`absolute inset-0 bg-black/30 transition ${open?"opacity-100":"opacity-0"}`} onClick={onClose}/>
      <div className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-xl p-4 max-h-[75vh] overflow-y-auto transition-transform ${open?"translate-y-0":"translate-y-full"}`}>
        {children}
      </div>
    </div>
  );
}
