import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ShieldCheck, AlertTriangle, Clock, Calendar, Store, Users, Search, 
  Filter, Download, ChevronRight, CheckCircle2, XCircle, AlertCircle, 
  Eye, RefreshCw, Sparkles, Building2, UserX, ArrowUpDown, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WEEKS_DEF } from '../data/coverageMonitorData.js';
import { initialSupervisors, initialPDVs } from '../data/seedData.js';
import { ACTIVE_371_COLLABORATORS, isCollaboratorActive } from '../data/activeCollaborators371.js';
import { api } from '../services/api.js';

export default function PendingCoverageMonitorView({ currentUser, pdvs, supervisors, users }) {
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isEmployee = currentUser?.role === 'EMPLOYEE' || currentUser?.role === 'PDV';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const currentSupervisorObj = supervisors?.find(
    s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id)
  );
  const userPdvObj = pdvs?.find(p => p.id === currentUser?.pdvId || p.code === currentUser?.pdvId);

  // Filter States
  const [selectedMonth, setSelectedMonth] = useState('ALL'); // 'ALL' | 'Octubre' | 'Septiembre' | ...
  const [selectedWeek, setSelectedWeek] = useState('43'); // Defaults to active current week
  const [selectedZone, setSelectedZone] = useState(isSupervisor ? (currentSupervisorObj?.id || '') : '');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // 'ALL' | 'AL_DIA' | 'PENDIENTE_MARCACION' | 'PENDIENTE_PROGRAMAR' | 'PENDIENTE_AMBOS'
  const [searchTerm, setSearchTerm] = useState(isEmployee && userPdvObj ? (userPdvObj.code || userPdvObj.name) : '');
  const [activeModalPdv, setActiveModalPdv] = useState(null);

  // Real Database State
  const [realSchedules, setRealSchedules] = useState([]);
  const [realPunches, setRealPunches] = useState([]);
  const [loadingRealData, setLoadingRealData] = useState(false);

  // Available Weeks sorted descending (Semana 43, 42, 41... down to 23)
  const availableWeeks = useMemo(() => {
    return Object.entries(WEEKS_DEF).map(([w, data]) => ({
      week: w,
      label: data.label,
      month: data.month,
      start: data.start,
      end: data.end
    })).sort((a, b) => Number(b.week) - Number(a.week));
  }, []);

  // Filter weeks by selected month if not ALL
  const filteredWeekOptions = useMemo(() => {
    if (selectedMonth === 'ALL') return availableWeeks;
    return availableWeeks.filter(w => w.month.includes(selectedMonth));
  }, [availableWeeks, selectedMonth]);

  // Load real schedules and biometric punches from cloud database
  const loadRealCoverageData = useCallback(async () => {
    setLoadingRealData(true);
    try {
      let targetWeeks = [];
      if (selectedWeek !== 'ALL' && WEEKS_DEF[selectedWeek]) {
        targetWeeks = [WEEKS_DEF[selectedWeek]];
      } else if (selectedMonth !== 'ALL') {
        targetWeeks = Object.values(WEEKS_DEF).filter(w => w.month.includes(selectedMonth));
      } else {
        // Evaluate active weeks
        targetWeeks = [WEEKS_DEF['43'], WEEKS_DEF['42'], WEEKS_DEF['41'], WEEKS_DEF['40']].filter(Boolean);
      }

      // Automatically fetch the 2 prior weeks to enforce the 2-week inactivity retirement rule
      const targetWeekNums = targetWeeks.map(w => Number(w.week)).filter(n => !isNaN(n));
      const minWeekNum = targetWeekNums.length > 0 ? Math.min(...targetWeekNums) : 43;
      const historyWeeks = [
        WEEKS_DEF[String(minWeekNum - 1)],
        WEEKS_DEF[String(minWeekNum - 2)]
      ].filter(Boolean);

      const allWeeksToFetch = [...targetWeeks];
      historyWeeks.forEach(hw => {
        if (!allWeeksToFetch.some(w => w.start === hw.start)) {
          allWeeksToFetch.push(hw);
        }
      });

      const schedPromises = allWeeksToFetch.map(w => api.getSchedules({ weekStart: w.start }).catch(() => []));
      const punchPromises = allWeeksToFetch.map(w => api.getPunchRecords({ weekStart: w.start }).catch(() => []));

      const [schedResults, punchResults] = await Promise.all([
        Promise.all(schedPromises),
        Promise.all(punchPromises)
      ]);

      const flatScheds = schedResults.flat();
      const flatPunches = punchResults.flat();

      // Check localStorage for offline/draft schedules saved locally
      allWeeksToFetch.forEach(w => {
        if (typeof window !== 'undefined' && window.localStorage && w.start) {
          try {
            const raw = window.localStorage.getItem('control_turnos_schedules_' + w.start);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) flatScheds.push(...parsed);
            }
          } catch (e) {}
        }
      });

      setRealSchedules(flatScheds);
      setRealPunches(flatPunches);
    } catch (e) {
      console.error('Error cargando datos reales de cobertura:', e);
    } finally {
      setLoadingRealData(false);
    }
  }, [selectedWeek, selectedMonth]);

  useEffect(() => {
    loadRealCoverageData();
  }, [loadRealCoverageData]);

  // Aggregate Data based on REAL schedules and REAL punches
  const aggregatedData = useMemo(() => {
    let targetWeeks = [];
    if (selectedWeek !== 'ALL' && WEEKS_DEF[selectedWeek]) {
      targetWeeks = [WEEKS_DEF[selectedWeek]];
    } else if (selectedMonth !== 'ALL') {
      targetWeeks = Object.values(WEEKS_DEF).filter(w => w.month.includes(selectedMonth));
    } else {
      targetWeeks = [WEEKS_DEF['43'], WEEKS_DEF['42'], WEEKS_DEF['41'], WEEKS_DEF['40']].filter(Boolean);
    }

    const effectivePdvs = (pdvs && pdvs.length > 0) ? pdvs : initialPDVs;
    const effectiveSupervisors = (supervisors && supervisors.length > 0) ? supervisors : initialSupervisors;

    // Index schedules by "weekStart_docId" and "weekStart_userId"
    const schedLookup = new Map();
    realSchedules.forEach(s => {
      const wStart = s.weekStart || s.week_start;
      if (!wStart) return;
      const doc = s.user?.document_id || s.user?.documentId || s.documentId || (s.userId?.startsWith('emp-') ? s.userId.replace('emp-', '') : s.userId);
      const uId = s.userId || s.user_id;

      const hasValidShifts = Array.isArray(s.shifts) && s.shifts.some(sh => 
        sh.startTime || sh.isDayOff || sh.shiftType === 'DESCANSO' || sh.shiftType === 'VACACIONES' || sh.shiftType === 'INCAPACIDAD' || sh.shiftType === 'LICENCIA'
      );

      if (hasValidShifts) {
        if (doc) schedLookup.set(`${wStart}_doc_${String(doc).trim()}`, s);
        if (uId) schedLookup.set(`${wStart}_uid_${String(uId).trim()}`, s);
      }
    });

    // Index punches by "weekStart_docId"
    const punchLookup = new Map();
    realPunches.forEach(p => {
      const doc = p.documentId || p.document_id;
      const entryDate = p.entryDate || p.entry_date;
      if (!doc || !entryDate) return;
      const docStr = String(doc).trim();

      Object.values(WEEKS_DEF).forEach(w => {
        if (entryDate >= w.start && entryDate <= w.end) {
          const key = `${w.start}_${docStr}`;
          punchLookup.set(key, (punchLookup.get(key) || 0) + 1);
        }
      });
    });

    // Map schedules to pdvId by documentId and userId
    const schedPdvMap = new Map();
    realSchedules.forEach(s => {
      const doc = s.user?.document_id || s.user?.documentId || s.documentId || (s.userId?.startsWith('emp-') ? s.userId.replace('emp-', '') : s.userId);
      const uId = s.userId || s.user_id;
      const pId = s.pdvId || s.pdv_id;
      if (pId) {
        if (doc) schedPdvMap.set(String(doc).trim(), pId);
        if (uId) schedPdvMap.set(String(uId).trim(), pId);
      }
    });

    // Map DB users to pdvId by documentId and id
    const dbUserPdvMap = new Map();
    (users || []).forEach(u => {
      const doc = u.document_id || u.documentId;
      const uId = u.id;
      const pId = u.pdv_id || u.pdvId;
      if (pId) {
        if (doc) dbUserPdvMap.set(String(doc).trim(), pId);
        if (uId) dbUserPdvMap.set(String(uId).trim(), pId);
      }
    });

    // Unified list of collaborators (ACTIVE_371 + any active employees in DB)
    const baseCollabs = [...ACTIVE_371_COLLABORATORS];
    const baseDocSet = new Set(baseCollabs.map(c => String(c.documentId).trim()));
    (users || []).forEach(u => {
      const doc = String(u.document_id || u.documentId || '').trim();
      const cleanName = String(u.full_name || u.fullName || '').replace(/\s*\(Retirado\)/gi, '').trim();
      const isRetired = u.is_active === false;
      if (doc && !baseDocSet.has(doc) && (u.role === 'EMPLOYEE' || !u.role) && !isRetired) {
        baseDocSet.add(doc);
        baseCollabs.push({
          id: u.id || `emp-${doc}`,
          fullName: cleanName,
          documentId: doc,
          role: u.role || 'EMPLOYEE',
          pdvId: u.pdv_id || u.pdvId,
          position: u.position || 'ASESOR(A) DE IMAGEN',
          isActive: true
        });
      }
    });

    const pdvMap = new Map();

    effectivePdvs.forEach(pdv => {
      // Find assigned staff for this store (cross with DB schedules, DB users, and fallback to static pdvId)
      const storeStaff = baseCollabs.filter(c => {
        const docStr = String(c.documentId).trim();
        const uidStr = c.id || `emp-${docStr}`;
        const assignedPdvId = schedPdvMap.get(docStr) || schedPdvMap.get(uidStr) || dbUserPdvMap.get(docStr) || dbUserPdvMap.get(uidStr) || c.pdvId;
        return (
          assignedPdvId === pdv.id ||
          (pdv.code && (assignedPdvId === pdv.code || (!schedPdvMap.has(docStr) && !dbUserPdvMap.has(docStr) && c.pdvCode?.toUpperCase() === pdv.code.toUpperCase())))
        );
      });

      const sup = effectiveSupervisors.find(s => s.id === pdv.supervisorId);
      let storePendingCollabs = [];
      let storeAutoRetiredCollabs = [];

      targetWeeks.forEach(w => {
        const wNum = Number(w.week);
        const prevW1 = WEEKS_DEF[String(wNum - 1)];
        const prevW2 = WEEKS_DEF[String(wNum - 2)];

        storeStaff.forEach(collab => {
          const docStr = String(collab.documentId).trim();
          const uidStr = collab.id || `emp-${docStr}`;

          // Check real schedule
          const hasSchedule = schedLookup.has(`${w.start}_doc_${docStr}`) || schedLookup.has(`${w.start}_uid_${uidStr}`);
          const schedObj = schedLookup.get(`${w.start}_doc_${docStr}`) || schedLookup.get(`${w.start}_uid_${uidStr}`);
          const allPaidNovelty = schedObj && Array.isArray(schedObj.shifts) && schedObj.shifts.length > 0 && schedObj.shifts.every(sh => 
            sh.shiftType === 'VACACIONES' || sh.shiftType === 'INCAPACIDAD' || sh.shiftType === 'LICENCIA'
          );

          const hasPunch = (punchLookup.get(`${w.start}_${docStr}`) || 0) > 0 || allPaidNovelty;

          // Regla de Negocio: Inactividad >= 2 semanas sin turno ni marcacion = Retirado
          const hasSchedPrev1 = prevW1 ? (schedLookup.has(`${prevW1.start}_doc_${docStr}`) || schedLookup.has(`${prevW1.start}_uid_${uidStr}`)) : false;
          const hasPunchPrev1 = prevW1 ? ((punchLookup.get(`${prevW1.start}_${docStr}`) || 0) > 0) : false;

          const hasSchedPrev2 = prevW2 ? (schedLookup.has(`${prevW2.start}_doc_${docStr}`) || schedLookup.has(`${prevW2.start}_uid_${uidStr}`)) : false;
          const hasPunchPrev2 = prevW2 ? ((punchLookup.get(`${prevW2.start}_${docStr}`) || 0) > 0) : false;

          const isNewlyHired = collab.isNewEmployee;
          const hasRecentActivity = hasSchedule || hasPunch || hasSchedPrev1 || hasPunchPrev1 || hasSchedPrev2 || hasPunchPrev2 || isNewlyHired;

          if (!hasRecentActivity) {
            storeAutoRetiredCollabs.push({
              documentId: collab.documentId,
              fullName: collab.fullName,
              position: collab.position || 'ASESOR(A) DE IMAGEN',
              reason: 'Inactivo (+2 semanas sin turnos ni marcación)'
            });
            return; // Excluir del conteo de pendientes activos
          }

          const isPendingProgram = !hasSchedule;
          const isPendingPunch = !hasPunch;

          if (isPendingProgram || isPendingPunch) {
            const issues = [];
            if (isPendingProgram) issues.push('Sin turno programado');
            if (isPendingPunch) issues.push('Sin marcación biométrica');

            storePendingCollabs.push({
              documentId: collab.documentId,
              fullName: collab.fullName,
              position: collab.position || 'ASESOR(A) DE IMAGEN',
              isPendingProgram,
              isPendingPunch,
              issues,
              week: w.week,
              weekLabel: w.label
            });
          }
        });
      });

      // Group unique pending collaborators for this PDV
      const uniquePendingMap = new Map();
      storePendingCollabs.forEach(item => {
        if (!uniquePendingMap.has(item.documentId)) {
          uniquePendingMap.set(item.documentId, { ...item });
        } else {
          const existing = uniquePendingMap.get(item.documentId);
          existing.isPendingProgram = existing.isPendingProgram || item.isPendingProgram;
          existing.isPendingPunch = existing.isPendingPunch || item.isPendingPunch;
          item.issues.forEach(iss => {
            if (!existing.issues.includes(iss)) existing.issues.push(iss);
          });
        }
      });
      const pendingCollaborators = Array.from(uniquePendingMap.values());

      // Group unique auto-retired collaborators for this PDV
      const uniqueRetiredMap = new Map();
      storeAutoRetiredCollabs.forEach(item => {
        if (!uniqueRetiredMap.has(item.documentId)) {
          uniqueRetiredMap.set(item.documentId, { ...item });
        }
      });
      const retiredCollaborators = Array.from(uniqueRetiredMap.values());

      // Personal activo real (excluyendo automáticamente retirados por >= 2 semanas de inactividad)
      const storeTotalStaff = Math.max(0, storeStaff.length - retiredCollaborators.length);

      const pendingProgramCount = pendingCollaborators.filter(c => c.isPendingProgram).length;
      const pendingPunchesCount = pendingCollaborators.filter(c => c.isPendingPunch).length;
      const programmedCount = Math.max(0, storeTotalStaff - pendingProgramCount);
      const punchesCount = Math.max(0, storeTotalStaff - pendingPunchesCount);

      let status = 'AL_DIA';
      if (storeTotalStaff === 0) {
        status = 'AL_DIA';
      } else if (pendingProgramCount > 0 && pendingPunchesCount > 0) {
        status = 'PENDIENTE_AMBOS';
      } else if (pendingProgramCount > 0) {
        status = 'PENDIENTE_PROGRAMAR';
      } else if (pendingPunchesCount > 0) {
        status = 'PENDIENTE_MARCACION';
      }

      pdvMap.set(pdv.id, {
        pdvId: pdv.id,
        pdvCode: pdv.code,
        pdvName: pdv.name,
        city: pdv.city,
        zone: sup?.zoneName || pdv.zone || 'ZONA NACIONAL',
        supervisorName: sup?.name || pdv.supervisorName || 'Líder Regional',
        supervisorId: sup?.id || pdv.supervisorId,
        totalStaff: storeTotalStaff,
        programmedCount,
        pendingProgramCount,
        punchesCount,
        pendingPunchesCount,
        pendingCollaborators,
        retiredCollaborators,
        status
      });
    });

    return Array.from(pdvMap.values());
  }, [selectedWeek, selectedMonth, realSchedules, realPunches, pdvs, supervisors, users]);

  // Apply Search, Zone, Status Filters
  // Filter by Zone first (for global KPIs across the selected region/period)
  const zoneFilteredPdvs = useMemo(() => {
    return aggregatedData.filter(p => {
      if (selectedZone) {
        const sup = supervisors?.find(s => s.id === selectedZone);
        if (sup) {
          const matchSupId = p.supervisorId && p.supervisorId === sup.id;
          const matchSupName = p.supervisorName && p.supervisorName.toLowerCase() === sup.name.toLowerCase();
          const targetZone = sup.zoneName || sup.zone || '';
          const matchZone = targetZone && p.zone && p.zone.toLowerCase().includes(targetZone.toLowerCase());
          if (!matchSupId && !matchSupName && !matchZone) {
            return false;
          }
        }
      }
      return true;
    });
  }, [aggregatedData, selectedZone, supervisors]);

  // Apply Search, Zone, Status Filters for Table View
  const filteredPdvs = useMemo(() => {
    return zoneFilteredPdvs.filter(p => {
      // Search term (flexible match for codes like q87 vs Q087, numbers, city, supervisor, collaborator)
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const sNorm = s.replace(/^q0*/i, 'q').replace(/\s+/g, '');
        const sDigits = s.replace(/\D/g, '');

        const code = (p.pdvCode || '').toLowerCase();
        const codeNorm = code.replace(/^q0*/i, 'q');
        const codeDigits = code.replace(/\D/g, '');

        const name = (p.pdvName || '').toLowerCase();
        const nameNorm = name.replace(/\s+/g, '');

        const city = (p.city || '').toLowerCase();
        const sup = (p.supervisorName || '').toLowerCase();

        const matchStaff = (p.pendingCollaborators || []).some(c => 
          c.fullName?.toLowerCase().includes(s) || String(c.documentId).includes(s)
        );

        const matchRetired = (p.retiredCollaborators || []).some(r => 
          r.fullName?.toLowerCase().includes(s) || String(r.documentId).includes(s)
        );

        const matches = (
          name.includes(s) ||
          nameNorm.includes(sNorm) ||
          code.includes(s) ||
          (codeNorm && sNorm && (codeNorm === sNorm || codeNorm.includes(sNorm))) ||
          (sDigits && codeDigits && codeDigits === sDigits) ||
          city.includes(s) ||
          sup.includes(s) ||
          matchStaff ||
          matchRetired
        );

        if (!matches) return false;
      }

      // Status filter
      // If user is explicitly searching by store or code, we don't hide the search result
      if (selectedStatus !== 'ALL' && !searchTerm.trim()) {
        if (selectedStatus === 'AL_DIA' && p.status !== 'AL_DIA') return false;
        if (selectedStatus === 'PENDIENTE_MARCACION' && p.pendingPunchesCount === 0) return false;
        if (selectedStatus === 'PENDIENTE_PROGRAMAR' && p.pendingProgramCount === 0) return false;
        if (selectedStatus === 'PENDIENTE_AMBOS' && p.status !== 'PENDIENTE_AMBOS') return false;
      }

      return true;
    });
  }, [zoneFilteredPdvs, selectedStatus, searchTerm]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPdvs = zoneFilteredPdvs.length;
    const alDia = zoneFilteredPdvs.filter(p => p.status === 'AL_DIA').length;
    const conPendienteMarcacion = zoneFilteredPdvs.filter(p => p.pendingPunchesCount > 0).length;
    const conPendienteProgramar = zoneFilteredPdvs.filter(p => p.pendingProgramCount > 0).length;
    const totalColaboradoresPendientes = zoneFilteredPdvs.reduce((acc, p) => acc + p.pendingCollaborators.length, 0);

    return {
      totalPdvs,
      alDia,
      conPendienteMarcacion,
      conPendienteProgramar,
      totalColaboradoresPendientes,
      pctAlDia: totalPdvs > 0 ? Math.round((alDia / totalPdvs) * 100) : 100
    };
  }, [zoneFilteredPdvs]);

  // Export to Excel
  const handleExportExcel = () => {
    const rows = [];
    filteredPdvs.forEach(p => {
      if (p.pendingCollaborators && p.pendingCollaborators.length > 0) {
        p.pendingCollaborators.forEach(c => {
          const isAct = isCollaboratorActive(c.documentId);
          rows.push({
            'Código PDV': p.pdvCode,
            'Punto de Venta': p.pdvName,
            'Ciudad': p.city,
            'Zona': p.zone,
            'Líder Regional': p.supervisorName,
            'Documento Colaborador': c.documentId,
            'Nombre Colaborador': String(c.fullName || '').replace(/\s*\(Retirado\)/gi, '').trim(),
            'Estado': 'Activo',
            'Cargo': c.position,
            'Pendiente Turno Programado': c.isPendingProgram ? 'SÍ' : 'NO',
            'Pendiente Marcación': c.isPendingPunch ? 'SÍ' : 'NO',
            'Detalle de Novedades': (c.issues || []).join(' | '),
            'Período Evaluado': selectedWeek !== 'ALL' ? `Semana ${selectedWeek}` : selectedMonth
          });
        });
      } else {
        rows.push({
          'Código PDV': p.pdvCode,
          'Punto de Venta': p.pdvName,
          'Ciudad': p.city,
          'Zona': p.zone,
          'Líder Regional': p.supervisorName,
          'Documento Colaborador': 'N/A',
          'Nombre Colaborador': '100% Al Día (Sin Pendientes)',
          'Cargo': 'N/A',
          'Pendiente Turno Programado': 'NO',
          'Pendiente Marcación': 'NO',
          'Detalle de Novedades': 'Completo',
          'Período Evaluado': selectedWeek !== 'ALL' ? `Semana ${selectedWeek}` : selectedMonth
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Control de Cobertura PDV');
    XLSX.writeFile(wb, `Control_Cobertura_Pendientes_${selectedWeek !== 'ALL' ? `Sem_${selectedWeek}` : selectedMonth}_2026.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`p-2 rounded-xl border ${
              isAuditorVrx 
                ? 'bg-amber-500/20 text-amber-400 border-amber-400/30' 
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-400/30'
            }`}>
              {isAuditorVrx ? <AlertTriangle className="w-6 h-6 text-amber-400" /> : <ShieldCheck className="w-6 h-6 text-indigo-400" />}
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
              <span>{isAuditorVrx ? 'Control de Faltantes por Programar' : 'Control de Cobertura y Cumplimiento PDV'}</span>
              {isAuditorVrx && (
                <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-600 text-purple-100 border border-purple-400 shadow-xs">
                  Auditor Maestro VRX
                </span>
              )}
            </h1>
          </div>
          <p className="text-slate-300 text-xs sm:text-sm mt-1.5 max-w-3xl leading-relaxed">
            {isAuditorVrx 
              ? 'Monitoreo nacional exclusivo para VRX: identifica con exactitud qué puntos de venta y colaboradores aún no cuentan con turnos programados en el sistema.'
              : 'Monitoreo en tiempo real de colaboradores y tiendas. Identifica con exactitud los puntos de venta con personal pendiente por marcación biométrica y pendiente por programación de turno.'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={loadRealCoverageData}
            disabled={loadingRealData}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="Refrescar y cruzar con la base de datos real en la nube"
          >
            <RefreshCw className={`w-4 h-4 text-blue-400 ${loadingRealData ? 'animate-spin' : ''}`} />
            <span>{loadingRealData ? 'Cruzando Datos...' : 'Refrescar Nube'}</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-md shadow-emerald-900/40 cursor-pointer"
            title="Descargar informe completo en Excel"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/80 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          {/* Mes */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setSelectedWeek('ALL');
              }}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">🗓️ Todos los Meses</option>
              <option value="Octubre">Octubre 2026 (Sem 40-43)</option>
              <option value="Septiembre">Septiembre 2026 (Sem 36-40)</option>
              <option value="Agosto">Agosto 2026 (Sem 31-35)</option>
              <option value="Julio">Julio 2026 (Sem 27-31)</option>
              <option value="Junio">Junio 2026 (Sem 23-26)</option>
            </select>
          </div>

          {/* Semana */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Semana Específica</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">⚡ Todas las Semanas del Período</option>
              {filteredWeekOptions.map(w => (
                <option key={w.week} value={w.week}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          {/* Zona / Supervisor */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Zona / Líder</label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              disabled={isSupervisor}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white disabled:opacity-60"
            >
              <option value="">🌐 Todas las Zonas Nacionales</option>
              {supervisors?.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.zoneName || s.zone || 'Regional'})</option>
              ))}
            </select>
          </div>

          {/* Estado de Cumplimiento */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Estado Cobertura</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="ALL">🎯 Todos los Estados</option>
              <option value="AL_DIA">✅ 100% Al Día</option>
              <option value="PENDIENTE_MARCACION">⚠️ Con Marcación Pendiente</option>
              <option value="PENDIENTE_PROGRAMAR">📋 Con Programación Pendiente</option>
              <option value="PENDIENTE_AMBOS">🚨 Crítico (Ambos Pendientes)</option>
            </select>
          </div>

          {/* Buscador */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Buscar Tienda o Código</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              <input
                type="text"
                placeholder="Ej: Q105, Cali, Unicentro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        
        {/* Total PDVs */}
        <div 
          onClick={() => setSelectedStatus('ALL')}
          className={`bg-white p-4 rounded-xl border shadow-xs flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${
            selectedStatus === 'ALL' ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/10' : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">PDVs Evaluados</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800">{kpis.totalPdvs}</span>
          </div>
        </div>

        {/* 100% Al Día */}
        <div 
          onClick={() => setSelectedStatus(selectedStatus === 'AL_DIA' ? 'ALL' : 'AL_DIA')}
          className={`bg-white p-4 rounded-xl border shadow-xs flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${
            selectedStatus === 'AL_DIA' ? 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/40' : 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300'
          }`}
        >
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">100% Al Día</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-emerald-800">{kpis.alDia}</span>
              <span className="text-xs font-semibold text-emerald-600">({kpis.pctAlDia}%)</span>
            </div>
          </div>
        </div>

        {/* Pendiente Marcación */}
        <div 
          onClick={() => setSelectedStatus(selectedStatus === 'PENDIENTE_MARCACION' ? 'ALL' : 'PENDIENTE_MARCACION')}
          className={`bg-white p-4 rounded-xl border shadow-xs flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${
            selectedStatus === 'PENDIENTE_MARCACION' ? 'ring-2 ring-amber-500 border-amber-400 bg-amber-50/40' : 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
          }`}
        >
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Pendiente Marcación</span>
            <span className="text-xl sm:text-2xl font-black text-amber-800">{kpis.conPendienteMarcacion}</span>
          </div>
        </div>

        {/* Pendiente Programación */}
        <div 
          onClick={() => setSelectedStatus(selectedStatus === 'PENDIENTE_PROGRAMAR' ? 'ALL' : 'PENDIENTE_PROGRAMAR')}
          className={`bg-white p-4 rounded-xl border shadow-xs flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${
            selectedStatus === 'PENDIENTE_PROGRAMAR' ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/40' : 'border-blue-200 bg-blue-50/20 hover:border-blue-300'
          }`}
        >
          <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Falta Programar</span>
            <span className="text-xl sm:text-2xl font-black text-blue-800">{kpis.conPendienteProgramar}</span>
          </div>
        </div>

        {/* Total Colaboradores Afectados */}
        <div 
          onClick={() => setSelectedStatus(selectedStatus === 'PENDIENTE_AMBOS' ? 'ALL' : 'PENDIENTE_AMBOS')}
          className={`bg-white p-4 rounded-xl border shadow-xs flex items-center gap-3 cursor-pointer transition-all hover:shadow-md col-span-2 md:col-span-1 ${
            selectedStatus === 'PENDIENTE_AMBOS' ? 'ring-2 ring-rose-500 border-rose-400 bg-rose-50/40' : 'border-rose-200 bg-rose-50/20 hover:border-rose-300'
          }`}
        >
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl">
            <UserX className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Casos Pendientes</span>
            <span className="text-xl sm:text-2xl font-black text-rose-800">{kpis.totalColaboradoresPendientes}</span>
          </div>
        </div>

      </div>

      {/* Main PDV Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Listado de Puntos de Venta y Nivel de Cumplimiento ({filteredPdvs.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Período: <strong className="text-slate-800">{selectedWeek !== 'ALL' ? `Semana ${selectedWeek}` : selectedMonth}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Código & PDV</th>
                <th className="py-3 px-3">Ciudad / Zona</th>
                <th className="py-3 px-3">Líder Regional</th>
                <th className="py-3 px-2 text-center">Personal</th>
                <th className="py-3 px-3 text-center">Programación</th>
                <th className="py-3 px-3 text-center">Marcaciones</th>
                <th className="py-3 px-3 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPdvs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Store className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    No se encontraron puntos de venta con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredPdvs.map((p) => {
                  const pctProg = p.totalStaff > 0 ? Math.round(((p.totalStaff - p.pendingProgramCount) / p.totalStaff) * 100) : 100;
                  const pctPunch = p.totalStaff > 0 ? Math.round(((p.totalStaff - p.pendingPunchesCount) / p.totalStaff) * 100) : 100;

                  return (
                    <tr key={p.pdvId} className="hover:bg-slate-50/80 transition-colors">
                      {/* PDV */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{p.pdvName}</div>
                        <div className="text-[10px] text-indigo-600 font-mono font-semibold">CÓD: {p.pdvCode}</div>
                      </td>

                      {/* Ciudad / Zona */}
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-700">{p.city}</span>
                        <span className="text-[10px] text-slate-400 block">{p.zone}</span>
                      </td>

                      {/* Líder */}
                      <td className="py-3 px-3 font-medium text-slate-600">
                        {p.supervisorName}
                      </td>

                      {/* Personal */}
                      <td className="py-3 px-2 text-center">
                        <span className="inline-block bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded-full text-[11px]">
                          {p.totalStaff}
                        </span>
                      </td>

                      {/* Programación */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-[11px] font-bold ${p.pendingProgramCount === 0 ? 'text-emerald-700' : 'text-blue-700'}`}>
                            {p.totalStaff - p.pendingProgramCount} / {p.totalStaff}
                          </span>
                          <div className="w-16 bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${p.pendingProgramCount === 0 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, pctProg))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Marcaciones */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-[11px] font-bold ${p.pendingPunchesCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {p.totalStaff - p.pendingPunchesCount} / {p.totalStaff}
                          </span>
                          <div className="w-16 bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${p.pendingPunchesCount === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, pctPunch))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Estado Semáforo */}
                      <td className="py-3 px-3 text-center">
                        {p.status === 'AL_DIA' && (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            100% Al Día
                          </span>
                        )}
                        {p.status === 'PENDIENTE_MARCACION' && (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Falta Marcación ({p.pendingPunchesCount})
                          </span>
                        )}
                        {p.status === 'PENDIENTE_PROGRAMAR' && (
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-300">
                            <Calendar className="w-3 h-3 text-blue-600" />
                            Falta Turno ({p.pendingProgramCount})
                          </span>
                        )}
                        {p.status === 'PENDIENTE_AMBOS' && (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-rose-300">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Crítico ({p.pendingCollaborators.length})
                          </span>
                        )}
                      </td>

                      {/* Acción */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setActiveModalPdv(p)}
                          className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs transition border border-indigo-200"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Ver Personas</span>
                          {p.pendingCollaborators.length > 0 && (
                            <span className="bg-rose-500 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full">
                              {p.pendingCollaborators.length}
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Drawer: Detalle de Colaboradores del PDV */}
      {activeModalPdv && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-indigo-400/30">
                    CÓD: {activeModalPdv.pdvCode}
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-white">{activeModalPdv.pdvName}</h3>
                </div>
                <p className="text-slate-300 text-xs mt-1">
                  Ciudad: <strong>{activeModalPdv.city}</strong> | Líder: <strong>{activeModalPdv.supervisorName}</strong>
                </p>
              </div>
              <button
                onClick={() => setActiveModalPdv(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600 pb-2 border-b border-slate-100">
                <span>Personal Total: <strong className="text-slate-900">{activeModalPdv.totalStaff}</strong></span>
                <span className="text-rose-600 font-bold">
                  {activeModalPdv.pendingCollaborators.length} caso(s) con novedades pendientes
                </span>
              </div>

              {activeModalPdv.pendingCollaborators.length === 0 ? (
                <div className="py-10 text-center text-emerald-600 space-y-2">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
                  <p className="font-bold text-sm">¡Excelente! Este PDV está 100% al día.</p>
                  <p className="text-xs text-slate-500">Todos los colaboradores cuentan con sus turnos programados y marcaciones registradas.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeModalPdv.pendingCollaborators.map((c, idx) => (
                    <div 
                      key={`${c.documentId}-${idx}`}
                      className="bg-slate-50 hover:bg-slate-100/80 p-3.5 rounded-xl border border-slate-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">{c.fullName}</span>
                          {!isCollaboratorActive(c.documentId) && (
                            <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-rose-300">
                              Retirado
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 font-mono">CC: {c.documentId}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium block">{c.position}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.isPendingProgram && (
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-blue-600" />
                            Falta Malla
                          </span>
                        )}
                        {c.isPendingPunch && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Falta Marcación
                          </span>
                        )}
                        {(c.issues || []).map((issue, iIdx) => (
                          <span key={iIdx} className="bg-slate-200 text-slate-700 text-[9px] font-semibold px-1.5 py-0.5 rounded">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Colaboradores Retirados Automáticamente (+2 semanas sin turnos ni marcación) */}
              {activeModalPdv.retiredCollaborators && activeModalPdv.retiredCollaborators.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <UserX className="w-3.5 h-3.5 text-slate-400" />
                      Retirados por Inactividad (+2 semanas sin turnos): {activeModalPdv.retiredCollaborators.length}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Excluidos de faltantes de programación</span>
                  </div>
                  <div className="space-y-1.5">
                    {activeModalPdv.retiredCollaborators.map((r, rIdx) => (
                      <div 
                        key={`retired-${r.documentId}-${rIdx}`}
                        className="bg-slate-100/70 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2 opacity-85"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700 text-xs line-through decoration-slate-400">{r.fullName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">CC: {r.documentId}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block">{r.position}</span>
                        </div>
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-300">
                          Retirado (+2 sem)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Semana evaluada: {selectedWeek !== 'ALL' ? `Semana ${selectedWeek}` : selectedMonth}
              </span>
              <button
                onClick={() => setActiveModalPdv(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
