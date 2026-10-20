import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, ShieldCheck, Clock, Search, Filter, Download, RefreshCw, 
  UserCheck, Store, Building2, AlertTriangle, CheckCircle2, Calendar, 
  LogIn, LogOut, FileText, Send, Wrench, Sparkles, Layers, ShieldAlert,
  ArrowUpDown, ExternalLink
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getAuditLogs, formatAuditDate } from '../services/auditService.js';

export default function VrxAuditLogView({ currentUser, pdvs = [], supervisors = [] }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [selectedTimeRange, setSelectedTimeRange] = useState('ALL'); // 'TODAY' | 'WEEK' | 'ALL'

  async function loadLogs() {
    setLoading(true);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (e) {
      console.error('Error cargando bitácora de auditoría:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // Auto-refresh every 20 seconds to monitor live logins and movements nationwide
    const interval = setInterval(() => {
      loadLogs();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Filter logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;

    return logs.filter(log => {
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesUser = log.user_name?.toLowerCase().includes(q);
        const matchesPdv = log.pdv_name?.toLowerCase().includes(q);
        const matchesDetail = log.detail?.toLowerCase().includes(q);
        const matchesAction = log.action_label?.toLowerCase().includes(q);
        if (!matchesUser && !matchesPdv && !matchesDetail && !matchesAction) {
          return false;
        }
      }

      // Action Filter
      if (selectedAction !== 'ALL') {
        if (selectedAction === 'LOGIN' && log.action !== 'LOGIN' && log.action !== 'LOGOUT') return false;
        if (selectedAction === 'SCHEDULE' && !log.action.includes('SCHEDULE')) return false;
        if (selectedAction === 'PERMISSION' && !log.action.includes('PERMISSION')) return false;
        if (selectedAction === 'PUNCH' && !log.action.includes('PUNCH')) return false;
      }

      // Role Filter
      if (selectedRole !== 'ALL') {
        if (log.user_role !== selectedRole) return false;
      }

      // Time Range Filter
      if (selectedTimeRange !== 'ALL') {
        const logTime = new Date(log.created_at).getTime();
        if (selectedTimeRange === 'TODAY' && (now - logTime > oneDayMs)) return false;
        if (selectedTimeRange === 'WEEK' && (now - logTime > sevenDaysMs)) return false;
      }

      return true;
    });
  }, [logs, searchTerm, selectedAction, selectedRole, selectedTimeRange]);

  // Stats
  const stats = useMemo(() => {
    const total = logs.length;
    const logins = logs.filter(l => l.action === 'LOGIN').length;
    const scheduleActions = logs.filter(l => l.action?.includes('SCHEDULE')).length;
    const permissionsActions = logs.filter(l => l.action?.includes('PERMISSION')).length;
    return { total, logins, scheduleActions, permissionsActions };
  }, [logs]);

  // Export to Excel
  function exportToExcel() {
    if (filteredLogs.length === 0) return;

    const dataToExport = filteredLogs.map((l, index) => ({
      '#': index + 1,
      'Fecha y Hora (Colombia)': formatAuditDate(l.created_at),
      'Usuario / Responsable': l.user_name,
      'Rol / Perfil': l.user_role,
      'Punto de Venta / Zona': l.pdv_name || 'N/A',
      'Movimiento / Acción': l.action_label || l.action,
      'Detalle del Evento': l.detail || '',
      'ID de Registro': l.id
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bitacora_Auditoria_VRX');
    
    // Auto-fit column widths
    const colWidths = [
      { wch: 6 },
      { wch: 24 },
      { wch: 32 },
      { wch: 18 },
      { wch: 28 },
      { wch: 28 },
      { wch: 55 },
      { wch: 24 }
    ];
    ws['!cols'] = colWidths;

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Bitacora_Auditoria_Movimientos_VRX_${todayStr}.xlsx`);
  }

  // Get action icon and color
  function getActionBadge(action, actionLabel) {
    if (action === 'LOGIN') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          <LogIn className="w-3 h-3 text-blue-600" />
          {actionLabel || 'Inicio de Sesión'}
        </span>
      );
    }
    if (action === 'LOGOUT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          <LogOut className="w-3 h-3 text-slate-500" />
          {actionLabel || 'Cierre de Sesión'}
        </span>
      );
    }
    if (action.includes('DELETE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          {actionLabel || 'Eliminación de Malla'}
        </span>
      );
    }
    if (action.includes('SCHEDULE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
          <Calendar className="w-3 h-3 text-amber-600" />
          {actionLabel || 'Horario / Turnos'}
        </span>
      );
    }
    if (action.includes('APPROVE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {actionLabel || 'Aprobación'}
        </span>
      );
    }
    if (action.includes('REJECT')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          {actionLabel || 'Rechazo'}
        </span>
      );
    }
    if (action.includes('PUNCH')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
          <Clock className="w-3 h-3 text-indigo-600" />
          {actionLabel || 'Biométrico'}
        </span>
      );
    }
    if (action.includes('COLLABORATOR') || action.includes('USER')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-100 text-cyan-900 border border-cyan-300">
          <UserCheck className="w-3 h-3 text-cyan-600" />
          {actionLabel || 'Gestión Personal'}
        </span>
      );
    }
    if (action.includes('JUSTIFICATION')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
          <FileText className="w-3 h-3 text-purple-600" />
          {actionLabel || 'Justificación Semanal'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
        <Sparkles className="w-3 h-3 text-purple-600" />
        {actionLabel || action}
      </span>
    );
  }

  // Get Role badge
  function getRoleBadge(role) {
    if (role === 'SUPERVISOR') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
          Líder de Zona
        </span>
      );
    }
    if (role === 'PDV' || role === 'EMPLOYEE') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-300">
          Punto de Venta
        </span>
      );
    }
    if (role === 'HR_ADMIN') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
          Talento Humano
        </span>
      );
    }
    if (role === 'AUDITOR_VRX') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 border border-indigo-400">
          Auditor VRX
        </span>
      );
    }
    if (role === 'ADMIN') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-300">
          Administrador
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
        {role || 'N/A'}
      </span>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Banner - Exclusive VRX Audit styling */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-900/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Módulo Exclusivo Auditor Maestro VRX</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Trazabilidad Nacional Nube (Toda Colombia)</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>Bitácora de Auditoría & Control de Accesos</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-2 max-w-3xl leading-relaxed">
              Monitoreo y trazabilidad forense en vivo centralizado en la nube Supabase. Registra de forma inmutable cada persona que ingresa a la plataforma desde cualquier lugar de Colombia, fecha y hora de acceso, tienda/zona y movimientos sobre turnos, horarios y novedades.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={loadLogs}
              disabled={loading}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="Refrescar eventos en vivo"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refrescar</span>
            </button>

            <button
              onClick={exportToExcel}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-900/40 cursor-pointer"
              title="Descargar informe completo en Excel"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Bitácora Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Movimientos</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{stats.total}</div>
            <span className="text-[10px] text-slate-400 font-medium">Eventos en la bitácora</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center gap-4">
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
            <LogIn className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Inicios de Sesión</span>
            <div className="text-2xl font-black text-blue-700 mt-0.5">{stats.logins}</div>
            <span className="text-[10px] text-slate-400 font-medium">Accesos autenticados</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center gap-4">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Gestión de Turnos</span>
            <div className="text-2xl font-black text-amber-700 mt-0.5">{stats.scheduleActions}</div>
            <span className="text-[10px] text-slate-400 font-medium">Envíos y modificaciones</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Novedades & Permisos</span>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{stats.permissionsActions}</div>
            <span className="text-[10px] text-slate-400 font-medium">Resoluciones y cambios</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-3 justify-between">
          
          {/* Search box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre de persona, tienda, acción o palabra clave..."
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Filter by Action */}
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-bold text-slate-700 focus:bg-white"
            >
              <option value="ALL">🔍 Todas las Acciones</option>
              <option value="LOGIN">🔑 Inicios / Cierres de Sesión</option>
              <option value="SCHEDULE">📅 Programación de Turnos</option>
              <option value="PERMISSION">📋 Permisos & Novedades</option>
              <option value="PUNCH">⏱️ Cargas Biométricas</option>
            </select>

            {/* Filter by Role */}
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-bold text-slate-700 focus:bg-white"
            >
              <option value="ALL">👥 Todos los Perfiles</option>
              <option value="SUPERVISOR">👔 Líderes de Zona</option>
              <option value="PDV">🏬 Puntos de Venta (PDV)</option>
              <option value="HR_ADMIN">👩‍💼 Talento Humano</option>
              <option value="AUDITOR_VRX">🛡️ Auditoría VRX</option>
              <option value="ADMIN">👑 Administradores</option>
            </select>

            {/* Filter by Date Range */}
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-bold text-slate-700 focus:bg-white"
            >
              <option value="ALL">🗓️ Todo el Historial</option>
              <option value="TODAY">☀️ Movimientos de Hoy</option>
              <option value="WEEK">📅 Últimos 7 Días</option>
            </select>

            {(searchTerm || selectedAction !== 'ALL' || selectedRole !== 'ALL' || selectedTimeRange !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedAction('ALL');
                  setSelectedRole('ALL');
                  setSelectedTimeRange('ALL');
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 px-3 py-2"
              >
                Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span>Mostrando <strong>{filteredLogs.length}</strong> de <strong>{logs.length}</strong> movimientos auditados</span>
          <span className="font-mono text-slate-400">Hora de referencia: UTC-5 (Colombia)</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[11px] font-bold">
                <th className="py-3 px-3.5 w-12 text-center">#</th>
                <th className="py-3 px-3.5 w-44">Fecha & Hora Exacta</th>
                <th className="py-3 px-3.5 w-56">Persona / Usuario</th>
                <th className="py-3 px-3 w-32">Perfil / Rol</th>
                <th className="py-3 px-3 w-40">Tienda / PDV</th>
                <th className="py-3 px-3 w-44">Movimiento / Acción</th>
                <th className="py-3 px-4">Detalle del Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    <p className="font-bold">Cargando bitácora de auditoría...</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <ShieldAlert className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-600">No se encontraron movimientos con los filtros seleccionados</p>
                    <p className="text-xs text-slate-400 mt-1">Prueba cambiando los criterios de búsqueda o limpiando los filtros</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr key={log.id || index} className="hover:bg-slate-50/80 transition group">
                    <td className="py-3 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>
                    <td className="py-3 px-3.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      <div className="font-bold text-slate-900">
                        {formatAuditDate(log.created_at)}
                      </div>
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{log.user_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getRoleBadge(log.user_role)}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5 truncate max-w-[160px]" title={log.pdv_name}>
                        <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{log.pdv_name || 'Nacional'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getActionBadge(log.action, log.action_label)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium leading-relaxed">
                      {log.detail}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
