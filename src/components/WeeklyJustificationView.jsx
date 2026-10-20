import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, Clock, Store, Building2, Send, CheckCircle2, 
  AlertCircle, AlertTriangle, Filter, Calendar, Search, RefreshCw, MessageSquare, 
  FileText, ShieldCheck, ChevronDown, ChevronUp, Check, X, Sparkles, User, Users,
  TrendingUp, ArrowRight, ShieldAlert
} from 'lucide-react';
import { ALL_WEEKS_2026, CURRENT_WEEK_START } from '../utils/weeks.js';
import { api } from '../services/api.js';
import { recordAuditEvent } from '../services/auditService.js';

const REASON_CATEGORIES = [
  'Mantenimiento y Obras',
  'Capacitación y Reuniones',
  'Incapacidad o Licencia',
  'Auditoría e Inventario',
  'Líder de Zona',
  'Evento Comercial',
  'Tiempo Adicional Autorizado',
  'Recepción Logística'
];

export default function WeeklyJustificationView({ currentUser, pdvs = [], supervisors = [] }) {
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isPdv = currentUser?.role === 'PDV' || (!isSupervisor && !isAdmin && !isHrAdmin && !isAuditorVrx);

  const currentSupervisorObj = supervisors.find(s => 
    s.name === currentUser?.fullName || 
    s.id === currentUser?.supervisorId || 
    currentUser?.id?.includes(s.id)
  );

  // Scoped PDVs
  const allowedPdvs = (isAdmin || isHrAdmin || isAuditorVrx)
    ? pdvs
    : isSupervisor
    ? pdvs.filter(p => p.supervisorId === currentSupervisorObj?.id || p.supervisorId === currentUser?.supervisorId)
    : pdvs.filter(p => p.id === currentUser?.pdvId || p.code === currentUser?.pdvId);

  const activePdvObj = allowedPdvs.find(p => p.id === currentUser?.pdvId || p.code === currentUser?.pdvId) || allowedPdvs[0];

  // Sub-tabs: 'CAPACITY_EXCESS' (Auditoría de Excedente de Capacidad por PDV) | 'JUSTIFICATIONS_LOG' (Histórico Radicado)
  const [activeSubTab, setActiveSubTab] = useState('CAPACITY_EXCESS');

  // Selector de Semana (Por defecto: Semana Actual)
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK_START);
  const isCurrentWeek = selectedWeek === CURRENT_WEEK_START;

  const currentWeekNum = useMemo(() => {
    return ALL_WEEKS_2026.find(w => w.weekStart === CURRENT_WEEK_START)?.weekNumber || 43;
  }, []);

  // Semanas anteriores ordenadas de la más reciente a la más antigua
  const pastWeeks = useMemo(() => {
    return ALL_WEEKS_2026
      .filter(w => w.weekStart !== CURRENT_WEEK_START)
      .sort((a, b) => b.weekNumber - a.weekNumber);
  }, []);

  const [selectedPdvId, setSelectedPdvId] = useState(isPdv ? (activePdvObj?.id || '') : 'ALL');
  const [selectedZoneId, setSelectedZoneId] = useState(isSupervisor ? (currentSupervisorObj?.id || '') : 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyExceeded, setOnlyExceeded] = useState(true);
  const [expandedPdvId, setExpandedPdvId] = useState(null);

  // Metadata de la Semana Consultada
  const activeWeekObj = useMemo(() => {
    return ALL_WEEKS_2026.find(w => w.weekStart === selectedWeek) || {
      weekNumber: 43,
      weekStart: selectedWeek,
      weekEnd: '2026-10-25',
      label: `Semana 43 (${selectedWeek})`
    };
  }, [selectedWeek]);

  // Schedules and Capacity Data
  const [schedules, setSchedules] = useState([]);
  const [standardMaxHours, setStandardMaxHours] = useState(42);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Justifications data
  const [justifications, setJustifications] = useState([]);
  const [loadingJustifications, setLoadingJustifications] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Modal for new justification
  const [showModal, setShowModal] = useState(false);
  const [formWeek, setFormWeek] = useState(selectedWeek);
  const [formPdvId, setFormPdvId] = useState(activePdvObj?.id || (allowedPdvs[0]?.id || 'pdv-1'));
  const [formCategory, setFormCategory] = useState(REASON_CATEGORIES[0]);
  const [formHours, setFormHours] = useState('');
  const [formReason, setFormReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 1. Load Justifications
  async function loadJustifications() {
    setLoadingJustifications(true);
    try {
      const filters = {};
      if (isPdv) {
        const pId = currentUser?.pdvId || activePdvObj?.id;
        if (pId) filters.pdvId = pId;
      } else if (isSupervisor) {
        const sId = currentUser?.supervisorId || currentSupervisorObj?.id;
        if (sId) filters.supervisorId = sId;
      }
      
      const list = await api.getSupplementaryJustifications(filters).catch(() => []);
      setJustifications(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error fetching weekly justifications:', err);
    } finally {
      setLoadingJustifications(false);
    }
  }

  // 2. Load Schedules for Capacity Excess Calculation
  async function loadSchedulesData() {
    setLoadingSchedules(true);
    try {
      const [schedList, cfg] = await Promise.all([
        api.getSchedules({ weekStart: selectedWeek }).catch(() => []),
        api.getConfig().catch(() => ({ weeklyMaxStandardHours: 42 }))
      ]);

      let combined = Array.isArray(schedList) ? [...schedList] : [];

      // Local storage fallback / merge in case turnos were updated locally for this week
      try {
        const localScheds = localStorage.getItem('control_turnos_schedules_' + selectedWeek);
        if (localScheds) {
          const parsed = JSON.parse(localScheds);
          if (Array.isArray(parsed)) {
            parsed.forEach(ls => {
              const idx = combined.findIndex(c => 
                (c.userId === ls.userId || (c.documentId && c.documentId === ls.documentId)) && 
                (c.weekStart === selectedWeek || c.week_start === selectedWeek)
              );
              if (idx >= 0) {
                combined[idx] = { ...combined[idx], ...ls };
              } else {
                combined.push(ls);
              }
            });
          }
        }
      } catch (e) {}

      setSchedules(combined);
      if (cfg?.weeklyMaxStandardHours) {
        setStandardMaxHours(Number(cfg.weeklyMaxStandardHours) || 42);
      }
    } catch (err) {
      console.error('Error fetching schedules for capacity audit:', err);
    } finally {
      setLoadingSchedules(false);
    }
  }

  useEffect(() => {
    loadJustifications();
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    loadSchedulesData();
  }, [selectedWeek]);

  // Handle open justification modal prefilled for an exceeded PDV
  function handleOpenJustifyPdv(pdvAuditItem) {
    setFormPdvId(pdvAuditItem.pdvId);
    setFormWeek(pdvAuditItem.weekStart || selectedWeek);
    setFormHours(pdvAuditItem.excessHours > 0 ? String(pdvAuditItem.excessHours) : '');
    setFormCategory('Tiempo Adicional Autorizado');
    setFormReason(`Sustentación de excedente semanal de capacidad: La tienda cuenta con ${pdvAuditItem.personCount} personas (capacidad máxima ${pdvAuditItem.maxAllowedHours} hrs a 42h/sem) y registró ${pdvAuditItem.totalNetHours} hrs, generando un excedente de ${pdvAuditItem.excessHours} horas.`);
    setFeedbackMsg(null);
    setShowModal(true);
  }

  // Handle create justification
  async function handleCreateJustification(e) {
    e.preventDefault();
    if (!formReason.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Por favor escribe la sustentación o detalle de la justificación.' });
      return;
    }

    const pdvObj = allowedPdvs.find(p => p.id === formPdvId) || activePdvObj || allowedPdvs[0];
    const targetSupId = pdvObj?.supervisorId || currentSupervisorObj?.id || 'zone-1';

    setSubmitting(true);
    setFeedbackMsg(null);

    try {
      await api.saveSupplementaryJustification({
        pdvId: pdvObj?.id || 'pdv-1',
        pdvName: pdvObj?.name || 'Punto de Venta',
        weekStart: formWeek,
        month: formWeek.substring(0, 7),
        reasonCategory: formCategory || 'Excedente de Horas PDV',
        detailedReason: formReason.trim(),
        createdBy: currentUser?.fullName || 'Administrador PDV',
        supervisorId: targetSupId,
        totalSupplementaryHours: Number(formHours) || 0
      });

      setFeedbackMsg({ type: 'success', text: `✓ Justificación semanal para ${pdvObj?.name} radicada exitosamente ante el Líder de Zona.` });
      
      recordAuditEvent({
        userName: currentUser?.fullName || 'Administrador PDV',
        userRole: currentUser?.role || 'PDV',
        action: 'JUSTIFICATION_SUBMIT',
        actionLabel: 'Radicación de Justificación Semanal',
        pdvName: pdvObj?.name || 'Punto de Venta',
        detail: `Radicó justificación de ${Number(formHours) || 0} hrs para ${pdvObj?.name} (${formWeek}): ${formCategory}`
      });

      setFormReason('');
      setFormHours('');
      setShowModal(false);
      loadJustifications();
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al guardar la justificación.' });
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------
  // CALCULO AUTOMÁTICO DE CAPACIDAD Y EXCEDENTES POR PDV
  // [N.° Colaboradores x 42 Horas Máximas] vs Horas Registradas
  // -------------------------------------------------------------
  const pdvCapacityAuditList = useMemo(() => {
    if (!schedules || schedules.length === 0) return [];

    // Filter schedules strictly by active week
    const filteredSchedules = schedules.filter(s => {
      const sWeek = s.weekStart || s.week_start;
      if (sWeek && sWeek !== selectedWeek) return false;
      return true;
    });

    // Group by PDV
    const pdvAgg = new Map();

    filteredSchedules.forEach(s => {
      const pId = s.pdvId || s.pdv_id || s.pdvCode;
      if (!pId) return;

      const pdvMeta = allowedPdvs.find(p => p.id === pId || p.code === s.pdvCode || p.code === pId);
      const supMeta = supervisors.find(sup => sup.id === pdvMeta?.supervisorId || sup.id === s.supervisorId);

      // Scoping
      if (selectedPdvId && selectedPdvId !== 'ALL' && pdvMeta?.id !== selectedPdvId) return;
      if (selectedZoneId && selectedZoneId !== 'ALL' && pdvMeta?.supervisorId !== selectedZoneId) return;

      if (!pdvAgg.has(pId)) {
        pdvAgg.set(pId, {
          pdvId: pdvMeta?.id || pId,
          pdvCode: pdvMeta?.code || s.pdvCode || pId,
          pdvName: pdvMeta?.name || s.pdvName || s.pdvCode || pId,
          supervisorName: supMeta?.name || 'Líder Asignado',
          weekStart: s.weekStart || s.week_start || selectedWeek,
          employeesMap: new Map(),
          totalNetHours: 0
        });
      }

      const item = pdvAgg.get(pId);
      const doc = String(s.documentId || s.document_id || s.userId || s.user_id || '').trim();
      const empName = s.fullName || s.user?.fullName || 'Colaborador';
      const netHours = Number(s.totalNetHours || s.total_net_hours) || 0;

      if (doc) {
        if (!item.employeesMap.has(doc)) {
          item.employeesMap.set(doc, {
            documentId: doc,
            fullName: empName,
            hours: netHours
          });
        } else {
          item.employeesMap.get(doc).hours += netHours;
        }
      }

      item.totalNetHours += netHours;
    });

    // Compute Capacity & Excess
    const list = [];
    pdvAgg.forEach(p => {
      const personCount = p.employeesMap.size;
      const maxAllowedHours = Math.round(personCount * standardMaxHours * 10) / 10;
      const totalNetHours = Math.round(p.totalNetHours * 10) / 10;
      const diff = Math.round((totalNetHours - maxAllowedHours) * 10) / 10;
      const isExceeded = diff > 0.05;
      const excessHours = isExceeded ? diff : 0;
      const deficitHours = !isExceeded ? Math.abs(diff) : 0;
      const excessPercentage = maxAllowedHours > 0 && isExceeded ? Math.round((excessHours / maxAllowedHours) * 1000) / 10 : 0;

      list.push({
        pdvId: p.pdvId,
        pdvCode: p.pdvCode,
        pdvName: p.pdvName,
        supervisorName: p.supervisorName,
        weekStart: p.weekStart,
        personCount,
        standardMaxHours,
        maxAllowedHours,
        totalNetHours,
        excessHours,
        deficitHours,
        isExceeded,
        excessPercentage,
        employees: Array.from(p.employeesMap.values()).sort((a, b) => b.hours - a.hours)
      });
    });

    // Search filter
    let filtered = list;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.pdvCode.toLowerCase().includes(q) ||
        item.pdvName.toLowerCase().includes(q) ||
        item.supervisorName.toLowerCase().includes(q)
      );
    }

    if (onlyExceeded) {
      filtered = filtered.filter(item => item.isExceeded);
    }

    return filtered.sort((a, b) => b.excessHours - a.excessHours);
  }, [schedules, allowedPdvs, supervisors, selectedWeek, selectedPdvId, selectedZoneId, searchTerm, onlyExceeded, standardMaxHours]);

  // Aggregate KPI metrics for Capacity Excess
  const excessKpis = useMemo(() => {
    let totalExceededPdvs = 0;
    let totalExcessHours = 0;
    let totalEvaluatedPdvs = 0;
    let totalCapacityHours = 0;
    let totalScheduledHours = 0;

    pdvCapacityAuditList.forEach(item => {
      totalEvaluatedPdvs++;
      totalCapacityHours += item.maxAllowedHours;
      totalScheduledHours += item.totalNetHours;
      if (item.isExceeded) {
        totalExceededPdvs++;
        totalExcessHours += item.excessHours;
      }
    });

    const avgExcess = totalExceededPdvs > 0 ? (totalExcessHours / totalExceededPdvs) : 0;

    return {
      totalEvaluatedPdvs,
      totalExceededPdvs,
      totalExcessHours: Math.round(totalExcessHours * 10) / 10,
      totalCapacityHours: Math.round(totalCapacityHours * 10) / 10,
      totalScheduledHours: Math.round(totalScheduledHours * 10) / 10,
      avgExcess: Math.round(avgExcess * 10) / 10
    };
  }, [pdvCapacityAuditList]);

  // Filtered list of submitted justifications (strictly weekly)
  const filteredJustifications = justifications.filter(item => {
    const itemWeek = item.weekStart || item.week_start;
    const itemPdvId = item.pdvId || item.pdv_id;
    const itemSupId = item.supervisorId || item.supervisor_id;

    if (itemWeek && itemWeek !== selectedWeek) return false;
    if (selectedPdvId && selectedPdvId !== 'ALL' && itemPdvId !== selectedPdvId) return false;
    if (selectedZoneId && selectedZoneId !== 'ALL' && itemSupId !== selectedZoneId) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchPdv = (item.pdvName || item.pdv_name || '').toLowerCase().includes(q);
      const matchCat = (item.reasonCategory || '').toLowerCase().includes(q);
      const matchReason = (item.detailedReason || item.reason || '').toLowerCase().includes(q);
      const matchBy = (item.createdBy || item.submitted_by || '').toLowerCase().includes(q);
      if (!matchPdv && !matchCat && !matchReason && !matchBy) return false;
    }
    return true;
  });

  const totalJustifiedHours = filteredJustifications.reduce((acc, curr) => acc + (Number(curr.totalSupplementaryHours || curr.hours_increase) || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black px-3 py-0.5 rounded-full flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
              Auditoría de Excedente de Capacidad
            </span>
            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Tope Legal 42h/sem por Persona
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1.5">
            {isSupervisor 
              ? `Monitoreo de Excedentes de Zona: ${currentUser.zoneName || 'Zona Asignada'}`
              : isPdv 
              ? `Capacidad Semanal de Mi PDV: ${activePdvObj?.name || 'Tienda'}`
              : 'Auditoría Nacional de Excedentes de Horas por PDV'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Detección automática de tiendas que superan la capacidad semanal permitida (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">N.° Personas × 42h</code>). En caso de sobrecupo se audita el excedente neto.
          </p>
        </div>

        {/* Action Button: Radicar Justificación */}
        {(isPdv || isAdmin || isAuditorVrx) && (
          <button
            onClick={() => {
              setFormWeek(selectedWeek);
              setFormPdvId(activePdvObj?.id || allowedPdvs[0]?.id || 'pdv-1');
              setFormHours('');
              setFormReason('');
              setShowModal(true);
              setFeedbackMsg(null);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Radicar Justificación de la Semana</span>
          </button>
        )}
      </div>

      {/* 2. Notification Message */}
      {feedbackMsg && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-bold ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
        </div>
      )}

      {/* 3. Sub-Navigation Switcher: Excedentes vs Historial */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('CAPACITY_EXCESS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
            activeSubTab === 'CAPACITY_EXCESS'
              ? 'bg-rose-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>🚨 Auditoría de Excedentes por PDV</span>
          {excessKpis.totalExceededPdvs > 0 && (
            <span className={`text-[10px] px-2 py-0.2 rounded-full font-extrabold ${
              activeSubTab === 'CAPACITY_EXCESS' ? 'bg-rose-900 text-rose-200' : 'bg-rose-100 text-rose-800'
            }`}>
              {excessKpis.totalExceededPdvs}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('JUSTIFICATIONS_LOG')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
            activeSubTab === 'JUSTIFICATIONS_LOG'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📋 Histórico de Justificaciones Radicadas</span>
          <span className={`text-[10px] px-2 py-0.2 rounded-full font-extrabold ${
            activeSubTab === 'JUSTIFICATIONS_LOG' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-800'
          }`}>
            {filteredJustifications.length}
          </span>
        </button>
      </div>

      {/* 4. Resumen de la Semana Consultada */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-xl border shrink-0 ${
            isCurrentWeek 
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' 
              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}>
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                isCurrentWeek ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950 font-black'
              }`}>
                {isCurrentWeek ? 'Semana Actual' : `Semana Anterior #${activeWeekObj?.weekNumber}`}
              </span>
              <span className="text-slate-400 text-xs font-mono">
                {activeWeekObj?.weekStart} al {activeWeekObj?.weekEnd}
              </span>
              {!isCurrentWeek && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWeek(CURRENT_WEEK_START);
                    setFormWeek(CURRENT_WEEK_START);
                  }}
                  className="text-[11px] font-bold text-rose-300 hover:text-white underline cursor-pointer ml-1"
                >
                  ← Ir a Semana Actual
                </button>
              )}
            </div>
            <h3 className="text-lg font-black text-white mt-1">
              Semana {activeWeekObj?.weekNumber || 43} - Auditoría de Sobrecupo y Capacidad
            </h3>
            <p className="text-xs text-slate-400">
              Evaluación estricta de turnos sobre el tope de {standardMaxHours}h/semana por colaborador en cada punto de venta.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          {loadingSchedules ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-bold bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Auditando semana...
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="bg-white/10 px-3 py-1 rounded-xl text-xs font-bold text-slate-300">
                🏬 {excessKpis.totalEvaluatedPdvs} PDVs evaluados
              </span>
              {excessKpis.totalExceededPdvs > 0 && (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-xl text-xs font-black">
                  🚨 {excessKpis.totalExceededPdvs} con sobrecupo
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Filters & Search Box */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Filtros de Tiendas (Semana {activeWeekObj?.weekNumber}):</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Week Selector: Semana Actual o Semanas Anteriores */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1.5 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-rose-600 ml-1" />
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(e.target.value);
                  setFormWeek(e.target.value);
                }}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer max-w-[260px]"
                title="Seleccionar Semana Actual o Semanas Anteriores"
              >
                <option value={CURRENT_WEEK_START}>⭐ Semana Actual (Sem {currentWeekNum})</option>
                <optgroup label="── Semanas Anteriores ──">
                  {pastWeeks.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>
                      Semana {w.weekNumber} ({w.weekStart} al {w.weekEnd})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* PDV Selector */}
            {(!isPdv && allowedPdvs.length > 1) && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1.5 rounded-xl">
                <Store className="w-3.5 h-3.5 text-slate-500 ml-1" />
                <select
                  value={selectedPdvId}
                  onChange={(e) => setSelectedPdvId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer max-w-xs"
                >
                  <option value="ALL">-- Todos los PDVs --</option>
                  {allowedPdvs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar PDV, código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:outline-hidden w-44 sm:w-52"
              />
            </div>

            {/* Refresh */}
            <button
              onClick={() => {
                loadSchedulesData();
                loadJustifications();
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
              title="Actualizar datos de la semana"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(loadingSchedules || loadingJustifications) ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 5. KPI CARDS FOR CAPACITY EXCESS */}
        {activeSubTab === 'CAPACITY_EXCESS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">PDVs Auditados</span>
                <Store className="w-4 h-4 text-slate-400" />
              </div>
              <span className="text-2xl font-black text-slate-900 mt-1 block">{excessKpis.totalEvaluatedPdvs}</span>
              <span className="text-[11px] text-slate-500">Tiendas con programación activa</span>
            </div>

            <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-700 uppercase">PDVs con Excedente</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <span className="text-2xl font-black text-rose-900 mt-1 block">{excessKpis.totalExceededPdvs}</span>
              <span className="text-[11px] text-rose-700 font-medium">Superaron el tope de horas semanales</span>
            </div>

            <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase">Horas de Excedente</span>
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-2xl font-black text-amber-900 mt-1 block">+{excessKpis.totalExcessHours.toLocaleString('es-CO')} hrs</span>
              <span className="text-[11px] text-amber-700 font-medium">Horas por encima de la capacidad legal</span>
            </div>

            <div className="p-4 bg-blue-50/80 rounded-xl border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-800 uppercase">Exceso Promedio</span>
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-2xl font-black text-blue-900 mt-1 block">+{excessKpis.avgExcess.toFixed(1)} hrs</span>
              <span className="text-[11px] text-blue-700 font-medium">Por PDV en sobrecupo</span>
            </div>
          </div>
        )}

        {/* KPI CARDS FOR JUSTIFICATIONS LOG */}
        {activeSubTab === 'JUSTIFICATIONS_LOG' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">Total Radicadas</span>
              <span className="text-xl font-black text-slate-900">{filteredJustifications.length}</span>
            </div>
            <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/80">
              <span className="text-[11px] font-bold text-amber-700 block uppercase">Horas Justificadas</span>
              <span className="text-xl font-black text-amber-900">{totalJustifiedHours.toFixed(1)} hrs</span>
            </div>
            <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200/80">
              <span className="text-[11px] font-bold text-emerald-700 block uppercase">Estado de Cobertura</span>
              <span className="text-xs font-extrabold text-emerald-800 block mt-1">✓ Reporte Semanal Actualizado</span>
            </div>
          </div>
        )}
      </div>

      {/* 6. TABLA 1: AUDITORÍA DE EXCEDENTES DE HORAS POR PDV */}
      {activeSubTab === 'CAPACITY_EXCESS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-rose-50/60 border-b border-rose-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                PDVs con Horas Superiores a su Capacidad en Semana {activeWeekObj?.weekNumber} ({pdvCapacityAuditList.length})
              </h3>
            </div>

            {/* Toggle: Solo Excedentes vs Todos */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={onlyExceeded}
                  onChange={(e) => setOnlyExceeded(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <span>Mostrar solo PDVs que superaron la capacidad</span>
              </label>

              <span className="text-[11px] font-black text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                🗓️ Sem {activeWeekObj?.weekNumber} ({activeWeekObj?.weekStart} al {activeWeekObj?.weekEnd})
              </span>
            </div>
          </div>

          {/* Banner Didáctico del Ejemplo */}
          <div className="p-3 bg-amber-50/70 border-b border-amber-200 text-amber-950 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold shrink-0">💡 Regla de Capacidad:</span>
              <span>
                Cada colaborador cuenta con <strong>{standardMaxHours} hrs semanales</strong> como máximo permitido. La capacidad total del PDV es <code>[Colaboradores × {standardMaxHours}h]</code>.
                Si una tienda tiene <strong>168 hrs</strong> como máximo (4 personas) e hizo <strong>198 hrs</strong>, se audita el excedente: <strong>+30.0 horas</strong>.
              </span>
            </div>
          </div>

          {loadingSchedules ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <div className="animate-spin w-6 h-6 border-3 border-rose-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              Auditando capacidad y recalculando excedentes de esta semana...
            </div>
          ) : pdvCapacityAuditList.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <p className="font-black text-slate-800 text-sm">
                  {schedules.length === 0
                    ? `No hay turnos registrados en la Semana Actual (${activeWeekObj?.weekStart} al ${activeWeekObj?.weekEnd})`
                    : `¡Excelente! Ningún punto de venta superó su capacidad semanal en esta semana`}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {schedules.length === 0
                    ? 'Los turnos programados en los puntos de venta se auditarán automáticamente en tiempo real.'
                    : `Todos los PDVs operaron dentro del tope legal de ${standardMaxHours} horas semanales por colaborador.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-[11px] font-black uppercase">
                    <th className="py-3 px-3.5 text-center">#</th>
                    <th className="py-3 px-4">Punto de Venta</th>
                    <th className="py-3 px-3.5 text-center">Colaboradores</th>
                    <th className="py-3 px-3.5 text-center">Capacidad Máx. ({standardMaxHours}h/p)</th>
                    <th className="py-3 px-3.5 text-center">Horas Registradas</th>
                    <th className="py-3 px-4 text-center">Excedente de Horas</th>
                    <th className="py-3 px-4 text-center">Sobrecupo %</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pdvCapacityAuditList.map((item, idx) => {
                    const isExpanded = expandedPdvId === item.pdvId;
                    return (
                      <React.Fragment key={item.pdvId + '_' + idx}>
                        <tr className={`hover:bg-slate-50/80 transition ${item.isExceeded ? 'bg-rose-50/15' : ''}`}>
                          <td className="py-3 px-3.5 text-center font-bold text-slate-400">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-4 h-4 text-blue-600 shrink-0" />
                              <span className="font-black text-slate-900">{item.pdvCode}</span>
                              <span className="text-slate-600 font-medium">- {item.pdvName}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 block ml-5">
                              Líder: {item.supervisorName}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border border-slate-200">
                              <Users className="w-3 h-3 text-slate-500" />
                              {item.personCount} personas
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center font-bold text-slate-600">
                            <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono">
                              {item.maxAllowedHours.toFixed(1)} hrs
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-center font-black text-slate-900">
                            <span className="font-mono">{item.totalNetHours.toFixed(1)} hrs</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.isExceeded ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  +{item.excessHours.toFixed(1)} hrs
                                </span>
                                <span className="text-[10px] text-rose-700 font-bold mt-0.5">
                                  Se pasó por {item.excessHours.toFixed(1)} horas
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-lg">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                En Cupo (-{item.deficitHours.toFixed(1)}h)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            {item.isExceeded ? (
                              <span className="font-black text-rose-700 text-xs">
                                +{item.excessPercentage}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">0%</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Toggle Employee Breakdown */}
                              <button
                                onClick={() => setExpandedPdvId(isExpanded ? null : item.pdvId)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                                title="Ver colaboradores de este PDV"
                              >
                                <Users className="w-3 h-3" />
                                <span>{isExpanded ? 'Ocultar' : 'Personas'}</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>

                              {/* Action: Radicar Justificación */}
                              {item.isExceeded && (isPdv || isAdmin || isAuditorVrx) && (
                                <button
                                  onClick={() => handleOpenJustifyPdv(item)}
                                  className="inline-flex items-center gap-1 text-[11px] font-black text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer"
                                  title="Radicar justificación formal por este excedente"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Justificar</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Accordion: Employee Breakdown */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <td colSpan="8" className="p-4 pl-12">
                              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2 shadow-xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-blue-600" />
                                    Colaboradores de {item.pdvName} ({item.employees.length} personas):
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    Capacidad legal permitida por persona: <strong>{standardMaxHours} hrs/semana</strong>
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                                  {item.employees.map(emp => {
                                    const empExceeded = emp.hours > standardMaxHours;
                                    const empDiff = Math.round((emp.hours - standardMaxHours) * 10) / 10;
                                    return (
                                      <div 
                                        key={emp.documentId} 
                                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                                          empExceeded ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-slate-50 border-slate-200 text-slate-800'
                                        }`}
                                      >
                                        <div>
                                          <span className="font-bold block leading-tight">{emp.fullName}</span>
                                          <span className="text-[10px] text-slate-400 font-mono">CC: {emp.documentId}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="font-black text-xs block font-mono">{emp.hours.toFixed(1)} hrs</span>
                                          {empExceeded ? (
                                            <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1 py-0.2 rounded">
                                              +{empDiff}h extra
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                                              Cumple
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 7. TABLA 2: HISTÓRICO DE JUSTIFICACIONES RADICADAS */}
      {activeSubTab === 'JUSTIFICATIONS_LOG' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Tablero de Histórico Semanal de Justificaciones ({filteredJustifications.length})
              </h3>
            </div>
            <span className="text-[11px] font-black text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              🗓️ Sem {activeWeekObj?.weekNumber} ({activeWeekObj?.weekStart} al {activeWeekObj?.weekEnd})
            </span>
          </div>

          {loadingJustifications ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <div className="animate-spin w-6 h-6 border-3 border-amber-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              Cargando justificaciones semanales...
            </div>
          ) : filteredJustifications.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <p className="font-bold text-slate-700">No se encontraron justificaciones semanales radicadas para este período.</p>
              <p className="text-slate-400 text-[11px]">
                {isPdv ? 'Puedes registrar una justificación haciendo clic en "Radicar Justificación de la Semana".' : 'Los puntos de venta radicarán aquí sus justificaciones de tiempos suplementarios.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 text-[11px] font-black uppercase">
                    <th className="py-3 px-4">Semana / Fecha</th>
                    <th className="py-3 px-4">Punto de Venta</th>
                    <th className="py-3 px-4">Categoría del Motivo</th>
                    <th className="py-3 px-4 text-center">Horas Supl.</th>
                    <th className="py-3 px-4">Sustentación Detallada</th>
                    <th className="py-3 px-4">Radicado Por</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJustifications.map((item, idx) => {
                    const weekObj = ALL_WEEKS_2026.find(w => w.weekStart === item.weekStart);
                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-extrabold text-slate-900 block">
                            {weekObj ? weekObj.label : item.weekStart}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('es-CO') : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{item.pdvName || 'PDV'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[11px] px-2.5 py-0.5 rounded-lg">
                            {item.reasonCategory || 'General'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-black text-slate-900">
                          <span className="bg-slate-100 px-2 py-1 rounded-md">
                            {Number(item.totalSupplementaryHours || 0).toFixed(1)} hrs
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs sm:max-w-md text-slate-600 text-[11px]">
                          <p className="line-clamp-2" title={item.detailedReason}>
                            {item.detailedReason || 'Sin detalle'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{item.createdBy || 'PDV'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            Radicado ante Jefatura
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 8. MODAL: Radicar Justificación de la Semana */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden text-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm">Radicar Justificación Semanal</h3>
                  <p className="text-[11px] text-amber-100">Sustentación formal de tiempos suplementarios / excedente de capacidad</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateJustification} className="p-6 space-y-4 text-xs">
              {/* Semana */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Semana a Justificar *</label>
                <select
                  value={formWeek}
                  onChange={(e) => setFormWeek(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden cursor-pointer"
                >
                  <option value={CURRENT_WEEK_START}>⭐ Semana Actual (Sem {currentWeekNum})</option>
                  <optgroup label="── Semanas Anteriores ──">
                    {pastWeeks.map(w => (
                      <option key={w.weekStart} value={w.weekStart}>
                        Semana {w.weekNumber} ({w.weekStart} al {w.weekEnd})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* PDV (Locked to active PDV if store) */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Punto de Venta *</label>
                <select
                  value={formPdvId}
                  disabled={isPdv}
                  onChange={(e) => setFormPdvId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {allowedPdvs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>


              {/* Horas Suplementarias */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Total Horas Suplementarias / Excedente a Justificar (hrs) *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Ej: 30.0"
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Sustentación Detallada */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Sustentación Detallada del Incremento *</label>
                <textarea
                  rows="4"
                  placeholder="Describe detalladamente las razones operacionales o comerciales que originaron el tiempo suplementario en la semana..."
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold rounded-xl transition text-xs shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Radicando...' : 'Radicar Justificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
