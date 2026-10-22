import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import RoleSwitcherModal from './components/RoleSwitcherModal.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import ScheduleForm from './components/ScheduleForm.jsx';
import HistoryView from './components/HistoryView.jsx';
import PermissionsView from './components/PermissionsView.jsx';
import ReconciliationView from './components/ReconciliationView.jsx';
import AnalyticsDashboard from './components/AnalyticsDashboard.jsx';
import EmployeeTrackingView from './components/EmployeeTrackingView.jsx';
import PdvDirectoryView from './components/PdvDirectoryView.jsx';
import ConfigView from './components/ConfigView.jsx';
import HabitualSchedulesAuditView from './components/HabitualSchedulesAuditView.jsx';
import NetworkMonitorView from './components/NetworkMonitorView.jsx';
import WeeklyJustificationView from './components/WeeklyJustificationView.jsx';
import PendingCoverageMonitorView from './components/PendingCoverageMonitorView.jsx';
import VrxAuditLogView from './components/VrxAuditLogView.jsx';
import QrAntiFraudLabModal from './components/QrAntiFraudLabModal.jsx';
import MobilePunchScreen from './components/MobilePunchScreen.jsx';
import { recordAuditEvent } from './services/auditService.js';

import { api } from './services/api.js';
import { initialSupervisors, initialPDVs, initialUsers } from './data/seedData.js';

function isTalentoHumanoUser(u) {
  if (!u) return false;
  return (
    u.role === 'HR_ADMIN' ||
    u.role === 'HR' ||
    u.role === 'TALENTO_HUMANO' ||
    u.role === 'TALENTO HUMANO' ||
    u.id === 'user-th' ||
    u.id === 'user-thumano' ||
    u.username?.toLowerCase() === 'th' ||
    u.username?.toLowerCase() === 'thumano' ||
    u.fullName?.toLowerCase().includes('talento humano')
  );
}

