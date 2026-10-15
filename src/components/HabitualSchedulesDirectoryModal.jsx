import React, { useState, useMemo } from 'react';
import { Clock, Search, X, Store, Building2, MapPin, CheckCircle2, Lock, Filter, ExternalLink } from 'lucide-react';
import { ALL_HABITUAL_SCHEDULES, getHabitualDaySchedule } from '../data/habitualSchedules.js';

export default function HabitualSchedulesDirectoryModal({ isOpen, onClose, onSelectPdv, currentPdvId, currentPdv }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('ALL'); // 'ALL' | 'Calle' | 'Centro Comercial'
  const [filterSunday, setFilterSunday] = useState('ALL'); // 'ALL' | 'OPEN' | 'CLOSED'

  const filteredStores = useMemo(() => {
    return ALL_HABITUAL_SCHEDULES.filter(store => {
      // Search
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
        store.name.toLowerCase().includes(term) ||
        store.code.toLowerCase().includes(term) ||
        (store.city && store.city.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      // Location type
      if (filterLocation !== 'ALL' && store.locationType !== filterLocation) {
        return false;
      }

      // Sunday filter
      const sundaySched = store.days?.domingo || store.byDayIndex?.[6];
      const isSundayClosed = sundaySched?.isClosed;
      if (filterSunday === 'OPEN' && isSundayClosed) return false;
      if (filterSunday === 'CLOSED' && !isSundayClosed) return false;

      return true;
    });
  }, [searchTerm, filterLocation, filterSunday]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-xs">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  Directorio Oficial de Horarios Habituales (101 PDVs)
                </h3>
                <span className="text-[10px] bg-blue-500/30 text-blue-200 font-extrabold px-2 py-0.5 rounded-full border border-blue-400/30">
                  Cadena Nacional
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Horarios oficiales fijos de apertura y cierre de cada tienda de lunes a domingo (No modificables).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 shrink-0 flex flex-wrap items-center gap-3 text-xs">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código (ej: Q138, N10), nombre o ciudad..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Location Filter */}
          <div className="flex items-center gap-1.5">
            <label className="font-bold text-slate-600 shrink-0">Tipo:</label>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg py-1.5 px-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos los tipos</option>
              <option value="Centro Comercial">Centro Comercial</option>
              <option value="Calle">Calle</option>
            </select>
          </div>

          {/* Sunday Status Filter */}
          <div className="flex items-center gap-1.5">
            <label className="font-bold text-slate-600 shrink-0">Domingos:</label>
            <select
              value={filterSunday}
              onChange={(e) => setFilterSunday(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg py-1.5 px-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos los domingos</option>
              <option value="OPEN">Abre Domingos (96 tiendas)</option>
              <option value="CLOSED">Cierra Domingos (5 tiendas)</option>
            </select>
          </div>

          <div className="text-slate-500 font-semibold shrink-0 ml-auto">
            Mostrando <strong>{filteredStores.length}</strong> de 101 PDVs
          </div>
        </div>

        {/* Stores Table */}
        <div className="overflow-x-auto flex-1 p-2 sm:p-4">
          <table className="w-full text-left text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-900 text-white uppercase tracking-wider text-[10px] font-extrabold sticky top-0 z-10">
                <th className="py-2.5 px-3">Código & Tienda</th>
                <th className="py-2.5 px-2">Ciudad</th>
                <th className="py-2.5 px-2">Tipo</th>
                <th className="py-2.5 px-2 text-center">Lunes</th>
                <th className="py-2.5 px-2 text-center">Martes</th>
                <th className="py-2.5 px-2 text-center">Miércoles</th>
                <th className="py-2.5 px-2 text-center">Jueves</th>
                <th className="py-2.5 px-2 text-center">Viernes</th>
                <th className="py-2.5 px-2 text-center">Sábado</th>
                <th className="py-2.5 px-2 text-center bg-purple-950 text-amber-300">Domingo</th>
                {onSelectPdv && <th className="py-2.5 px-3 text-center">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                    No se encontraron tiendas con los criterios de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredStores.map((store, sIdx) => {
                  const effectiveCurrentId = currentPdvId || currentPdv?.id || currentPdv?.code;
                  const isCurrent = effectiveCurrentId && (store.id === effectiveCurrentId || store.code === effectiveCurrentId);
                  const domSched = store.days?.domingo || store.byDayIndex?.[6];
                  const isDomClosed = domSched?.isClosed;

                  return (
                    <tr
                      key={store.id || store.code}
                      className={`hover:bg-blue-50/50 transition ${
                        isCurrent ? 'bg-blue-50/80 font-bold' : sIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      {/* Store info */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-900 text-xs">{store.code}</span>
                          {isCurrent && (
                            <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase">
                              Activo
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate max-w-[220px]" title={store.name}>
                          {store.name}
                        </div>
                      </td>

                      {/* City */}
                      <td className="py-2 px-2 text-slate-700 font-medium">
                        {store.city || '-'}
                      </td>

                      {/* Location type */}
                      <td className="py-2 px-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          store.locationType === 'Calle' 
                            ? 'bg-amber-50 text-amber-800 border-amber-200' 
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}>
                          {store.locationType}
                        </span>
                      </td>

                      {/* 7 Days Hours */}
                      {['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].map((dKey, dIdx) => {
                        const dayData = store.days?.[dKey] || store.byDayIndex?.[dIdx];
                        return (
                          <td key={dKey} className="py-2 px-1 text-center font-bold text-slate-800 text-[10.5px]">
                            {dayData?.label || '-'}
                          </td>
                        );
                      })}

                      {/* Domingo */}
                      <td className="py-2 px-1 text-center font-bold text-[10.5px] bg-purple-50/30">
                        {isDomClosed ? (
                          <span className="text-slate-400 font-semibold bg-slate-100 px-1 py-0.5 rounded text-[9.5px]">
                            Cerrado
                          </span>
                        ) : (
                          <span className="text-purple-900 font-black">
                            {domSched?.label || '-'}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      {onSelectPdv && (
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectPdv(store.id || store.code);
                              onClose();
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition shadow-2xs flex items-center gap-1 mx-auto cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ver PDV</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 text-slate-500 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Datos oficiales parametrizados. Ningún perfil puede alterar estos horarios comerciales.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
