import React, { useState, useEffect } from 'react';
import {
  User,
  Store,
  Briefcase,
  Shield,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Award,
  Sun,
  FileText,
  Search,
  ChevronRight,
  TrendingUp,
  History
} from 'lucide-react';
import { api } from '../services/api.js';

export default function EmployeeTrackingView({ currentUser, pdvs = [], supervisors = [], users = [] }) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isEmployee = currentUser?.role === 'EMPLOYEE';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';

  const currentSupervisorObj = supervisors.find(
    s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id)
  );

  const canViewAll = isAdmin || isAuditorVrx;

  // Available employees based on role
  const availableEmployees = canViewAll
    ? (users || []).filter(u => u.role === 'EMPLOYEE' || u.position?.toLowerCase().includes('asesor') || (u.documentId && u.id !== currentUser?.id))
    : isSupervisor
    ? (users || []).filter(u => {
        const pdv = pdvs.find(p => p.id === u.pdvId);
        return pdv?.supervisorId === currentSupervisorObj?.id || u.supervisorId === currentSupervisorObj?.id;
      })
    : (users || []).filter(u => u.id === currentUser?.id);

  const effectiveEmployeeList = availableEmployees.length > 0 
    ? availableEmployees 
    : (users || []).filter(u => u.id !== currentUser?.id);

  const defaultSelectedId = isEmployee 
    ? (currentUser?.id || '')
    : (effectiveEmployeeList[0]?.id || (users || [])[0]?.id || '');

  const [selectedUserId, setSelectedUserId] = useState(defaultSelectedId);
  const [selectedPdvFilter, setSelectedPdvFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Default selection
  useEffect(() => {
    if (isEmployee) {
      setSelectedUserId(currentUser?.id || '');
    } else if (effectiveEmployeeList.length > 0) {
      if (!selectedUserId || !effectiveEmployeeList.some(e => e.id === selectedUserId)) {
        setSelectedUserId(effectiveEmployeeList[0].id);
      }
    }
  }, [currentUser?.id, effectiveEmployeeList.length]);

  async function fetchEmployeeTracking(userId) {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await api.getEmployeeTracking(userId);
      if (data) {
        setTrackingData(data);
      }
    } catch (err) {
      console.error('Error fetching employee dossier from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedUserId) {
      fetchEmployeeTracking(selectedUserId);
    }
  }, [selectedUserId]);

  const filteredEmployees = effectiveEmployeeList.filter(emp => {
    if (selectedPdvFilter !== 'ALL' && emp.pdvId !== selectedPdvFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const pdvObj = pdvs.find(p => p.id === emp.pdvId);
    const pdvName = (pdvObj?.name || '').toLowerCase();
    const pdvCode = (pdvObj?.code || '').toLowerCase();
    return (
      (emp.fullName || '').toLowerCase().includes(q) ||
      String(emp.documentId || '').includes(q) ||
      (emp.code || '').toLowerCase().includes(q) ||
      pdvName.includes(q) ||
      pdvCode.includes(q)
    );
  });

  const empUser = trackingData?.user;
  const empPdv = trackingData?.pdv;
  const empSupervisor = trackingData?.supervisor;
  const currentSun = trackingData?.currentMonthSundays;
  const punctualityScore = trackingData?.punctualityScore ?? 100;
  const schedules = trackingData?.schedules || [];
  const punches = trackingData?.punches || [];
  const permissions = trackingData?.permissions || [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              Hoja de Vida & Expediente Digital
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">
            {isEmployee ? 'Mi Expediente & Historial de Cumplimiento' : 'Seguimiento Individual de Colaboradores'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Consolidado histórico de turnos programados, marcaciones biométricas, descansos dominicales y permisos.
          </p>
        </div>

        {/* Employee Selection and Filters for Admin / Auditor / Supervisor */}
        {!isEmployee && (
          <div className="w-full xl:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Filter by PDV */}
            <div className="w-full sm:w-44">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Filtrar por Tienda</label>
              <select
                value={selectedPdvFilter}
                onChange={(e) => {
                  setSelectedPdvFilter(e.target.value);
                  const matched = effectiveEmployeeList.filter(emp => e.target.value === 'ALL' || emp.pdvId === e.target.value);
                  if (matched.length > 0 && !matched.some(m => m.id === selectedUserId)) {
                    setSelectedUserId(matched[0].id);
                  }
                }}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl px-2.5 py-2 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">-- Todos los PDVs --</option>
                {pdvs.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>

            {/* Quick Search */}
            <div className="w-full sm:w-44">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Buscar Colaborador</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nombre o CC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Collaborator Dropdown */}
            <div className="w-full sm:w-64">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Colaborador ({filteredEmployees.length})
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full bg-white border border-blue-400 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
              >
                {filteredEmployees.map(emp => {
                  const pObj = pdvs.find(p => p.id === emp.pdvId);
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} - CC {emp.documentId} {pObj ? `[${pObj.code}]` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-semibold">Cargando expediente del colaborador...</p>
        </div>
      ) : empUser ? (
        <div className="space-y-6">
          {/* Main Profile Header Card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-6 shadow-md border border-slate-700">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 border-2 border-blue-400 flex items-center justify-center font-black text-2xl text-white shadow-md">
                  {empUser.fullName?.charAt(0) || empUser.name?.charAt(0) || 'C'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">{empUser.fullName}</h2>
                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/40">
                      ACTIVO
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span><strong>Cargo:</strong> {empUser.position}</span>
                    <span><strong>Cédula:</strong> {empUser.documentId || 'Sin asignar'}</span>
                    <span><strong>Código:</strong> {empUser.code || (empUser.documentId ? `COD-${empUser.documentId.slice(-4)}` : 'COD-COLAB')}</span>
                  </div>
                </div>
              </div>

              {/* Assignment Badges */}
              <div className="flex flex-wrap gap-3">
                <div className="bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700 flex items-center gap-2.5">
                  <Store className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Punto de Venta</div>
                    <div className="text-xs font-bold text-white">{empPdv?.name || 'PDV Asignado'}</div>
                  </div>
                </div>

                <div className="bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700 flex items-center gap-2.5">
                  <Briefcase className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Líder de Zona</div>
                    <div className="text-xs font-bold text-white">{empSupervisor?.name || 'Jefe Asignado'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Compliance Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Sunday Tracker Widget */}
            <div className={`p-5 rounded-2xl border shadow-xs transition ${
              currentSun?.requiresApproval
                ? 'bg-rose-50 border-rose-300'
                : currentSun?.reachesLimit
                ? 'bg-amber-50 border-amber-300'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Domingos Septiembre</span>
                <div className={`p-2 rounded-xl ${
                  currentSun?.requiresApproval ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <Sun className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1 mt-2">
                <span className={`text-2xl font-black ${
                  currentSun?.requiresApproval ? 'text-rose-600' : currentSun?.reachesLimit ? 'text-amber-600' : 'text-slate-900'
                }`}>
                  {currentSun?.workedSundaysCount ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 2 domingos máx</span>
              </div>
              <div className="text-[11px] mt-1 font-medium">
                {currentSun?.requiresApproval ? (
                  <span className="text-rose-600 font-bold">⚠️ Excede límite (3+ domingos)</span>
                ) : currentSun?.reachesLimit ? (
                  <span className="text-amber-700 font-bold">Alcanzó el límite mensual legal</span>
                ) : (
                  <span className="text-emerald-600 font-bold">Dentro del límite legal</span>
                )}
              </div>
            </div>

            {/* Punctuality Score */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Score de Puntualidad</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-emerald-600 mt-2">{punctualityScore}%</div>
              <div className="text-[11px] text-slate-400 mt-1">Evaluado con reloj biométrico</div>
            </div>

            {/* Total Schedules Registered */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cronogramas Registrados</span>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-blue-700 mt-2">{schedules.length} semanas</div>
              <div className="text-[11px] text-slate-400 mt-1">Histórico en plataforma</div>
            </div>

            {/* Total Punches Logged */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Marcaciones Biométricas</span>
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-purple-700 mt-2">{punches.length} registros</div>
              <div className="text-[11px] text-slate-400 mt-1">Entradas y salidas conciliadas</div>
            </div>
          </div>

          {/* Section 1: Weekly Schedules History */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  Histórico de Programación de Turnos (Semanas)
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{schedules.length} semanas programadas</span>
            </div>

            {schedules.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No hay cronogramas registrados para este colaborador.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {schedules.map((sc, idx) => (
                  <div key={idx} className="p-4 hover:bg-slate-50/70 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <span className="font-bold text-xs text-slate-900">Semana {sc.weekStart}</span>
                        <span className="text-xs text-slate-400 ml-2">Total Programado: <strong>{sc.totalNetHours} hrs</strong></span>
                      </div>
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-200 self-start sm:self-auto">
                        Estado: Aprobado
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {sc.shifts?.map((sh, sIdx) => (
                        <div key={sIdx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                          <div className="font-bold text-slate-500 text-[10px] uppercase">{sh.dayName || `Día ${sIdx+1}`}</div>
                          <div className="font-semibold text-slate-800 mt-1">
                            {sh.shiftType === 'DESCANSO' || sh.isDayOff ? (
                              <span className="text-slate-700 font-bold">Descanso (7h)</span>
                            ) : sh.shiftType === 'INCAPACIDAD' ? (
                              <span className="text-rose-600 font-bold">Incapacidad (7h)</span>
                            ) : sh.shiftType === 'VACACIONES' ? (
                              <span className="text-emerald-600 font-bold">Vacaciones (7h)</span>
                            ) : sh.shiftType === 'LICENCIA' ? (
                              <span className="text-purple-600 font-bold">Licencia (7h)</span>
                            ) : sh.shiftType === 'NO_PROGRAMADO' ? (
                              <span className="text-slate-400">No Programado (0h)</span>
                            ) : (
                              <span>{sh.startTime} - {sh.endTime}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-blue-600 font-bold mt-0.5">{sh.netHours} hrs</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Biometric Punch Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  Registro de Marcaciones Biométricas Reales
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{punches.length} marcaciones registradas</span>
            </div>

            {punches.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No hay marcaciones biométricas registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-4">Fecha</th>
                      <th className="py-2.5 px-4">Hora Ingreso</th>
                      <th className="py-2.5 px-4">Hora Salida</th>
                      <th className="py-2.5 px-4">Almuerzo</th>
                      <th className="py-2.5 px-4 text-right">Horas Netas</th>
                      <th className="py-2.5 px-4 text-center">Estado Marcación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {punches.map((p, pIdx) => {
                      const hasExit = !!p.exitTime && p.exitTime !== '';
                      const net = p.realCalculations?.netHours || 0;
                      return (
                        <tr key={pIdx} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{p.entryDate || '-'}</td>
                          <td className="py-2.5 px-4 font-mono text-emerald-700 font-bold">{p.entryTime || '-'}</td>
                          <td className="py-2.5 px-4 font-mono">
                            {hasExit ? (
                              <span className="text-slate-800 font-bold">{p.exitTime}</span>
                            ) : (
                              <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px]">Sin Marcación</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {(p.realCalculations?.lunchHours > 0 || p.realCalculations?.lunchApplied) ? (
                              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                1:30
                              </span>
                            ) : (
                              <span 
                                className="font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded text-[10px]" 
                                title={p.realCalculations?.lunchReason || 'Sin deducción de almuerzo (ingreso después de 12:30 PM o jornada corta)'}
                              >
                                0:00
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">{net}h</td>
                          <td className="py-2.5 px-4 text-center">
                            {!hasExit ? (
                              <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">Incompleta</span>
                            ) : net < 4.0 ? (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">Jornada Corta</span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">Conforme</span>
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

          {/* Section 3: Permission & Novelty Requests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  Historial de Permisos & Novedades Solicitadas
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-semibold">{permissions.length} solicitudes</span>
            </div>

            {permissions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No registra solicitudes de permiso o cambios de turno.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {permissions.map((perm, idx) => (
                  <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">Fecha del Permiso: {perm.date}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          perm.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          perm.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {perm.status === 'APPROVED' ? 'Aprobado' : perm.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1"><strong>Motivo:</strong> {perm.reason}</p>
                      {perm.supervisorNotes && (
                        <p className="text-[11px] text-slate-500 mt-0.5"><strong>Respuesta Líder:</strong> {perm.supervisorNotes}</p>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      Solicitado el {new Date(perm.requestedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
          <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.</h3>
          <p className="text-xs text-slate-500 mt-1">Seleccione un colaborador para ver su expediente e historial de turnos.</p>
        </div>
      )}
    </div>
  );
}
