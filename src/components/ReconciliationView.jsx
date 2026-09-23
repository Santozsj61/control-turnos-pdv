import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, BarChart3, Filter, CheckCircle2, AlertTriangle, AlertCircle, Clock, Download, RefreshCw, Eye, Sparkles, UserCheck, ShieldAlert, ArrowUpDown, ChevronRight, ChevronDown, Store, Building2, Edit3, CheckSquare, Square, X, Send, Lock, HelpCircle, Activity, TrendingUp, Calendar, Zap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import { ALL_WEEKS_2026, CURRENT_WEEK_START } from '../utils/weeks.js';
import { api } from '../services/api.js';

export default function ReconciliationView({ currentUser, pdvs, supervisors }) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isEmployee = currentUser?.role === 'EMPLOYEE';
  const isAdminOrSup = isAdmin || isSupervisor || isAuditorVrx;

  const currentSupervisorObj = supervisors.find(s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id));

  // Allowed PDVs based on security scope
  const allowedPdvs = (isAdmin || isHrAdmin || isAuditorVrx)
    ? pdvs
    : isSupervisor
    ? pdvs.filter(p => p.supervisorId === currentSupervisorObj?.id || p.supervisorId === currentUser?.supervisorId)
    : pdvs.filter(p => p.id === currentUser?.pdvId || p.code === currentUser?.pdvId);

  const [weekStart, setWeekStart] = useState(CURRENT_WEEK_START);
  const [selectedPdv, setSelectedPdv] = useState(isEmployee ? (currentUser.pdvId || allowedPdvs[0]?.id) : '');
  const [selectedSupervisor, setSelectedSupervisor] = useState(isSupervisor ? (currentSupervisorObj?.id || '') : '');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('PDV_GROUPED'); // 'PDV_GROUPED' or 'TABLE'
  const [expandedPdvIds, setExpandedPdvIds] = useState({ 'pdv-1': true, 'pdv-3': true });
  
  // Shift Correction Enablement by Admin / Supervisor / Auditor VRX
  const [selectedCorrectionRows, setSelectedCorrectionRows] = useState({});
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [adminCorrectionReason, setAdminCorrectionReason] = useState('Favor revisar y corregir marcación o justificar discrepancia de horario.');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Biometric Integrity & Short Shift (<4h) Detection (Admin / Supervisor / Auditor VRX)
  const [integrityData, setIntegrityData] = useState(null);
  const [showIntegrityDetails, setShowIntegrityDetails] = useState(false);
  const [integrityFilter, setIntegrityFilter] = useState('ALL'); // 'ALL', 'MISSING_EXIT', 'SHORT_SHIFT'

  // Monthly Reconciliation Dashboard (Cronograma Semanal vs Marcaciones Subidas)
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [monthlyDashboardData, setMonthlyDashboardData] = useState(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [reconciliationViewTab, setReconciliationViewTab] = useState('DASHBOARD'); // 'DASHBOARD' | 'DETALLE'

  // Month-over-Month Comparison for PDV
  const [weeklyComparisonData, setWeeklyComparisonData] = useState(null);

  // Justificación de Tiempos Suplementarios del PDV (Enviada a Jefe de Zona)
  const [showJustifyModal, setShowJustifyModal] = useState(false);
  const [justificationReasonCategory, setJustificationReasonCategory] = useState('Evento Comercial / Alta Demanda');
  const [justificationDetailedReason, setJustificationDetailedReason] = useState('');
  const [submittingJustification, setSubmittingJustification] = useState(false);
  const [justificationMsg, setJustificationMsg] = useState(null);
  const [existingJustifications, setExistingJustifications] = useState([]);

  const [reconciliationData, setReconciliationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [selectedRowDetail, setSelectedRowDetail] = useState(null);

  async function fetchReconciliation() {
    setLoading(true);
    try {
      let targetPdvId = null;
      let targetSupId = null;
      if (isEmployee) {
        targetPdvId = currentUser.pdvId;
      } else if (isSupervisor) {
        targetSupId = currentSupervisorObj?.id;
        if (selectedPdv) targetPdvId = selectedPdv;
      } else if (isAdmin || isHrAdmin || isAuditorVrx) {
        if (selectedPdv) targetPdvId = selectedPdv;
        if (selectedSupervisor) targetSupId = selectedSupervisor;
      }
      
      const data = await api.getReconciliation({
        weekStart,
        pdvId: targetPdvId,
        supervisorId: targetSupId
      });
      if (data) {
        setReconciliationData(data);
      }

      // Fetch integrity data for Admin / Supervisor / Auditor VRX
      if (isAdmin || isSupervisor || isAuditorVrx) {
        const integData = await api.getReconciliationIntegrity({
          weekStart,
          pdvId: targetPdvId,
          supervisorId: targetSupId
        });
        if (integData) {
          setIntegrityData(integData);
        }
      }

      // Fetch weekly comparison for PDV
      if (isEmployee) {
        const dashData = await api.getDashboardAnalytics({ pdvId: currentUser.pdvId });
        if (dashData?.weeklyComparison) {
          setWeeklyComparisonData(dashData.weeklyComparison);
        }
      }
    } catch (err) {
      console.error('Error fetching reconciliation:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMonthlyDashboard() {
    const targetPdvId = isEmployee ? (currentUser.pdvId || allowedPdvs[0]?.id) : (selectedPdv || allowedPdvs[0]?.id || 'pdv-1');
    if (!targetPdvId) return;
    setLoadingMonthly(true);
    try {
      const data = await api.getMonthlyReconciliationDashboard({ pdvId: targetPdvId, month: selectedMonth });
      if (data) {
        setMonthlyDashboardData(data);
      }
    } catch (err) {
      console.error('Error fetching monthly dashboard:', err);
    } finally {
      setLoadingMonthly(false);
    }
  }

  async function fetchJustifications() {
    try {
      const activePdvId = isEmployee ? (currentUser.pdvId || allowedPdvs[0]?.id) : selectedPdv;
      const data = await api.getSupplementaryJustifications({
        pdvId: activePdvId,
        weekStart
      });
      if (Array.isArray(data)) {
        setExistingJustifications(data);
      }
    } catch (e) {
      console.error('Error fetching supplementary justifications:', e);
    }
  }

  async function handleSaveJustification(e) {
    e.preventDefault();
    if (!justificationDetailedReason.trim()) {
      setJustificationMsg({ type: 'error', text: 'Por favor ingresa la sustentación detallada del incremento de tiempos suplementarios.' });
      return;
    }

    const currentPdvObj = allowedPdvs.find(p => p.id === (isEmployee ? currentUser.pdvId : selectedPdv)) || allowedPdvs[0];
    const targetSupervisorId = currentPdvObj?.supervisorId || (isSupervisor ? currentSupervisorObj?.id : 'zone-1');
    const totalSuppHours = monthlyDashboardData?.kpis?.overtimeRealHours || stats?.totalHoursDifference || 0;

    setSubmittingJustification(true);
    setJustificationMsg(null);
    try {
      await api.saveSupplementaryJustification({
        pdvId: currentPdvObj?.id || currentUser.pdvId || 'pdv-1',
        pdvName: currentPdvObj?.name || 'PDV',
        weekStart,
        month: selectedMonth,
        reasonCategory: justificationReasonCategory,
        detailedReason: justificationDetailedReason,
        createdBy: currentUser.fullName || 'ADMINISTRADOR PDV',
        supervisorId: targetSupervisorId,
        totalSupplementaryHours: totalSuppHours
      });

      setJustificationMsg({ type: 'success', text: 'Justificación radicada exitosamente ante el Líder de Zona.' });
      setJustificationDetailedReason('');
      fetchJustifications();
      setTimeout(() => {
        setShowJustifyModal(false);
        setJustificationMsg(null);
      }, 2000);
    } catch (err) {
      setJustificationMsg({ type: 'error', text: err.message || 'Error al enviar justificación al Jefe de Zona.' });
    } finally {
      setSubmittingJustification(false);
    }
  }

  useEffect(() => {
    if (isEmployee) {
      setSelectedPdv(currentUser.pdvId || allowedPdvs[0]?.id || '');
    } else if (isSupervisor) {
      setSelectedSupervisor(currentSupervisorObj?.id || '');
    }
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    fetchReconciliation();
    fetchJustifications();
  }, [weekStart, selectedPdv, selectedSupervisor, currentUser?.id]);

  useEffect(() => {
    fetchMonthlyDashboard();
  }, [selectedMonth, selectedPdv, currentUser?.id, currentUser?.pdvId]);

  // Handle file upload (Exclusive for Admin, Talento Humano & Auditor VRX)
  async function handleFileUpload(e) {
    if (!isAdmin && !isHrAdmin && !isAuditorVrx) {
      setUploadMsg({ type: 'error', text: 'Acceso Denegado: Solo el perfil Administrador, Talento Humano o Auditor VRX puede cargar marcaciones.' });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await api.uploadPunchFile(file);
      setUploadMsg({ type: 'success', text: `Archivo cargado exitosamente: ${res.recordCount} marcaciones registradas.` });
      fetchReconciliation();
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.message || 'Error de conexión durante la carga' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  // Load image demo punches button (Exclusive for Admin, Talento Humano & Auditor VRX)
  async function handleLoadSampleData() {
    if (!isAdmin && !isHrAdmin && !isAuditorVrx) {
      setUploadMsg({ type: 'error', text: 'Acceso Denegado: Solo el Administrador, Talento Humano o Auditor VRX puede cargar datos de prueba.' });
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await api.generateSamplePunches({ weekStart });
      setUploadMsg({ type: 'success', text: `Datos de prueba cargados con éxito: ${res.recordCount} marcaciones generadas.` });
      fetchReconciliation();
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.message || 'Error al cargar datos de muestra' });
    } finally {
      setUploading(false);
    }
  }

  // Export results to Excel
  function exportToExcel() {
    if (!reconciliationData?.rows) return;
    const exportRows = reconciliationData.rows.map(r => ({
      'Colaborador': r.fullName,
      'Documento de Identidad': r.documentId,
      'Cargo': r.position,
      'Punto de Venta': r.pdvName,
      'Supervisor / Jefe Directo': r.supervisorName,
      'Fecha': r.date,
      'Día': r.dayName,
      'Programado Entrada': r.scheduledStart || 'Descanso',
      'Programado Salida': r.scheduledEnd || 'Descanso',
      'Horas Netas Programadas': r.scheduledNetHours,
      'Almuerzo Programado': r.scheduledLunchHours > 0 ? '1:30' : '0:00',
      'Marcación Real Entrada': r.realStart || 'Sin Marcación',
      'Marcación Real Salida': r.realEnd || 'Sin Marcación',
      'Horas Netas Reales': r.realNetHours,
      'Almuerzo Real Aplicado': r.realLunchHours > 0 ? '1:30' : '0:00',
      'Diferencia Entrada (Min)': r.entryDiffMinutes,
      'Diferencia Salida (Min)': r.exitDiffMinutes,
      'Diferencia Horas Netas': r.hoursDiff,
      'Estado Conciliación': r.statusLabel,
      'Permiso Autorizado': r.hasPermission ? 'SÍ (' + r.permissionNote + ')' : 'NO',
      'Novedades / Discrepancias': r.issues.join(' | ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliacion_Horarios');
    XLSX.writeFile(wb, `Conciliacion_Marcaciones_${weekStart}.xlsx`);
  }

  function toggleSelectRow(rowId) {
    setSelectedCorrectionRows(prev => {
      const next = { ...prev };
      if (next[rowId]) delete next[rowId];
      else next[rowId] = true;
      return next;
    });
  }

  function selectAllDiscrepancies() {
    const next = {};
    filteredRows.forEach(r => {
      if (r.status !== 'OK_MATCH' && r.status !== 'DAY_OFF') {
        next[r.id] = true;
      }
    });
    setSelectedCorrectionRows(next);
  }

  function clearRowSelection() {
    setSelectedCorrectionRows({});
  }

  async function handleSendCorrectionRequests() {
    const selectedIds = Object.keys(selectedCorrectionRows);
    if (selectedIds.length === 0) return;

    const corrections = selectedIds.map(id => {
      const row = rows.find(r => r.id === id);
      return {
        userId: row.userId,
        date: row.date,
        reason: adminCorrectionReason
      };
    });

    setSubmittingCorrection(true);
    try {
      const res = await api.requestCorrections({
        weekStart,
        corrections,
        adminNotes: adminCorrectionReason,
        requestedBy: currentUser?.fullName || 'ADMINISTRACIÓN'
      });
      setUploadMsg({ type: 'success', text: res.message });
      setShowCorrectionModal(false);
      setSelectedCorrectionRows({});
      fetchReconciliation();
    } catch (err) {
      setUploadMsg({ type: 'error', text: 'Error al enviar solicitudes de corrección' });
    } finally {
      setSubmittingCorrection(false);
    }
  }

  async function handleCancelCorrection(row) {
    try {
      const res = await api.cancelCorrection({
        userId: row.userId,
        weekStart,
        date: row.date
      });
      setUploadMsg({ type: 'success', text: res.message || 'Corrección cancelada.' });
      fetchReconciliation();
    } catch (err) {
      console.error(err);
    }
  }

  const rows = reconciliationData?.rows || [];
  const stats = reconciliationData?.stats || {
    totalRows: 0,
    exactMatches: 0,
    lateArrivals: 0,
    earlyDepartures: 0,
    absences: 0,
    unscheduledPunches: 0,
    permissionsApproved: 0,
    totalScheduledHours: 0,
    totalRealHours: 0,
    totalHoursDifference: 0
  };

  const filteredRows = rows.filter(r => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'DISCREPANCIES' && r.status === 'OK_MATCH') return false;
      if (statusFilter === 'LATE' && r.status !== 'LATE_ARRIVAL') return false;
      if (statusFilter === 'EARLY' && r.status !== 'EARLY_DEPARTURE') return false;
      if (statusFilter === 'ABSENT' && r.status !== 'ABSENT') return false;
      if (statusFilter === 'MATCH' && r.status !== 'OK_MATCH') return false;
      if (statusFilter === 'PERMISSION' && !r.hasPermission) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = r.fullName.toLowerCase().includes(q);
      const matchDoc = r.documentId.includes(q);
      const matchPdv = r.pdvName.toLowerCase().includes(q);
      if (!matchName && !matchDoc && !matchPdv) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner with File Upload & Actions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              Módulo de Conciliación y Comparativa
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">
            Cruce: Cronograma Programado vs. Marcaciones Biométricas
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Compara los turnos oficiales aprobados con las marcaciones reales del reloj checador / Excel para identificar tardanzas, salidas anticipadas y horas reales laboradas.
          </p>
        </div>

        {/* Upload & Export Actions based on Security Role */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {(isAdmin || isHrAdmin) ? (
            <>
              {/* Direct Sample Generator (Matches user's image) */}
              <button
                onClick={handleLoadSampleData}
                disabled={uploading}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md"
                title="Carga directa de los 8 registros exactos del Excel adjunto"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Cargar Marcaciones de la Imagen</span>
              </button>

              {/* File Upload Input */}
              <label className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer transition shadow-xs" title="Cargar archivo Excel con las marcaciones semanales">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>{uploading ? 'Procesando...' : 'Subir Archivo Excel'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={uploading}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </>
          ) : isSupervisor ? (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
              <span>👔 Vista de Zona:</span>
              <span className="font-extrabold">{currentSupervisorObj?.name}</span>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-300 text-blue-900 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
              <span>🏬 Consulta PDV:</span>
              <span className="font-extrabold">{allowedPdvs[0]?.name}</span>
            </div>
          )}

          {/* Botón de Justificación de Tiempos Suplementarios para PDV / Jefatura */}
          <button
            onClick={() => { setShowJustifyModal(true); setJustificationMsg(null); }}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition shadow-md cursor-pointer"
            title="Justificar formalmente el incremento de tiempos suplementarios del PDV y remitir a Jefatura de Zona"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-200" />
            <span>Justificar Tiempos Suplementarios del PDV</span>
            {existingJustifications.length > 0 && (
              <span className="bg-black/20 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                {existingJustifications.length}
              </span>
            )}
          </button>

          {/* Export to Excel (Exclusive for Admin / HR / Auditor VRX, hidden for Supervisor and PDV) */}
          {(isAdmin || isHrAdmin || isAuditorVrx) && !isSupervisor && !isEmployee && (
            <button
              onClick={exportToExcel}
              className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow-xs"
              title="Exportar reporte comparativo a Excel"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload Status Message */}
      {uploadMsg && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold ${
          uploadMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {uploadMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{uploadMsg.text}</span>
          </div>
          <button onClick={() => setUploadMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MÓDULO DASHBOARD COMPARATIVO MENSUAL (CRONOGRAMA VS MARCACIONES) */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-100 text-indigo-800 text-xs font-extrabold px-3 py-0.5 rounded-full flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Dashboard Comparativo Mensual
              </span>
              <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                Tiempo Suplementario
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-1">
              Cronograma Semanal vs. Marcaciones Biométricas Subidas
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparación mensual de Horas Extras, Recargo Nocturno, Dominicales y Festivos para <strong>{monthlyDashboardData?.pdv?.name || 'Punto de Venta'}</strong> ({monthlyDashboardData?.monthLabel || selectedMonth}).
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Month Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-500 ml-1" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer"
              >
                <option value="2026-09">Septiembre 2026 (Actual)</option>
                <option value="2026-08">Agosto 2026 (Anterior)</option>
                <option value="2026-07">Julio 2026</option>
                <option value="2026-10">Octubre 2026</option>
              </select>
            </div>

            {/* PDV Selector for Admins / Supervisors */}
            {(!isEmployee && allowedPdvs.length > 1) && (
              <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <Store className="w-4 h-4 text-slate-500 ml-1" />
                <select
                  value={selectedPdv}
                  onChange={(e) => setSelectedPdv(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer max-w-xs"
                >
                  {allowedPdvs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {loadingMonthly ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="animate-spin w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            Calculando métricas y gráficos comparativos...
          </div>
        ) : monthlyDashboardData && (
          <div className="space-y-6">
            {/* 4 KPI Comparative Parameter Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Horas Extras */}
              <div className="bg-gradient-to-br from-blue-50/70 to-white p-4 rounded-2xl border border-blue-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Horas Extras (HE)
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    monthlyDashboardData.diffTotals.overtime > 0
                      ? 'bg-amber-100 text-amber-800'
                      : monthlyDashboardData.diffTotals.overtime < 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    Δ {monthlyDashboardData.diffTotals.overtime > 0 ? `+${monthlyDashboardData.diffTotals.overtime}` : monthlyDashboardData.diffTotals.overtime}h
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-blue-100/70 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">📅 Cronograma</div>
                    <div className="text-base font-black text-blue-800">{monthlyDashboardData.scheduledTotals.overtime}h</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">⏰ Marcaciones</div>
                    <div className="text-base font-black text-slate-800">{monthlyDashboardData.punchTotals.overtime}h</div>
                  </div>
                </div>
              </div>

              {/* 2. Recargo Nocturno */}
              <div className="bg-gradient-to-br from-purple-50/70 to-white p-4 rounded-2xl border border-purple-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span> Recargo Nocturno (RN)
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    monthlyDashboardData.diffTotals.night > 0
                      ? 'bg-amber-100 text-amber-800'
                      : monthlyDashboardData.diffTotals.night < 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    Δ {monthlyDashboardData.diffTotals.night > 0 ? `+${monthlyDashboardData.diffTotals.night}` : monthlyDashboardData.diffTotals.night}h
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-100/70 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">📅 Cronograma</div>
                    <div className="text-base font-black text-purple-800">{monthlyDashboardData.scheduledTotals.night}h</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">⏰ Marcaciones</div>
                    <div className="text-base font-black text-slate-800">{monthlyDashboardData.punchTotals.night}h</div>
                  </div>
                </div>
              </div>

              {/* 3. Dominicales */}
              <div className="bg-gradient-to-br from-emerald-50/70 to-white p-4 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Dominicales (DOM)
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    monthlyDashboardData.diffTotals.sunday > 0
                      ? 'bg-amber-100 text-amber-800'
                      : monthlyDashboardData.diffTotals.sunday < 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    Δ {monthlyDashboardData.diffTotals.sunday > 0 ? `+${monthlyDashboardData.diffTotals.sunday}` : monthlyDashboardData.diffTotals.sunday}h
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-100/70 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">📅 Cronograma</div>
                    <div className="text-base font-black text-emerald-800">{monthlyDashboardData.scheduledTotals.sunday}h</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">⏰ Marcaciones</div>
                    <div className="text-base font-black text-slate-800">{monthlyDashboardData.punchTotals.sunday}h</div>
                  </div>
                </div>
              </div>

              {/* 4. Festivos */}
              <div className="bg-gradient-to-br from-amber-50/70 to-white p-4 rounded-2xl border border-amber-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span> Festivos (FEST)
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    monthlyDashboardData.diffTotals.holiday > 0
                      ? 'bg-amber-100 text-amber-800'
                      : monthlyDashboardData.diffTotals.holiday < 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    Δ {monthlyDashboardData.diffTotals.holiday > 0 ? `+${monthlyDashboardData.diffTotals.holiday}` : monthlyDashboardData.diffTotals.holiday}h
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-100/70 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">📅 Cronograma</div>
                    <div className="text-base font-black text-amber-800">{monthlyDashboardData.scheduledTotals.holiday}h</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">⏰ Marcaciones</div>
                    <div className="text-base font-black text-slate-800">{monthlyDashboardData.punchTotals.holiday}h</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2 Gráficos con los Mismos Parámetros (Side-by-Side en Grid de 2 Columnas) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfico 1: Base Cronograma Semanal */}
              <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Gráfico 1: Base Cronograma Semanal
                      </h4>
                      <p className="text-[10px] text-slate-500">Horas suplementarias proyectadas en turnos oficiales</p>
                    </div>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[11px] font-black px-2.5 py-1 rounded-lg">
                    Total: {monthlyDashboardData.scheduledTotals.totalSpecial} hrs
                  </span>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyDashboardData.chartScheduledData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} fontWeight={700} />
                      <YAxis stroke="#64748b" fontSize={10} unit="h" />
                      <Tooltip
                        formatter={(val, name, item) => [`${val} Horas (${monthlyDashboardData.scheduledTotals.totalSpecial > 0 ? ((val / monthlyDashboardData.scheduledTotals.totalSpecial) * 100).toFixed(1) : 0}%)`, item.payload.name]}
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="horas" radius={[6, 6, 0, 0]}>
                        {monthlyDashboardData.chartScheduledData.map((entry, index) => (
                          <Cell key={`cell-sched-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Parameters Pill Legend */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <span>HE: <strong>{monthlyDashboardData.scheduledTotals.overtime}h</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span>RN: <strong>{monthlyDashboardData.scheduledTotals.night}h</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                    <span>DOM: <strong>{monthlyDashboardData.scheduledTotals.sunday}h</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                    <span>FEST: <strong>{monthlyDashboardData.scheduledTotals.holiday}h</strong></span>
                  </div>
                </div>
              </div>

              {/* Gráfico 2: Base Marcaciones Subidas */}
              <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Gráfico 2: Base Marcaciones Subidas
                      </h4>
                      <p className="text-[10px] text-slate-500">Horas suplementarias reales registradas en reloj checador</p>
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[11px] font-black px-2.5 py-1 rounded-lg">
                    Total: {monthlyDashboardData.punchTotals.totalSpecial} hrs
                  </span>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyDashboardData.chartPunchesData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} fontWeight={700} />
                      <YAxis stroke="#64748b" fontSize={10} unit="h" />
                      <Tooltip
                        formatter={(val, name, item) => [`${val} Horas (${monthlyDashboardData.punchTotals.totalSpecial > 0 ? ((val / monthlyDashboardData.punchTotals.totalSpecial) * 100).toFixed(1) : 0}%)`, item.payload.name]}
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="horas" radius={[6, 6, 0, 0]}>
                        {monthlyDashboardData.chartPunchesData.map((entry, index) => (
                          <Cell key={`cell-punch-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Parameters Pill Legend */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <span>HE: <strong>{monthlyDashboardData.punchTotals.overtime}h</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span>RN: <strong>{monthlyDashboardData.punchTotals.night}h</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                    <span>DOM: <strong>{monthlyDashboardData.punchTotals.sunday}h</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                    <span>FEST: <strong>{monthlyDashboardData.punchTotals.holiday}h</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico 3: Comparativa Directa Agrupada */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Comparativa Lado a Lado: Cronograma vs. Marcaciones Reales ({monthlyDashboardData.monthLabel})
                  </h4>
                </div>
                <span className="text-[11px] text-slate-500 font-semibold">
                  Variación Total: <strong className={monthlyDashboardData.diffTotals.totalSpecial > 0 ? 'text-amber-600' : 'text-emerald-600'}>{monthlyDashboardData.diffTotals.totalSpecial > 0 ? `+${monthlyDashboardData.diffTotals.totalSpecial}` : monthlyDashboardData.diffTotals.totalSpecial} hrs</strong>
                </span>
              </div>

              <div className="h-60 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyDashboardData.chartComparisonData} margin={{ top: 10, right: 30, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="parameter" stroke="#64748b" fontSize={11} fontWeight={700} />
                    <YAxis stroke="#64748b" fontSize={11} unit="h" />
                    <Tooltip
                      formatter={(val, name) => [`${val} Horas`, name === 'cronograma' ? '📅 Cronograma Semanal' : '⏰ Marcaciones Subidas']}
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '10px', color: '#fff', fontSize: '11px', border: 'none' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend
                      formatter={(val) => val === 'cronograma' ? '📅 Base Cronograma Semanal' : '⏰ Base Marcaciones Subidas'}
                      wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                    />
                    <Bar dataKey="cronograma" name="cronograma" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="marcaciones" name="marcaciones" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabla de Detalle Comparativo Mensual por Colaborador */}
            {monthlyDashboardData.employees && monthlyDashboardData.employees.length > 0 && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
                  <span className="text-xs font-black tracking-wide uppercase flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-400" />
                    Detalle Comparativo por Colaborador del PDV ({monthlyDashboardData.monthLabel})
                  </span>
                  <span className="text-[11px] text-slate-300 font-semibold">
                    {monthlyDashboardData.employees.length} colaboradores
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                        <th className="py-2.5 px-3">Colaborador</th>
                        <th className="py-2.5 px-2 text-center">Tipo</th>
                        <th className="py-2.5 px-2 text-center">HE (Prog / Real)</th>
                        <th className="py-2.5 px-2 text-center">RN (Prog / Real)</th>
                        <th className="py-2.5 px-2 text-center">DOM (Prog / Real)</th>
                        <th className="py-2.5 px-2 text-center">FEST (Prog / Real)</th>
                        <th className="py-2.5 px-3 text-center">Total Suplementario</th>
                        <th className="py-2.5 px-3 text-center">Variación Δ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {monthlyDashboardData.employees.map(emp => {
                        const isFijo = emp.contractType === 'FIJO';
                        return (
                          <tr key={emp.userId} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              <div>{emp.fullName}</div>
                              <div className="text-[10px] text-slate-500 font-normal">CC: {emp.documentId} • {emp.position}</div>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                isFijo ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {isFijo ? 'Fijo' : 'Temporal'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-700 font-semibold">
                              <span className="text-blue-700">{emp.scheduled.overtime}h</span> / <span className="text-slate-800">{emp.punches.overtime}h</span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-700 font-semibold">
                              <span className="text-purple-700">{emp.scheduled.night}h</span> / <span className="text-slate-800">{emp.punches.night}h</span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-700 font-semibold">
                              <span className="text-emerald-700">{emp.scheduled.sunday}h</span> / <span className="text-slate-800">{emp.punches.sunday}h</span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-slate-700 font-semibold">
                              <span className="text-amber-700">{emp.scheduled.holiday}h</span> / <span className="text-slate-800">{emp.punches.holiday}h</span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-black text-slate-900">
                              <span className="text-blue-800">{emp.scheduled.totalSpecial}h</span> vs <span className="text-emerald-800">{emp.punches.totalSpecial}h</span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-black">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${
                                emp.diff.totalSpecial > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : emp.diff.totalSpecial < 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {emp.diff.totalSpecial > 0 ? `+${emp.diff.totalSpecial}` : emp.diff.totalSpecial}h
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Biometric Integrity & Short Shift Detection Module */}
      {isAdminOrSup && integrityData && (integrityData.incompleteCount > 0 || integrityData.shortShiftCount > 0) && (
        <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-white rounded-2xl p-5 border border-rose-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Auditoría de Integridad Biométrica & Jornadas Cortas</h3>
                  <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {integrityData.incompleteCount + integrityData.shortShiftCount} Inconsistencias
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Detección automática de marcaciones sin salida y jornadas inferiores a 4.0 horas laborales.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowIntegrityDetails(!showIntegrityDetails)}
                className="bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-xs flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{showIntegrityDetails ? 'Ocultar Auditoría' : 'Revisar Inconsistencias'}</span>
              </button>
            </div>
          </div>

          {/* Quick Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => { setShowIntegrityDetails(true); setIntegrityFilter('MISSING_EXIT'); }}
              className={`cursor-pointer p-3.5 rounded-xl border transition flex items-center justify-between ${
                integrityFilter === 'MISSING_EXIT' && showIntegrityDetails ? 'bg-rose-100/80 border-rose-400' : 'bg-white/80 border-rose-200 hover:bg-rose-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full bg-rose-600 animate-ping"></div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Marcaciones Incompletas (Sin Salida)</div>
                  <div className="text-[11px] text-slate-500">Ingreso registrado sin salida en reloj biométrico</div>
                </div>
              </div>
              <span className="text-lg font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                {integrityData.incompleteCount}
              </span>
            </div>

            <div
              onClick={() => { setShowIntegrityDetails(true); setIntegrityFilter('SHORT_SHIFT'); }}
              className={`cursor-pointer p-3.5 rounded-xl border transition flex items-center justify-between ${
                integrityFilter === 'SHORT_SHIFT' && showIntegrityDetails ? 'bg-amber-100/80 border-amber-400' : 'bg-white/80 border-amber-200 hover:bg-amber-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Alerta de Jornadas Cortas (&lt; 4h)</div>
                  <div className="text-[11px] text-slate-500">Tiempo laborado menor al mínimo legal estimado</div>
                </div>
              </div>
              <span className="text-lg font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                {integrityData.shortShiftCount}
              </span>
            </div>
          </div>

          {/* Detailed Inconsistencies List */}
          {showIntegrityDetails && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Filtrar registros:</span>
                  <button
                    onClick={() => setIntegrityFilter('ALL')}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${integrityFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Todos ({integrityData.incompleteCount + integrityData.shortShiftCount})
                  </button>
                  <button
                    onClick={() => setIntegrityFilter('MISSING_EXIT')}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${integrityFilter === 'MISSING_EXIT' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'}`}
                  >
                    Sin Salida ({integrityData.incompleteCount})
                  </button>
                  <button
                    onClick={() => setIntegrityFilter('SHORT_SHIFT')}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${integrityFilter === 'SHORT_SHIFT' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'}`}
                  >
                    Jornada &lt;4h ({integrityData.shortShiftCount})
                  </button>
                </div>
                <button
                  onClick={() => setShowIntegrityDetails(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                >
                  Cerrar Tabla
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Colaborador / CC</th>
                      <th className="py-2.5 px-3">Punto de Venta</th>
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-3">Ingreso Real</th>
                      <th className="py-2.5 px-3">Salida Real</th>
                      <th className="py-2.5 px-3">Horas Netas</th>
                      <th className="py-2.5 px-3">Tipo de Novedad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ...(integrityFilter !== 'SHORT_SHIFT' ? integrityData.incompleteList : []),
                      ...(integrityFilter !== 'MISSING_EXIT' ? integrityData.shortShiftList : [])
                    ].map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.employeeName}</div>
                          <div className="text-[10px] text-slate-400">CC: {item.documentId}</div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">{item.pdvName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{item.entryDate}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700 font-bold">{item.entryTime || '-'}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {item.exitTime ? (
                            <span className="text-slate-800 font-bold">{item.exitTime}</span>
                          ) : (
                            <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded text-[11px]">Falta Salida</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {item.netHours ? `${item.netHours}h` : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.type === 'MISSING_EXIT' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Evaluados</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalRows} turnos</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Semana {weekStart}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Cumplimiento</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{stats.exactMatches}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Conforme a programación</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Llegadas Tarde</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{stats.lateArrivals}</div>
          <div className="text-[10px] text-amber-600 font-medium mt-0.5">&gt; 10 min de retraso</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">Salidas Anticipadas</div>
          <div className="text-2xl font-black text-orange-600 mt-1">{stats.earlyDepartures}</div>
          <div className="text-[10px] text-orange-600 font-medium mt-0.5">Antes del horario</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Ausencias</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{stats.absences}</div>
          <div className="text-[10px] text-rose-600 font-medium mt-0.5">Sin marcación</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Balance Horas</div>
          <div className="text-xl font-black text-blue-700 mt-1">
            {stats.totalRealHours}h <span className="text-xs text-slate-400 font-normal">/ {stats.totalScheduledHours}h</span>
          </div>
          <div className="text-[10px] text-blue-600 font-bold mt-0.5">
            Dif: {stats.totalHoursDifference > 0 ? `+${stats.totalHoursDifference}h` : `${stats.totalHoursDifference}h`}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Week */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase">Semana</label>
            <select
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 max-w-[280px]"
            >
              {ALL_WEEKS_2026.map(w => (
                <option key={w.weekStart} value={w.weekStart}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          {/* PDV Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase">Punto de Venta</label>
            {isEmployee ? (
              <div className="bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-slate-500" />
                <span>{allowedPdvs[0]?.name || 'Mi PDV'}</span>
              </div>
            ) : (
              <select
                value={selectedPdv}
                onChange={(e) => setSelectedPdv(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {isAdmin ? `Todos los PDVs (${pdvs.length})` : `Mis PDVs Asignados (${allowedPdvs.length})`}
                </option>
                {allowedPdvs.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.city})</option>
                ))}
              </select>
            )}
          </div>

          {/* Supervisor Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase">Jefe Directo</label>
            {!isAdmin ? (
              <div className="bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-slate-500" />
                <span>
                  {isSupervisor
                    ? currentSupervisorObj?.name
                    : supervisors.find(s => s.id === allowedPdvs[0]?.supervisorId)?.name || 'Asignado'}
                </span>
              </div>
            ) : (
              <select
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos los Líderes ({supervisors.length})</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Search & Status Badges */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <input
            type="text"
            placeholder="Buscar por colaborador, cédula o PDV..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 min-w-56"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
          >
            <option value="ALL">Mostrar Todos ({rows.length})</option>
            <option value="DISCREPANCIES">Solo Discrepancias / Novedades</option>
            <option value="LATE">Solo Llegadas Tarde</option>
            <option value="EARLY">Solo Salidas Anticipadas</option>
            <option value="ABSENT">Solo Ausencias</option>
            <option value="MATCH">Solo Cumplimiento Exacto</option>
            <option value="PERMISSION">Solo con Permiso Aprobado</option>
          </select>
        </div>
      </div>

      {/* Admin Shift Correction Enablement Toolbar */}
      {isAdminOrSup && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-blue-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
                <span>Auditoría: Habilitar Corrección de Marcaciones / Turnos al PDV</span>
                {Object.keys(selectedCorrectionRows).length > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                    {Object.keys(selectedCorrectionRows).length} seleccionados
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Selecciona las marcaciones o turnos que presenten novedades para habilitar que el PDV edite <strong>únicamente</strong> esos días específicos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={selectAllDiscrepancies}
              className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-xl transition shadow-xs"
            >
              Seleccionar Todas las Novedades
            </button>
            {Object.keys(selectedCorrectionRows).length > 0 && (
              <button
                onClick={clearRowSelection}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-2"
              >
                Limpiar
              </button>
            )}
            <button
              disabled={Object.keys(selectedCorrectionRows).length === 0}
              onClick={() => setShowCorrectionModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span>Habilitar Edición al PDV ({Object.keys(selectedCorrectionRows).length})</span>
            </button>
          </div>
        </div>
      )}

      {/* View Mode Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('PDV_GROUPED')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              viewMode === 'PDV_GROUPED'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Vista Agrupada por Punto de Venta (PDV)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${viewMode === 'PDV_GROUPED' ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-700'}`}>
              {reconciliationData?.pdvSummaries?.length || 0} PDVs
            </span>
          </button>

          <button
            onClick={() => setViewMode('TABLE')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              viewMode === 'TABLE'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Vista Lista Plana ({filteredRows.length} filas)</span>
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline-block">
          Semana {weekStart} • Cruce Biométrico
        </span>
      </div>

      {/* 1. PDV GROUPED VIEW (Hero Experience) */}
      {viewMode === 'PDV_GROUPED' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400">Cargando conciliación por PDV...</div>
          ) : (!reconciliationData?.pdvSummaries || reconciliationData.pdvSummaries.length === 0) ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 font-semibold">
              No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
            </div>
          ) : (
            reconciliationData.pdvSummaries.map(pdvSummary => {
              const isExpanded = expandedPdvIds[pdvSummary.pdvId] !== false; // default expanded
              const pdvRows = filteredRows.filter(r => r.pdvId === pdvSummary.pdvId);

              if (pdvRows.length === 0 && (selectedPdv || searchTerm || statusFilter !== 'ALL')) {
                return null;
              }

              return (
                <div key={pdvSummary.pdvId} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition">
                  {/* PDV Header Card */}
                  <div
                    onClick={() => setExpandedPdvIds({ ...expandedPdvIds, [pdvSummary.pdvId]: !isExpanded })}
                    className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 cursor-pointer hover:from-slate-800 hover:to-slate-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600 p-2.5 rounded-xl shadow-xs">
                        <Store className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-white">{pdvSummary.pdvName}</h3>
                          <span className="bg-slate-700 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded">
                            {pdvSummary.city}
                          </span>
                          <span className="bg-blue-900 text-blue-200 text-[10px] font-bold px-2 py-0.5 rounded">
                            {pdvSummary.employeeCount} colaboradores
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5">
                          Jefe Directo: <strong>{pdvSummary.supervisorName}</strong>
                        </div>
                      </div>
                    </div>

                    {/* PDV Consolidated KPIs */}
                    <div className="flex flex-wrap items-center gap-4 self-end lg:self-center">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Cumplimiento PDV</div>
                        <div className="text-sm font-black text-emerald-400">{pdvSummary.complianceRate}%</div>
                      </div>

                      <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Horas Prog vs Real</div>
                        <div className="text-sm font-bold text-white">
                          {pdvSummary.realHours}h <span className="text-slate-400 text-xs font-normal">/ {pdvSummary.scheduledHours}h</span>
                        </div>
                      </div>

                      <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>

                      <div className="flex items-center gap-1.5">
                        {pdvSummary.lateCount > 0 && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                            {pdvSummary.lateCount} tarde
                          </span>
                        )}
                        {pdvSummary.earlyCount > 0 && (
                          <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                            {pdvSummary.earlyCount} sal. ant
                          </span>
                        )}
                        {pdvSummary.absenceCount > 0 && (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                            {pdvSummary.absenceCount} ausencias
                          </span>
                        )}
                      </div>

                      <div className="p-1 rounded-lg bg-slate-800 text-slate-300 ml-2">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* PDV Collaborators Table */}
                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                            {isAdminOrSup && <th className="py-2.5 px-3 text-center w-10">Sel</th>}
                            <th className="py-2.5 px-3.5">Colaborador</th>
                            <th className="py-2.5 px-3">Fecha & Día</th>
                            <th className="py-2.5 px-3">📅 Cronograma Programado</th>
                            <th className="py-2.5 px-3">⏱️ Marcación Real (Biométrico)</th>
                            <th className="py-2.5 px-3 text-center">Diferencia Minutos</th>
                            <th className="py-2.5 px-3 text-center">Horas Netas (Real vs Prog)</th>
                            <th className="py-2.5 px-3">Almuerzo Aplicado</th>
                            <th className="py-2.5 px-3 text-center">Estado / Novedad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pdvRows.length === 0 ? (
                            <tr>
                              <td colSpan={isAdminOrSup ? 9 : 8} className="py-6 text-center text-slate-400 font-semibold">
                                No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                              </td>
                            </tr>
                          ) : (
                            pdvRows.map(row => {
                              const isLate = row.status === 'LATE_ARRIVAL';
                              const isEarly = row.status === 'EARLY_DEPARTURE';
                              const isAbsent = row.status === 'ABSENT';
                              const isSelected = !!selectedCorrectionRows[row.id];

                              return (
                                <tr
                                  key={row.id}
                                  className={`hover:bg-slate-50 transition cursor-pointer ${
                                    isSelected ? 'bg-amber-100/60' : row.correctionRequested ? 'bg-amber-50/50' : row.hasPermission ? 'bg-emerald-50/40' : isAbsent ? 'bg-rose-50/40' : isLate ? 'bg-amber-50/30' : ''
                                  }`}
                                  onClick={() => setSelectedRowDetail(row)}
                                >
                                  {isAdminOrSup && (
                                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelectRow(row.id)}
                                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                      />
                                    </td>
                                  )}

                                  <td className="py-3 px-3.5">
                                    <div className="font-bold text-slate-900">{row.fullName}</div>
                                    <div className="text-[11px] text-slate-500">CC: {row.documentId} | {row.position}</div>
                                  </td>

                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="font-bold text-slate-800">{row.dayName}</div>
                                    <div className="text-[11px] text-slate-500">{row.date}</div>
                                  </td>

                                  <td className="py-3 px-3">
                                    {row.isScheduled ? (
                                      <div>
                                        <div className="font-bold text-slate-900">{row.scheduledStart} - {row.scheduledEnd}</div>
                                        <div className="text-[10px] text-slate-500">
                                          Prog: {row.scheduledNetHours}h netas (Alm: {row.scheduledLunchHours > 0 ? '1:30' : '0'})
                                        </div>
                                        {row.hasPermission && (
                                          <div className="text-[9px] text-emerald-700 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                            ✓ Permiso Aprobado
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic bg-slate-100 px-2 py-0.5 rounded">Día de Descanso</span>
                                    )}
                                  </td>

                                  <td className="py-3 px-3">
                                    {row.hasPunch ? (
                                      <div>
                                        <div className="font-extrabold text-blue-800">
                                          {row.realStart} {row.realEnd ? `- ${row.realEnd}` : <span className="text-rose-600 font-normal">(Sin Salida)</span>}
                                        </div>
                                        <div className="text-[10px] text-slate-600">
                                          Real: {row.realNetHours}h netas
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-rose-600 font-semibold text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                        Sin Marcación
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {row.hasPunch && row.isScheduled ? (
                                      <div className="space-y-0.5">
                                        {row.entryDiffMinutes > 10 ? (
                                          <span className="block text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                                            Ent: +{row.entryDiffMinutes}m tarde
                                          </span>
                                        ) : row.entryDiffMinutes < -10 ? (
                                          <span className="block text-blue-700 font-semibold text-[10px]">
                                            Ent: {Math.abs(row.entryDiffMinutes)}m antes
                                          </span>
                                        ) : (
                                          <span className="block text-emerald-600 font-bold text-[10px]">Entrada a tiempo</span>
                                        )}

                                        {row.exitDiffMinutes < -10 ? (
                                          <span className="block text-orange-700 font-bold bg-orange-50 px-2 py-0.5 rounded text-[11px]">
                                            Sal: {row.exitDiffMinutes}m anticipada
                                          </span>
                                        ) : row.exitDiffMinutes > 10 ? (
                                          <span className="block text-indigo-700 font-semibold text-[10px]">
                                            Sal: +{row.exitDiffMinutes}m extra
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>

                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <div className="font-extrabold text-slate-900 text-xs">
                                      {row.realNetHours}h <span className="text-slate-400 font-normal text-[10px]">vs {row.scheduledNetHours}h</span>
                                    </div>
                                    <div className={`text-[11px] font-bold ${
                                      row.hoursDiff > 0 ? 'text-blue-700' : row.hoursDiff < 0 ? 'text-rose-600' : 'text-emerald-600'
                                    }`}>
                                      {row.hoursDiff > 0 ? `+${row.hoursDiff}h extra` : row.hoursDiff < 0 ? `${row.hoursDiff}h` : 'Exacto'}
                                    </div>
                                  </td>

                                  <td className="py-3 px-3">
                                    {row.hasPunch ? (
                                      <div>
                                        <span className={`font-bold text-[11px] ${row.realLunchHours > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                                          {row.realLunchHours > 0 ? '1:30 hrs' : '0:00 hrs'}
                                        </span>
                                        <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                          {row.realLunchReason}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-[10px]">-</span>
                                    )}
                                  </td>

                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                                      row.statusColor === 'green' ? 'bg-emerald-100 text-emerald-800' :
                                      row.statusColor === 'yellow' ? 'bg-amber-100 text-amber-800' :
                                      row.statusColor === 'orange' ? 'bg-orange-100 text-orange-800' :
                                      row.statusColor === 'red' ? 'bg-rose-100 text-rose-800' :
                                      row.statusColor === 'purple' ? 'bg-purple-100 text-purple-800' :
                                      row.statusColor === 'blue' ? 'bg-blue-100 text-blue-800' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {row.statusLabel}
                                    </span>

                                    {/* Correction status badges */}
                                    {row.correctionRequested && (
                                      <div className="mt-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <span className="bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" title={row.correctionReason}>
                                          <Edit3 className="w-2.5 h-2.5 text-amber-700" />
                                          <span>Edición Habilitada PDV</span>
                                        </span>
                                        {isAdminOrSup && (
                                          <button
                                            onClick={() => handleCancelCorrection(row)}
                                            title="Cancelar solicitud de corrección"
                                            className="text-slate-400 hover:text-rose-600 font-bold text-[11px] px-1"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {row.correctionStatus === 'RESOLVED' && (
                                      <div className="mt-1 text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-center" title={row.employeeCorrectionNotes}>
                                        ✓ Corregido por PDV
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 2. FLAT TABLE VIEW */}
      {viewMode === 'TABLE' && (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[11px] font-bold">
                {isAdminOrSup && <th className="py-3 px-3 text-center w-10">Sel</th>}
                <th className="py-3 px-3.5">Colaborador / PDV</th>
                <th className="py-3 px-3">Fecha & Día</th>
                <th className="py-3 px-3">📅 Cronograma Programado</th>
                <th className="py-3 px-3">⏱️ Marcación Real (Biométrico)</th>
                <th className="py-3 px-3 text-center">Diferencias Minutos</th>
                <th className="py-3 px-3 text-center">Horas Netas (Prog vs Real)</th>
                <th className="py-3 px-3">Almuerzo Aplicado</th>
                <th className="py-3 px-3 text-center">Estado / Novedad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isAdminOrSup ? 9 : 8} className="py-12 text-center text-slate-400">Cargando conciliación...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={isAdminOrSup ? 9 : 8} className="py-12 text-center text-slate-400 font-semibold">
                    No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isLate = row.status === 'LATE_ARRIVAL';
                  const isEarly = row.status === 'EARLY_DEPARTURE';
                  const isAbsent = row.status === 'ABSENT';
                  const isSelected = !!selectedCorrectionRows[row.id];

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50 transition cursor-pointer ${
                        isSelected ? 'bg-amber-100/60' : row.correctionRequested ? 'bg-amber-50/50' : row.hasPermission ? 'bg-emerald-50/40' : isAbsent ? 'bg-rose-50/40' : isLate ? 'bg-amber-50/30' : ''
                      }`}
                      onClick={() => setSelectedRowDetail(row)}
                    >
                      {isAdminOrSup && (
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(row.id)}
                            className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>
                      )}

                      {/* Employee & PDV */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-900">{row.fullName}</div>
                        <div className="text-[11px] text-slate-500">CC: {row.documentId} | {row.position}</div>
                        <div className="text-[10px] text-blue-700 font-semibold mt-0.5">
                          {row.pdvName} (Jefe: {row.supervisorName.split(' ')[0]})
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{row.dayName}</div>
                        <div className="text-[11px] text-slate-500">{row.date}</div>
                      </td>

                      {/* Programmed Schedule */}
                      <td className="py-3 px-3">
                        {row.isScheduled ? (
                          <div>
                            <div className="font-bold text-slate-900">{row.scheduledStart} - {row.scheduledEnd}</div>
                            <div className="text-[10px] text-slate-500">
                              Prog: {row.scheduledNetHours}h netas (Alm: {row.scheduledLunchHours > 0 ? '1:30' : '0'})
                            </div>
                            {row.hasPermission && (
                              <div className="text-[9px] text-emerald-700 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                ✓ Permiso Aprobado
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic bg-slate-100 px-2 py-0.5 rounded">Día de Descanso</span>
                        )}
                      </td>

                      {/* Real Punch */}
                      <td className="py-3 px-3">
                        {row.hasPunch ? (
                          <div>
                            <div className="font-extrabold text-blue-800">
                              {row.realStart} {row.realEnd ? `- ${row.realEnd}` : <span className="text-rose-600 font-normal">(Sin Salida)</span>}
                            </div>
                            <div className="text-[10px] text-slate-600">
                              Real: {row.realNetHours}h netas
                            </div>
                          </div>
                        ) : (
                          <span className="text-rose-600 font-semibold text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Sin Marcación
                          </span>
                        )}
                      </td>

                      {/* Difference in Minutes */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {row.hasPunch && row.isScheduled ? (
                          <div className="space-y-0.5">
                            {row.entryDiffMinutes > 10 ? (
                              <span className="block text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                                Ent: +{row.entryDiffMinutes}m tarde
                              </span>
                            ) : row.entryDiffMinutes < -10 ? (
                              <span className="block text-blue-700 font-semibold text-[10px]">
                                Ent: {Math.abs(row.entryDiffMinutes)}m antes
                              </span>
                            ) : (
                              <span className="block text-emerald-600 font-bold text-[10px]">Entrada a tiempo</span>
                            )}

                            {row.exitDiffMinutes < -10 ? (
                              <span className="block text-orange-700 font-bold bg-orange-50 px-2 py-0.5 rounded text-[11px]">
                                Sal: {row.exitDiffMinutes}m anticipada
                              </span>
                            ) : row.exitDiffMinutes > 10 ? (
                              <span className="block text-indigo-700 font-semibold text-[10px]">
                                Sal: +{row.exitDiffMinutes}m extra
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Net Hours Comparison */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="font-extrabold text-slate-900 text-xs">
                          {row.realNetHours}h <span className="text-slate-400 font-normal text-[10px]">vs {row.scheduledNetHours}h</span>
                        </div>
                        <div className={`text-[11px] font-bold ${
                          row.hoursDiff > 0 ? 'text-blue-700' : row.hoursDiff < 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {row.hoursDiff > 0 ? `+${row.hoursDiff}h extra` : row.hoursDiff < 0 ? `${row.hoursDiff}h` : 'Exacto'}
                        </div>
                      </td>

                      {/* Lunch breakdown */}
                      <td className="py-3 px-3">
                        {row.hasPunch ? (
                          <div>
                            <span className={`font-bold text-[11px] ${row.realLunchHours > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                              {row.realLunchHours > 0 ? '1:30 hrs' : '0:00 hrs'}
                            </span>
                            <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                              {row.realLunchReason}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Status / Badge */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                          row.statusColor === 'green' ? 'bg-emerald-100 text-emerald-800' :
                          row.statusColor === 'yellow' ? 'bg-amber-100 text-amber-800' :
                          row.statusColor === 'orange' ? 'bg-orange-100 text-orange-800' :
                          row.statusColor === 'red' ? 'bg-rose-100 text-rose-800' :
                          row.statusColor === 'purple' ? 'bg-purple-100 text-purple-800' :
                          row.statusColor === 'blue' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {row.statusLabel}
                        </span>

                        {/* Correction status badges */}
                        {row.correctionRequested && (
                          <div className="mt-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" title={row.correctionReason}>
                              <Edit3 className="w-2.5 h-2.5 text-amber-700" />
                              <span>Edición Habilitada PDV</span>
                            </span>
                            {isAdminOrSup && (
                              <button
                                onClick={() => handleCancelCorrection(row)}
                                title="Cancelar solicitud de corrección"
                                className="text-slate-400 hover:text-rose-600 font-bold text-[11px] px-1"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                        {row.correctionStatus === 'RESOLVED' && (
                          <div className="mt-1 text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-center" title={row.employeeCorrectionNotes}>
                            ✓ Corregido por PDV
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Admin Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <h3 className="text-base text-slate-900">Habilitar Edición de Horario al PDV</h3>
              </div>
              <button onClick={() => setShowCorrectionModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Vas a habilitar la edición de <strong>{Object.keys(selectedCorrectionRows).length} marcación(es)/turno(s)</strong> seleccionados. Los colaboradores y encargados del PDV podrán modificar <strong>únicamente estos días específicos</strong> para ajustar su horario o justificar la discrepancia.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Instrucción / Motivo de la Solicitud para el PDV:
              </label>
              <textarea
                rows={3}
                value={adminCorrectionReason}
                onChange={(e) => setAdminCorrectionReason(e.target.value)}
                placeholder="Ej: Favor revisar marcación de salida que no coincide con el turno..."
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submittingCorrection}
                onClick={handleSendCorrectionRequests}
                className="px-5 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md transition flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{submittingCorrection ? 'Enviando...' : 'Confirmar y Habilitar a PDV'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row Details Modal */}
      {selectedRowDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedRowDetail.fullName}</h3>
                <p className="text-xs text-slate-500">{selectedRowDetail.pdvName} | {selectedRowDetail.date} ({selectedRowDetail.dayName})</p>
              </div>
              <button onClick={() => setSelectedRowDetail(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">📅 Programado</span>
                <div><strong>Horario:</strong> {selectedRowDetail.scheduledStart || 'Descanso'} - {selectedRowDetail.scheduledEnd}</div>
                <div><strong>Horas Netas:</strong> {selectedRowDetail.scheduledNetHours} hrs</div>
                <div><strong>Almuerzo:</strong> {selectedRowDetail.scheduledLunchHours > 0 ? '1:30' : '0:00'}</div>
                {selectedRowDetail.hasPermission && (
                  <div className="mt-2 text-emerald-800 font-bold bg-emerald-100 p-1.5 rounded">
                    Permiso: "{selectedRowDetail.permissionNote}"
                  </div>
                )}
                {selectedRowDetail.correctionRequested && (
                  <div className="mt-2 text-amber-900 font-bold bg-amber-100 p-1.5 rounded border border-amber-300">
                    Solicitud Corrección: "{selectedRowDetail.correctionReason}"
                  </div>
                )}
              </div>

              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                <span className="font-bold text-blue-700 uppercase text-[10px] block mb-1">⏱️ Marcación Real</span>
                <div><strong>Entrada:</strong> {selectedRowDetail.realStart || 'Sin Marcación'}</div>
                <div><strong>Salida:</strong> {selectedRowDetail.realEnd || 'Sin Marcación'}</div>
                <div><strong>Horas Netas Reales:</strong> {selectedRowDetail.realNetHours} hrs</div>
                <div><strong>Almuerzo Aplicado:</strong> {selectedRowDetail.realLunchHours > 0 ? '1:30' : '0:00'}</div>
                <div className="text-[10px] text-slate-500 mt-1">{selectedRowDetail.realLunchReason}</div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <span className="font-bold text-slate-700">Discrepancias / Observaciones:</span>
              {selectedRowDetail.issues?.length > 0 ? (
                <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                  {selectedRowDetail.issues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-emerald-700 font-semibold">✓ Marcación conforme al horario programado.</p>
              )}
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setSelectedRowDetail(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Justificación de Tiempos Suplementarios del PDV */}
      {showJustifyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Justificación de Tiempos Suplementarios del PDV
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sustentación formal de horas extras y recargos dirigida al Jefe de Zona
                  </p>
                </div>
              </div>
              <button onClick={() => setShowJustifyModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {justificationMsg && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${justificationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {justificationMsg.text}
              </div>
            )}

            {/* Context Card */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-800">
                <div>
                  <span className="text-slate-500 text-[11px] block font-medium">Punto de Venta:</span>
                  <strong className="text-slate-900 font-bold">
                    {allowedPdvs.find(p => p.id === (isEmployee ? currentUser.pdvId : selectedPdv))?.name || currentUser.pdvId || 'Punto de Venta'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block font-medium">Destinatario (Jefe de Zona):</span>
                  <strong className="text-amber-900 font-bold">
                    {allowedPdvs.find(p => p.id === (isEmployee ? currentUser.pdvId : selectedPdv))?.supervisorName || currentSupervisorObj?.name || 'Líder de Zona Asignado'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block font-medium">Semana de Conciliación:</span>
                  <strong className="text-slate-900 font-semibold">{weekStart} (Mes: {selectedMonth})</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block font-medium">Radicado por:</span>
                  <strong className="text-slate-900 font-semibold">{currentUser.fullName} ({currentUser.position || 'Administración'})</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveJustification} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Causa / Motivo del Incremento de Horas *
                </label>
                <select
                  required
                  value={justificationReasonCategory}
                  onChange={(e) => setJustificationReasonCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Evento Comercial / Alta Demanda">Evento Comercial / Alta Demanda (Tráfico Extraordinario)</option>
                  <option value="Mantenimiento o Adecuación Locativa">Mantenimiento o Adecuación Locativa de la Tienda</option>
                  <option value="Inventario General / Auditoría Extraordinaria">Inventario General / Auditoría Extraordinaria</option>
                  <option value="Relevo por Incapacidad o Permiso de Colaborador">Relevo por Incapacidad o Permiso no previsto</option>
                  <option value="Recepción y Organización de Mercancía / Logística">Recepción y Organización de Mercancía / Logística</option>
                  <option value="Operación Extendida Autorizada por Jefatura">Operación Extendida Autorizada por Jefatura de Zona</option>
                  <option value="Cierre de Mes y Balance Operativo">Cierre de Mes y Balance Operativo</option>
                  <option value="Otro Motivo Operativo">Otro Motivo Operativo</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Explicación Detallada y Sustentación Operativa *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Detalla las actividades operativas extraordinarias realizadas, personal involucrado y las razones del sobretiempo..."
                  value={justificationDetailedReason}
                  onChange={(e) => setJustificationDetailedReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Esta justificación se guardará en la base de datos y se notificará de manera directa al Jefe de Zona para respaldar la planilla de tiempos suplementarios.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJustifyModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingJustification}
                  className="px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{submittingJustification ? 'Guardando y Enviando...' : 'Guardar y Enviar al Jefe de Zona'}</span>
                </button>
              </div>
            </form>

            {/* Historial de Justificaciones previas del PDV */}
            {existingJustifications.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Justificaciones Remitidas ({existingJustifications.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {existingJustifications.map((j) => (
                    <div key={j.id} className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">{j.reasonCategory}</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ✓ Remitido a {j.supervisorName}
                        </span>
                      </div>
                      <p className="text-slate-700 italic">"{j.detailedReason}"</p>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                        <span>Por: {j.createdBy}</span>
                        <span>{new Date(j.createdAt).toLocaleString('es-CO')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
