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

import { api } from './services/api.js';
import { initialSupervisors, initialPDVs, initialUsers } from './data/seedData.js';

export default function App() {
  const [users, setUsers] = useState(initialUsers);
  const [pdvs, setPdvs] = useState(initialPDVs);
  const [supervisors, setSupervisors] = useState(initialSupervisors);
  const [currentUser, setCurrentUser] = useState(null);
  const [showHomeScreen, setShowHomeScreen] = useState(false);
  const [activeTab, setActiveTab] = useState('schedule');
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
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
        api.getSupervisors().catch(() => [])
      ]);

      const finalUsers = (loadedUsers && loadedUsers.length > 0) ? loadedUsers : initialUsers;
      const finalPdvs = (loadedPdvs && loadedPdvs.length > 0) ? loadedPdvs : initialPDVs;
      const finalSups = (loadedSups && loadedSups.length > 0) ? loadedSups : initialSupervisors;

      setUsers(finalUsers);
      setPdvs(finalPdvs);
      setSupervisors(finalSups);

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
          const sup = supervisors.find(s => s.name === currentUser.fullName || currentUser.id?.includes(s.id));
          if (sup) filters.supervisorId = sup.id;
        } else if (currentUser.role === 'MAINTENANCE_APPROVER') {
          filters.recipientRole = 'MAINTENANCE_APPROVER';
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

    // Switch to appropriate tab based on role
    if (newUser.role === 'MAINTENANCE_APPROVER') {
      setActiveTab('permissions');
    } else {
      setActiveTab('schedule');
    }
  }

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
        onGoToHome={() => setShowHomeScreen(true)}
        onLogout={() => {
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
      </main>

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
