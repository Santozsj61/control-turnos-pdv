import React, { useState, useRef } from 'react';
import { 
  Store, Building2, UserCheck, ShieldCheck, ArrowRight, Lock, 
  Search, Check, AlertCircle, Eye, EyeOff, Sparkles, Clock, X
} from 'lucide-react';

import { api } from '../services/api.js';
import { initialSupervisors, initialPDVs } from '../data/seedData.js';
import ConnectionStatusBadge from './ConnectionStatusBadge.jsx';

export default function HomeScreen({ users, pdvs, supervisors, currentUser, onSelectUser, onEnterPlatform, onOpenNetworkMonitor }) {
  const effectivePdvs = (pdvs && pdvs.length > 0) ? pdvs : initialPDVs;
  const effectiveSupervisors = (supervisors && supervisors.length > 0) ? supervisors : initialSupervisors;

  const [activeModalProfile, setActiveModalProfile] = useState(null); // 'PDV' | 'ZONA' | 'HR' | 'VRX' | null
  
  // Login form state & ref for focus
  const passwordInputRef = useRef(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [selectedPdvId, setSelectedPdvId] = useState(effectivePdvs[0]?.id || 'pdv-1');
  const [pdvSearch, setPdvSearch] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // 4 Profiles Configuration
  const profiles = [
    {
      id: 'PDV',
      number: 'PERFIL #1',
      title: 'Punto de Venta (PDV)',
      subtitle: 'Tiendas & Administradores de Tienda',
      badge: '101 PUNTOS DE VENTA NACIONALES',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
      icon: Store,
      theme: 'blue',
      headerGradient: 'from-blue-600 to-indigo-700',
      btnGradient: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30',
      modalBadgeBg: 'bg-blue-600',
      actionLabel: 'Ingresar como Punto de Venta',
      defaultUserPlaceholder: 'Selecciona o escribe tu PDV'
    },
    {
      id: 'ZONA',
      number: 'PERFIL #2',
      title: 'Líder de Zona',
      subtitle: 'Supervisión Regional de Tiendas',
      badge: '15 ZONAS REGIONALES',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
      icon: Building2,
      theme: 'amber',
      headerGradient: 'from-amber-500 to-orange-600',
      btnGradient: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30',
      modalBadgeBg: 'bg-amber-600',
      actionLabel: 'Ingresar como Líder de Zona',
      defaultUserPlaceholder: 'Ej: Zona / Líder Regional'
    },
    {
      id: 'HR',
      number: 'PERFIL #3',
      title: 'Talento Humano (HR)',
      subtitle: 'Gestión Humana & Nómina',
      badge: 'CONTROL & AUDITORÍA NACIONAL',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
      icon: UserCheck,
      theme: 'emerald',
      headerGradient: 'from-emerald-600 to-teal-700',
      btnGradient: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30',
      modalBadgeBg: 'bg-emerald-600',
      actionLabel: 'Ingresar como Talento Humano',
      defaultUserPlaceholder: 'Ej: THumano'
    },
    {
      id: 'VRX',
      number: 'PERFIL #4',
      title: 'Auditoría & Control (VRX)',
      subtitle: 'Control de Gestión & Compliance',
      badge: 'CONTROL & COMPLIANCE VRX',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
      icon: ShieldCheck,
      theme: 'purple',
      headerGradient: 'from-purple-600 to-indigo-700',
      btnGradient: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30',
      modalBadgeBg: 'bg-purple-600',
      actionLabel: 'Ingresar como Auditor VRX',
      defaultUserPlaceholder: 'Ej: VRX'
    }
  ];

  function handleOpenModal(profile) {
    setActiveModalProfile(profile);
    setErrorMsg(null);
    setShowPassword(false);
    setLoginPassword('');
    
    if (profile.id === 'PDV') {
      if (effectivePdvs && effectivePdvs.length > 0) {
        setSelectedPdvId(effectivePdvs[0].id);
        setLoginUsername(effectivePdvs[0].name);
      } else {
        setSelectedPdvId('');
        setLoginUsername('');
      }
    } else if (profile.id === 'ZONA') {
      setLoginUsername('Zona');
    } else if (profile.id === 'HR') {
      setLoginUsername('THumano');
    } else if (profile.id === 'VRX') {
      setLoginUsername('VRX');
    } else {
      setLoginUsername('');
    }
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 100);
  }

  function handleCloseModal() {
    setActiveModalProfile(null);
    setErrorMsg(null);
    setLoginUsername('');
    setLoginPassword('');
    setShowPassword(false);
  }

  function triggerPasswordError() {
    setErrorMsg('Error de Clave intente nuevamente');
    setLoginPassword('');
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 50);
  }

  async function handleAuthenticate(e) {
    if (e) e.preventDefault();
    if (!activeModalProfile) return;

    if (!loginUsername.trim()) {
      setErrorMsg('Error de Clave intente nuevamente');
      triggerPasswordError();
      return;
    }
    if (!loginPassword.trim()) {
      triggerPasswordError();
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const payload = {
        username: loginUsername.trim(),
        password: loginPassword.trim()
      };

      if (activeModalProfile.id === 'PDV') {
        payload.pdvId = selectedPdvId;
      }

      const user = await api.login(payload);
      if (user) {
        onSelectUser(user);
        handleCloseModal();
      } else {
        triggerPasswordError();
      }
    } catch (err) {
      console.error('Error de autenticación:', err);
      // Fallback local matching
      const cleanP = loginPassword.trim();

      if (activeModalProfile.id === 'ZONA' && (cleanP === '200101' || cleanP === '888')) {
        const defaultSup = effectiveSupervisors[0] || { id: 'zone-1', name: 'Alexander Lopez', zoneName: 'ZONA VALLE CENTRO & TULUÁ' };
        onSelectUser({ id: `user-${defaultSup.id}`, username: 'Zona', fullName: defaultSup.name, role: 'SUPERVISOR', supervisorId: defaultSup.id });
        handleCloseModal();
      } else if (activeModalProfile.id === 'HR' && (cleanP === '888123' || cleanP === '200102' || cleanP === '888')) {
        onSelectUser({ id: 'user-thumano', username: 'THumano', fullName: 'TALENTO HUMANO (HR)', role: 'HR_ADMIN' });
        handleCloseModal();
      } else if (activeModalProfile.id === 'VRX' && (cleanP === '0814' || cleanP === '888')) {
        onSelectUser({ id: 'user-vrx', username: 'AuditorVRX', fullName: 'AUDITORÍA DE ASISTENCIA VRX', role: 'AUDITOR_VRX' });
        handleCloseModal();
      } else if (activeModalProfile.id === 'PDV' && (cleanP === '101888' || cleanP === '888')) {
        const pdv = effectivePdvs.find(p => p.id === selectedPdvId) || effectivePdvs[0];
        onSelectUser({
          id: `user-${pdv.id}`,
          username: pdv.code,
          fullName: pdv.name,
          role: 'PDV',
          pdvId: pdv.id,
          supervisorId: pdv.supervisorId
        });
        handleCloseModal();
      } else {
        triggerPasswordError();
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredPdvs = pdvs.filter(p => 
    p.name.toLowerCase().includes(pdvSearch.toLowerCase()) || 
    (p.city && p.city.toLowerCase().includes(pdvSearch.toLowerCase())) ||
    (p.code && p.code.toLowerCase().includes(pdvSearch.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      
      {/* ----------------------------------------------------------------- */}
      {/* 1. TOP NAVBAR / BRAND HEADER (Sin acceso Admin 888) */}
      {/* ----------------------------------------------------------------- */}
      <header className="border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Company Logo & Clean System Title */}
          <div className="flex items-center gap-4">
            <img 
              src="/ncs_brands_logo.png" 
              alt="NCS BRANDS" 
              className="h-10 sm:h-12 w-auto object-contain rounded-lg shadow-md border border-slate-700/60"
            />
            <div className="pl-4 border-l border-slate-700">
              <span className="text-xs sm:text-sm font-black tracking-wider text-slate-100 block uppercase">
                SISTEMA INTEGRAL DE GESTIÓN DE HORARIOS & TURNOS
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium block">
                NCS BRANDS • Normativa Laboral Colombia (CST)
              </span>
            </div>
          </div>

          {/* Right session action and live online status */}
          <div className="flex items-center gap-3">
            <ConnectionStatusBadge 
              currentUser={currentUser} 
              onOpenNetworkMonitor={onOpenNetworkMonitor}
            />
            {currentUser && (
              <button
                onClick={onEnterPlatform}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
              >
                <span>Continuar a Plataforma</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* 2. HERO BANNER WITH BACKGROUND IMAGE */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-slate-800 bg-slate-900">
        
        {/* Background Image with Dark Gradient Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/banner_bg.jpg" 
            alt="Fondo Operaciones de Turnos QUEST" 
            className="w-full h-full object-cover object-center opacity-30 filter brightness-90 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-900/80"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60"></div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14 space-y-4">
          
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 text-blue-300 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Plataforma Oficial de Control & Programación de Turnos</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight max-w-4xl">
            EFICIENCIA EN LA GESTIÓN DEL TIEMPO & PROGRAMACIÓN DE HORARIOS
          </h1>

          <p className="text-sm sm:text-base text-slate-300 font-normal max-w-3xl leading-relaxed">
            Plataforma corporativa de <strong>QUEST / QST (NCS S.A.S.)</strong> para la programación semanal de turnos, cumplimiento de la jornada legal ordinaria (<strong>42 horas semanales - Ley 2101 / CST</strong>), auditoría de descansos dominicales y conciliación con el reloj biométrico.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <Store className="w-4 h-4 text-blue-400" /> {pdvs.length > 0 ? `${pdvs.length} Puntos de Venta Nacionales` : 'Red de Puntos de Venta Nacionales'}
            </span>
            <span className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <Building2 className="w-4 h-4 text-amber-400" /> {supervisors.length > 0 ? `${supervisors.length} Zonas Regionales` : 'Supervisión Zonal & Regional'}
            </span>
            <span className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <Clock className="w-4 h-4 text-emerald-400" /> Control de Jornada 42h & Marcaciones
            </span>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* 3. SIMPLIFIED & COMPACT 4 PROFILE CARDS (Sin funciones ni claves) */}
      {/* ----------------------------------------------------------------- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-8 w-full flex-1">
        
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <span className="text-xs font-black uppercase tracking-widest text-blue-400">
            SELECCIÓN DE PERFIL DE USUARIO
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Selecciona tu Perfil para Identificarte e Ingresar
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Haz clic sobre tu perfil correspondiente para abrir el formulario de autenticación.
          </p>
        </div>

        {/* 4 Clean Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {profiles.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                onClick={() => handleOpenModal(p)}
                className="bg-slate-900/90 rounded-3xl border border-slate-800 hover:border-slate-700 transition-all duration-200 overflow-hidden flex flex-col justify-between group hover:shadow-2xl hover:shadow-blue-950/50 hover:-translate-y-1.5 cursor-pointer text-center"
              >
                {/* Compact Colored Header with Icon & Profile Tag */}
                <div className={`p-6 bg-gradient-to-br ${p.headerGradient} text-white flex flex-col items-center justify-center space-y-3 relative overflow-hidden`}>
                  <span className="text-[10px] font-black uppercase px-3 py-0.5 rounded-full bg-black/25 text-white backdrop-blur-xs border border-white/20 tracking-wider">
                    {p.number}
                  </span>

                  <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl shadow-inner group-hover:scale-110 transition-transform duration-200">
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-white leading-tight">
                      {p.title}
                    </h3>
                    <p className="text-xs text-white/85 font-medium">
                      {p.subtitle}
                    </p>
                  </div>
                </div>

                {/* Compact Body: Badge & Action Button Only */}
                <div className="p-6 space-y-5 flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-center">
                    <span className={`text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-xl border tracking-wide ${p.badgeClass}`}>
                      {p.badge}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenModal(p);
                    }}
                    className={`w-full font-bold text-xs py-3 px-4 rounded-2xl transition shadow-lg flex items-center justify-center gap-2 group-hover:opacity-95 ${p.btnGradient}`}
                  >
                    <span>{p.actionLabel}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ----------------------------------------------------------------- */}
      {/* 4. CLEAN FOOTER */}
      {/* ----------------------------------------------------------------- */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-5 px-4 sm:px-8 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 NCS BRANDS • QUEST / QST — Todos los derechos reservados.</p>
          <p className="text-[11px] text-slate-500">Portal de Horarios, Turnos PDV & Conciliación Biométrica</p>
        </div>
      </footer>

      {/* ----------------------------------------------------------------- */}
      {/* 5. MODAL DE AUTENTICACIÓN DINÁMICO */}
      {/* ----------------------------------------------------------------- */}
      {activeModalProfile && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl max-w-md w-full overflow-hidden text-white space-y-4">
            
            {/* Modal Header */}
            <div className="p-5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl text-white shadow-md ${activeModalProfile.modalBadgeBg}`}>
                  {React.createElement(activeModalProfile.icon, { className: 'w-5 h-5' })}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Acceso a {activeModalProfile.title}
                  </h3>
                  <p className="text-xs text-slate-400">Ingresa tus credenciales de acceso</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Notification */}
            {errorMsg && (
              <div className="mx-6 p-3 bg-rose-950/70 border border-rose-600/50 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleAuthenticate} className="p-6 space-y-4 text-xs">
              
              {/* Special PDV store selector if profile is PDV */}
              {activeModalProfile.id === 'PDV' && (
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-300">
                    Punto de Venta (Tienda) *
                  </label>
                  <div className="relative">
                    <select
                      value={selectedPdvId}
                      onChange={(e) => {
                        const pId = e.target.value;
                        setSelectedPdvId(pId);
                        const matched = effectivePdvs.find(p => p.id === pId);
                        if (matched) {
                          setLoginUsername(matched.name);
                        }
                        setErrorMsg(null);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                    >
                      {effectivePdvs.length === 0 ? (
                        <option value="">-- No hay PDVs registrados (Digita tu PDV abajo) --</option>
                      ) : (
                        effectivePdvs.map(pdv => (
                          <option key={pdv.id} value={pdv.id}>
                            {pdv.code} - {pdv.name} ({pdv.city})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* Special Zone selector if profile is ZONA */}
              {activeModalProfile.id === 'ZONA' && (
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-300">
                    Zona Regional / Líder de Zona
                  </label>
                  <select
                    onChange={(e) => {
                      const supId = e.target.value;
                      if (!supId) return;
                      const matched = effectiveSupervisors.find(s => s.id === supId);
                      if (matched) {
                        setLoginUsername(matched.name || matched.zoneName);
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="">-- Seleccionar Zona / Líder Regional (15 Zonas) --</option>
                    {effectiveSupervisors.map(sup => (
                      <option key={sup.id} value={sup.id}>
                        {sup.zoneName} — {sup.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Campo 1: Usuario */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300">
                  Usuario *
                </label>
                <input
                  type="text"
                  required
                  placeholder={activeModalProfile.defaultUserPlaceholder}
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Campo 2: Contraseña / Clave (Input password oculto) */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300">
                  Contraseña / Clave *
                </label>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Digita tu contraseña"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-xs text-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Botones de acción: Iniciar Sesión y Cancelar */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md ${activeModalProfile.btnGradient}`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{loading ? 'Verificando...' : 'Iniciar Sesión'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
