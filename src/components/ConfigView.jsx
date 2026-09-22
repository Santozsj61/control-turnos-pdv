import React, { useState, useEffect } from 'react';
import { 
  Settings, ShieldCheck, CheckCircle2, Clock, Coffee, AlertCircle, 
  RotateCcw, Save, Loader2, Sparkles, Mail 
} from 'lucide-react';

const DEFAULT_LEGAL_CONFIG = {
  lunchDurationHours: 1.5,
  lunchCutoffTime: '12:30',
  lunchMinShiftDuration: 6.0,
  dayStartTime: '06:00',
  nightStartTime: '21:00',
  weeklyMaxStandardHours: 42,
  maxSundaysPerMonth: 2,
  lateToleranceMinutes: 10,
  earlyExitToleranceMinutes: 10,
  maintenanceApprovalEmail: 'mantenimiento.obras@quest.com.co'
};

export default function ConfigView() {
  const [config, setConfig] = useState(DEFAULT_LEGAL_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // Load current config from server API
  async function loadConfig() {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (json.success && json.data) {
        setConfig({
          lunchDurationHours: json.data.lunchDurationHours !== undefined ? Number(json.data.lunchDurationHours) : 1.5,
          lunchCutoffTime: json.data.lunchCutoffTime || '12:30',
          lunchMinShiftDuration: json.data.lunchMinShiftDuration !== undefined ? Number(json.data.lunchMinShiftDuration) : 6.0,
          dayStartTime: json.data.dayStartTime || '06:00',
          nightStartTime: json.data.nightStartTime || '21:00',
          weeklyMaxStandardHours: json.data.weeklyMaxStandardHours !== undefined ? Number(json.data.weeklyMaxStandardHours) : 42,
          maxSundaysPerMonth: json.data.maxSundaysPerMonth !== undefined ? Number(json.data.maxSundaysPerMonth) : 2,
          lateToleranceMinutes: json.data.lateToleranceMinutes !== undefined ? Number(json.data.lateToleranceMinutes) : 10,
          earlyExitToleranceMinutes: json.data.earlyExitToleranceMinutes !== undefined ? Number(json.data.earlyExitToleranceMinutes) : 10,
          maintenanceApprovalEmail: json.data.maintenanceApprovalEmail || 'mantenimiento.obras@quest.com.co'
        });
      }
    } catch (err) {
      console.error('Error fetching config:', err);
      setFeedback({ type: 'error', text: 'No se pudieron cargar los parámetros desde el servidor.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const payload = {
      lunchDurationHours: parseFloat(config.lunchDurationHours) || 1.5,
      lunchCutoffTime: config.lunchCutoffTime || '12:30',
      lunchMinShiftDuration: parseFloat(config.lunchMinShiftDuration) || 6.0,
      dayStartTime: config.dayStartTime || '06:00',
      nightStartTime: config.nightStartTime || '21:00',
      weeklyMaxStandardHours: parseInt(config.weeklyMaxStandardHours, 10) || 42,
      maxSundaysPerMonth: parseInt(config.maxSundaysPerMonth, 10) || 2,
      lateToleranceMinutes: parseInt(config.lateToleranceMinutes, 10) || 10,
      earlyExitToleranceMinutes: parseInt(config.earlyExitToleranceMinutes, 10) || 10,
      maintenanceApprovalEmail: (config.maintenanceApprovalEmail || 'mantenimiento.obras@quest.com.co').trim()
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setLastSavedAt(new Date());
        setFeedback({ 
          type: 'success', 
          text: '¡Parámetros guardados y sincronizados correctamente en la base de datos! Las nuevas reglas aplican para la conciliación y los cálculos de turnos.' 
        });
        setTimeout(() => setFeedback(null), 6000);
      } else {
        setFeedback({ type: 'error', text: json.error || 'Error al guardar los parámetros.' });
      }
    } catch (err) {
      console.error('Error saving config:', err);
      setFeedback({ type: 'error', text: 'Error de comunicación al guardar parámetros en el servidor.' });
    } finally {
      setSaving(false);
    }
  }

  function handleResetToDefaults() {
    setConfig(DEFAULT_LEGAL_CONFIG);
    setFeedback({
      type: 'info',
      text: 'Valores restablecidos a la normativa legal colombiana estándar (42h L-S, 1:30h almuerzo, tolerancia 10m). Haz clic en "Guardar Parámetros" para aplicar.'
    });
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-xs text-slate-500 font-semibold">Cargando parámetros del sistema...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Settings className="w-3.5 h-3.5" />
              Parámetros del Sistema
            </span>
            {lastSavedAt && (
              <span className="text-[11px] text-slate-400 font-medium">
                Último guardado: {lastSavedAt.toLocaleTimeString('es-CO')}
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">
            Reglas de Liquidación de Horarios & Almuerzo
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configuración paramétrica de acuerdo con las especificaciones establecidas y el Código Sustantivo del Trabajo de Colombia.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetToDefaults}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Restablecer Normativa Legal</span>
        </button>
      </div>

      {/* Feedback Messages */}
      {feedback && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-semibold animate-in fade-in duration-150 ${
          feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
          feedback.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
          'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
          {feedback.type === 'info' && <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />}
          {feedback.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6 text-xs">
        {/* Section 1: Almuerzo */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <Coffee className="w-4 h-4 text-amber-600" />
            <span>Reglas de Almuerzo y Descanso</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Duración Almuerzo Estándar</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="4"
                  required
                  value={config.lunchDurationHours}
                  onChange={(e) => setConfig({ ...config, lunchDurationHours: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                <span className="text-slate-500 shrink-0">horas ({Number(config.lunchDurationHours) === 1.5 ? '1:30' : `${config.lunchDurationHours}h`})</span>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Hora Límite de Ingreso (Corte)</label>
              <input
                type="time"
                required
                value={config.lunchCutoffTime}
                onChange={(e) => setConfig({ ...config, lunchCutoffTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Ingreso &gt; {config.lunchCutoffTime} no tiene derecho a almuerzo</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Jornada Mínima para Almuerzo</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="12"
                  required
                  value={config.lunchMinShiftDuration}
                  onChange={(e) => setConfig({ ...config, lunchMinShiftDuration: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                <span className="text-slate-500 shrink-0">horas</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Jornadas &lt; {config.lunchMinShiftDuration} hrs no descuentan almuerzo</span>
            </div>
          </div>
        </div>

        {/* Section 2: Jornada Diurna y Nocturna */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Ventana Diurna / Nocturna & Límites Legales</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Inicio Jornada Diurna</label>
              <input
                type="time"
                required
                value={config.dayStartTime}
                onChange={(e) => setConfig({ ...config, dayStartTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Horas a partir de esta hora computan diurnas</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Inicio Jornada Nocturna (Recargo 35%)</label>
              <input
                type="time"
                required
                value={config.nightStartTime}
                onChange={(e) => setConfig({ ...config, nightStartTime: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Horas a partir de {config.nightStartTime} aplican recargo nocturno</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Límite Semanal Ordinario (Lun-Sáb)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="20"
                  max="60"
                  required
                  value={config.weeklyMaxStandardHours}
                  onChange={(e) => setConfig({ ...config, weeklyMaxStandardHours: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                <span className="text-slate-500 shrink-0">horas</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Ley colombiana actual: 42 horas semanales</span>
            </div>
          </div>
        </div>

        {/* Section 3: Domingos y Tolerancias */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Tolerancias de Marcación & Límite Dominical</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tolerancia Llegada Tarde (Minutos)</label>
              <input
                type="number"
                min="0"
                max="60"
                required
                value={config.lateToleranceMinutes}
                onChange={(e) => setConfig({ ...config, lateToleranceMinutes: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Llegadas con más de {config.lateToleranceMinutes}m se marcan como retardo</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tolerancia Salida Anticipada (Minutos)</label>
              <input
                type="number"
                min="0"
                max="60"
                required
                value={config.earlyExitToleranceMinutes}
                onChange={(e) => setConfig({ ...config, earlyExitToleranceMinutes: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-500 block mt-1">Salidas antes de este umbral se marcan como salida anticipada</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Máx. Domingos Ordinarios al Mes</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="5"
                  required
                  value={config.maxSundaysPerMonth}
                  onChange={(e) => setConfig({ ...config, maxSundaysPerMonth: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
                <span className="text-slate-500 shrink-0">domingos</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">Un 3er domingo requiere autorización del Líder de Zona</span>
            </div>
          </div>
        </div>

        {/* Section 4: Enrutamiento de Notificaciones & Aprobaciones */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-purple-600" />
            <span>Enrutamiento de Notificaciones & Aprobaciones Especiales</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Correo Corporativo para Permisos de "Mantenimiento y Obras"
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="mantenimiento.obras@quest.com.co"
                  value={config.maintenanceApprovalEmail || ''}
                  onChange={(e) => setConfig({ ...config, maintenanceApprovalEmail: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:bg-white"
                />
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">
                Las solicitudes de permisos asignadas al área "Mantenimiento y Obras" se remiten automáticamente a este buzón para su aprobación.
              </span>
            </div>

            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[11px] font-bold text-purple-900 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                Flujo Directo Auditoría & Mantenimiento
              </span>
              <p className="text-[10px] text-purple-700 leading-relaxed">
                Parametrizado por Auditoría VRX. Los puntos de venta no pueden alterar este destinatario; al radicar un permiso por trabajos de obra, se notificará de forma inmediata a esta cuenta corporativa.
              </p>
            </div>
          </div>
        </div>

        {/* Save Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 italic">
            * Los cambios se aplicarán instantáneamente a todas las nuevas conciliaciones y planillas.
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl transition shadow-md cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Guardar Parámetros</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
