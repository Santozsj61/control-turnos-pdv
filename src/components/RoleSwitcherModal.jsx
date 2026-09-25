import React, { useState } from 'react';
import { 
  X, User, Shield, Briefcase, Store, Check, Lock, Key, 
  ArrowRight, AlertCircle, Sparkles, Building2, Search, Eye, EyeOff
} from 'lucide-react';
import { initialSupervisors, initialPDVs, initialUsers } from '../data/seedData.js';
import { api } from '../services/api.js';

export default function RoleSwitcherModal({ isOpen, onClose, users, pdvs, supervisors, currentUser, onSelectUser }) {
  if (!isOpen) return null;

  const effectivePdvs = (pdvs && pdvs.length > 0) ? pdvs : initialPDVs;
  const effectiveSupervisors = (supervisors && supervisors.length > 0) ? supervisors : initialSupervisors;
  const effectiveUsers = (users && users.length > 0) ? users : initialUsers;

  const [activeSubTab, setActiveSubTab] = useState('credentials'); // 'credentials', 'zonas', 'pdvs', 'directory'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pdvSearch, setPdvSearch] = useState('');
  const [zoneSearch, setZoneSearch] = useState('');
  const [selectedPdvId, setSelectedPdvId] = useState(effectivePdvs[0]?.id || 'pdv-1');
  const [pdvPassword, setPdvPassword] = useState(effectivePdvs[0]?.name ? effectivePdvs[0].name.substring(0, 4) : '');
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const quickRoles = [
    {
      user: 'Santiago',
      pass: '888',
      label: 'Santiago (Admin TI & Red)',
      role: 'ADMIN',
      icon: Shield,
      badge: 'Santiago (888)',
      color: 'blue',
      desc: 'Control total del sistema y acceso exclusivo al Monitor de Red & Nube'
    },
    {
      user: 'Administrador',
      pass: '888',
      label: 'Administrador General',
      role: 'ADMIN',
      icon: Shield,
      badge: 'Superusuario (888)',
      color: 'purple',
      desc: 'Control global, configuración de parámetros y auditoría'
    },
    {
      user: 'Zona',
      pass: '200101',
      label: 'Líder de Zona',
      role: 'SUPERVISOR',
      icon: Briefcase,
      badge: 'Supervisor (200101)',
      color: 'amber',
      desc: 'Supervisión regional, aprobación de horarios y 3er domingo'
    },
    {
      user: 'THumano',
      pass: '200102',
      label: 'Talento Humano (HR)',
      role: 'HR_ADMIN',
      icon: User,
      badge: 'Maestro RRHH (200102)',
      color: 'emerald',
      desc: 'CRUD maestro de PDVs, Zonas, Colaboradores y corte nómina'
    },
    {
      user: 'VRX',
      pass: '0814',
      label: 'Auditor / Control (VRX)',
      role: 'AUDITOR_VRX',
      icon: Shield,
      badge: 'Auditoría & Control (0814)',
      color: 'indigo',
      desc: 'Compliance, verificación de tolerancias y horas extras'
    }
  ];

  async function handleLoginSubmit(e) {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Por favor ingresa tu usuario y contraseña.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const loggedUser = await api.login({ username: username.trim(), password: password.trim() });
      if (loggedUser) {
        onSelectUser(loggedUser);
        onClose();
        return;
      }
    } catch (err) {
      console.error('Error logging in:', err);
      // Fallback local matching
      const cleanU = username.trim().toLowerCase();
      const cleanP = password.trim();
      if ((cleanU === 'administrador' || cleanU === 'santiago') && cleanP === '888') {
        onSelectUser({ 
          id: cleanU === 'santiago' ? 'user-santiago' : 'user-admin', 
          username: cleanU === 'santiago' ? 'Santiago' : 'Administrador',
          fullName: cleanU === 'santiago' ? 'SANTIAGO (ADMIN TI & RED)' : 'ADMINISTRADOR GENERAL', 
          role: 'ADMIN',
          position: cleanU === 'santiago' ? 'ADMINISTRADOR DE RED & TI' : 'SUPERUSUARIO'
        });
        onClose();
      } else if (cleanU === 'zona' && cleanP === '200101') {
        onSelectUser({ id: 'user-zone-1', fullName: 'LÍDER ZONA 2', role: 'SUPERVISOR', supervisorId: 'zone-1' });
        onClose();
      } else if (cleanU === 'thumano' && cleanP === '200102') {
        onSelectUser({ id: 'user-thumano', fullName: 'TALENTO HUMANO (HR)', role: 'HR_ADMIN' });
        onClose();
      } else if (cleanU === 'vrx') {
        if (cleanP === '0814') {
          onSelectUser({ id: 'user-vrx', fullName: 'AUDITORÍA & CONTROL (VRX)', role: 'AUDITOR_VRX' });
          onClose();
        } else {
          setErrorMsg('Contraseña de Auditor incorrecta (única clave autorizada: 0814).');
        }
      } else {
        setErrorMsg('Error de conexión o credenciales inválidas.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFillAndLogin(quick) {
    setUsername(quick.user);
    setPassword(quick.pass);
    setErrorMsg(null);
    // Direct instant login
    if (quick.user === 'Santiago') {
      onSelectUser({ 
        id: 'user-santiago', 
        username: 'Santiago', 
        fullName: 'SANTIAGO (ADMIN TI & RED)', 
        role: 'ADMIN', 
        position: 'ADMINISTRADOR DE RED & TI' 
      });
      onClose();
      return;
    }
    if (quick.role === 'ADMIN') {
      onSelectUser({ id: 'user-admin', username: 'Administrador', fullName: 'ADMINISTRADOR GENERAL', role: 'ADMIN', position: 'SUPERUSUARIO' });
      onClose();
    } else if (quick.role === 'SUPERVISOR') {
      const defaultSup = supervisors[0] || { id: 'zone-1', name: 'LÍDER ZONA 2', zoneName: 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)' };
      onSelectUser({ 
        id: `user-${defaultSup.id}`, 
        username: 'Zona', 
        fullName: defaultSup.name, 
        zoneName: defaultSup.zoneName, 
        role: 'SUPERVISOR', 
        supervisorId: defaultSup.id, 
        position: `LÍDER DE ZONA - ${defaultSup.zoneName || defaultSup.name}` 
      });
      onClose();
    } else if (quick.role === 'HR_ADMIN') {
      onSelectUser({ id: 'user-thumano', username: 'THumano', fullName: 'TALENTO HUMANO (HR)', role: 'HR_ADMIN', position: 'GERENCIA DE TALENTO HUMANO' });
      onClose();
    } else if (quick.role === 'AUDITOR_VRX') {
      onSelectUser({ id: 'user-vrx', username: 'VRX', fullName: 'AUDITORÍA & CONTROL (VRX)', role: 'AUDITOR_VRX', position: 'AUDITOR DE CONTROL & COMPLIANCE' });
      onClose();
    }
  }

  function handleSelectSupervisorDirect(sup) {
    const supUser = {
      id: `user-${sup.id}`,
      username: sup.code || sup.id,
      fullName: sup.name,
      zoneName: sup.zoneName,
      role: 'SUPERVISOR',
      position: `LÍDER DE ZONA - ${sup.zoneName || sup.name}`,
      area: 'RETAIL',
      pdvId: null,
      supervisorId: sup.id
    };
    onSelectUser(supUser);
    onClose();
  }

  async function handlePdvLogin() {
    const targetPdv = effectivePdvs.find(p => p.id === selectedPdvId) || effectivePdvs[0];
    if (!targetPdv) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const loggedUser = await api.login({
        pdvId: targetPdv.id,
        username: targetPdv.code || targetPdv.id,
        password: pdvPassword.trim()
      });

      if (loggedUser) {
        onSelectUser(loggedUser);
        onClose();
        return;
      }
    } catch (err) {
      console.error('Error logging into PDV:', err);
      const pdvUser = {
        id: `usr-${targetPdv.id}-admin`,
        username: targetPdv.code || targetPdv.id,
        fullName: `ADMINISTRADOR ${targetPdv.name.toUpperCase()}`,
        role: 'EMPLOYEE',
        position: 'ADMINISTRADOR(A) PUNTO DE VENTA',
        pdvId: targetPdv.id,
        supervisorId: targetPdv.supervisorId
      };
      onSelectUser(pdvUser);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const filteredPdvs = effectivePdvs.filter(p => 
    p.name.toLowerCase().includes(pdvSearch.toLowerCase()) || 
    (p.city && p.city.toLowerCase().includes(pdvSearch.toLowerCase())) ||
    (p.code && p.code.toLowerCase().includes(pdvSearch.toLowerCase())) ||
    (p.zoneName && p.zoneName.toLowerCase().includes(pdvSearch.toLowerCase()))
  );

  const filteredSupervisors = effectiveSupervisors.filter(s => 
    s.name.toLowerCase().includes(zoneSearch.toLowerCase()) || 
    (s.zoneName && s.zoneName.toLowerCase().includes(zoneSearch.toLowerCase())) ||
    (s.code && s.code.toLowerCase().includes(zoneSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Top Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-xs">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold">Control de Acceso & Perfiles (RBAC)</h3>
              <p className="text-xs text-slate-300">Inicia sesión con tus credenciales oficiales o selecciona un rol</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => { setActiveSubTab('credentials'); setErrorMsg(null); }}
            className={`px-3.5 py-2.5 rounded-t-xl transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'credentials'
                ? 'bg-white border-blue-600 text-blue-700 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Credenciales Oficiales</span>
          </button>

          <button
            onClick={() => { setActiveSubTab('zonas'); setErrorMsg(null); }}
            className={`px-3.5 py-2.5 rounded-t-xl transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'zonas'
                ? 'bg-white border-blue-600 text-blue-700 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-amber-600" />
            <span>Líderes de Zona (15 Zonas)</span>
          </button>

          <button
            onClick={() => { setActiveSubTab('pdvs'); setErrorMsg(null); }}
            className={`px-3.5 py-2.5 rounded-t-xl transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'pdvs'
                ? 'bg-white border-blue-600 text-blue-700 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Puntos de Venta (101 PDVs)</span>
          </button>

          <button
            onClick={() => { setActiveSubTab('directory'); setErrorMsg(null); }}
            className={`px-3.5 py-2.5 rounded-t-xl transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'directory'
                ? 'bg-white border-blue-600 text-blue-700 shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Colaboradores</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* TAB 1: CREDENCIALES OFICIALES */}
          {activeSubTab === 'credentials' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Form Input */}
              <form onSubmit={handleLoginSubmit} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span>Ingresar con Usuario y Clave</span>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Usuario (Username)</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="Ej: Administrador, Zona, THumano, VRX"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Contraseña / Clave (Password)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Ej: 888, 200101, 200102, 0814"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 pr-10 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center justify-center gap-2"
                  >
                    <span>{loading ? 'Verificando...' : 'Iniciar Sesión'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {/* Quick Access Cards */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">Perfiles Autorizados (1 Clic para Acceder):</span>
                  <span className="text-[11px] text-slate-400">Credenciales del Sistema</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {quickRoles.map(q => {
                    const Icon = q.icon;
                    const isCurrent = currentUser?.role === q.role || currentUser?.username === q.user;
                    return (
                      <button
                        key={q.user}
                        type="button"
                        onClick={() => handleQuickFillAndLogin(q)}
                        className={`p-3.5 rounded-2xl border text-left transition relative group ${
                          isCurrent
                            ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white shadow-xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-xl ${
                              q.color === 'purple' ? 'bg-purple-100 text-purple-700' :
                              q.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                              q.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-indigo-100 text-indigo-700'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                                <span>{q.label}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                User: <strong>{q.user}</strong> • Clave: <strong>{q.pass}</strong>
                              </div>
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">ACTIVO</span>
                          ) : (
                            <span className="opacity-0 group-hover:opacity-100 text-blue-600 text-xs font-bold transition shrink-0">Entrar →</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 line-clamp-1">{q.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LÍDERES DE ZONA (15 ZONAS REGIONALES) */}
          {activeSubTab === 'zonas' && (
            <div className="space-y-4 animate-in fade-in duration-150 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-amber-600" />
                    <span>Seleccionar Líder de Zona Regional ({supervisors.length} Zonas Disponibles)</span>
                  </span>
                  <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    Clave Oficial: 200101
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar zona por nombre (ej: Cali, Antioquia, Costa, Santanderes)..."
                    value={zoneSearch}
                    onChange={(e) => setZoneSearch(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {filteredSupervisors.map(sup => {
                    const supPdvs = pdvs.filter(p => p.supervisorId === sup.id);
                    const isSelected = currentUser?.supervisorId === sup.id || currentUser?.fullName === sup.name;
                    return (
                      <button
                        key={sup.id}
                        type="button"
                        onClick={() => handleSelectSupervisorDirect(sup)}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-900 font-bold'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-black text-xs text-slate-900">{sup.zoneName || sup.name}</div>
                          <div className="text-[11px] text-slate-600 mt-0.5 font-medium">
                            Supervisor: <strong>{sup.name}</strong>
                          </div>
                        </div>
                        <div className="text-[10px] text-amber-800 font-bold mt-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span>📍 {supPdvs.length} PDVs asignados</span>
                          <span className="text-blue-600 font-extrabold hover:underline">Ingresar →</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACCESO POR PUNTO DE VENTA (PDVS) */}
          {activeSubTab === 'pdvs' && (
            <div className="space-y-4 animate-in fade-in duration-150 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-blue-600" />
                    <span>Seleccionar Punto de Venta ({pdvs.length} PDVs Disponibles)</span>
                  </span>
                  <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    Contraseña: 4 primeros dígitos del nombre
                  </span>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar PDV por nombre, código o ciudad..."
                    value={pdvSearch}
                    onChange={(e) => setPdvSearch(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPdvs.map(pdv => {
                    const isSelected = selectedPdvId === pdv.id;
                    const prefix = pdv.name.substring(0, 4);
                    return (
                      <button
                        key={pdv.id}
                        type="button"
                        onClick={() => {
                          setSelectedPdvId(pdv.id);
                          setPdvPassword(prefix);
                          setErrorMsg(null);
                        }}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                          isSelected ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-xs">{pdv.name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span>Ciudad: <strong>{pdv.city}</strong></span>
                            <span>•</span>
                            <span>Zona: <strong>{pdv.zoneName || 'Regional'}</strong></span>
                            <span>•</span>
                            <span className="text-blue-700 font-mono font-bold">Clave: "{prefix}"</span>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Selected PDV credentials summary & password input */}
                {selectedPdvId && (() => {
                  const targetPdv = pdvs.find(p => p.id === selectedPdvId) || pdvs[0];
                  const expectedPass = targetPdv ? targetPdv.name.substring(0, 4) : '';
                  return (
                    <div className="pt-3 border-t border-slate-200 space-y-2.5">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Usuario Seleccionado:</span>
                          <span className="font-extrabold text-slate-900">{targetPdv?.name}</span>
                        </div>
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded">
                          {targetPdv?.code}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <label className="font-bold text-slate-700 text-xs shrink-0">
                            Contraseña (4 primeros dígitos):
                          </label>
                          <input
                            type="text"
                            value={pdvPassword}
                            onChange={(e) => setPdvPassword(e.target.value)}
                            placeholder={`Ej: ${expectedPass}`}
                            className="w-28 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-center text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handlePdvLogin}
                          disabled={loading}
                          className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>{loading ? 'Verificando...' : 'Iniciar Sesión en PDV'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB 4: COLABORADORES DEMO */}
          {activeSubTab === 'directory' && (
            <div className="space-y-4 animate-in fade-in duration-150 text-xs">
              <p className="text-slate-500 text-xs">
                Selecciona a cualquier colaborador individual para simular su sesión directa:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {users.map(user => {
                  const isSelected = currentUser?.id === user.id;
                  const pdv = pdvs.find(p => p.id === user.pdvId);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => { onSelectUser(user); onClose(); }}
                      className={`p-3 rounded-xl border text-left transition ${
                        isSelected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20' : 'border-slate-200 hover:bg-slate-50 bg-white'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-900">{user.fullName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {user.position} | CC: {user.documentId || user.code}
                      </div>
                      {pdv && (
                        <div className="text-[10px] text-blue-700 font-medium mt-1">
                          📍 {pdv.name}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Sesión actual: <strong className="text-slate-800">{currentUser?.fullName}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
