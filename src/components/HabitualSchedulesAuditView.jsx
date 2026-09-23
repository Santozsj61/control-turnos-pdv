import React, { useState, useEffect } from 'react';
import { 
  Clock, Store, Building2, Calendar, FileSpreadsheet, Download, RefreshCw, 
  Edit3, CheckCircle2, AlertTriangle, AlertCircle, ShieldAlert, TrendingUp, 
  BarChart3, Zap, Filter, Search, Eye, X, Save, ArrowRight, Plus, Minus, Trash2, 
  CheckSquare, Layers, Globe, ArrowUpDown, ChevronRight, ChevronDown, Users 
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  Tooltip, Legend, CartesianGrid, Cell 
} from 'recharts';
import * as XLSX from 'xlsx';
import { ALL_WEEKS_2026, CURRENT_WEEK_START } from '../utils/weeks.js';
import { buildAuditDataLocally } from '../utils/auditCalculator.js';
import { api } from '../services/api.js';

export default function HabitualSchedulesAuditView({ currentUser, pdvs = [], supervisors = [] }) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';

  const [weekStart, setWeekStart] = useState(CURRENT_WEEK_START);
  const [selectedPdvId, setSelectedPdvId] = useState('ALL'); // 'ALL' for unified comparison or specific pdvId
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [chartViewMode, setChartViewMode] = useState('PDVS_COMPARISON'); // 'PDVS_COMPARISON' | 'DAILY_HOURS' | 'SUPPLEMENTARY' | 'OFFSETS'
  const [activeTabSubView, setActiveTabSubView] = useState('PDVS_SUMMARY'); // 'PDVS_SUMMARY' | 'EMPLOYEE_DETAIL'

  // Expanded daily breakdown per collaborator in weekly analysis
  const [expandedWeeklyRowIds, setExpandedWeeklyRowIds] = useState({});

  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [newShiftInput, setNewShiftInput] = useState('');

  const isUnified = selectedPdvId === 'ALL';

  // Fetch Audit Data (with resilient local calculation)
  async function fetchAuditData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getHabitualVsPunchesAudit({
        weekStart,
        pdvId: selectedPdvId && selectedPdvId !== 'ALL' ? selectedPdvId : 'ALL',
        supervisorId: selectedSupervisorId || undefined
      });
      if (data && data.habitualSummaries && data.habitualSummaries.length > 0) {
        setAuditData(data);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Remote audit calculation error, falling back locally:', err);
    }

    try {
      const localData = buildAuditDataLocally({
        pdvs,
        supervisors,
        weekStart,
        selectedPdvId,
        selectedSupervisorId
      });
      setAuditData(localData);
    } catch (calcErr) {
      console.error('Error generating local audit data:', calcErr);
      setErrorMsg('No se pudieron calcular los datos de auditoría.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAuditData();
  }, [selectedPdvId, weekStart, selectedSupervisorId]);

  // Open Edit Modal for a specific PDV
  function handleOpenEditModal(targetPdvIdToEdit) {
    const targetId = targetPdvIdToEdit || (selectedPdvId !== 'ALL' ? selectedPdvId : pdvs[0]?.id);
    const currentPdv = pdvs.find(p => p.id === targetId) || pdvs[0];
    if (!currentPdv) return;

    const currentConfig = currentPdv.habitualSchedule?.dailyConfig || {};

    setEditFormData({
      pdvId: currentPdv.id,
      pdvName: currentPdv.name,
      openingHour: currentPdv.openingHour || '10:00',
      closingHour: currentPdv.closingHour || '20:30',
      lunchHours: 1.0,
      standardDailyHours: 9.5,
      notes: currentPdv.habitualSchedule?.notes || 'Horario habitual auditado por VRX.',
      dailyConfig: {
        lunes: currentConfig.lunes || { open: currentPdv.openingHour || '10:00', close: currentPdv.closingHour || '20:30', standardHours: 9.5, lunchHours: 1.0, active: true },
        martes: currentConfig.martes || { open: currentPdv.openingHour || '10:00', close: currentPdv.closingHour || '20:30', standardHours: 9.5, lunchHours: 1.0, active: true },
        miercoles: currentConfig.miercoles || { open: currentPdv.openingHour || '10:00', close: currentPdv.closingHour || '20:30', standardHours: 9.5, lunchHours: 1.0, active: true },
        jueves: currentConfig.jueves || { open: currentPdv.openingHour || '10:00', close: currentPdv.closingHour || '20:30', standardHours: 9.5, lunchHours: 1.0, active: true },
        viernes: currentConfig.viernes || { open: currentPdv.openingHour || '10:00', close: '21:00', standardHours: 10.0, lunchHours: 1.0, active: true },
        sabado: currentConfig.sabado || { open: '09:30', close: '21:00', standardHours: 10.5, lunchHours: 1.0, active: true },
        domingo: currentConfig.domingo || { open: '11:00', close: '19:00', standardHours: 7.0, lunchHours: 1.0, active: true }
      },
      allowedShifts: currentPdv.allowedShifts || ['10:00-20:30', '10:00-18:00', '11:00-19:00', '12:00-20:30', '13:00-20:30']
    });
    setSaveSuccessMsg(null);
    setShowEditModal(true);
  }

  // Save Habitual Schedule
  async function handleSaveHabitualSchedule(e) {
    if (e) e.preventDefault();
    if (!editFormData) return;
    setSavingSchedule(true);
    setSaveSuccessMsg(null);
    try {
      await api.updatePdvHabitualSchedule(editFormData.pdvId, editFormData);
      setSaveSuccessMsg('¡Horario habitual guardado y actualizado con éxito!');
      setTimeout(() => {
        setShowEditModal(false);
        fetchAuditData();
      }, 800);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Error de conexión al guardar el horario habitual');
    } finally {
      setSavingSchedule(false);
    }
  }

  // Quick Daily Field Update
  function updateDailyField(dayKey, field, value) {
    setEditFormData(prev => {
      const updatedDay = { ...prev.dailyConfig[dayKey], [field]: value };
      return {
        ...prev,
        dailyConfig: {
          ...prev.dailyConfig,
          [dayKey]: updatedDay
        }
      };
    });
  }

  // Add Allowed Shift
  function handleAddShift() {
    if (!newShiftInput.trim()) return;
    setEditFormData(prev => ({
      ...prev,
      allowedShifts: Array.from(new Set([...prev.allowedShifts, newShiftInput.trim()]))
    }));
    setNewShiftInput('');
  }

  // Remove Allowed Shift
  function handleRemoveShift(shiftToRemove) {
    setEditFormData(prev => ({
      ...prev,
      allowedShifts: prev.allowedShifts.filter(s => s !== shiftToRemove)
    }));
  }

  function toggleExpandWeeklyRow(rowId) {
    setExpandedWeeklyRowIds(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  }

  // Export to Excel
  function handleExportExcel() {
    if (!auditData || !auditData.auditWeeklyRows || auditData.auditWeeklyRows.length === 0) {
      alert('No hay datos disponibles para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumen por PDV
    if (auditData.pdvsSummary && auditData.pdvsSummary.length > 0) {
      const summaryRows = auditData.pdvsSummary.map(ps => ({
        'Código PDV': ps.pdvCode,
        'Punto de Venta': ps.pdvName,
        'Ciudad': ps.city,
        'Zona Regional': ps.zoneName,
        'Líder Supervisor': ps.supervisorName,
        'Apertura Habitual': ps.openingHour,
        'Cierre Habitual': ps.closingHour,
        'Personal Activo': ps.totalEmployees,
        'Horas Habituales (Tienda)': ps.totalHabitualHours,
        'Horas Programadas (Cronograma)': ps.totalScheduledHours,
        'Horas Marcadas (Biometría)': ps.totalPunchHours,
        'Tiempos Suplementarios (+ HED/HEN)': ps.totalSupplementaryHours,
        'Recargo Nocturno (RN)': ps.totalNightSurchargeHours,
        'Recargo Dominical/Festivo (RD)': ps.totalSundaySurchargeHours,
        'Desfase Entrada Antes (Min)': ps.totalEarlyArrivalMin,
        'Desfase Salida Después (Min)': ps.totalLateExitMin,
        'Alertas Auditoría': ps.alertCount,
        'Cumplimiento %': `${ps.complianceRate}%`
      }));
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_PDVs');
    }

    // Sheet 2: Consolidado Semanal por Colaborador
    const weeklyExcelRows = (auditData.auditWeeklyRows || []).map(r => ({
      'Código PDV': r.pdvCode,
      'Punto de Venta': r.pdvName,
      'Semana': r.weekStart,
      'Colaborador': r.employeeName,
      'Cédula': r.documentId,
      'Cargo': r.position,
      'Tipo Personal': r.contractType,
      'Días Trabajados': r.daysWorked,
      'Días Programados': r.daysScheduled,
      'Horas Habituales Semanales': r.habitualHoursWeek,
      'Horas Programadas Semanales': r.schedHoursWeek,
      'Horas Marcadas Semanales': r.punchHoursWeek,
      'HED Semanal': r.hedWeek,
      'HEN Semanal': r.henWeek,
      'RN Semanal': r.rnWeek,
      'RD Semanal': r.rdWeek,
      'Total Suplementario Semanal': r.suplementarioTotalWeek,
      'Desfase Entrada Semanal (Min)': r.earlyArrivalMinWeek,
      'Desfase Salida Semanal (Min)': r.lateExitMinWeek,
      'Diferencia vs Habitual Semanal': r.diffVsHabitualWeek,
      'Diferencia vs Programado Semanal': r.diffVsSchedWeek,
      'Estado Auditoría Semanal': r.weeklyStatus,
      'Dictamen de Auditoría': r.weeklyNotes
    }));
    const wsWeekly = XLSX.utils.json_to_sheet(weeklyExcelRows);
    XLSX.utils.book_append_sheet(wb, wsWeekly, 'Analisis_Semanal_Colaboradores');

    // Sheet 3: Detalle Diario por Colaborador y Día
    if (auditData.auditRows && auditData.auditRows.length > 0) {
      const excelRows = auditData.auditRows.map(r => ({
        'Código PDV': r.pdvCode,
        'Punto de Venta': r.pdvName,
        'Fecha': r.date,
        'Día': r.dayName,
        'Colaborador': r.employeeName,
        'Cédula': r.documentId,
        'Cargo': r.position,
        'Tipo Contrato': r.contractType,
        'Apertura Habitual': r.habitualOpen,
        'Cierre Habitual': r.habitualClose,
        'Horas Habituales Base': r.habitualHours,
        'Horario Programado': r.isScheduled ? `${r.schedStart} - ${r.schedEnd}` : 'Descanso / No Programado',
        'Horas Programadas': r.schedNet,
        'Marcación Entrada': r.punchIn || 'Sin marcación',
        'Marcación Salida': r.punchOut || 'Sin marcación',
        'Horas Reales Marcadas': r.punchNet,
        'Ingreso Anticipado (Min)': r.earlyArrivalMin,
        'Salida Tardía (Min)': r.lateExitMin,
        'Horas Extras Diurnas (HED)': r.hed,
        'Horas Extras Nocturnas (HEN)': r.hen,
        'Recargo Nocturno (RN)': r.rn,
        'Recargo Dominical/Festivo (RD)': r.rd,
        'Total Tiempos Suplementarios': r.suplementarioTotal,
        'Diferencia vs Horario Habitual (Hrs)': r.diffVsHabitual,
        'Estado Auditoría': r.auditStatus,
        'Observaciones Auditoría': r.auditNotes
      }));

      const wsDetail = XLSX.utils.json_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle_Diario');
    }

    const fileName = isUnified 
      ? `Auditoria_Consolidada_Semanal_${weekStart}.xlsx`
      : `Auditoria_Semanal_${auditData.pdv?.code || 'PDV'}_${weekStart}.xlsx`;

    XLSX.writeFile(wb, fileName);
  }

  // Filtered Weekly Rows for employee analysis
  const filteredWeeklyRows = (auditData?.auditWeeklyRows || []).filter(row => {
    const matchesSearch = 
      row.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.pdvName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.pdvCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.documentId).includes(searchTerm) ||
      row.position.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ALERTAS') return row.weeklyStatus !== 'CONFORME';
    return row.weeklyStatus === statusFilter;
  });

  // Filtered Daily Rows (for breakdown reference)
  const filteredRows = (auditData?.auditRows || []).filter(row => {
    const matchesSearch = 
      row.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.pdvName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.pdvCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(row.documentId).includes(searchTerm) ||
      row.dayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.date.includes(searchTerm);

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ALERTAS') return row.auditStatus !== 'CONFORME';
    return row.auditStatus === statusFilter;
  });

  // Filtered PDVs Summary
  const filteredPdvsSummary = (auditData?.pdvsSummary || []).filter(p => {
    return p.pdvName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           p.pdvCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
           p.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
           p.zoneName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white p-6 rounded-2xl shadow-xl border border-indigo-900/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300">
                <Clock className="w-6 h-6" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-400/30">
                MÓDULO DE AUDITORÍA & CONTROL (VRX)
              </span>
              {isUnified && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span>VISTA UNIFICADA NACIONAL</span>
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {isUnified ? 'Auditoría Comparativa Unificada de Todos los PDVs' : 'Horarios Habituales PDV vs Marcaciones Reales'}
            </h1>
            <p className="text-xs text-indigo-200/80 max-w-3xl leading-relaxed">
              {isUnified 
                ? 'Consolidado nacional de todas las tiendas. Permite comparar simultáneamente los horarios habituales, marcaciones biométricas reales y sobretiempos suplementarios entre todos los puntos de venta.'
                : 'Auditoría individual del punto de venta seleccionado contra su horario comercial habitual y cronograma semanal.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {!isUnified && (
              <button
                onClick={() => handleOpenEditModal(selectedPdvId)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition border border-indigo-400/30 cursor-pointer"
                title="Configurar los horarios habituales de apertura, cierre y turnos de esta tienda"
              >
                <Edit3 className="w-4 h-4" />
                <span>Editar Horario Tienda</span>
              </button>
            )}

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition border border-emerald-500/30 cursor-pointer"
              title="Descargar informe completo de auditoría a Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Informe a Excel</span>
            </button>

            <button
              onClick={fetchAuditData}
              disabled={loading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700 cursor-pointer"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Control Bar: Selectors & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        
        {/* Selector de PDV con Opción TODOS UNIFICADO */}
        <div className="space-y-1">
          <label className="block font-bold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-indigo-600" />
              <span>Punto de Venta (PDV) *</span>
            </span>
            {isUnified ? (
              <span className="text-[10px] text-emerald-700 font-extrabold bg-emerald-100 px-1.5 py-0.2 rounded">
                UNIFICADO
              </span>
            ) : null}
          </label>
          <select
            value={selectedPdvId}
            onChange={(e) => setSelectedPdvId(e.target.value)}
            className={`w-full border rounded-lg p-2 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer ${
              isUnified ? 'bg-indigo-50 text-indigo-900 border-indigo-300' : 'bg-slate-50 text-slate-800 border-slate-300'
            }`}
          >
            <option value="ALL">🌐 -- TODOS LOS PUNTOS DE VENTA (UNIFICADO) --</option>
            <optgroup label="Tiendas Individuales:">
              {pdvs.map(pdv => (
                <option key={pdv.id} value={pdv.id}>
                  {pdv.code} - {pdv.name} ({pdv.city})
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Selector de Semana */}
        <div className="space-y-1">
          <label className="block font-bold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Semana de Auditoría (Lunes)</span>
          </label>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
          >
            {ALL_WEEKS_2026.map(w => (
              <option key={w.weekStart} value={w.weekStart}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por Zona */}
        <div className="space-y-1">
          <label className="block font-bold text-slate-700 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-amber-600" />
            <span>Filtrar por Zona Regional</span>
          </label>
          <select
            value={selectedSupervisorId}
            onChange={(e) => setSelectedSupervisorId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden cursor-pointer"
          >
            <option value="">-- Todas las Zonas (Nacional) --</option>
            {supervisors.map(sup => (
              <option key={sup.id} value={sup.id}>
                {sup.zoneName || sup.name}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Estado de Auditoría */}
        <div className="space-y-1">
          <label className="block font-bold text-slate-700 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-purple-600" />
            <span>Estado de Auditoría</span>
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-hidden cursor-pointer"
          >
            <option value="ALL">Todos los Registros</option>
            <option value="ALERTAS">⚠️ Solo Alertas y Desfases</option>
            <option value="CONFORME">✅ Conforme con Horario Habitual</option>
            <option value="SOBRETIEMPO_ALTO">🔥 Sobretiempo Alto (≥ 2h)</option>
            <option value="TIEMPO_SUPLEMENTARIO">⏱️ Con Tiempo Suplementario</option>
            <option value="INGRESO_ANTICIPADO">🚪 Ingreso Anticipado (&gt;25m)</option>
            <option value="SALIDA_TARDIA">🌙 Salida Tardía (&gt;30m)</option>
            <option value="DESFASE_DOBLE">🚨 Desfase Doble (Apertura + Cierre)</option>
            <option value="SIN_MARCACION">❌ Sin Marcación Biometría</option>
          </select>
        </div>

      </div>

      {/* Mode Switcher Banner (Unificado vs Individual) */}
      <div className="flex items-center justify-between bg-slate-100/80 p-2 rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600 pl-2">Modo de Auditoría:</span>
          <button
            onClick={() => setSelectedPdvId('ALL')}
            className={`px-3 py-1.5 rounded-lg font-extrabold transition flex items-center gap-1.5 ${
              isUnified ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Comparativa Todos los PDVs (Unificado)</span>
          </button>
          
          <button
            onClick={() => {
              if (isUnified) setSelectedPdvId(pdvs[0]?.id || 'pdv-1');
            }}
            className={`px-3 py-1.5 rounded-lg font-extrabold transition flex items-center gap-1.5 ${
              !isUnified ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Detalle Individual de Tienda</span>
          </button>
        </div>

        {isUnified && auditData?.totals && (
          <span className="text-indigo-800 font-bold text-xs pr-2 hidden sm:inline">
            Auditoría consolidada para <strong>{auditData.totals.totalPdvs} tiendas</strong> y <strong>{auditData.totals.totalEmployees} colaboradores</strong>
          </span>
        )}
      </div>

      {/* KPI Cards: Métricas Clave Consolidadas */}
      {auditData?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <span className="text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              {isUnified ? 'Total Tiendas / PDVs' : 'Horas Habituales'}
            </span>
            <div className="my-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-800">
                {isUnified ? auditData.totals.totalPdvs : auditData.totals.totalHabitualHours}
              </span>
              <span className="text-xs font-semibold text-slate-400">{isUnified ? 'PDVs' : 'hrs'}</span>
            </div>
            <span className="text-[10px] text-slate-500">
              {isUnified ? `${auditData.totals.totalEmployees} colaboradores` : 'Jornada estándar tienda'}
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs flex flex-col justify-between bg-blue-50/20">
            <span className="text-blue-700 font-bold text-[11px] uppercase tracking-wider">Marcación Real</span>
            <div className="my-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-blue-700">{auditData.totals.totalPunchHours}</span>
              <span className="text-xs font-semibold text-blue-500">hrs</span>
            </div>
            <span className="text-[10px] text-blue-600 font-semibold">Biometría registrada</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-xs flex flex-col justify-between bg-purple-50/20">
            <span className="text-purple-700 font-bold text-[11px] uppercase tracking-wider">Tiempos Suplementarios</span>
            <div className="my-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-purple-700">+{auditData.totals.totalSupplementaryHours}</span>
              <span className="text-xs font-semibold text-purple-500">hrs</span>
            </div>
            <span className="text-[10px] text-purple-600 font-semibold">HED + HEN acumuladas</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs flex flex-col justify-between bg-indigo-50/20">
            <span className="text-indigo-700 font-bold text-[11px] uppercase tracking-wider">Recargo Nocturno</span>
            <div className="my-1.5 flex items-baseline gap-1">
              <span className="text-2xl font-black text-indigo-700">{auditData.totals.totalNightSurchargeHours}</span>
              <span className="text-xs font-semibold text-indigo-500">hrs</span>
            </div>
            <span className="text-[10px] text-indigo-600 font-semibold">Turnos 21:00 - 06:00</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs flex flex-col justify-between bg-amber-50/20">
            <span className="text-amber-700 font-bold text-[11px] uppercase tracking-wider">Desfase Entrada/Salida</span>
            <div className="my-1.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-amber-700">
                {auditData.totals.totalEarlyArrivalMin + auditData.totals.totalLateExitMin}
              </span>
              <span className="text-xs font-semibold text-amber-500">min</span>
            </div>
            <span className="text-[10px] text-amber-600 font-semibold">Fuera de horario tienda</span>
          </div>

          <div className={`p-4 rounded-xl border shadow-xs flex flex-col justify-between ${
            auditData.totals.alertCount > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-emerald-50/50 border-emerald-200'
          }`}>
            <span className={`font-bold text-[11px] uppercase tracking-wider ${
              auditData.totals.alertCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              Alertas Auditoría
            </span>
            <div className="my-1.5 flex items-baseline gap-1">
              <span className={`text-2xl font-black ${auditData.totals.alertCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {auditData.totals.alertCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">/ {auditData.totals.totalAuditedShifts}</span>
            </div>
            <span className={`text-[10px] font-bold ${auditData.totals.alertCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {auditData.totals.complianceRate}% Cumplimiento
            </span>
          </div>

        </div>
      )}

      {/* Info Card: Horario Habitual Configurado (Solo en modo individual) */}
      {!isUnified && auditData?.pdv && (
        <div className="bg-white border border-indigo-100 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    {auditData.pdv.name}
                  </h2>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-md">
                    CÓD: {auditData.pdv.code}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">
                    📍 {auditData.pdv.city}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Zona: <strong className="text-slate-700">{auditData.pdv.zoneName || 'Zona Regional'}</strong> | Líder: <strong className="text-slate-700">{auditData.pdv.supervisorName || 'Sin asignar'}</strong>
                </p>
              </div>
            </div>

            <button
              onClick={() => handleOpenEditModal(selectedPdvId)}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Modificar Horarios de esta Tienda</span>
            </button>
          </div>

          {/* Grilla de Días con Horarios Habituales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-4 text-xs">
            {auditData.weekDates?.map(wd => {
              const hab = wd.habitual || {};
              const isSunday = wd.dayKey === 'domingo';
              const isSaturday = wd.dayKey === 'sabado';
              return (
                <div 
                  key={wd.dayKey} 
                  className={`p-3 rounded-xl border transition ${
                    isSunday ? 'bg-purple-50/60 border-purple-200' :
                    isSaturday ? 'bg-blue-50/60 border-blue-200' :
                    'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[11px] mb-1.5">
                    <span className={isSunday ? 'text-purple-800' : isSaturday ? 'text-blue-800' : 'text-slate-800'}>
                      {wd.dayName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{wd.date.slice(5)}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Apertura:</span>
                      <strong className="text-slate-800">{hab.open || '10:00'}</strong>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Cierre:</span>
                      <strong className="text-slate-800">{hab.close || '20:30'}</strong>
                    </div>
                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60 font-semibold">
                      <span className="text-slate-500">Horas Base:</span>
                      <span className="text-indigo-600 font-bold">{hab.standardHours || 9.5}h</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Comparative Chart */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <span>
                {chartViewMode === 'PDVS_COMPARISON' ? 'Comparativo de Puntos de Venta (Ranking de Tiendas)' : 'Gráfico Comparativo: Horario Habitual vs Marcación Real'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isUnified 
                ? 'Análisis comparativo de sobretiempos, horas registradas y cumplimiento entre todos los PDVs.'
                : 'Comparación diaria de horas de tienda y detección de sobretiempos suplementarios.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold flex-wrap">
            {isUnified && (
              <button
                onClick={() => setChartViewMode('PDVS_COMPARISON')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  chartViewMode === 'PDVS_COMPARISON' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 Comparativa por Tienda (PDV)
              </button>
            )}
            <button
              onClick={() => setChartViewMode('DAILY_HOURS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                chartViewMode === 'DAILY_HOURS' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Horas de Operación Diaria
            </button>
            <button
              onClick={() => setChartViewMode('SUPPLEMENTARY')}
              className={`px-3 py-1.5 rounded-lg transition ${
                chartViewMode === 'SUPPLEMENTARY' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tiempos Suplementarios & Recargos
            </button>
            <button
              onClick={() => setChartViewMode('OFFSETS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                chartViewMode === 'OFFSETS' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Desfases Apertura / Cierre
            </button>
          </div>
        </div>

        {/* Chart Rendering */}
        <div className="h-72 sm:h-80 w-full pt-2">
          
          {/* Multi-PDV Comparative Bar Chart */}
          {chartViewMode === 'PDVS_COMPARISON' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditData?.chartPdvsComparison || []} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="code" tick={{ fontSize: 10, fill: '#475569', fontWeight: 700 }} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="h" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="horasHabituales" name="Horas Habituales Base" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="horasMarcadas" name="Horas Marcadas (Biometría)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="horasSuplementarias" name="Tiempos Suplementarios (+)" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartViewMode === 'DAILY_HOURS' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditData?.chartDailyComparison || []} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="h" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="horasHabitualesPersonal" name="Horas Habituales Base" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="horasProgramadas" name="Horas Cronograma" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="horasMarcadas" name="Horas Marcación Real" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="horasSuplementarias" name="Tiempos Suplementarios (+)" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartViewMode === 'SUPPLEMENTARY' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditData?.chartDailyComparison || []} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit="h" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="horasSuplementarias" name="Horas Extras (HED + HEN)" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recargoNocturno" name="Recargo Nocturno (RN)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recargoDominical" name="Recargo Dominical (RD)" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartViewMode === 'OFFSETS' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditData?.chartDailyComparison || []} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit=" min" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="desfaseAperturaMin" name="Minutos Antes de Apertura" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="desfaseCierreMin" name="Minutos Después de Cierre" fill="#e11d48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sub-view Navigation Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1">
        <div className="flex items-center gap-2">
          {isUnified && (
            <button
              onClick={() => setActiveTabSubView('PDVS_SUMMARY')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTabSubView === 'PDVS_SUMMARY'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Resumen Comparativo por Tienda ({filteredPdvsSummary.length} PDVs)</span>
            </button>
          )}

          <button
            onClick={() => setActiveTabSubView('EMPLOYEE_DETAIL')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTabSubView === 'EMPLOYEE_DETAIL' || !isUnified
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Análisis Semanal por Colaborador ({filteredWeeklyRows.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder={activeTabSubView === 'PDVS_SUMMARY' ? 'Buscar PDV o ciudad...' : 'Buscar colaborador o cédula...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* VIEW 1: Tabla Resumen Comparativo de Todos los PDVs */}
      {isUnified && activeTabSubView === 'PDVS_SUMMARY' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
            <div>
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <Store className="w-4 h-4 text-indigo-600" />
                <span>Consolidado de Tiendas (PDVs) - Comparativa de Horarios y Suplementarios</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Haz clic en <strong>"Auditar Tienda"</strong> para acceder al detalle específico o en el icono de lápiz para editar sus horarios habituales.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Código / PDV</th>
                  <th className="py-3 px-3">Ciudad & Zona</th>
                  <th className="py-3 px-3">Horario Tienda</th>
                  <th className="py-3 px-3 text-center">Colab.</th>
                  <th className="py-3 px-3 text-center">H. Habituales</th>
                  <th className="py-3 px-3 text-center">H. Cronograma</th>
                  <th className="py-3 px-3 text-center">H. Biométrico</th>
                  <th className="py-3 px-3 text-center">T. Suplementario</th>
                  <th className="py-3 px-3 text-center">Recargo Noc/Dom</th>
                  <th className="py-3 px-3 text-center">Desfases Tienda</th>
                  <th className="py-3 px-3 text-center">Cumplimiento</th>
                  <th className="py-3 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700 font-medium">
                {filteredPdvsSummary.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400 font-semibold">
                      No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                    </td>
                  </tr>
                ) : (
                  filteredPdvsSummary.map(pdv => (
                    <tr key={pdv.pdvId} className="hover:bg-indigo-50/40 transition">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-extrabold text-indigo-900 text-xs">{pdv.pdvCode}</div>
                        <div className="font-bold text-slate-900">{pdv.pdvName}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{pdv.city}</div>
                        <div className="text-[10px] text-slate-500">{pdv.zoneName}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          {pdv.openingHour} - {pdv.closingHour}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-700">
                        {pdv.totalEmployees}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-800">
                        {pdv.totalHabitualHours}h
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-800">
                        {pdv.totalScheduledHours}h
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700">
                        {pdv.totalPunchHours}h
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {pdv.totalSupplementaryHours > 0 ? (
                          <span className="font-extrabold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md text-xs">
                            +{pdv.totalSupplementaryHours}h
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0.0h</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap text-[11px]">
                        <span className="text-blue-700 font-bold">RN: {pdv.totalNightSurchargeHours}h</span>
                        <span className="text-slate-300 mx-1">|</span>
                        <span className="text-orange-700 font-bold">RD: {pdv.totalSundaySurchargeHours}h</span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap text-[10px]">
                        {pdv.totalEarlyArrivalMin > 0 && (
                          <span className="text-blue-800 font-bold mr-1">🚪 -{pdv.totalEarlyArrivalMin}m</span>
                        )}
                        {pdv.totalLateExitMin > 0 && (
                          <span className="text-rose-800 font-bold">🌙 +{pdv.totalLateExitMin}m</span>
                        )}
                        {pdv.totalEarlyArrivalMin === 0 && pdv.totalLateExitMin === 0 && (
                          <span className="text-slate-400">Sin desfase</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full ${pdv.complianceRate >= 95 ? 'bg-emerald-500' : pdv.complianceRate >= 85 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${pdv.complianceRate}%` }}
                            ></div>
                          </div>
                          <span className="font-extrabold text-xs text-slate-800">{pdv.complianceRate}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedPdvId(pdv.pdvId);
                              setActiveTabSubView('EMPLOYEE_DETAIL');
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition shadow-xs flex items-center gap-1 cursor-pointer"
                            title="Ver análisis semanal detallado de este PDV"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Auditar</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(pdv.pdvId)}
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="Editar horario habitual de esta tienda"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Tabla Análisis Semanal por Colaborador con Desglose Diario Expandible */}
      {(!isUnified || activeTabSubView === 'EMPLOYEE_DETAIL') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3">
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-purple-600" />
                <span>Semana de Auditoría - Análisis Semanal Consolidado por Colaborador</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mostrando {filteredWeeklyRows.length} colaborador(es) auditados para <strong>{auditData?.pdv?.name || (isUnified ? 'Todos los PDVs Unificados' : 'la selección actual')}</strong> (Semana: {weekStart}). Haz clic en <strong>[+]</strong> para ver el desglose diario.
              </p>
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'ALERTAS', label: 'Con Alertas' },
                { id: 'CONFORME', label: 'Conforme' },
                { id: 'SOBRETIEMPO_ALTO_SEMANAL', label: 'Sobretiempo Alto' },
                { id: 'TIEMPO_SUPLEMENTARIO', label: 'Suplementarios' },
                { id: 'DESFASE_SEMANAL', label: 'Desfases' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-extrabold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-2 text-center w-8">Ver</th>
                  {isUnified && <th className="py-3 px-3">Punto de Venta</th>}
                  <th className="py-3 px-3">Colaborador / Cargo</th>
                  <th className="py-3 px-3 text-center">Días Lab. / Prog.</th>
                  <th className="py-3 px-3 text-center">H. Habituales Sem.</th>
                  <th className="py-3 px-3 text-center">H. Cronograma Sem.</th>
                  <th className="py-3 px-3 text-center">H. Marcadas Sem.</th>
                  <th className="py-3 px-3 text-center">Desfases Semanales</th>
                  <th className="py-3 px-3 text-center">Tiempos Suplementarios</th>
                  <th className="py-3 px-3 text-center">Dif. vs Habitual</th>
                  <th className="py-3 px-3 text-center">Estado Semanal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-700 font-medium">
                {filteredWeeklyRows.length === 0 ? (
                  <tr>
                    <td colSpan={isUnified ? 11 : 10} className="py-8 text-center text-slate-400 font-semibold">
                      No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                    </td>
                  </tr>
                ) : (
                  filteredWeeklyRows.map(row => {
                    const isExpanded = !!expandedWeeklyRowIds[row.id];

                    return (
                      <React.Fragment key={row.id}>
                        <tr 
                          className={`hover:bg-slate-50/90 transition ${
                            row.weeklyStatus === 'SOBRETIEMPO_ALTO_SEMANAL' ? 'bg-purple-50/40' :
                            row.weeklyStatus === 'SIN_MARCACIONES' || row.weeklyStatus === 'DESFASE_SEMANAL' ? 'bg-rose-50/40' :
                            row.weeklyStatus === 'TIEMPO_SUPLEMENTARIO' || row.weeklyStatus === 'ALERTAS_PUNTUALES' ? 'bg-amber-50/30' :
                            ''
                          }`}
                        >
                          {/* Expand Button */}
                          <td className="py-3 px-2 text-center">
                            <button
                              onClick={() => toggleExpandWeeklyRow(row.id)}
                              className={`p-1.5 rounded-lg font-black transition flex items-center justify-center cursor-pointer ${
                                isExpanded 
                                  ? 'bg-indigo-600 text-white shadow-xs' 
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                              title={isExpanded ? 'Ocultar desglose diario' : 'Desplegar desglose diario de 7 días'}
                            >
                              {isExpanded ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                          </td>

                          {/* PDV (si es unificado) */}
                          {isUnified && (
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="font-extrabold text-indigo-900">{row.pdvCode}</div>
                              <div className="text-[10px] text-slate-500">{row.pdvName}</div>
                            </td>
                          )}

                          {/* Colaborador */}
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{row.employeeName}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                                row.contractType === 'FIJO' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {row.contractType}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              CC: {row.documentId} | <span className="text-indigo-600 font-semibold">{row.position}</span>
                            </div>
                          </td>

                          {/* Días Trabajados / Programados */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">
                              {row.daysWorked} / {row.daysScheduled}
                            </div>
                            <span className="text-[9px] text-slate-400">días laborados</span>
                          </td>

                          {/* Horas Habituales Semanales */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block border border-indigo-200">
                              {row.habitualHoursWeek}h
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">base tienda</div>
                          </td>

                          {/* Horas Programadas Semanales */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {row.schedHoursWeek}h
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">cronograma</div>
                          </td>

                          {/* Horas Marcadas Semanales */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md inline-block border border-emerald-200">
                              {row.punchHoursWeek}h
                            </div>
                            <div className="text-[9px] text-emerald-700 font-bold mt-0.5">biométrico</div>
                          </td>

                          {/* Desfases Semanales */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {row.earlyArrivalMinWeek > 0 || row.lateExitMinWeek > 0 ? (
                              <div className="space-y-0.5 text-[10px]">
                                {row.earlyArrivalMinWeek > 0 && (
                                  <span className="inline-block font-bold px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded">
                                    🚪 -{row.earlyArrivalMinWeek}m antes
                                  </span>
                                )}
                                {row.lateExitMinWeek > 0 && (
                                  <span className="inline-block font-bold px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded block">
                                    🌙 +{row.lateExitMinWeek}m después
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Sin desfase</span>
                            )}
                          </td>

                          {/* Tiempos Suplementarios Semanales */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {row.suplementarioTotalWeek > 0 || row.rnWeek > 0 || row.rdWeek > 0 ? (
                              <div>
                                <span className="font-black text-purple-700 text-xs bg-purple-100 px-2 py-0.5 rounded-md">
                                  +{row.suplementarioTotalWeek}h
                                </span>
                                <div className="text-[9px] text-slate-500 mt-0.5">
                                  {row.hedWeek > 0 && <span>HED: {row.hedWeek}h </span>}
                                  {row.henWeek > 0 && <span>HEN: {row.henWeek}h </span>}
                                  {row.rnWeek > 0 && <span className="text-blue-600 font-bold">RN: {row.rnWeek}h </span>}
                                  {row.rdWeek > 0 && <span className="text-orange-600 font-bold">RD: {row.rdWeek}h</span>}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">0.0h</span>
                            )}
                          </td>

                          {/* Diferencia vs Habitual Semanal */}
                          <td className="py-3 px-3 text-center whitespace-nowrap font-black">
                            <span className={`${
                              row.diffVsHabitualWeek > 0 ? 'text-purple-700' :
                              row.diffVsHabitualWeek < 0 ? 'text-amber-700' :
                              'text-slate-500'
                            }`}>
                              {row.diffVsHabitualWeek > 0 ? `+${row.diffVsHabitualWeek}h` : `${row.diffVsHabitualWeek}h`}
                            </span>
                          </td>

                          {/* Estado Semanal */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 ${
                              row.weeklyStatus === 'CONFORME' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              row.weeklyStatus === 'SOBRETIEMPO_ALTO_SEMANAL' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                              row.weeklyStatus === 'DESFASE_SEMANAL' || row.weeklyStatus === 'SIN_MARCACIONES' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                              'bg-amber-100 text-amber-800 border border-amber-300'
                            }`} title={row.weeklyNotes}>
                              {row.weeklyStatus === 'CONFORME' && <CheckCircle2 className="w-3 h-3" />}
                              {row.weeklyStatus !== 'CONFORME' && <AlertTriangle className="w-3 h-3" />}
                              <span>{row.weeklyStatus.replace(/_/g, ' ')}</span>
                            </span>
                          </td>
                        </tr>

                        {/* Fila Desplegable con el Detalle Diario de los 7 Días */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-y border-slate-200">
                            <td colSpan={isUnified ? 11 : 10} className="p-4">
                              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-2">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-indigo-600" />
                                    <span className="font-extrabold text-xs text-slate-900">
                                      Desglose Diario de Marcaciones - {row.employeeName} (Semana {row.weekStart})
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    {row.weeklyNotes}
                                  </span>
                                </div>

                                <table className="w-full text-left text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[9px] border-b border-slate-200">
                                      <th className="py-2 px-2">Día & Fecha</th>
                                      <th className="py-2 px-2">Horario Habitual PDV</th>
                                      <th className="py-2 px-2">Cronograma</th>
                                      <th className="py-2 px-2">Marcación Real</th>
                                      <th className="py-2 px-2 text-center">Desfases Tienda</th>
                                      <th className="py-2 px-2 text-center">Suplementarios</th>
                                      <th className="py-2 px-2 text-center">Dif. Habitual</th>
                                      <th className="py-2 px-2 text-center">Estado Diario</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {row.dailyBreakdown?.map(dayRow => (
                                      <tr key={dayRow.id} className="hover:bg-slate-50">
                                        <td className="py-2 px-2 font-bold text-slate-800 whitespace-nowrap">
                                          {dayRow.dayName} <span className="text-slate-400 font-normal">({dayRow.date})</span>
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                            {dayRow.habitualOpen} - {dayRow.habitualClose}
                                          </span>
                                          <span className="text-slate-400 text-[10px] ml-1">({dayRow.habitualHours}h)</span>
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                          {dayRow.isScheduled ? (
                                            <span>{dayRow.schedStart} - {dayRow.schedEnd} ({dayRow.schedNet}h)</span>
                                          ) : (
                                            <span className="text-slate-400 italic">Descanso</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                          {dayRow.hasPunch ? (
                                            <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                              {dayRow.punchIn} - {dayRow.punchOut || 'Sin salida'} ({dayRow.punchNet}h)
                                            </span>
                                          ) : (
                                            <span className="text-rose-600 font-bold">Sin marcación</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-2 text-center whitespace-nowrap">
                                          {dayRow.earlyArrivalMin > 0 && <span className="text-blue-700 font-bold mr-1">-{dayRow.earlyArrivalMin}m</span>}
                                          {dayRow.lateExitMin > 0 && <span className="text-rose-700 font-bold">+{dayRow.lateExitMin}m</span>}
                                          {dayRow.earlyArrivalMin === 0 && dayRow.lateExitMin === 0 && <span className="text-slate-400">-</span>}
                                        </td>
                                        <td className="py-2 px-2 text-center whitespace-nowrap font-bold text-purple-700">
                                          {dayRow.suplementarioTotal > 0 ? `+${dayRow.suplementarioTotal}h` : '0h'}
                                        </td>
                                        <td className="py-2 px-2 text-center whitespace-nowrap font-bold">
                                          <span className={dayRow.diffVsHabitual > 0 ? 'text-purple-700' : dayRow.diffVsHabitual < 0 ? 'text-amber-700' : 'text-slate-500'}>
                                            {dayRow.diffVsHabitual > 0 ? `+${dayRow.diffVsHabitual}h` : `${dayRow.diffVsHabitual}h`}
                                          </span>
                                        </td>
                                        <td className="py-2 px-2 text-center whitespace-nowrap">
                                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                            dayRow.auditStatus === 'CONFORME' ? 'bg-emerald-100 text-emerald-800' :
                                            dayRow.auditStatus === 'SOBRETIEMPO_ALTO' ? 'bg-purple-100 text-purple-800' :
                                            'bg-amber-100 text-amber-800'
                                          }`}>
                                            {dayRow.auditStatus.replace(/_/g, ' ')}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Configurar / Editar Horarios Habituales del PDV */}
      {showEditModal && editFormData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden my-8 text-white">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-900 p-5 border-b border-indigo-800/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/30 border border-indigo-400/40 rounded-xl text-indigo-300">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">
                    Configurar Horarios Habituales del PDV
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Tienda: <strong className="text-white">{editFormData.pdvName}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Message */}
            {saveSuccessMsg && (
              <div className="mx-6 mt-4 p-3 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveHabitualSchedule} className="p-6 space-y-5 text-xs">
              
              {/* Horarios Generales de Referencia */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Apertura Habitual General</label>
                  <input
                    type="time"
                    value={editFormData.openingHour}
                    onChange={(e) => setEditFormData({ ...editFormData, openingHour: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl p-2 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Cierre Habitual General</label>
                  <input
                    type="time"
                    value={editFormData.closingHour}
                    onChange={(e) => setEditFormData({ ...editFormData, closingHour: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl p-2 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Tiempo de Almuerzo (Hrs)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="2"
                    value={editFormData.lunchHours}
                    onChange={(e) => setEditFormData({ ...editFormData, lunchHours: parseFloat(e.target.value) || 1.0 })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl p-2 text-white font-bold"
                  />
                </div>
              </div>

              {/* Parametrización Día por Día */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-200">
                  Parametrización Específica por Día de la Semana (Lunes a Domingo):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {Object.keys(editFormData.dailyConfig || {}).map(dayKey => {
                    const cfg = editFormData.dailyConfig[dayKey];
                    const dayLabels = {
                      lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
                      jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo'
                    };
                    return (
                      <div key={dayKey} className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 space-y-2">
                        <div className="flex items-center justify-between font-bold text-indigo-300">
                          <span>{dayLabels[dayKey]}</span>
                          <span className="text-[10px] text-slate-400">Jornada Comercial</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <label className="text-slate-400 block text-[10px]">Apertura:</label>
                            <input
                              type="time"
                              value={cfg.open}
                              onChange={(e) => updateDailyField(dayKey, 'open', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-white font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-slate-400 block text-[10px]">Cierre:</label>
                            <input
                              type="time"
                              value={cfg.close}
                              onChange={(e) => updateDailyField(dayKey, 'close', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-white font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-slate-400 block text-[10px]">Horas Base:</label>
                            <input
                              type="number"
                              step="0.5"
                              value={cfg.standardHours}
                              onChange={(e) => updateDailyField(dayKey, 'standardHours', parseFloat(e.target.value) || 9.5)}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-white font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Turnos Habituales Autorizados */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-200">
                  Turnos Habituales Autorizados para esta Tienda:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ej: 10:00-20:30 o 11:00-19:00"
                    value={newShiftInput}
                    onChange={(e) => setNewShiftInput(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-semibold"
                  />
                  <button
                    type="button"
                    onClick={handleAddShift}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {editFormData.allowedShifts?.map(s => (
                    <span 
                      key={s} 
                      className="px-2.5 py-1 bg-indigo-900/60 border border-indigo-600/50 rounded-lg text-indigo-200 text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <span>{s}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveShift(s)}
                        className="hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Observaciones de Auditoría */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-300">
                  Observaciones / Normas Especiales de la Tienda
                </label>
                <input
                  type="text"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-xs"
                />
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSchedule ? 'Guardando...' : 'Guardar Horario Habitual'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
