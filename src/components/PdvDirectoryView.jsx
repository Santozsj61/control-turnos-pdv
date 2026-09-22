import React, { useState } from 'react';
import { 
  Store, Users, User, Clock, MapPin, Briefcase, Search, PlusCircle, 
  Trash2, CheckCircle2, AlertCircle, Shield, Phone, Mail, Globe,
  Building2, Sparkles, Filter, Edit3
} from 'lucide-react';

export default function PdvDirectoryView({ currentUser, pdvs, supervisors, users, onReloadPdvs }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupFilter, setSelectedSupFilter] = useState('');
  const [activeTab, setActiveTab] = useState('PDVS'); // 'PDVS' or 'ZONAS'

  // Modals state
  const [showCreatePdvModal, setShowCreatePdvModal] = useState(false);
  const [showCreateZonaModal, setShowCreateZonaModal] = useState(false);
  const [editingZona, setEditingZona] = useState(null);
  
  // Form states
  const [pdvForm, setPdvForm] = useState({
    code: '',
    name: '',
    city: 'BOGOTÁ',
    supervisorId: supervisors[0]?.id || 'sup-1',
    openingHour: '10:00',
    closingHour: '20:30',
    allowedShifts: '10:00 - 20:30, 10:00 - 18:00, 11:00 - 19:00, 12:00 - 20:30'
  });

  const [zonaForm, setZonaForm] = useState({
    name: '',
    zoneCode: '',
    phone: '+57 300 123 4567',
    email: ''
  });

  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isEmployee = currentUser?.role === 'EMPLOYEE';
  const canManagePdvAndZonas = isAdmin || isHrAdmin || isAuditorVrx;

  const currentSupervisorObj = supervisors.find(s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id));

  // Determine scoped PDVs based on security tier
  const basePdvs = (isAdmin || isHrAdmin || isAuditorVrx)
    ? pdvs
    : isSupervisor
    ? pdvs.filter(p => p.supervisorId === currentSupervisorObj?.id)
    : pdvs.filter(p => p.id === currentUser?.pdvId);

  const employees = users.filter(u => u.role === 'EMPLOYEE');

  const filteredPdvs = basePdvs.filter(p => {
    if (selectedSupFilter && p.supervisorId !== selectedSupFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchPdv = p.name?.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q);
      const sup = supervisors.find(s => s.id === p.supervisorId);
      const matchSup = sup?.name?.toLowerCase().includes(q);
      if (!matchPdv && !matchSup) return false;
    }
    return true;
  });

  const filteredZonas = supervisors.filter(s => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.zoneCode?.toLowerCase().includes(q);
    }
    return true;
  });

  // Handle PDV Creation
  async function handleSavePdv(e) {
    e.preventDefault();
    if (!pdvForm.name.trim() || !pdvForm.city.trim()) {
      setMessage({ type: 'error', text: 'Nombre del PDV y Ciudad son campos obligatorios.' });
      return;
    }

    setLoading(true);
    try {
      const shiftsArray = pdvForm.allowedShifts
        ? pdvForm.allowedShifts.split(',').map(s => s.trim()).filter(Boolean)
        : ['10:00 - 20:30', '10:00 - 18:00', '11:00 - 19:00'];

      const payload = {
        code: pdvForm.code.trim().toUpperCase(),
        name: pdvForm.name.trim().toUpperCase(),
        city: pdvForm.city.trim().toUpperCase(),
        supervisorId: pdvForm.supervisorId,
        openingHour: pdvForm.openingHour,
        closingHour: pdvForm.closingHour,
        allowedShifts: shiftsArray
      };

      const res = await fetch('/api/pdvs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.message || 'Punto de Venta registrado exitosamente.' });
        setShowCreatePdvModal(false);
        if (onReloadPdvs) onReloadPdvs();
      } else {
        setMessage({ type: 'error', text: json.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al procesar la solicitud de PDV.' });
    } finally {
      setLoading(false);
    }
  }

  // Handle Zona Creation & Update
  async function handleSaveZona(e) {
    e.preventDefault();
    if (!zonaForm.name.trim()) {
      setMessage({ type: 'error', text: 'Nombre de la Zona / Supervisor es requerido.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: zonaForm.name.trim().toUpperCase(),
        zoneCode: zonaForm.zoneCode.trim().toUpperCase(),
        phone: zonaForm.phone,
        email: zonaForm.email
      };

      let url = '/api/zonas';
      let method = 'POST';

      if (editingZona) {
        url = `/api/zonas/${editingZona.id}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.message || 'Zona guardada con éxito.' });
        setShowCreateZonaModal(false);
        setEditingZona(null);
        if (onReloadPdvs) onReloadPdvs();
      } else {
        setMessage({ type: 'error', text: json.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al procesar la solicitud de Zona.' });
    } finally {
      setLoading(false);
    }
  }

  // Handle Delete PDV
  async function handleDeletePdv(pdvId, pdvName) {
    if (!window.confirm(`¿Estás seguro de eliminar el Punto de Venta "${pdvName}"?`)) return;

    try {
      const res = await fetch(`/api/pdvs/${pdvId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `PDV "${pdvName}" eliminado correctamente.` });
        if (onReloadPdvs) onReloadPdvs();
      } else {
        setMessage({ type: 'error', text: json.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al eliminar el PDV.' });
    }
  }

  // Handle Delete Zona
  async function handleDeleteZona(zonaId, zonaName) {
    if (!window.confirm(`¿Estás seguro de eliminar la Zona "${zonaName}"?`)) return;

    try {
      const res = await fetch(`/api/zonas/${zonaId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `Zona "${zonaName}" eliminada correctamente.` });
        if (onReloadPdvs) onReloadPdvs();
      } else {
        setMessage({ type: 'error', text: json.error });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al eliminar la Zona.' });
    }
  }

  function openEditZona(sup) {
    setEditingZona(sup);
    setZonaForm({
      name: sup.name || '',
      zoneCode: sup.zoneCode || '',
      phone: sup.phone || '',
      email: sup.email || ''
    });
    setShowCreateZonaModal(true);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* 1. Header & Quick Statistics */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              {isSupervisor ? 'Zona Asignada' : isEmployee ? 'Punto de Venta' : 'Estructura Organizacional Retail'}
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1.5">
            {isSupervisor
              ? `Mis PDVs Asignados (${basePdvs.length})`
              : isEmployee
              ? `Mi Punto de Venta: ${basePdvs[0]?.name || 'Tienda Asignada'}`
              : `Directorio Maestro: ${supervisors.length} Zonas & ${pdvs.length} Puntos de Venta`}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isSupervisor
              ? `Líder de Zona: ${currentSupervisorObj?.name} • Gestión integral de tiendas asignadas.`
              : canManagePdvAndZonas
              ? 'Administración y configuración oficial de Puntos de Venta (PDV) y Zonas Regionales.'
              : 'Directorio de tiendas y canales de atención.'}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-800/80 p-3 rounded-2xl border border-slate-700 text-center">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Zonas / Líderes</div>
            <div className="text-xl font-black text-amber-400">{supervisors.length}</div>
          </div>
          <div className="h-7 w-px bg-slate-700"></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Puntos de Venta</div>
            <div className="text-xl font-black text-blue-400">{pdvs.length}</div>
          </div>
          <div className="h-7 w-px bg-slate-700"></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold">Colaboradores</div>
            <div className="text-xl font-black text-emerald-400">{employees.length}</div>
          </div>
        </div>
      </div>

      {/* Alert Messages */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-in fade-in duration-150 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs font-bold text-slate-500 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* 2. Navigation Tabs (PDVs vs Zonas) & Management Action Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('PDVS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
              activeTab === 'PDVS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Puntos de Venta ({filteredPdvs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ZONAS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition ${
              activeTab === 'ZONAS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Zonas Regionales ({filteredZonas.length})</span>
          </button>
        </div>

        {/* THumano / Admin Add Buttons */}
        {canManagePdvAndZonas && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingZona(null);
                setZonaForm({ name: '', zoneCode: `ZONA-${supervisors.length + 1}`, phone: '+57 300 000 0000', email: '' });
                setShowCreateZonaModal(true);
              }}
              className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs px-3.5 py-2 rounded-xl transition border border-amber-200"
            >
              <PlusCircle className="w-4 h-4 text-amber-600" />
              <span>+ Crear Nueva Zona</span>
            </button>

            <button
              onClick={() => {
                setPdvForm({
                  code: `PDV-${pdvs.length + 1}`,
                  name: '',
                  city: 'BOGOTÁ',
                  supervisorId: supervisors[0]?.id || 'sup-1',
                  openingHour: '10:00',
                  closingHour: '20:30',
                  allowedShifts: '10:00 - 20:30, 10:00 - 18:00, 11:00 - 19:00'
                });
                setShowCreatePdvModal(true);
              }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-md shadow-blue-500/20"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Registrar Nuevo PDV</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Search and Zone Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-64">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === 'PDVS' ? 'Buscar por PDV, código o ciudad...' : 'Buscar por nombre o código de zona...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-xs rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 font-semibold"
          />
        </div>

        {activeTab === 'PDVS' && (isAdmin || isHrAdmin || isAuditorVrx) && (
          <select
            value={selectedSupFilter}
            onChange={(e) => setSelectedSupFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg px-3 py-2"
          >
            <option value="">Todas las Zonas ({supervisors.length})</option>
            {supervisors.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* 4. TAB CONTENT: PDVS GRID (Without Edit PDV button as requested) */}
      {activeTab === 'PDVS' && (
        filteredPdvs.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
            <Store className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.</h3>
            <p className="text-xs text-slate-500 mt-1">Utilice el botón "+ Registrar Nuevo PDV" para registrar puntos de venta en el sistema.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPdvs.map(pdv => {
            const pdvEmployees = employees.filter(e => e.pdvId === pdv.id);
            const sup = supervisors.find(s => s.id === pdv.supervisorId);

            return (
              <div key={pdv.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-blue-300 transition">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                      <Store className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{pdv.name}</span>
                    </h3>
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-slate-200">
                      {pdv.code || pdv.id}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-3">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> {pdv.city}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" /> {pdv.openingHour || '10:00'} - {pdv.closingHour || '20:30'}
                    </span>
                  </div>

                  {/* Supervisor / Zone Banner */}
                  <div className="mt-3 bg-amber-50/80 border border-amber-200/80 rounded-xl p-2.5 text-xs">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Zona / Líder Asignado:</span>
                    <span className="font-bold text-slate-900">{sup ? sup.name : pdv.supervisorName}</span>
                  </div>

                  {/* Team members with Fijo vs Temporal indicator */}
                  <div className="mt-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Personal Asignado ({pdvEmployees.length} colaboradores)</span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {pdvEmployees.length > 0 ? (
                        pdvEmployees.map(emp => {
                          const isTemporal = (emp.contractType || 'FIJO').toUpperCase() === 'TEMPORAL';
                          return (
                            <div key={emp.id} className="bg-slate-50 p-2 rounded-lg text-xs flex items-center justify-between border border-slate-100">
                              <div>
                                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                  <span>{emp.fullName}</span>
                                  <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded border ${
                                    isTemporal ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300'
                                  }`}>
                                    {isTemporal ? 'Temporal' : 'Fijo'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500">{emp.position} | CC: {emp.documentId}</div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">Sin colaboradores asignados directamente.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Turnos habilitados & Admin Actions (Only Delete option, no Edit PDV as requested) */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  {pdv.allowedShifts && (
                    <div className="text-[10px] text-slate-500">
                      <span className="font-bold text-slate-600 block mb-1">Turnos Habilitados:</span>
                      <div className="flex flex-wrap gap-1">
                        {pdv.allowedShifts.map(sh => (
                          <span key={sh} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium text-[9px] border border-slate-200">
                            {sh}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {canManagePdvAndZonas && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleDeletePdv(pdv.id, pdv.name)}
                        className="flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                      >
                        <Trash2 className="w-3 h-3" /> Eliminar PDV
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        )
      )}

      {/* 5. TAB CONTENT: ZONAS / SUPERVISORES GRID */}
      {activeTab === 'ZONAS' && (
        filteredZonas.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.</h3>
            <p className="text-xs text-slate-500 mt-1">Utilice el botón "+ Crear Nueva Zona" para agregar zonas regionales.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredZonas.map(sup => {
            const supPdvs = pdvs.filter(p => p.supervisorId === sup.id);
            const supPdvIds = new Set(supPdvs.map(p => p.id));
            const supEmployees = employees.filter(e => e.supervisorId === sup.id || supPdvIds.has(e.pdvId));

            return (
              <div key={sup.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-amber-300 transition">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{sup.name}</span>
                    </h3>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-amber-200">
                      {sup.zoneCode || sup.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">PDVs a Cargo</div>
                      <div className="text-base font-black text-blue-600">{supPdvs.length}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Colaboradores</div>
                      <div className="text-base font-black text-emerald-600">{supEmployees.length}</div>
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{sup.phone || '+57 300 000 0000'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{sup.email || `${sup.name.toLowerCase().replace(/\s+/g, '.')}@empresa.com`}</span>
                    </div>
                  </div>

                  {/* List of sample PDVs in Zone */}
                  <div className="mt-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tiendas en la Zona:</span>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {supPdvs.map(p => (
                        <span key={p.id} className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {canManagePdvAndZonas && (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditZona(sup)}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 transition"
                    >
                      <Edit3 className="w-3 h-3" /> Editar Zona
                    </button>
                    <button
                      onClick={() => handleDeleteZona(sup.id, sup.name)}
                      className="flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                    >
                      <Trash2 className="w-3 h-3" /> Eliminar Zona
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )
      )}

      {/* 6. MODAL: Registrar Nuevo PDV */}
      {showCreatePdvModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-black text-base">
                <Store className="w-5 h-5 text-blue-600" />
                <span>Registrar Nuevo Punto de Venta (PDV)</span>
              </div>
              <button
                onClick={() => setShowCreatePdvModal(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePdv} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código del PDV *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Q045"
                    value={pdvForm.code}
                    onChange={(e) => setPdvForm({ ...pdvForm, code: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ciudad *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: CALI"
                    value={pdvForm.city}
                    onChange={(e) => setPdvForm({ ...pdvForm, city: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre Completo del PDV *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Q045 - CALI - CC UNICENTRO"
                  value={pdvForm.name}
                  onChange={(e) => setPdvForm({ ...pdvForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Zona Asignada / Líder Regional *</label>
                <select
                  value={pdvForm.supervisorId}
                  onChange={(e) => setPdvForm({ ...pdvForm, supervisorId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
                >
                  {supervisors.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.zoneCode || s.id})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hora de Apertura</label>
                  <input
                    type="time"
                    value={pdvForm.openingHour}
                    onChange={(e) => setPdvForm({ ...pdvForm, openingHour: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hora de Cierre</label>
                  <input
                    type="time"
                    value={pdvForm.closingHour}
                    onChange={(e) => setPdvForm({ ...pdvForm, closingHour: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Turnos Habilitados (Separados por coma)</label>
                <input
                  type="text"
                  placeholder="10:00 - 20:30, 10:00 - 18:00, 11:00 - 19:00"
                  value={pdvForm.allowedShifts}
                  onChange={(e) => setPdvForm({ ...pdvForm, allowedShifts: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreatePdvModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-500/30"
                >
                  {loading ? 'Guardando...' : 'Crear PDV'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: Crear / Editar Zona */}
      {showCreateZonaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-black text-base">
                <Building2 className="w-5 h-5 text-amber-600" />
                <span>{editingZona ? 'Editar Zona Regional' : 'Crear Nueva Zona Regional'}</span>
              </div>
              <button
                onClick={() => { setShowCreateZonaModal(false); setEditingZona(null); }}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveZona} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre de la Zona / Supervisor *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: ZONA CALI 1 o NOMBRE DEL LÍDER"
                  value={zonaForm.name}
                  onChange={(e) => setZonaForm({ ...zonaForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código de Zona</label>
                <input
                  type="text"
                  placeholder="Ej: ZONA-CALI-1"
                  value={zonaForm.zoneCode}
                  onChange={(e) => setZonaForm({ ...zonaForm, zoneCode: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teléfono de Contacto</label>
                  <input
                    type="text"
                    placeholder="+57 300 000 0000"
                    value={zonaForm.phone}
                    onChange={(e) => setZonaForm({ ...zonaForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    placeholder="lider@empresa.com"
                    value={zonaForm.email}
                    onChange={(e) => setZonaForm({ ...zonaForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowCreateZonaModal(false); setEditingZona(null); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs font-black bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md shadow-amber-500/30"
                >
                  {loading ? 'Guardando...' : editingZona ? 'Guardar Cambios' : 'Crear Zona'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
