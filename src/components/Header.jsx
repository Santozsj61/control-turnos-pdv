import React from 'react';
import { Clock, Users, Calendar, CheckSquare, BarChart3, Store, Settings, UserCheck, ShieldAlert, ArrowRightLeft, TrendingUp, FileText, Wrench, Home, LogOut, Activity } from 'lucide-react';
import ConnectionStatusBadge from './ConnectionStatusBadge.jsx';

export default function Header({ activeTab, setActiveTab, currentUser, onOpenUserSwitcher, onGoToHome, onLogout, pendingPermissionsCount }) {
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isEmployee = currentUser?.role === 'EMPLOYEE';
  const isPdv = currentUser?.role === 'PDV';
  const isMaintenanceApprover = currentUser?.role === 'MAINTENANCE_APPROVER';
  const isSantiago = currentUser?.fullName?.toLowerCase().includes('santiago') || 
                     currentUser?.username?.toLowerCase() === 'santiago' || 
                     currentUser?.role === 'ADMIN';
  const canAccessNetwork = isSantiago || isAuditorVrx || isAdmin;

  const navItems = [
    { id: 'schedule', label: isEmployee ? 'Mi Cronograma Semanal' : 'Programación de Horarios', icon: Calendar, show: !isMaintenanceApprover },
    { id: 'history', label: isEmployee ? 'Historial de Mi PDV' : 'Historial de Turnos', icon: Clock, show: !isMaintenanceApprover },
    { 
      id: 'permissions', 
      label: isMaintenanceApprover ? 'Aprobaciones Locativas/Mantenimiento' : isSupervisor ? 'Aprobación de Permisos' : 'Permisos y Novedades', 
      icon: isMaintenanceApprover ? Wrench : CheckSquare, 
      badge: (isSupervisor || isAdmin || isMaintenanceApprover) && pendingPermissionsCount > 0 ? pendingPermissionsCount : null,
      show: !isHrAdmin 
    },
    { id: 'reconciliation', label: 'Conciliación de Marcaciones', icon: BarChart3, show: !isMaintenanceApprover },
    { id: 'weekly_justification', label: 'Justificación Semanal', icon: FileText, show: !isMaintenanceApprover },
    { id: 'habitual_schedules', label: 'Horarios Habituales & Auditoría', icon: Clock, show: isAuditorVrx || isAdmin },
    { id: 'analytics', label: isAdmin || isHrAdmin || isAuditorVrx ? 'Dashboard Analítica Nacional' : 'Analítica & Alertas Zona', icon: TrendingUp, show: isAdmin || isHrAdmin || isAuditorVrx || isSupervisor },
    { id: 'tracking', label: isEmployee ? 'Mi Expediente & Historial' : 'Seguimiento & Hoja de Vida', icon: FileText, show: !isPdv && !isSupervisor && !isHrAdmin && !isEmployee && (isAdmin || isAuditorVrx) },
    { id: 'pdvs', label: isEmployee ? 'Mi Punto de Venta' : 'Directorio PDVs & Zonas', icon: Store, show: !isPdv && !isSupervisor && !isEmployee && (isAdmin || isHrAdmin || isAuditorVrx) },
    { id: 'network_monitor', label: '📡 Monitor de Red & Nube', icon: Activity, show: canAccessNetwork },
    { id: 'config', label: 'Reglas y Parámetros', icon: Settings, show: isAdmin || isHrAdmin || isAuditorVrx }
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner with Active User Information */}
      <div className="bg-slate-900 text-slate-100 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          
          <div className="flex items-center gap-3">
            <button
              onClick={onGoToHome}
              title="Volver a la Pantalla de Inicio"
              className="flex items-center gap-2 hover:opacity-90 transition group"
            >
              <img 
                src="/ncs_brands_logo.png" 
                alt="NCS BRANDS" 
                className="h-8 sm:h-9 w-auto object-contain rounded-md shadow-xs border border-slate-700/60"
              />
            </button>
            <div className="hidden lg:block pl-2 border-l border-slate-700">
              <span className="font-bold tracking-wide text-white text-xs">PORTAL HORARIOS & MARCADORES PDV</span>
              <span className="hidden xl:inline-block ml-2 text-slate-400 text-[11px]">| NCS BRANDS Colombia (CST)</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Online/Offline Status Indicator */}
            <ConnectionStatusBadge 
              currentUser={currentUser} 
              onOpenNetworkMonitor={canAccessNetwork ? () => setActiveTab('network_monitor') : null} 
            />

            <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1 rounded-full border border-slate-700">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-slate-400 text-xs hidden sm:inline">Sesión:</span>
              <span className="font-semibold text-white text-xs">{currentUser.fullName}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                isAdmin ? 'bg-purple-900/90 text-purple-200 border border-purple-600' :
                isHrAdmin ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-600' :
                isAuditorVrx ? 'bg-indigo-900/90 text-indigo-200 border border-indigo-600' :
                isSupervisor ? 'bg-amber-900/90 text-amber-200 border border-amber-600' :
                isMaintenanceApprover ? 'bg-orange-900/90 text-orange-200 border border-orange-600' :
                'bg-blue-900/90 text-blue-200 border border-blue-600'
              }`}>
                {isAdmin ? '👑 Admin General' : isHrAdmin ? '👥 Talento Humano' : isAuditorVrx ? '🛡️ Auditor VRX' : isSupervisor ? '👔 Líder de Zona' : isMaintenanceApprover ? '🛠️ Mantenimiento' : '🏬 Punto de Venta'}
              </span>
            </div>

            <button
              onClick={onGoToHome}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded-lg text-xs transition border border-slate-700 shadow-xs"
              title="Ir a la Pantalla de Inicio"
            >
              <Home className="w-3.5 h-3.5 text-blue-400" />
              <span>Inicio</span>
            </button>

            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 bg-rose-600/90 hover:bg-rose-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition shadow-xs"
                title="Cerrar Sesión y regresar a la pantalla principal"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2.5">
          {navItems.filter(item => item.show).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium text-xs sm:text-sm whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs border border-blue-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
