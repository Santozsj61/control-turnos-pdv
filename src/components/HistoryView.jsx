import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, Lock, Coffee, CheckCircle2, AlertCircle, 
  FileText, ChevronDown, ChevronRight, User, Filter, Store, 
  Layers, Search, ShieldCheck, Sparkles, Building2, UserCheck, Eye
} from 'lucide-react';

const DAYS_NAME = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function HistoryView({ currentUser, pdvs, supervisors }) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isEmployee = currentUser?.role === 'EMPLOYEE';

  const currentSupervisorObj = supervisors.find(s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id));

  // Allowed PDVs based on security scope
  const allowedPdvs = (isAdmin || isHrAdmin || isAuditorVrx)
    ? pdvs
    : isSupervisor
    ? pdvs.filter(p => p.supervisorId === currentSupervisorObj?.id)
    : pdvs.filter(p => p.id === currentUser?.pdvId || p.code === currentUser?.pdvId);

  const [selectedPdvId, setSelectedPdvId] = useState(
    isEmployee ? (currentUser.pdvId || allowedPdvs[0]?.id || 'pdv-1') : (allowedPdvs[0]?.id || 'pdv-1')
  );

  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState('2026-08-31');
  const [filterType, setFilterType] = useState('ALL'); // 'ALL', 'FIJO', 'TEMPORAL'
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEmpId, setExpandedEmpId] = useState(null);

  const activePdv = allowedPdvs.find(p => p.id === selectedPdvId || p.code === selectedPdvId) || allowedPdvs[0] || pdvs[0];
  const activeSupervisor = supervisors.find(s => s.id === activePdv?.supervisorId);

  // Fetch PDV schedules and employees
  useEffect(() => {
    async function loadData() {
      if (!activePdv?.id) return;
      setLoading(true);
      try {
        // 1. Fetch schedules for this PDV
        const resSched = await fetch(`/api/schedules?pdvId=${activePdv.id}`);
        const jsonSched = await resSched.json();
        let schedList = [];
        if (jsonSched.success) {
          schedList = jsonSched.data;
          setSchedules(schedList);
          // Auto-select the latest week if available
          if (schedList.length > 0 && !schedList.some(s => s.weekStart === selectedWeek)) {
            setSelectedWeek(schedList[0].weekStart);
          }
        }

        // 2. Fetch employees of this PDV
        const resUsers = await fetch(`/api/users?pdvId=${activePdv.id}`);
        const jsonUsers = await resUsers.json();
        if (jsonUsers.success) {
          setEmployees(jsonUsers.data.filter(u => u.role === 'EMPLOYEE'));
        }
      } catch (err) {
        console.error('Error loading history data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [activePdv?.id]);

  // Extract all distinct weekStart dates
  const availableWeeks = Array.from(new Set([
    '2026-08-31',
    '2026-09-07',
    '2026-09-14',
    '2026-09-21',
    ...schedules.map(s => s.weekStart)
  ])).sort().reverse();

  // Helper to get dates for horizontal matrix header
  function getDatesForWeek(startDateStr) {
    const start = new Date(startDateStr + 'T12:00:00Z');
    return DAYS_NAME.map((name, idx) => {
      const d = new Date(start.getTime() + idx * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      return {
        dayOfWeek: name,
        date: dateStr,
        formattedDate: d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
        isSunday: idx === 6
      };
    });
  }

  const weekDays = getDatesForWeek(selectedWeek);

  // Filter employees
  const filteredEmployees = employees.filter(emp => {
    const matchSearch = (emp.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (emp.documentId || '').includes(searchTerm);
    const matchType = filterType === 'ALL' || (emp.contractType || 'FIJO') === filterType;
    return matchSearch && matchType;
  });

  // Get schedules for the active week
  const currentWeekSchedules = schedules.filter(s => s.weekStart === selectedWeek);

  // Weekly stats calculation
  let totalWeekNetHours = 0;
  let totalWeekLunchHours = 0;
  let totalWeekSundays = 0;
  let scheduledEmployeesCount = 0;

  filteredEmployees.forEach(emp => {
    const empSched = currentWeekSchedules.find(s => s.userId === emp.id);
    if (empSched) {
      scheduledEmployeesCount++;
      totalWeekNetHours += (empSched.totalNetHours || 0);
      totalWeekLunchHours += (empSched.totalLunchHours || 0);
      empSched.shifts?.forEach(sh => {
        if (sh.isSunday && sh.netHours > 0) totalWeekSundays++;
      });
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-800 text-xs font-extrabold px-3 py-0.5 rounded-full flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Historial de Horarios PDV (Matriz Horizontal)
            </span>
            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              Lunes a Domingo
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <span>Historial Semanal de {activePdv?.name || 'Punto de Venta'}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Código: <strong className="text-slate-800">{activePdv?.code || 'N/A'}</strong> | Ciudad: <strong className="text-slate-800">{activePdv?.city || 'N/A'}</strong> | Líder de Zona: <strong className="text-slate-800">{activeSupervisor?.name || activePdv?.supervisorName || 'Asignado'}</strong>
          </p>
        </div>

        {/* PDV Selector for Admins & Supervisors */}
        {(!isEmployee && allowedPdvs.length > 1) && (
          <div className="w-full md:w-auto flex flex-col items-start md:items-end gap-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Seleccionar Tienda / PDV:</label>
            <select
              value={selectedPdvId}
              onChange={(e) => setSelectedPdvId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              {allowedPdvs.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name} ({p.city})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Week Selector Bar & KPI Badges */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Week Selector Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-slate-700 mr-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" /> Semanas Registradas:
            </span>
            {availableWeeks.map(w => {
              const isSelected = selectedWeek === w;
              const wDate = new Date(w + 'T12:00:00Z');
              const endDate = new Date(wDate.getTime() + 6 * 86400000);
              const label = `${wDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} al ${endDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
              return (
                <button
                  key={w}
                  onClick={() => setSelectedWeek(w)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Search & Contract Filter */}
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar colaborador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos los Contratos</option>
              <option value="FIJO">🏢 Personal Fijo (Planta)</option>
              <option value="TEMPORAL">⏱️ Personal Temporal (Apoyo)</option>
            </select>
          </div>
        </div>

        {/* KPI Mini-Cards for Active Week */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500">Colaboradores con Horario</div>
            <div className="text-base font-black text-slate-800 mt-0.5">
              {scheduledEmployeesCount} / {filteredEmployees.length} activos
            </div>
          </div>
          <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200/80">
            <div className="text-[11px] font-semibold text-blue-700">Total Horas Netas Programadas</div>
            <div className="text-base font-black text-blue-800 mt-0.5">
              {totalWeekNetHours.toFixed(1)} hrs
            </div>
          </div>
          <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80">
            <div className="text-[11px] font-semibold text-amber-700">Deducción de Almuerzos (1.5h)</div>
            <div className="text-base font-black text-amber-800 mt-0.5 flex items-center gap-1">
              <Coffee className="w-3.5 h-3.5 text-amber-600" /> {totalWeekLunchHours.toFixed(1)} hrs
            </div>
          </div>
          <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/80">
            <div className="text-[11px] font-semibold text-emerald-700">Estado de Programación</div>
            <div className="text-xs font-extrabold text-emerald-800 mt-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Oficial Bloqueado
            </div>
          </div>
        </div>
      </div>

      {/* Main Horizontal Matrix (Lunes a Domingo) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-black tracking-wide uppercase">
              Programación Semanal Horizontal • Semana {selectedWeek}
            </h3>
          </div>
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Horario Oficial Registrado
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
            Cargando historial horizontal del PDV...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <User className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.</p>
            <p className="text-xs text-slate-500 mt-0.5">Verifica los filtros de búsqueda o asocia personal en "Mi Cronograma Semanal".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              {/* Horizontal Days Table Header */}
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-extrabold border-b border-slate-200">
                  <th className="py-3 px-4 w-64 sticky left-0 bg-slate-100/95 z-10 shadow-2xs border-r border-slate-200">
                    Colaborador & Contrato
                  </th>
                  {weekDays.map(day => (
                    <th key={day.date} className={`py-3 px-3 text-center border-r border-slate-200 ${day.isSunday ? 'bg-amber-50/70 text-amber-900' : ''}`}>
                      <div className="font-extrabold text-[12px]">{day.dayOfWeek}</div>
                      <div className="text-[10px] font-semibold text-slate-500">{day.formattedDate}</div>
                    </th>
                  ))}
                  <th className="py-3 px-4 text-center w-36 bg-slate-100">
                    Totales Semanales
                  </th>
                </tr>
              </thead>

              {/* Horizontal Rows per Employee */}
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map(emp => {
                  const empSched = currentWeekSchedules.find(s => s.userId === emp.id);
                  const isFijo = (emp.contractType || 'FIJO') === 'FIJO';

                  // Map shifts by date for fast O(1) horizontal lookup
                  const shiftsByDate = {};
                  empSched?.shifts?.forEach(sh => {
                    shiftsByDate[sh.date] = sh;
                  });

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition">
                      {/* Sticky Colaborador Info */}
                      <td className="py-3.5 px-4 sticky left-0 bg-white hover:bg-slate-50/70 z-10 border-r border-slate-200 shadow-2xs">
                        <div className="font-bold text-slate-900 text-xs">{emp.fullName}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>CC: {emp.documentId}</span>
                          <span>•</span>
                          <span>{emp.position}</span>
                        </div>
                        <div className="mt-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                            isFijo
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {isFijo ? '🏢 Fijo' : '⏱️ Temporal'}
                          </span>
                        </div>
                      </td>

                      {/* 7 Horizontal Day Cells (Lunes a Domingo) */}
                      {weekDays.map(day => {
                        const shift = shiftsByDate[day.date];

                        if (!shift) {
                          return (
                            <td key={day.date} className="py-3 px-2 text-center border-r border-slate-100 text-slate-400 italic">
                              <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded">Sin asignar</span>
                            </td>
                          );
                        }

                        const isDayOff = shift.isDayOff || shift.shiftType === 'DESCANSO';
                        const isNovedad = ['INCAPACIDAD', 'VACACIONES', 'LICENCIA'].includes(shift.shiftType);

                        return (
                          <td 
                            key={day.date} 
                            className={`py-2.5 px-2 text-center border-r border-slate-100 align-middle ${
                              day.isSunday ? 'bg-amber-50/30' : ''
                            }`}
                          >
                            {isDayOff ? (
                              <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200/70 text-slate-600">
                                <span className="text-[10px] font-bold block">Descanso</span>
                                <span className="text-[9px] text-slate-500 font-semibold">(7.0h comp.)</span>
                              </div>
                            ) : isNovedad ? (
                              <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                                <span className="text-[10px] font-bold block capitalize">{shift.shiftType?.toLowerCase()}</span>
                                <span className="text-[9px] text-rose-600 font-semibold">(7.0h legal)</span>
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-lg bg-blue-50/70 border border-blue-200/80 text-blue-900 space-y-0.5">
                                <div className="text-[11px] font-black text-slate-900">
                                  {shift.startTime} - {shift.endTime}
                                </div>
                                <div className="flex items-center justify-center gap-1 text-[10px] font-extrabold text-blue-700">
                                  <span>{shift.netHours || 0}h netas</span>
                                </div>
                                {shift.lunchApplied && (
                                  <div className="text-[9px] font-semibold text-amber-700 flex items-center justify-center gap-0.5">
                                    <Coffee className="w-2.5 h-2.5" /> 1:30h
                                  </div>
                                )}
                                {shift.nightHours > 0 && (
                                  <div className="text-[9px] font-bold text-purple-700">
                                    🌙 {shift.nightHours}h noct.
                                  </div>
                                )}
                                {day.isSunday && shift.netHours > 0 && (
                                  <div className="text-[9px] font-bold text-amber-700">
                                    ☀️ Dom 75%
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Totales Semanales */}
                      <td className="py-3 px-3 text-center align-middle bg-slate-50/50">
                        {empSched ? (
                          <div className="space-y-1">
                            <div className="text-xs font-black text-blue-800">
                              {empSched.totalNetHours || 0} hrs netas
                            </div>
                            <div className="text-[10px] font-bold text-amber-700">
                              ☕ {empSched.totalLunchHours || 0}h almuerzo
                            </div>
                            <div className="text-[9px] font-semibold text-slate-500">
                              🔒 Bloqueado Oficial
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Sin registro</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical Records Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Este historial refleja exclusivamente los horarios oficiales bloqueados bajo la normativa de 42h semanales y compensatorios dominicales.</span>
        </div>
        <span className="font-bold text-slate-700">Total semanas disponibles: {availableWeeks.length}</span>
      </div>
    </div>
  );
}
