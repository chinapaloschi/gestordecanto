import React, { useState, useMemo } from 'react';
import { Modal, ModalHeader } from './Modal.jsx';
import { AddExtraIncomeForm, ManageExpenseCategoriesModal, AddExpenseForm } from './FinancialForms.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { IconTrash } from './Icons.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { useEffect } from 'react';
import { parseMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { doc, deleteDoc } from 'firebase/firestore';

export const FinancialManagementModal = ({ isOpen, onClose, allPayments, extraIncomes, expenses, students, db, userId, appId, showMessage, expenseCategories }) => {
    const [activeTab, setActiveTab] = useState('ingresos');
    const [selectedMonthFilter, setSelectedMonthFilter] = useState('all');
    const [availableMonthOptions, setAvailableMonthOptions] = useState([]);
    
    const [searchText, setSearchText] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    const [showAddExtraIncomeModal, setShowAddExtraIncomeModal] = useState(false);
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
    const [showConfirmDeleteFinancialRecordModal, setShowConfirmDeleteFinancialRecordModal] = useState(false);
    const [selectedFinancialRecordToDelete, setSelectedFinancialRecordToDelete] = useState(null);
const [showPercentageCalculator, setShowPercentageCalculator] = useState(false);
    const [baseAmountInput, setBaseAmountInput] = useState('');
    const [percentageInput, setPercentageInput] = useState('');
    const [originalPriceInput, setOriginalPriceInput] = useState('');
    const [newPriceInput, setNewPriceInput] = useState('');
    const normalizeYMD = (v) => {
        if (!v) return '';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const d = v?.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v));
        if (!(d instanceof Date) || isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    useEffect(() => {
        const monthsSet = new Set();
        [...allPayments, ...extraIncomes, ...expenses].forEach(item => {
            const ymd = normalizeYMD(item.paymentDate || item.date);
            if (ymd) monthsSet.add(ymd.slice(0, 7));
        });
        const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
        const options = [{ value: 'all', label: 'Todos los Meses' }];
        sortedMonths.forEach(monthKey => {
            const [year, month] = monthKey.split('-');
            const date = new Date(year, parseInt(month) - 1, 1);
            options.push({ value: monthKey, label: date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) });
        });
        setAvailableMonthOptions(options);
    }, [allPayments, extraIncomes, expenses]);

    const processFinancialData = (items, filterMonthKey, type) => {
        const dataByMonth = {};
        items.forEach(item => {
            const itemDate = type === 'income' ? (item.paymentDate || item.date) : item.date;
            const ymd = normalizeYMD(itemDate);
            if (!ymd) return;

            if (searchText) {
                const term = searchText.toLowerCase();
                const studentMatch = (item.studentName || '').toLowerCase().includes(term);
                const descMatch = (item.description || '').toLowerCase().includes(term);
                const categoryMatch = (item.category || '').toLowerCase().includes(term);
                if (!(studentMatch || descMatch || categoryMatch)) return;
            }
            if (dateFrom && ymd < dateFrom) return;
            if (dateTo && ymd > dateTo) return;
            
            const monthKey = ymd.slice(0, 7);
            if (filterMonthKey !== 'all' && monthKey !== filterMonthKey) return;

            if (!dataByMonth[monthKey]) dataByMonth[monthKey] = {};
            const sourceName = type === 'income' ? (item.studentName || `Extra: ${item.description}`) : item.category;
            const recordType = type === 'income' ? (item.paymentMethod || 'extra_income') : 'expense';
            if (!dataByMonth[monthKey][sourceName]) dataByMonth[monthKey][sourceName] = { totalAmount: 0, records: [] };
            dataByMonth[monthKey][sourceName].totalAmount += parseFloat(item.amount || 0);
            dataByMonth[monthKey][sourceName].records.push({ id: item.id, type: recordType, data: item });
        });

        const sortedMonthKeys = Object.keys(dataByMonth).sort((a, b) => b.localeCompare(a));
        return sortedMonthKeys.map(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, parseInt(month) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            
            const sourcesData = Object.entries(dataByMonth[monthKey]).map(([sourceName, data]) => {
                const sortedRecords = data.records.sort((a, b) => {
                    const dateA = normalizeYMD(a.data.date || a.data.paymentDate);
                    const dateB = normalizeYMD(b.data.date || b.data.paymentDate);
                    return dateB.localeCompare(dateA);
                });
                
                const latestDate = sortedRecords.length > 0 ? normalizeYMD(sortedRecords[0].data.date || sortedRecords[0].data.paymentDate) : '';

                return {
                    sourceName,
                    totalAmount: data.totalAmount,
                    records: sortedRecords,
                    latestDate
                };
            })
            .sort((a, b) => b.latestDate.localeCompare(a.latestDate));

            return { monthKey, monthName, sources: sourcesData, monthlyTotal: sourcesData.reduce((sum, s) => sum + s.totalAmount, 0) };
        });
    };

    const incomeData = useMemo(() => processFinancialData([...allPayments, ...extraIncomes], selectedMonthFilter, 'income'), [allPayments, extraIncomes, selectedMonthFilter, searchText, dateFrom, dateTo]);
    const expenseData = useMemo(() => processFinancialData(expenses, selectedMonthFilter, 'expense'), [expenses, selectedMonthFilter, searchText, dateFrom, dateTo]);

    const summaryData = useMemo(() => {
        const allMonths = new Set([...incomeData.map(d => d.monthKey), ...expenseData.map(d => d.monthKey)]);
        const sortedMonths = Array.from(allMonths).sort((a, b) => b.localeCompare(a));
        return sortedMonths.map(monthKey => {
            const incomeMonth = incomeData.find(d => d.monthKey === monthKey);
            const expenseMonth = expenseData.find(d => d.monthKey === monthKey);
            return {
                monthKey,
                monthName: incomeMonth?.monthName || expenseMonth?.monthName,
                totalIncome: incomeMonth?.monthlyTotal || 0,
                totalExpense: expenseMonth?.monthlyTotal || 0,
                balance: (incomeMonth?.monthlyTotal || 0) - (expenseMonth?.monthlyTotal || 0)
            };
        });
    }, [incomeData, expenseData]);

    const handleDeleteFinancialRecordClick = (record) => {
        setSelectedFinancialRecordToDelete(record);
        setShowConfirmDeleteFinancialRecordModal(true);
    };

    const confirmDeleteFinancialRecord = async () => {
        if (!userId || !selectedFinancialRecordToDelete) return;
        const { id, type } = selectedFinancialRecordToDelete;
        let collectionName = type === 'extra_income' ? 'extraIncomes' : type === 'expense' ? 'expenses' : 'payments';
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/${collectionName}`, id));
            showMessage('Registro eliminado.', 'success');
        } catch (e) { showMessage(`Error al eliminar: ${e.message}`, 'error'); } 
        finally { setShowConfirmDeleteFinancialRecordModal(false); }
    };
    
    // ✅ --- LÓGICA DE EXPORTACIÓN A PDF IMPLEMENTADA ---
    const handleExportPDF = async () => {
        const monthLabel = availableMonthOptions.find(opt => opt.value === selectedMonthFilter)?.label || "Período Personalizado";
        
        try {
            switch (activeTab) {
                case 'ingresos': {
                    const allIncomeRows = incomeData.flatMap(month =>
                        month.sources.flatMap(source =>
                            source.records.map(r => ({
                                alumno: source.sourceName,
                                fecha: r.data.paymentDate || r.data.date,
                                concepto: r.data.description || (r.data.studentName ? 'Pago de abono' : 'Ingreso extra'),
                                monto: r.data.amount
                            }))
                        )
                    );
                    if (allIncomeRows.length === 0) {
                        showMessage('No hay ingresos para exportar en esta vista.', 'info');
                        return;
                    }
                    await exportFinanceListPDF(allIncomeRows, { title: "Reporte de Ingresos", monthLabel, groupField: "alumno" });
                    break;
                }
                case 'egresos': {
                    const allExpenseRows = expenseData.flatMap(month =>
                        month.sources.flatMap(source =>
                            source.records.map(r => ({
                                categoria: source.sourceName,
                                fecha: r.data.date,
                                concepto: r.data.description || 'Gasto general',
                                monto: r.data.amount
                            }))
                        )
                    );
                    if (allExpenseRows.length === 0) {
                        showMessage('No hay egresos para exportar en esta vista.', 'info');
                        return;
                    }
                    await exportFinanceListPDF(allExpenseRows, { title: "Reporte de Egresos", monthLabel, groupField: "categoria" });
                    break;
                }
                case 'total': {
                    const allIncomeRows = incomeData.flatMap(month => month.sources.flatMap(source => source.records.map(r => ({ alumno: source.sourceName, fecha: r.data.paymentDate || r.data.date, concepto: r.data.description || 'Pago de abono', monto: r.data.amount }))));
                    const allExpenseRows = expenseData.flatMap(month => month.sources.flatMap(source => source.records.map(r => ({ categoria: source.sourceName, fecha: r.data.date, concepto: r.data.description || 'Gasto', monto: r.data.amount }))));
                    if (allIncomeRows.length === 0 && allExpenseRows.length === 0) {
                        showMessage('No hay datos para exportar en esta vista.', 'info');
                        return;
                    }
                    await exportResumenMensualPDF({ ingresos: allIncomeRows, egresos: allExpenseRows, monthLabel, ingresosGroupField: 'alumno', egresosGroupField: 'categoria' });
                    break;
                }
            }
        } catch(e) {
            console.error("Error al exportar PDF:", e);
            showMessage("No se pudo generar el PDF.", "error");
        }
    };
    
    // ── Lista de transacciones mejorada ──────────────────────────────────────
    const renderFinancialList = (data, isExpense = false) => (
        <div className="space-y-4">
            {data.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <div className="text-4xl mb-2">📭</div>
                    <p className="font-medium">No hay datos para este período</p>
                </div>
            ) : data.map(monthData => (
                <div key={monthData.monthKey} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                    {/* Encabezado del mes */}
                    <div className={`flex justify-between items-center px-4 py-3 ${isExpense ? 'bg-rose-50 border-b border-rose-100' : 'bg-emerald-50 border-b border-emerald-100'}`}>
                        <h4 className="font-bold text-gray-800 capitalize text-sm">{monthData.monthName}</h4>
                        <div className="text-right">
                            <p className={`font-black text-base ${isExpense ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {formatMoneyAr(monthData.monthlyTotal)}
                            </p>
                        </div>
                    </div>

                    {/* Items del mes */}
                    <div className="divide-y divide-gray-50">
                        {monthData.sources.map(source => (
                            <div key={source.sourceName} className="px-4 py-3">
                                {/* Nombre del alumno/categoría + total del grupo */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-semibold text-gray-900 text-sm">{source.sourceName}</span>
                                    {source.records.length > 1 && (
                                        <span className="text-xs font-bold text-gray-400">{formatMoneyAr(source.totalAmount)}</span>
                                    )}
                                </div>
                                {/* Detalle de cada pago — solo si hay uno, muestra monto directamente */}
                                <div className="space-y-1">
                                    {source.records.map(record => (
                                        <div key={record.id} className="flex items-center justify-between text-xs text-gray-500 group">
                                            <span className="truncate pr-2 flex-1">
                                                {formatDateToDDMMYYYY(record.data.date || record.data.paymentDate)}
                                                {record.data.description ? ` · ${record.data.description}` : ''}
                                            </span>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className={`font-semibold ${isExpense ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {formatMoneyAr(record.data.amount)}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteFinancialRecordClick({ id: record.id, type: record.type })}
                                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity p-0.5"
                                                >
                                                    <IconTrash />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
    // ── Totales del período seleccionado ─────────────────────────────────────
    const periodIncome   = incomeData.reduce((s, m) => s + m.monthlyTotal, 0);
    const periodExpenses = expenseData.reduce((s, m) => s + m.monthlyTotal, 0);
    const periodBalance  = periodIncome - periodExpenses;

    // Comparativa con mes anterior
    const sortedSummary = [...summaryData].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    const latestM = sortedSummary[0];
    const prevM   = sortedSummary[1];
    const incomeDiff = latestM && prevM ? latestM.totalIncome - prevM.totalIncome : null;

    // ── Deuda pendiente total de alumnos activos ──────────────────────────────
    const pendingDebt = (students || []).filter(s => !s.isArchived && s.hasAnyUnpaidItems)
        .reduce((sum, s) => sum + (s.pendingBalance || 0), 0);

    // ── Exportar CSV ─────────────────────────────────────────────────────────
    const handleExportCSV = () => {
        const rows = [['Nombre', 'Fecha', 'Concepto', 'Monto']];
        const addRows = (data, nameField) => data.forEach(month =>
            month.sources.forEach(source => source.records.forEach(r => rows.push([
                source.sourceName,
                formatDateToDDMMYYYY(r.data.paymentDate || r.data.date),
                r.data.description || (nameField === 'alumno' ? 'Abono' : 'Gasto'),
                r.data.amount
            ])))
        );
        if (activeTab !== 'egresos') addRows(incomeData, 'alumno');
        if (activeTab !== 'ingresos') addRows(expenseData, 'categoria');
        const csv = rows.map(r => r.join(';')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = `finanzas_${activeTab}_${selectedMonthFilter}.csv`;
        a.click();
    };

    const baseAmount = parseMoneyAr(baseAmountInput);
    const percentage = parseFloat(percentageInput.replace(',', '.')) || 0;
    const calculatedAmount = isNaN(baseAmount) || baseAmount === 0 || percentage === 0
    ? 0
    : (baseAmount * percentage) / 100;
    // ... (resto de la lógica de cálculo: calculatedAmount, totalWithPercentage)
    const totalWithPercentage = isNaN(baseAmount) ? 0 : baseAmount + calculatedAmount;
    const originalPrice = parseMoneyAr(originalPriceInput);
    const newPrice = parseMoneyAr(newPriceInput);
    let percentageIncrease = 0;
    if (!isNaN(originalPrice) && !isNaN(newPrice) && originalPrice > 0) {
        percentageIncrease = ((newPrice - originalPrice) / originalPrice) * 100;
    }
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="full">
    <div className="flex flex-col h-[calc(100svh-4rem)]">

        {/* ── HEADER NUEVO ── */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-white font-bold text-base">Gestión Financiera</h2>
              <p className="text-gray-400 text-xs">
                {selectedMonthFilter === 'all' ? 'Todos los períodos' : availableMonthOptions.find(o => o.value === selectedMonthFilter)?.label}
              </p>
            </div>
          </div>

          {/* ── 3 CARDS RESUMEN ── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">Ingresos</p>
              <p className="text-white font-black text-sm leading-tight">{formatMoneyAr(periodIncome)}</p>
              {incomeDiff !== null && selectedMonthFilter === 'all' && (
                <p className={`text-[9px] font-semibold mt-0.5 ${incomeDiff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {incomeDiff >= 0 ? '↑' : '↓'} vs mes ant.
                </p>
              )}
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[9px] text-rose-300 font-bold uppercase tracking-wider">Egresos</p>
              <p className="text-white font-black text-sm leading-tight">{formatMoneyAr(periodExpenses)}</p>
            </div>
            <div className={`rounded-xl p-3 ${periodBalance >= 0 ? 'bg-emerald-500/30' : 'bg-rose-500/30'}`}>
              <p className="text-[9px] text-white/70 font-bold uppercase tracking-wider">Balance</p>
              <p className={`font-black text-sm leading-tight ${periodBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {formatMoneyAr(periodBalance)}
              </p>
            </div>
          </div>

          {/* Deuda pendiente */}
          {pendingDebt > 0 && (
            <div className="mt-2 flex items-center gap-2 bg-amber-500/20 rounded-lg px-3 py-1.5">
              <span className="text-amber-300 text-[10px] font-bold">⚠️ Deuda pendiente de alumnos:</span>
              <span className="text-amber-200 text-[10px] font-black">{formatMoneyAr(pendingDebt)}</span>
            </div>
          )}
        </div>

        {/* ── TOOLBAR FIJA ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3 space-y-3">
            {/* Fila 1: Tabs + acciones rápidas */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Tabs */}
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    {[['ingresos','💚 Ingresos'],['egresos','🔴 Egresos'],['total','📊 Total']].map(([id, label]) => (
                        <button key={id} onClick={() => setActiveTab(id)}
                            className={`px-3 py-2 text-xs font-bold transition ${activeTab === id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Filtro mes */}
                <select value={selectedMonthFilter} onChange={e => setSelectedMonthFilter(e.target.value)}
                    className="px-2 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300">
                    {availableMonthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>

                {/* Buscador */}
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                    placeholder="Buscar alumno..."
                    className="flex-1 min-w-[120px] px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-gray-300" />

                {/* Acciones contextuales */}
                <div className="flex items-center gap-1.5 ml-auto">
                    {activeTab === 'ingresos' && (
                        <button onClick={() => setShowAddExtraIncomeModal(true)}
                            className="px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition">
                            + Ingreso
                        </button>
                    )}
                    {activeTab === 'egresos' && (
                        <>
                            <button onClick={() => setShowManageCategoriesModal(true)}
                                className="px-3 py-2 text-xs font-bold bg-gray-700 text-white rounded-xl hover:bg-gray-800 transition">
                                Categorías
                            </button>
                            <button onClick={() => setShowAddExpenseModal(true)}
                                className="px-3 py-2 text-xs font-bold bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition">
                                + Egreso
                            </button>
                        </>
                    )}
                    <button onClick={handleExportPDF}
                        className="px-3 py-2 text-xs font-bold bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        PDF
                    </button>
                    <button onClick={handleExportCSV}
                        className="px-3 py-2 text-xs font-bold bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        CSV
                    </button>
                    <button onClick={() => setShowPercentageCalculator(p => !p)}
                        className={`px-3 py-2 text-xs font-bold rounded-xl transition ${showPercentageCalculator ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        title="Calculadora de porcentajes">
                        % Calc
                    </button>
                </div>
            </div>

            {/* ▼▼▼ UI CALCULADORA INSERTADA AQUÍ ▼▼▼ */}
       {/* ▼▼▼ CALCULADORA DE PORCENTAJES (CONDICIONAL) ▼▼▼ */}
            {showPercentageCalculator && (
                // ▼▼▼ CONTENIDO INTERNO REEMPLAZADO ▼▼▼
                <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg shadow-inner divide-y divide-gray-200">
                    {/* --- Sección 1: Calcular Monto + Porcentaje --- */}
                    <div>
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">Calcular Porcentaje sobre Monto</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {/* Inputs Monto Base y Porcentaje (%) */}
                            <div>
                                <label htmlFor="calcBaseAmount" className="block text-xs font-medium text-gray-600 mb-1">Monto Base</label>
                                <MoneyInput
                                    id="calcBaseAmount"
                                    value={baseAmountInput}
                                    onValueChange={(val) => setBaseAmountInput(isNaN(val) ? '' : String(val))}
                                    placeholder="Ingrese monto"
                                    className="w-full p-2 border border-gray-300 rounded"
                                />
                            </div>
                            <div>
                                <label htmlFor="calcPercentage" className="block text-xs font-medium text-gray-600 mb-1">Porcentaje (%)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    id="calcPercentage"
                                    value={percentageInput}
                                    onChange={(e) => setPercentageInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                                    placeholder="Ej: 10"
                                    className="w-full p-2 border border-gray-300 rounded"
                                />
                            </div>
                            {/* Resultados */}
                            <div className="sm:col-span-2 pt-2 border-t mt-1">
                                <p>Monto del Porcentaje: <strong className="text-blue-700">$ {formatMoneyAr(calculatedAmount)}</strong></p>
                                <p>Total (Base + %): <strong className="text-green-700">$ {formatMoneyAr(totalWithPercentage)}</strong></p>
                            </div>
                        </div>
                    </div> {/* Fin Sección 1 */}

                    {/* --- Nueva Sección: Calcular Aumento Porcentual --- */}
                    <div className="pt-3 mt-3">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">Calcular Aumento Porcentual</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {/* Input Precio Original */}
                            <div>
                                <label htmlFor="calcOriginalPrice" className="block text-xs font-medium text-gray-600 mb-1">Precio Original</label>
                                <MoneyInput
                                    id="calcOriginalPrice"
                                    value={originalPriceInput}
                                    onValueChange={(val) => setOriginalPriceInput(isNaN(val) ? '' : String(val))}
                                    placeholder="Ingrese precio viejo"
                                    className="w-full p-2 border border-gray-300 rounded"
                                />
                            </div>
                            {/* Input Precio Nuevo */}
                            <div>
                                <label htmlFor="calcNewPrice" className="block text-xs font-medium text-gray-600 mb-1">Precio Nuevo</label>
                                <MoneyInput
                                    id="calcNewPrice"
                                    value={newPriceInput}
                                    onValueChange={(val) => setNewPriceInput(isNaN(val) ? '' : String(val))}
                                    placeholder="Ingrese precio actual"
                                    className="w-full p-2 border border-gray-300 rounded"
                                />
                            </div>
                            {/* Resultado Aumento */}
                            <div className="sm:col-span-2 pt-2 border-t mt-1">
                                <p>Aumento Porcentual:
                                    <strong className="text-purple-700 ml-1">
                                        {percentageIncrease.toLocaleString('es-AR', { minimumFractionDigits: percentageIncrease % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} %
                                    </strong>
                                </p>
                            </div>
                        </div>
                    </div> {/* Fin Nueva Sección */}
                </div> // Fin del div principal de la calculadora
                 // ▲▲▲ FIN CONTENIDO INTERNO REEMPLAZADO ▲▲▲
            )}
            {/* ▲▲▲ FIN CALCULADORA ▲▲▲ */}
            {/* ▲▲▲ FIN UI CALCULADORA ▲▲▲ */}

        </div> {/* <-- Fin div encabezado fijo */}

        {/* ── CONTENIDO CON SCROLL ── */}
        <div className="flex-grow overflow-y-auto p-4 bg-gray-50 space-y-4">

            {/* Gráfico de tendencia (solo en Total) */}
            {activeTab === 'total' && sortedSummary.length >= 2 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Tendencia de los últimos meses</p>
                    <div className="flex items-end gap-2" style={{ height: '80px' }}>
                        {sortedSummary.slice(0, 6).reverse().map(month => {
                            const maxVal = Math.max(...sortedSummary.slice(0, 6).map(m => Math.max(m.totalIncome, m.totalExpense)), 1);
                            const incH = Math.max((month.totalIncome / maxVal) * 72, 2);
                            const expH = Math.max((month.totalExpense / maxVal) * 72, 2);
                            return (
                                <div key={month.monthKey} className="flex-1 flex flex-col items-center gap-1">
                                    <div className="w-full flex items-end gap-0.5" style={{ height: '72px' }}>
                                        <div className="flex-1 bg-emerald-400 rounded-t-sm transition-all" style={{ height: `${incH}px` }} title={`Ingresos: ${formatMoneyAr(month.totalIncome)}`}/>
                                        <div className="flex-1 bg-rose-400 rounded-t-sm transition-all" style={{ height: `${expH}px` }} title={`Egresos: ${formatMoneyAr(month.totalExpense)}`}/>
                                    </div>
                                    <span className="text-[8px] text-gray-400 text-center truncate w-full capitalize">
                                        {month.monthName.split(' ')[0].slice(0,3)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-4 mt-2 justify-center">
                        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 bg-emerald-400 rounded-sm inline-block"/>Ingresos</span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 bg-rose-400 rounded-sm inline-block"/>Egresos</span>
                    </div>
                </div>
            )}

            {activeTab === 'ingresos' && renderFinancialList(incomeData, false)}
            {activeTab === 'egresos' && renderFinancialList(expenseData, true)}

            {activeTab === 'total' && (
                <div className="space-y-3">
                    {sortedSummary.map(month => (
                        <div key={month.monthKey} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                                <h4 className="font-bold text-gray-800 capitalize text-sm">{month.monthName}</h4>
                                <span className={`text-xs font-black px-2 py-1 rounded-full ${month.balance >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {month.balance >= 0 ? '+' : ''}{formatMoneyAr(month.balance)}
                                </span>
                            </div>
                            <div className="px-4 py-3 space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-400 rounded-full inline-block"/>Ingresos</span>
                                    <span className="font-bold text-emerald-600">{formatMoneyAr(month.totalIncome)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 flex items-center gap-1.5"><span className="w-2 h-2 bg-rose-400 rounded-full inline-block"/>Egresos</span>
                                    <span className="font-bold text-rose-600">{formatMoneyAr(month.totalExpense)}</span>
                                </div>
                                {/* Barra visual */}
                                {month.totalIncome > 0 && (
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                                        <div className="h-full bg-emerald-400 rounded-full"
                                            style={{ width: `${Math.min(100, (month.totalExpense / month.totalIncome) * 100)}%` }}/>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>

    {/* Modales internos */}
    <Modal isOpen={showAddExtraIncomeModal} onClose={() => setShowAddExtraIncomeModal(false)}><AddExtraIncomeForm db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowAddExtraIncomeModal(false)} /></Modal>
    <Modal isOpen={showAddExpenseModal} onClose={() => setShowAddExpenseModal(false)}><AddExpenseForm db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowAddExpenseModal(false)} expenseCategories={expenseCategories} /></Modal>
    <Modal isOpen={showManageCategoriesModal} onClose={() => setShowManageCategoriesModal(false)}><ManageExpenseCategoriesModal db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowManageCategoriesModal(false)} expenseCategories={expenseCategories} onCategoriesUpdate={() => {}} /></Modal>
     <Modal isOpen={showConfirmDeleteFinancialRecordModal} onClose={() => setShowConfirmDeleteFinancialRecordModal(false)}>
        <div className="p-4">
            <h3 className="text-lg font-semibold mb-4">Confirmar Eliminación</h3>
            <p>¿Estás seguro de que deseas eliminar este registro? Esta acción es irreversible.</p>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowConfirmDeleteFinancialRecordModal(false)} className="px-4 py-2 rounded bg-gray-200">Cancelar</button>
                <button onClick={confirmDeleteFinancialRecord} className="px-4 py-2 rounded bg-red-600 text-white">Eliminar</button>
            </div>
        </div>
    </Modal>
</Modal>
    );
};
// Buscá el componente BlockDaysModal y reemplazalo por este:
