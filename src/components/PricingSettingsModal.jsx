import React, { useEffect, useState } from 'react';
import { Modal, ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { IconBanknote } from './Icons.jsx';
import { usePricing, savePricing, DEFAULT_PRICING } from '../hooks/usePricing.js';

const ROWS = [
  { classType: 'individual', label: 'Individual', durations: [60] },
  { classType: 'group', label: 'Grupal', durations: [60, 90] },
  { classType: 'choir', label: 'Coro', durations: [60, 90] },
];

export const PricingSettingsModal = ({ isOpen, onClose, db, appId, showMessage }) => {
  const { pricing } = usePricing(db, appId);
  const [draft, setDraft] = useState(DEFAULT_PRICING);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setDraft(pricing);
  }, [isOpen, pricing]);

  const setValue = (classType, duration, value) => {
    setDraft(prev => ({
      ...prev,
      [classType]: { ...(prev[classType] || {}), [duration]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePricing(db, appId, draft);
      showMessage?.('Tarifario guardado. Se va a usar como precio por defecto al agendar o renovar.', 'success');
      onClose?.();
    } catch (e) {
      showMessage?.('Error al guardar el tarifario: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-4 sm:p-6">
        <ModalHeader
          iconNode={<IconBanknote />}
          title="Tarifario"
          subtitle="Precio de lista por tipo de clase — se usa como valor por defecto, siempre se puede cambiar puntualmente."
        />
        <div className="mt-6 space-y-4">
          {ROWS.map(row => (
            <div key={row.classType} className="p-3 bg-white rounded-lg border border-gray-200">
              <p className="text-sm font-semibold text-gray-800 mb-2">{row.label}</p>
              <div className={`grid gap-3 ${row.durations.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {row.durations.map(d => (
                  <div key={d}>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                      {d} min
                    </label>
                    <MoneyInput
                      value={draft[row.classType]?.[d] || 0}
                      onValueChange={(v) => setValue(row.classType, d, Number.isNaN(v) ? 0 : v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 text-sm rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50 transition"
          >
            {saving ? 'Guardando…' : 'Guardar tarifario'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
