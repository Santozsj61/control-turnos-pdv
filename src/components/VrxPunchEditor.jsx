import React, { useState } from 'react';
import { api } from '../services/api.js';

/**
 * Panel de edición maestra de marcación y programación.
 * Solo se renderiza para el perfil AUDITOR_VRX; permite modificar en cualquier momento.
 */
export default function VrxPunchEditor({ row, currentUser, onSaved }) {
  const [entry, setEntry] = useState(row.rawPunchEntry ? String(row.rawPunchEntry).substring(0, 5) : '');
  const [exit, setExit] = useState(row.rawPunchExit ? String(row.rawPunchExit).substring(0, 5) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  if (currentUser?.role !== 'AUDITOR_VRX') return null;

  async function save() {
    setSaving(true);
    setMsg(null);
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
      setMsg({ type: 'ok', text: 'Marcación actualizada.' });
      onSaved?.();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs space-y-2">
      <div className="font-black text-purple-900 uppercase text-[10px]">
        ✏️ Edición maestra VRX {row.punchId ? '(modificar marcación)' : '(crear marcación)'}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="font-bold text-slate-700">Entrada</label>
        <input type="time" value={entry} onChange={(e) => setEntry(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1" />
        <label className="font-bold text-slate-700">Salida</label>
        <input type="time" value={exit} onChange={(e) => setExit(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1" />
        <button type="button" onClick={save} disabled={saving || !entry}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {msg && (
        <div className={msg.type === 'ok' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{msg.text}</div>
      )}
    </div>
  );
}
