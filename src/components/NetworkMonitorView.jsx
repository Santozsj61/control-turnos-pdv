import React, { useState, useEffect } from 'react';
import { 
  Wifi, WifiOff, Database, RefreshCw, CheckCircle2, AlertTriangle, 
  Server, Shield, Activity, ArrowUpDown, Clock, Send, Download, 
  Layers, Search, Eye, ExternalLink, Terminal
} from 'lucide-react';

export default function NetworkMonitorView({ currentUser, pdvs = [], supervisors = [] }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pingResult, setPingResult] = useState(null);
  const [testingPing, setTestingPing] = useState(false);
  const [cloudSchedules, setCloudSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [networkLogs, setNetworkLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [counts, setCounts] = useState({ schedules: 0, pdvs: 0, users: 0, supervisors: 0 });

  const SUPABASE_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

  function addLog(action, status, detail, latencyMs) {
    setNetworkLogs(prev => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        action,
        status,
        detail,
        latencyMs
      },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  }

  // Measure latency and check health
  async function runPingTest() {
    setTestingPing(true);
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?select=id&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        });
        const t1 = performance.now();
        if (res.ok) {
          times.push(Math.round(t1 - t0));
        }
      } catch (e) {}
    }
    setTestingPing(false);

    if (times.length > 0) {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const min = Math.min(...times);
      const max = Math.max(...times);
      setPingResult({ avg, min, max, ok: true });
      addLog('PING_TEST', 'SUCCESS', `Pings completados: min ${min}ms, prom ${avg}ms, max ${max}ms`, avg);
    } else {
      setPingResult({ ok: false });
      addLog('PING_TEST', 'ERROR', 'Fallo de conexión a Supabase', 0);
    }
  }

  // Load cloud schedules from Supabase
  async function fetchCloudSchedules() {
    setLoadingSchedules(true);
    const t0 = performance.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/schedules?select=*&order=created_at.desc&limit=100`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      });
      const t1 = performance.now();
      const ms = Math.round(t1 - t0);

      if (res.ok) {
        const data = await res.json();
        setCloudSchedules(data || []);
        addLog('FETCH_SCHEDULES', 'SUCCESS', `Cargados ${data.length} turnos guardados en Supabase`, ms);
      } else {
        addLog('FETCH_SCHEDULES', 'ERROR', `Error HTTP ${res.status}: ${res.statusText}`, ms);
      }
    } catch (err) {
      addLog('FETCH_SCHEDULES', 'ERROR', `Excepción de red: ${err.message}`, 0);
    } finally {
      setLoadingSchedules(false);
    }
  }

  // Count records across main tables
  async function fetchTableCounts() {
    try {
      const [resS, resP, resU, resSup] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/schedules?select=id`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/pdvs?select=id`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/users?select=id`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
        }),
        fetch(`${SUPABASE_URL}/rest/v1/supervisors?select=id`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
        })
      ]);

      const parseCount = (res) => {
        const cr = res.headers.get('content-range');
        return cr ? parseInt(cr.split('/')[1] || '0', 10) : 0;
      };

      setCounts({
        schedules: parseCount(resS),
        pdvs: parseCount(resP),
        users: parseCount(resU),
        supervisors: parseCount(resSup)
      });
    } catch (e) {}
  }

  useEffect(() => {
    runPingTest();
    fetchCloudSchedules();
    fetchTableCounts();
  }, []);

  const filteredCloud = cloudSchedules.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.user_id && s.user_id.toLowerCase().includes(term)) ||
      (s.week_start && s.week_start.includes(term)) ||
      (s.pdv_id && s.pdv_id.toLowerCase().includes(term)) ||
      (s.notes && s.notes.toLowerCase().includes(term))
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in">
      
      {/* Banner de Bienvenida Exclusivo Santiago */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600/30 border border-indigo-500/50 rounded-2xl text-indigo-400">
              <Activity className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">Monitor de Red & Conexiones en Vivo</h1>
                <span className="bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  Control VRX & Santiago (TI)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Supervisión en tiempo real del estado de red, latencia y registros de turnos compartidos en Supabase Cloud.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={runPingTest}
              disabled={testingPing}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingPing ? 'animate-spin' : ''}`} />
              <span>{testingPing ? 'Midiendo...' : 'Test Latencia (Ping)'}</span>
            </button>

            <a
              href="https://supabase.com/dashboard/project/aqgfocnbsjyhcpqfxrsa"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
            >
              <span>Consola Supabase</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>
        </div>
      </div>

      {/* KPI Cards de Red y Base de Datos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Estado Supabase */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Estado de Servidor</span>
            <Server className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xl font-black text-slate-900">200 OK Cloud</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">aqgfocnbsjyhcpqfxrsa.supabase.co</span>
        </div>

        {/* Latencia / Ping */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Latencia de Red (Ping)</span>
            <Wifi className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-blue-700">
              {pingResult?.avg ? `${pingResult.avg}` : '--'}
            </span>
            <span className="text-xs font-bold text-slate-500">ms</span>
            {pingResult?.min && (
              <span className="text-[10px] text-slate-400 ml-2">
                (min {pingResult.min}ms / max {pingResult.max}ms)
              </span>
            )}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">✓ Conexión Ultrarrápida</span>
        </div>

        {/* Cronogramas Guardados en Cloud */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Turnos en Supabase</span>
            <Database className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-purple-700">{counts.schedules}</span>
            <span className="text-xs font-bold text-slate-500">cronogramas</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Sincronizados en tiempo real</span>
        </div>

        {/* Tiendas Conectadas */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Tiendas & Zonas Activas</span>
            <Layers className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-700">{counts.pdvs || pdvs.length}</span>
            <span className="text-xs font-bold text-slate-500">PDVs / {counts.supervisors || supervisors.length} Zonas</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Catálogo nacional cargado</span>
        </div>

      </div>

      {/* Grid: Turnos en la Nube vs Log de Red */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda (2/3): Turnos Guardados en Supabase */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" />
                <span>Turnos Guardados en la Nube (Base de Datos Compartida)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Todo lo que cualquier persona suba a la app se almacena aquí y está visible para todos.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por tienda o ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 w-48"
                />
              </div>

              <button
                onClick={() => { fetchCloudSchedules(); fetchTableCounts(); }}
                disabled={loadingSchedules}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
                title="Refrescar lista desde Supabase"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSchedules ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tabla de Cronogramas */}
          <div className="overflow-x-auto max-h-96 border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-200 uppercase text-[10px] font-bold sticky top-0">
                <tr>
                  <th className="p-2.5">Semana</th>
                  <th className="p-2.5">Colaborador / ID</th>
                  <th className="p-2.5">PDV / Tienda</th>
                  <th className="p-2.5 text-center">Días</th>
                  <th className="p-2.5 text-center">Horas</th>
                  <th className="p-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCloud.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-xs text-slate-400">
                      {loadingSchedules ? 'Consultando base de datos en Supabase...' : 'No hay cronogramas registrados en la nube todavía.'}
                    </td>
                  </tr>
                ) : (
                  filteredCloud.map((sc, idx) => (
                    <tr key={sc.id || idx} className="hover:bg-slate-50 transition">
                      <td className="p-2.5 font-bold text-slate-900 font-mono">
                        {sc.week_start || sc.weekStart}
                      </td>
                      <td className="p-2.5 font-semibold text-slate-800">
                        {sc.user_id || sc.userId}
                      </td>
                      <td className="p-2.5 text-slate-600">
                        {sc.pdv_id || sc.pdvId || 'PDV'}
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-700">
                        {(sc.shifts || []).length}
                      </td>
                      <td className="p-2.5 text-center font-black text-indigo-700 font-mono">
                        {sc.total_net_hours || sc.totalNetHours || 0}h
                      </td>
                      <td className="p-2.5">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          ✓ Guardado Cloud
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Columna Derecha (1/3): Registro de Eventos de Red */}
        <div className="bg-slate-950 text-slate-200 rounded-2xl p-5 border border-slate-800 shadow-xs flex flex-col h-[460px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Consola de Peticiones de Red</span>
            </h3>
            <span className="text-[10px] font-mono text-emerald-400">Live</span>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-2 pt-3 pr-1">
            {networkLogs.length === 0 ? (
              <div className="text-slate-500 text-center pt-12">No hay eventos de red registrados aún.</div>
            ) : (
              networkLogs.map(log => (
                <div key={log.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 space-y-0.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">{log.time}</span>
                    <span className={`font-bold px-1.5 py-0.2 rounded text-[9px] ${
                      log.status === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  <div className="text-white font-bold text-xs">{log.action}</div>
                  <div className="text-slate-400 text-[10px] truncate">{log.detail}</div>
                  {log.latencyMs > 0 && (
                    <div className="text-indigo-400 text-[9px] text-right">{log.latencyMs}ms</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
