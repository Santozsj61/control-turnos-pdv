import React, { useState } from 'react';
import { Clock, Calendar, CheckCircle2, AlertCircle, Edit3, Sparkles } from 'lucide-react';
import { api } from '../services/api.js';
import { recordAuditEvent } from '../services/auditService.js';

/**
 * Panel de edición maestra de marcación biométrica y programación horaria.
 * Solo se renderiza para el perfil AUDITOR_VRX.
 */
export default function VrxPunchEditor({ row, currentUser, onSaved }) {
  // 1. Estado Marcación Biométrico
  const [entry, setEntry] = useState(row.rawPunchEntry ? String(row.rawPunchEntry).substring(0, 5) : '');
  const [exit, setExit] = useState(row.rawPunchExit ? String(row.rawPunchExit).substring(0, 5) : '');
  const [savingPunch, setSavingPunch] = useState(false);
  const [punchMsg, setPunchMsg] = useState(null);

  // 2. Estado Programación / Turno
  const [schedStart, setSchedStart] = useState(row.scheduledStart ? String(row.scheduledStart).substring(0, 5) : '10:00');
  const [schedEnd, setSchedEnd] = useState(row.scheduledEnd ? String(row.scheduledEnd).substring(0, 5) : '20:00');
  const [isDayOff, setIsDayOff] = useState(!row.isScheduled);
  const [savingSched, setSavingSched] = useState(false);
  const [schedMsg, setSchedMsg] = useState(null);

  if (currentUser?.role !== 'AUDITOR_VRX') return null;

  // Guardar Marcación Biométrico
  async function savePunch() {
    setSavingPunch(true);
    setPunchMsg(null);
    try {
      await api.vrxEditPunch({
        role: currentUser.role,
        punchId: row.punchId,
        documentId: row.documentId,
        fullName: row.fullName,
        position: row.position,
        pdvName: row.pdvName,
        supervisorName: row.supervisorName,
        date: row.date,
        entryTime: entry,
        exitTime: exit
      });

      // Registrar auditoría forense
      recordAuditEvent({
        userName: currentUser.fullName || 'AUDITORÍA DE ASISTENCIA VRX',
        userRole: currentUser.role,
        action: 'VRX_PUNCH_EDIT',
        actionLabel: 'Edición Maestra de Marcación Biométrico',
        pdvName: row.pdvName,
        detail: `Modificó marcación de ${row.fullName} (${row.date}): Entrada ${entry || 'N/A'}, Salida ${exit || 'N/A'}`
      });

      setPunchMsg({ type: 'ok', text: '✓ Marcación biométrica actualizada.' });
      onSaved?.();
    } catch (err) {
      setPunchMsg({ type: 'error', text: err.message || 'Error al actualizar marcación.' });
    } finally {
      setSavingPunch(false);
    }
  }

  // Guardar Programación / Turno
  async function saveSchedule() {
    setSavingSched(true);
    setSchedMsg(null);
    try {
      await api.vrxEditScheduleShift({
        role: currentUser.role,
        row,
        date: row.date,
        startTime: isDayOff ? '' : schedStart,
        endTime: isDayOff ? '' : schedEnd,
        isDayOff
      });

      // Registrar auditoría forense
      recordAuditEvent({
        userName: currentUser.fullName || 'AUDITORÍA DE ASISTENCIA VRX',
        userRole: currentUser.role,
        action: 'VRX_SCHEDULE_EDIT',
        actionLabel: 'Edición Maestra de Turno Programado',
        pdvName: row.pdvName,
        detail: `Modificó programación oficial de ${row.fullName} (${row.date}): ${isDayOff ? 'Día de Descanso' : `${schedStart} - ${schedEnd}`}`
      });

      setSchedMsg({ type: 'ok', text: '✓ Programación de turno actualizada.' });
      onSaved?.();
    } catch (err) {
      setSchedMsg({ type: 'error', text: err.message || 'Error al actualizar programación.' });
    } finally {
      setSavingSched(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-purple-50/90 to-indigo-50/80 border border-purple-200 rounded-2xl p-4 text-xs space-y-3.5 shadow-xs">
      
      {/* Header del Panel */}
      <div className="flex items-center justify-between border-b border-purple-200/90 pb-2.5">
        <div className="flex items-center gap-2 font-black text-purple-950 uppercase text-[11px] tracking-wide">
          <Edit3 className="w-4 h-4 text-purple-600" />
          <span>Edición Maestra VRX (Marcación & Programación)</span>
        </div>
        <span className="bg-purple-200/90 text-purple-950 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          Auditoría en Vivo
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        
        {/* 1. Módulo de Marcación Real (Biométrico) */}
        <div className="bg-white rounded-xl p-3 border border-purple-200/80 shadow-2xs space-y-2.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="font-extrabold text-slate-800 text-[11px] flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-900">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Marcación Real (Biométrico)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {row.punchId ? 'Registrado' : 'Sin Punch'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Entrada Real</label>
                <input 
                  type="time" 
                  value={entry} 
                  onChange={(e) => setEntry(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Salida Real</label>
                <input 
                  type="time" 
                  value={exit} 
                  onChange={(e) => setExit(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white" 
                />
              </div>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            {punchMsg ? (
              <span className={`text-[10px] font-bold truncate ${punchMsg.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {punchMsg.text}
              </span>
            ) : <span />}
            <button 
              type="button" 
              onClick={savePunch} 
              disabled={savingPunch || !entry}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
            >
              {savingPunch ? 'Guardando...' : 'Guardar Marcación'}
            </button>
          </div>
        </div>

        {/* 2. Módulo de Turno Programado (Horario Oficial) */}
        <div className="bg-white rounded-xl p-3 border border-purple-200/80 shadow-2xs space-y-2.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-amber-950 text-[11px] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>2. Turno Programado</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-700">
                <input 
                  type="checkbox" 
                  checked={isDayOff} 
                  onChange={(e) => setIsDayOff(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span>Descanso</span>
              </label>
            </div>

            {isDayOff ? (
              <div className="py-2.5 px-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-slate-500 font-bold text-[11px]">
                😴 Configurado como DÍA DE DESCANSO
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Inicio Turno</label>
                  <input 
                    type="time" 
                    value={schedStart} 
                    onChange={(e) => setSchedStart(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs focus:ring-2 focus:ring-amber-500 bg-slate-50 focus:bg-white" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Fin Turno</label>
                  <input 
                    type="time" 
                    value={schedEnd} 
                    onChange={(e) => setSchedEnd(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs focus:ring-2 focus:ring-amber-500 bg-slate-50 focus:bg-white" 
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            {schedMsg ? (
              <span className={`text-[10px] font-bold truncate ${schedMsg.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {schedMsg.text}
              </span>
            ) : <span />}
            <button 
              type="button" 
              onClick={saveSchedule} 
              disabled={savingSched || (!isDayOff && (!schedStart || !schedEnd))}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-xs transition cursor-pointer shrink-0"
            >
              {savingSched ? 'Guardando...' : 'Guardar Horario'}
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