export default function App() {
  // Mobile QR Punch Scanner mode (when a smartphone scans the rotating QR code)
  const punchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const punchToken = punchParams?.get('punchToken');
  const punchPdv = punchParams?.get('pdv');
  const punchTs = punchParams?.get('ts');

  if (punchToken) {
    return (
      <MobilePunchScreen
        token={punchToken}
        pdvId={punchPdv}
        ts={punchTs}
        onBackToPortal={() => {
          window.location.href = window.location.pathname;
        }}
      />
    );
  }

  const [users, setUsers] = useState(initialUsers);
  const [pdvs, setPdvs] = useState(initialPDVs);
  const [supervisors, setSupervisors] = useState(initialSupervisors);
  const [currentUser, setCurrentUser] = useState(null);
  const [showHomeScreen, setShowHomeScreen] = useState(false);
  const [activeTab, setActiveTab] = useState('schedule');
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isQrLabOpen, setIsQrLabOpen] = useState(false);
  const [pendingPermissionsCount, setPendingPermissionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null);

  // Load baseline data with resilience
  async function initApp() {
    setLoading(true);
    setInitError(null);
    try {
      const [loadedUsers, loadedPdvs, loadedSups] = await Promise.all([
        api.getUsers().catch(() => []),
        api.getPDVs().catch(() => []),
        api.getSupervisors().catch(() => []),
        api.getWeeksWithData().catch(() => [])
      ]);

      const finalUsers = (loadedUsers && loadedUsers.length > 0) ? loadedUsers : initialUsers;
      const finalPdvs = (loadedPdvs && loadedPdvs.length > 0) ? loadedPdvs : initialPDVs;
      const finalSups = (loadedSups && loadedSups.length > 0) ? loadedSups : initialSupervisors;

      setUsers(finalUsers);
      setPdvs(finalPdvs);
      setSupervisors(finalSups);

      // Limpieza automática única de cachés locales antiguas (turnos, marcaciones, novedades)
      if (typeof window !== 'undefined' && window.localStorage) {
        const PURGE_KEY = 'control_turnos_purged_active_clean_v4';
        if (!localStorage.getItem(PURGE_KEY)) {
          const keysToRemove = Object.keys(localStorage).filter(k => 
            k.startsWith('control_turnos_schedules_') ||
            k === 'control_turnos_custom_employees' ||
            k === 'control_turnos_payroll_liquidation' ||
            k === 'control_turnos_novelties'
          );
          keysToRemove.forEach(k => localStorage.removeItem(k));
          localStorage.setItem(PURGE_KEY, 'true');
        }
      }

      // Check localStorage for saved session
      const savedUserStr = localStorage.getItem('control_turnos_user');
      let restoredUser = null;
      if (savedUserStr) {
        try {
          restoredUser = JSON.parse(savedUserStr);
        } catch (e) {
          restoredUser = null;
        }
      }

      if (restoredUser && restoredUser.id) {
        const matched = (loadedUsers || []).find(u => u.id === restoredUser.id) || restoredUser;
        setCurrentUser(matched);
        setShowHomeScreen(false);
        if (matched.role === 'MAINTENANCE_APPROVER') {
          setActiveTab('permissions');
        } else if (isTalentoHumanoUser(matched)) {
          setActiveTab('reconciliation');
        } else if (matched.role === 'AUDITOR_VRX') {
          setActiveTab('audit_logs');
        }
      } else {
        setCurrentUser(null);
        setShowHomeScreen(true);
      }
    } catch (err) {
      console.error('Error initializing data:', err);
      setCurrentUser(null);
      setShowHomeScreen(true);
      setInitError('No se pudo sincronizar con la base de datos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    initApp();
  }, []);

  // Poll / Check pending permissions for badges
  useEffect(() => {
    async function checkPending() {
      if (!currentUser) return;
      try {
        const filters = { status: 'PENDING' };
        if (currentUser.role === 'SUPERVISOR') {
          const sup = supervisors.find(s => s.id === currentUser.supervisorId || s.name === currentUser.fullName || currentUser.id?.includes(s.id));
          if (sup) {
            filters.supervisorId = sup.id;
            filters.excludeMaintenance = true;
          }
        } else if (currentUser.role === 'MAINTENANCE_APPROVER') {
          filters.isMaintenanceApprover = true;
        }
        const perms = await api.getPermissions(filters);
        if (Array.isArray(perms)) {
          setPendingPermissionsCount(perms.length);
        }
      } catch (err) {
        // silent
      }
    }
    checkPending();
  }, [currentUser, supervisors]);

  function handleSelectUser(newUser) {
    setCurrentUser(newUser);
    try {
      localStorage.setItem('control_turnos_user', JSON.stringify(newUser));
    } catch (e) {}

    // Record login audit event
    recordAuditEvent({
      userName: newUser.fullName || newUser.username,
      userRole: newUser.role,
      action: 'LOGIN',
      actionLabel: 'Inicio de Sesión',
      pdvName: newUser.pdvId || (newUser.role === 'SUPERVISOR' ? newUser.fullName : 'Sede Principal'),
      detail: `Acceso autenticado con perfil ${newUser.position || newUser.role}`
    });

    // Switch to appropriate tab based on role
    if (newUser.role === 'MAINTENANCE_APPROVER') {
      setActiveTab('permissions');
    } else if (newUser.role === 'AUDITOR_VRX') {
      setActiveTab('audit_logs');
    } else if (isTalentoHumanoUser(newUser)) {
      setActiveTab('reconciliation');
    } else {
      setActiveTab('schedule');
    }
  }

  // Ensure activeTab is always valid for Talento Humano
  useEffect(() => {
    if (isTalentoHumanoUser(currentUser)) {
      if (activeTab !== 'reconciliation' && activeTab !== 'analytics') {
        setActiveTab('reconciliation');
      }
    }
  }, [currentUser, activeTab]);

  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white space-y-4 p-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold tracking-wide">Cargando Portal de Horarios & Marcaciones PDV...</p>
        <button
          onClick={initApp}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-lg transition"
        >
          Reintentar Carga
        </button>
      </div>
    );
  }

  // Render Fullscreen Home Screen if requested or if no user is active
  if (!currentUser || showHomeScreen) {
    return (
      <HomeScreen
        users={users}
        pdvs={pdvs}
        supervisors={supervisors}
        currentUser={currentUser}
        onSelectUser={(u) => {
          handleSelectUser(u);
          setShowHomeScreen(false);
        }}
        onEnterPlatform={() => setShowHomeScreen(false)}
        onOpenNetworkMonitor={() => {
          const vrxUser = { 
            id: 'user-vrx', 
            username: 'AuditorVRX', 
            fullName: 'AUDITORÍA & CONTROL (VRX)', 
            role: 'AUDITOR_VRX', 
            position: 'AUDITOR DE CONTROL & COMPLIANCE' 
          };
          handleSelectUser(vrxUser);
          setActiveTab('network_monitor');
          setShowHomeScreen(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70 text-slate-900">
      {/* Header with Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenUserSwitcher={() => setIsSwitcherOpen(true)}
        onOpenQrLab={() => setIsQrLabOpen(true)}
        onGoToHome={() => setShowHomeScreen(true)}
        onLogout={() => {
          if (currentUser) {
            recordAuditEvent({
              userName: currentUser.fullName || currentUser.username,
              userRole: currentUser.role,
              action: 'LOGOUT',
              actionLabel: 'Cierre de Sesión',
              pdvName: currentUser.pdvId || (currentUser.role === 'SUPERVISOR' ? currentUser.fullName : 'Sede Principal'),
              detail: 'Cierre de sesión voluntario en el portal'
            });
          }
          try {
            localStorage.removeItem('control_turnos_user');
          } catch (e) {}
          setCurrentUser(null);
          setShowHomeScreen(true);
        }}
        pendingPermissionsCount={pendingPermissionsCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'schedule' && (
          <ScheduleForm
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
            onOpenPermissionTab={() => setActiveTab('permissions')}
            onReloadUsers={initApp}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'permissions' && (
          <PermissionsView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'reconciliation' && (
          <ReconciliationView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'weekly_justification' && (
          <WeeklyJustificationView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'pending_coverage' && (
          <PendingCoverageMonitorView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
            users={users}
          />
        )}

        {activeTab === 'habitual_schedules' && (
          <HabitualSchedulesAuditView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'tracking' && (
          <EmployeeTrackingView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
            users={users}
          />
        )}

        {activeTab === 'pdvs' && (
          <PdvDirectoryView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
            users={users}
            onReloadPdvs={initApp}
          />
        )}

        {activeTab === 'config' && (
          <ConfigView />
        )}

        {activeTab === 'network_monitor' && (
          <NetworkMonitorView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}

        {activeTab === 'audit_logs' && currentUser?.role === 'AUDITOR_VRX' && (
          <VrxAuditLogView
            currentUser={currentUser}
            pdvs={pdvs}
            supervisors={supervisors}
          />
        )}
      </main>

      {/* QR Anti-Fraud Testing Lab Modal */}
      <QrAntiFraudLabModal
        isOpen={isQrLabOpen}
        onClose={() => setIsQrLabOpen(false)}
        pdvs={pdvs}
      />

      {/* Role / User Switcher Modal */}
      <RoleSwitcherModal
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        users={users}
        pdvs={pdvs}
        supervisors={supervisors}
        currentUser={currentUser}
        onSelectUser={handleSelectUser}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400">
        <p>© 2026 Portal de Horarios, Turnos PDV & Conciliación Biométrica • Normativa Laboral Colombia (CST)</p>
      </footer>
    </div>
  );
}
