import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Store,
  Building2,
  Calendar,
  ShieldAlert,
  Moon,
  Sun,
  Flame,
  UserCheck,
  CheckCircle2,
  Filter,
  Download,
  Users,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import * as XLSX from 'xlsx';

export default function AnalyticsDashboard({ currentUser, pdvs, supervisors }) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  
  const currentSupervisorObj = supervisors.find(
    s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id)
  );

  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [selectedZone, setSelectedZone] = useState(
    isSupervisor ? (currentSupervisorObj?.id || '') : ''
  );
  const [selectedPdv, setSelectedPdv] = useState('');
  const [activeView, setActiveView] = useState('MOM_OVERVIEW'); // 'MOM_OVERVIEW', 'SPECIAL_HOURS', 'ZONES', 'ALERTS'
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      let url = `/api/analytics/dashboard?month=${selectedMonth}`;
      if (isSupervisor) {
        url += `&supervisorId=${currentSupervisorObj?.id || ''}`;
      } else if (isAdmin || isHrAdmin || isAuditorVrx) {
        if (selectedZone) url += `&supervisorId=${selectedZone}`;
        if (selectedPdv) url += `&pdvId=${selectedPdv}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setAnalyticsData(json.data);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, [selectedMonth, selectedZone, selectedPdv, currentUser?.id]);

  const momMetrics = analyticsData?.momMetrics || {
    overtime: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
    night: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
    sunday: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
    holiday: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
    totalSpecial: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' }
  };

  const topPdvsSpecial = analyticsData?.topPdvsSpecial || [];
  const topPdvsDeviations = analyticsData?.topPdvsDeviations || [];
  const nationalZonesRanking = analyticsData?.nationalZonesRanking || [];
  const operationalAlerts = analyticsData?.operationalAlerts || [];
  const monthlyComparisonChart = analyticsData?.monthlyComparisonChart || [];
  const weeklyComparison = analyticsData?.weeklyComparison || [];

  function renderMoMBadge(metric) {
    if (!metric) return null;
    const isUp = metric.diff > 0;
    const isDown = metric.diff < 0;
    const isZero = metric.diff === 0;

    return (
      <div className={`flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full ${
        isUp ? 'bg-rose-100 text-rose-800' : isDown ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
      }`}>
        {isUp && <ArrowUpRight className="w-3.5 h-3.5" />}
        {isDown && <ArrowDownRight className="w-3.5 h-3.5" />}
        {isZero && <Minus className="w-3.5 h-3.5" />}
        <span>{isUp ? `+${metric.pctChange}%` : isDown ? `${metric.pctChange}%` : '0%'} MoM</span>
      </div>
    );
  }

  function exportAnalyticsReport() {
    if (!analyticsData) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: MoM Summary
    const summaryData = [
      { 'Concepto': 'Horas Extras (HE)', 'Mes Actual (Sep 2026)': momMetrics.overtime.current, 'Mes Anterior (Ago 2026)': momMetrics.overtime.previous, 'Variación MoM (hrs)': momMetrics.overtime.diff, 'Variación %': `${momMetrics.overtime.pctChange}%` },
      { 'Concepto': 'Recargo Nocturno (RN)', 'Mes Actual (Sep 2026)': momMetrics.night.current, 'Mes Anterior (Ago 2026)': momMetrics.night.previous, 'Variación MoM (hrs)': momMetrics.night.diff, 'Variación %': `${momMetrics.night.pctChange}%` },
      { 'Concepto': 'Dominicales (DOM)', 'Mes Actual (Sep 2026)': momMetrics.sunday.current, 'Mes Anterior (Ago 2026)': momMetrics.sunday.previous, 'Variación MoM (hrs)': momMetrics.sunday.diff, 'Variación %': `${momMetrics.sunday.pctChange}%` },
      { 'Concepto': 'Festivos (FEST)', 'Mes Actual (Sep 2026)': momMetrics.holiday.current, 'Mes Anterior (Ago 2026)': momMetrics.holiday.previous, 'Variación MoM (hrs)': momMetrics.holiday.diff, 'Variación %': `${momMetrics.holiday.pctChange}%` },
      { 'Concepto': 'Total Suplementario', 'Mes Actual (Sep 2026)': momMetrics.totalSpecial.current, 'Mes Anterior (Ago 2026)': momMetrics.totalSpecial.previous, 'Variación MoM (hrs)': momMetrics.totalSpecial.diff, 'Variación %': `${momMetrics.totalSpecial.pctChange}%` }
    ];
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen MoM');

    // Sheet 2: Top PDVs
    const specialData = topPdvsSpecial.map(p => ({
      'Punto de Venta': p.pdvName,
      'Ciudad': p.city,
      'Líder de Zona': p.supervisorName,
      'Horas Extras (HE)': p.overtimeHours,
      'Recargo Nocturno (RN)': p.nightHours,
      'Dominicales (DOM)': p.sundayHours,
      'Festivos (FEST)': p.holidayHours || 0,
      'Total Suplementario': p.totalSpecialHours,
      'Mes Anterior': p.prevSpecialHours || 0,
      'Variación % MoM': `${p.momChangePct || 0}%`
    }));
    const ws2 = XLSX.utils.json_to_sheet(specialData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle por PDV');

    // Sheet 3: Zonas
    const zonesData = nationalZonesRanking.map(z => ({
      'Zona Regional': z.zoneName,
      'PDVs Asignados': z.pdvCount,
      'Colaboradores': z.employeeCount,
      'Horas Programadas': z.scheduledHours,
      'Horas Reales': z.realHours,
      'Horas Suplementarias': z.specialHours,
      'Mes Anterior': z.prevSpecialHours || 0,
      'Variación % MoM': `${z.momChangePct || 0}%`,
      'Cumplimiento Operativo': `${z.complianceRate}%`
    }));
    const ws3 = XLSX.utils.json_to_sheet(zonesData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Ranking Zonas');

    XLSX.writeFile(wb, `Reporte_Liquidacion_Tiempo_Suplementario_${selectedMonth}.xlsx`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* 1. Header Banner & Filter Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-purple-500/20 text-purple-300 border border-purple-400/30 text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {isAdmin || isHrAdmin || isAuditorVrx ? 'Control de Gestión & Liquidación Nacional' : 'Analítica Operacional de Zona'}
              </span>
            </div>
            <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
              <span>Dashboard Analítica & Variaciones Mes a Mes (MoM)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Monitoreo comparativo de Horas Extras, Recargos Nocturnos, Dominicales y Festivos (Agosto vs Septiembre 2026).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Month Filter */}
            <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700">
              <Calendar className="w-4 h-4 text-purple-400 ml-1 shrink-0" />
              <label className="text-xs text-slate-300 font-semibold shrink-0">Mes:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500"
              >
                <option value="2026-09">Septiembre 2026 (Actual)</option>
                <option value="2026-08">Agosto 2026 (Anterior)</option>
              </select>
            </div>

            {/* Zone Filter (Admin/HR only) */}
            {(isAdmin || isHrAdmin || isAuditorVrx) && (
              <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                <Building2 className="w-4 h-4 text-blue-400 ml-1 shrink-0" />
                <select
                  value={selectedZone}
                  onChange={(e) => { setSelectedZone(e.target.value); setSelectedPdv(''); }}
                  className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 max-w-44"
                >
                  <option value="">Todas las 15 Zonas</option>
                  {supervisors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={exportAnalyticsReport}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-purple-500/20"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Reporte (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI CARDS WITH MoM VARIATIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Horas Extras (HE) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-amber-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                <Flame className="w-5 h-5" />
              </div>
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Horas Extras</span>
            </div>
            {renderMoMBadge(momMetrics.overtime)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.overtime.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>Mes Anterior: <strong>{momMetrics.overtime.previous} hrs</strong></span>
              <span className={momMetrics.overtime.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                {momMetrics.overtime.diff > 0 ? `+${momMetrics.overtime.diff} hrs` : `${momMetrics.overtime.diff} hrs`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Recargo Nocturno (RN) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-indigo-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-indigo-100 text-indigo-800 rounded-xl">
                <Moon className="w-5 h-5" />
              </div>
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Recargo Nocturno</span>
            </div>
            {renderMoMBadge(momMetrics.night)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.night.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>Mes Anterior: <strong>{momMetrics.night.previous} hrs</strong></span>
              <span className={momMetrics.night.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                {momMetrics.night.diff > 0 ? `+${momMetrics.night.diff} hrs` : `${momMetrics.night.diff} hrs`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Dominicales (DOM) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-purple-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-purple-100 text-purple-800 rounded-xl">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Dominicales (75%)</span>
            </div>
            {renderMoMBadge(momMetrics.sunday)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.sunday.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>Mes Anterior: <strong>{momMetrics.sunday.previous} hrs</strong></span>
              <span className={momMetrics.sunday.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                {momMetrics.sunday.diff > 0 ? `+${momMetrics.sunday.diff} hrs` : `${momMetrics.sunday.diff} hrs`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Festivos (FEST) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                <Sun className="w-5 h-5" />
              </div>
              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Festivos (75%)</span>
            </div>
            {renderMoMBadge(momMetrics.holiday)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.holiday.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>Mes Anterior: <strong>{momMetrics.holiday.previous} hrs</strong></span>
              <span className={momMetrics.holiday.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                {momMetrics.holiday.diff > 0 ? `+${momMetrics.holiday.diff} hrs` : `${momMetrics.holiday.diff} hrs`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Total Suplementario Overall Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-5 border border-purple-800/40 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600 p-3 rounded-2xl">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-black text-purple-300 tracking-wider">Total Tiempo Suplementario Consolidado (HE + RN + DOM + FEST)</div>
            <div className="text-2xl font-black text-white mt-0.5">
              {momMetrics.totalSpecial.current} Horas Liquidadas
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-800/70 p-3 rounded-xl border border-slate-700 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Agosto 2026:</span>
            <span className="font-black text-slate-200">{momMetrics.totalSpecial.previous} hrs</span>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <div>
            <span className="text-slate-400 block text-[10px]">Variación Neta:</span>
            <span className={momMetrics.totalSpecial.diff > 0 ? 'font-black text-rose-400' : 'font-black text-emerald-400'}>
              {momMetrics.totalSpecial.diff > 0 ? `+${momMetrics.totalSpecial.diff}h` : `${momMetrics.totalSpecial.diff}h`}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <div>
            {renderMoMBadge(momMetrics.totalSpecial)}
          </div>
        </div>
      </div>

      {/* 3. Sub-View Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveView('MOM_OVERVIEW')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'MOM_OVERVIEW'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Comparativo MoM & Gráficas</span>
        </button>

        <button
          onClick={() => setActiveView('SPECIAL_HOURS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'SPECIAL_HOURS'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Ranking de PDVs ({topPdvsSpecial.length})</span>
        </button>

        <button
          onClick={() => setActiveView('ZONES')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'ZONES'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Consolidado por 15 Zonas</span>
        </button>

        <button
          onClick={() => setActiveView('ALERTS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'ALERTS'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Alertas Operacionales ({operationalAlerts.length})</span>
          {operationalAlerts.length > 0 && (
            <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full">
              {operationalAlerts.length}
            </span>
          )}
        </button>
      </div>

      {/* 4. TAB CONTENT: MoM COMPARATIVE CHARTS */}
      {activeView === 'MOM_OVERVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Multi-Month Special Hours Breakdown */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                <span>Evolución MoM por Tipo de Horas Suplementarias</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativo mes anterior (Agosto) vs mes actual (Septiembre)
              </p>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyComparisonChart} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="monthName" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="overtime" name="Horas Extras" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="night" name="Recargo Nocturno" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sunday" name="Dominicales" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="holiday" name="Festivos" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Week by Week Comparison */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Horas Programadas vs Reales por Semana</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Desempeño semanal de cumplimiento respecto a las 42 horas legales
              </p>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyComparison} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[35, 50]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="currentMonthReal" name="Real Septiembre" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="currentMonthProg" name="Programado Septiembre" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: TOP PDVS SPECIAL HOURS */}
      {activeView === 'SPECIAL_HOURS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900">Ranking de Puntos de Venta con Mayor Liquidación de Horas Suplementarias</h3>
              <p className="text-xs text-slate-500">Desglose por concepto y variación porcentual respecto al mes anterior</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Punto de Venta</th>
                  <th className="p-3">Ciudad</th>
                  <th className="p-3">Zona / Líder</th>
                  <th className="p-3 text-center">Horas Extras</th>
                  <th className="p-3 text-center">Recargo Nocturno</th>
                  <th className="p-3 text-center">Dominicales</th>
                  <th className="p-3 text-center">Festivos</th>
                  <th className="p-3 text-center bg-purple-950 text-purple-200">Total Suplementario</th>
                  <th className="p-3 text-center">Mes Anterior</th>
                  <th className="p-3 text-center">Variación MoM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {topPdvsSpecial.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-semibold">
                      No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                    </td>
                  </tr>
                ) : (
                  topPdvsSpecial.map((p, idx) => (
                    <tr key={p.pdvId} className={`hover:bg-slate-50 transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <span>{p.pdvName}</span>
                      </td>
                      <td className="p-3 text-slate-600 font-semibold">{p.city}</td>
                      <td className="p-3 text-slate-600">{p.supervisorName}</td>
                      <td className="p-3 text-center font-bold text-amber-700">{p.overtimeHours}h</td>
                      <td className="p-3 text-center font-bold text-indigo-700">{p.nightHours}h</td>
                      <td className="p-3 text-center font-bold text-purple-700">{p.sundayHours}h</td>
                      <td className="p-3 text-center font-bold text-emerald-700">{p.holidayHours || 0}h</td>
                      <td className="p-3 text-center font-black text-purple-950 bg-purple-50">{p.totalSpecialHours}h</td>
                      <td className="p-3 text-center text-slate-500 font-semibold">{p.prevSpecialHours || 0}h</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          p.momChangePct > 0 ? 'bg-rose-100 text-rose-800' : p.momChangePct < 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.momChangePct > 0 ? `+${p.momChangePct}%` : `${p.momChangePct}%`}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB CONTENT: 15 ZONES RANKING */}
      {activeView === 'ZONES' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900">Consolidado Nacional por Zonas Regionales (15 Zonas)</h3>
              <p className="text-xs text-slate-500">Supervisión regional, horas suplementarias consolidadas y tasa de cumplimiento</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Zona / Líder Regional</th>
                  <th className="p-3 text-center">PDVs</th>
                  <th className="p-3 text-center">Personal</th>
                  <th className="p-3 text-center">Horas Prog.</th>
                  <th className="p-3 text-center">Horas Reales</th>
                  <th className="p-3 text-center bg-purple-950 text-purple-200">Horas Suplementarias</th>
                  <th className="p-3 text-center">Mes Anterior</th>
                  <th className="p-3 text-center">Variación MoM</th>
                  <th className="p-3 text-center">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {nationalZonesRanking.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 font-semibold">
                      No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                    </td>
                  </tr>
                ) : (
                  nationalZonesRanking.map((z, idx) => (
                    <tr key={z.zoneId} className={`hover:bg-slate-50 transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <span>{z.zoneName}</span>
                      </td>
                      <td className="p-3 text-center font-bold text-blue-600">{z.pdvCount}</td>
                      <td className="p-3 text-center font-bold text-slate-700">{z.employeeCount}</td>
                      <td className="p-3 text-center font-semibold text-slate-600">{z.scheduledHours}h</td>
                      <td className="p-3 text-center font-semibold text-slate-600">{z.realHours}h</td>
                      <td className="p-3 text-center font-black text-purple-950 bg-purple-50">{z.specialHours}h</td>
                      <td className="p-3 text-center text-slate-500 font-semibold">{z.prevSpecialHours || 0}h</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          z.momChangePct > 0 ? 'bg-rose-100 text-rose-800' : z.momChangePct < 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {z.momChangePct > 0 ? `+${z.momChangePct}%` : `${z.momChangePct}%`}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${z.complianceRate >= 95 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${z.complianceRate}%` }}
                            ></div>
                          </div>
                          <span className="font-bold text-[11px] text-slate-800">{z.complianceRate}%</span>
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

      {/* 7. TAB CONTENT: OPERATIONAL ALERTS */}
      {activeView === 'ALERTS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Control de Normativa Laboral & Alertas de Incumplimiento</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificación automática de colaboradores que superan la jornada legal de 42h Lunes a Sábado o el límite de 2 domingos trabajados en el mes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {operationalAlerts.map((alt, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-2xl border shadow-xs flex items-start gap-3.5 ${
                  alt.severity === 'HIGH' ? 'bg-rose-50/70 border-rose-300' : 'bg-amber-50/70 border-amber-300'
                }`}
              >
                <div className={`p-2.5 rounded-xl ${alt.severity === 'HIGH' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'}`}>
                  {alt.type === 'SUNDAY_LIMIT_EXCEEDED' ? <Calendar className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div className="flex-1 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{alt.title}</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      alt.severity === 'HIGH' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                    }`}>
                      {alt.severity === 'HIGH' ? 'BLOQUEANTE' : 'ADVERTENCIA'}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-800">
                    Colaborador: {alt.employeeName} • PDV: {alt.pdvName}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {alt.description}
                  </p>
                </div>
              </div>
            ))}
            {operationalAlerts.length === 0 && (
              <div className="col-span-2 p-8 bg-emerald-50 border border-emerald-200 rounded-2xl text-center text-emerald-800">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                <div className="font-black text-sm">100% Cumplimiento Normativo</div>
                <p className="text-xs text-emerald-700 mt-1">No se detectaron excesos de 42 horas ni sobrecupo dominical en el período evaluado.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
