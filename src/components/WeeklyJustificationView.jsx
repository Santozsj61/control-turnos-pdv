import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, Clock, Store, Building2, Send, CheckCircle2, 
  AlertCircle, Filter, Calendar, Search, RefreshCw, MessageSquare, 
  FileText, ShieldCheck, ChevronDown, Check, X, Sparkles, User
} from 'lucide-react';
import { ALL_WEEKS_2026, CURRENT_WEEK_START } from '../utils/weeks.js';
import { api } from '../services/api.js';

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

export default function WeeklyJustificationView({ currentUser, pdvs, supervisors }) {
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

  // Filters
  const [filterPeriodType, setFilterPeriodType] = useState('ALL'); // 'ALL' | 'WEEK' | 'MONTH'
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK_START);
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [selectedPdvId, setSelectedPdvId] = useState(isPdv ? (activePdvObj?.id || '') : 'ALL');
  const [selectedZoneId, setSelectedZoneId] = useState(isSupervisor ? (currentSupervisorObj?.id || '') : 'ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Justifications data
  const [justifications, setJustifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Modal for new justification
  const [showModal, setShowModal] = useState(false);
  const [formWeek, setFormWeek] = useState(CURRENT_WEEK_START);
  const [formPdvId, setFormPdvId] = useState(activePdvObj?.id || (allowedPdvs[0]?.id || 'pdv-1'));
  const [formCategory, setFormCategory] = useState(REASON_CATEGORIES[0]);
  const [formHours, setFormHours] = useState('');
  const [formReason, setFormReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Review modal
  const [reviewItem, setReviewItem] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  async function loadJustifications() {
    setLoading(true);
    try {
      const filters = {};
      if (isPdv && activePdvObj?.id) {
        filters.pdvId = activePdvObj.id;
      } else if (isSupervisor && currentSupervisorObj?.id) {
        filters.supervisorId = currentSupervisorObj.id;
      }
      
      const list = await api.getSupplementaryJustifications(filters).catch(() => []);
      setJustifications(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error fetching weekly justifications:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJustifications();
  }, [currentUser?.id, currentUser?.role]);

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
        reasonCategory: formCategory,
        detailedReason: formReason.trim(),
        createdBy: currentUser?.fullName || 'Administrador PDV',
        supervisorId: targetSupId,
        totalSupplementaryHours: Number(formHours) || 0
      });

      setFeedbackMsg({ type: 'success', text: `✓ Justificación semanal para ${pdvObj?.name} radicada exitosamente ante el Líder de Zona.` });
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

  // Filtered list
  const filteredList = justifications.filter(item => {
    // Week filter
    if (filterPeriodType === 'WEEK' && item.weekStart !== selectedWeek) return false;
    // Month filter
    if (filterPeriodType === 'MONTH') {
      const itemMonth = item.month || (item.weekStart ? item.weekStart.substring(0, 7) : '');
      if (itemMonth !== selectedMonth) return false;
    }
    // PDV filter
    if (selectedPdvId !== 'ALL' && item.pdvId !== selectedPdvId) return false;
    // Zone filter
    if (selectedZoneId !== 'ALL' && item.supervisorId !== selectedZoneId) return false;
    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchPdv = (item.pdvName || '').toLowerCase().includes(q);
      const matchCat = (item.reasonCategory || '').toLowerCase().includes(q);
      const matchReason = (item.detailedReason || '').toLowerCase().includes(q);
      const matchBy = (item.createdBy || '').toLowerCase().includes(q);
      if (!matchPdv && !matchCat && !matchReason && !matchBy) return false;
    }
    return true;
  });

  const totalJustifiedHours = filteredList.reduce((acc, curr) => acc + (Number(curr.totalSupplementaryHours) || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black px-3 py-0.5 rounded-full flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
              Gestión de Justificaciones Semanales
            </span>
            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Tiempos Suplementarios
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1.5">
            {isSupervisor 
              ? `Histórico de Justificaciones de Zona: ${currentUser.zoneName || 'Zona Asignada'}`
              : isPdv 
              ? `Justificación Semanal de Mi PDV: ${activePdvObj?.name || 'Tienda'}`
              : 'Histórico Nacional de Justificaciones Semanales'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro y sustentación formal de tiempos suplementarios de cada semana remitidos para revisión del Líder de Zona.
          </p>
        </div>

        {/* Action Button: Radicar Justificación (Visible for PDV, Admin, Auditor VRX) */}
        {(isPdv || isAdmin || isAuditorVrx) && (
          <button
            onClick={() => {
              setShowModal(true);
              setFeedbackMsg(null);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md cursor-pointer"
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
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* 3. Filters & KPI Cards */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Filtros de Búsqueda:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Period Type Toggle: ALL | WEEK | MONTH */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterPeriodType('ALL')}
                className={`px-3 py-1 rounded-lg transition ${filterPeriodType === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Todas las Semanas
              </button>
              <button
                onClick={() => setFilterPeriodType('WEEK')}
                className={`px-3 py-1 rounded-lg transition ${filterPeriodType === 'WEEK' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Por Semana
              </button>
              <button
                onClick={() => setFilterPeriodType('MONTH')}
                className={`px-3 py-1 rounded-lg transition ${filterPeriodType === 'MONTH' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Por Mes
              </button>
            </div>

            {/* Week Selector (if Por Semana) */}
            {filterPeriodType === 'WEEK' && (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 p-1.5 rounded-xl">
                <Calendar className="w-3.5 h-3.5 text-blue-600 ml-1" />
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="bg-transparent text-xs font-bold text-blue-900 focus:outline-hidden pr-2 cursor-pointer"
                >
                  {ALL_WEEKS_2026.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Month Selector (if Por Mes) */}
            {filterPeriodType === 'MONTH' && (
              <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 p-1.5 rounded-xl">
                <Calendar className="w-3.5 h-3.5 text-purple-600 ml-1" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-xs font-bold text-purple-900 focus:outline-hidden pr-2 cursor-pointer"
                >
                  <option value="2026-09">Septiembre 2026</option>
                  <option value="2026-08">Agosto 2026</option>
                  <option value="2026-07">Julio 2026</option>
                  <option value="2026-10">Octubre 2026</option>
                </select>
              </div>
            )}

            {/* PDV Selector (If not locked to single PDV) */}
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
                placeholder="Buscar por motivo, PDV..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden w-48 sm:w-56"
              />
            </div>

            <button
              onClick={loadJustifications}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              title="Actualizar listado"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mini KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 block uppercase">Total Radicadas</span>
            <span className="text-xl font-black text-slate-900">{filteredList.length}</span>
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
      </div>

      {/* 4. Table of Justifications */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Tablero de Histórico Semanal de Justificaciones ({filteredList.length})
            </h3>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            {filterPeriodType === 'WEEK' ? `Semana: ${selectedWeek}` : filterPeriodType === 'MONTH' ? `Mes: ${selectedMonth}` : 'Todas las Semanas'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="animate-spin w-6 h-6 border-3 border-amber-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            Cargando justificaciones semanales...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <p className="font-bold text-slate-700">No se encontraron justificaciones semanales para este período.</p>
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
                {filteredList.map((item, idx) => {
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

      {/* 5. MODAL: Radicar Justificación de la Semana */}
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
                  <p className="text-[11px] text-amber-100">Sustentación de tiempos suplementarios del PDV</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white p-1 rounded-lg">
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                >
                  {ALL_WEEKS_2026.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>
                      {w.label}
                    </option>
                  ))}
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

              {/* Categoría del Motivo (8 áreas) */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Área / Motivo del Cambio *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                >
                  {REASON_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Horas Suplementarias */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Total Horas Suplementarias a Justificar (hrs)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Ej: 14.5"
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
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold rounded-xl transition text-xs shadow-md disabled:opacity-50"
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
