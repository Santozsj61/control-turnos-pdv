import React, { useState, useMemo } from 'react';
import { 
  X, Download, Calendar, Clock, Store, Users, CheckCircle2, 
  AlertTriangle, RefreshCw, FileSpreadsheet, Layers, Filter, 
  Sparkles, CalendarRange, Check, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  ALL_WEEKS_2026, 
  CURRENT_WEEK_START, 
  KNOWN_WEEKS_WITH_DATA,
  formatTo12Hour,
  formatTimeRange12h
} from '../utils/weeks.js';
import { calculateShiftHours, calculateMonSatHours, countMonthlySundays } from '../utils/calculator.js';
import { api } from '../services/api.js';
import { recordAuditEvent } from '../services/auditService.js';

const DAYS_NAME = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function ScheduleExportModal({
  isOpen,
  onClose,
  pdvs = [],
  supervisors = [],
  currentUser,
  selectedPdvId = 'ALL',
  activeSinglePdv = null,
  selectedWeekStart = CURRENT_WEEK_START,
  allHistoricalEmployees = [],
  currentScheduleMatrix = {}
}) {
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN' || currentUser?.role === 'HR';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';

  // 1. Export mode: 'SINGLE_WEEK' | 'WEEK_RANGE' | 'MONTH_FORTNIGHT' | 'CUSTOM_DATES' | 'ALL_HISTORICAL'
  const [exportMode, setExportMode] = useState('WEEK_RANGE');

  // Time lapse controls
  const [singleWeek, setSingleWeek] = useState(selectedWeekStart);
  const [rangeStartWeek, setRangeStartWeek] = useState('2026-08-31'); // Sem 36 default
  const [rangeEndWeek, setRangeEndWeek] = useState('2026-10-12'); // Sem 42 default
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [fortnightType, setFortnightType] = useState('FULL_MONTH'); // 'FULL_MONTH' | 'Q1' | 'Q2'
  const [customStartDate, setCustomStartDate] = useState('2026-09-01');
  const [customEndDate, setCustomEndDate] = useState('2026-10-15');

  // PDV / Scope filter
  const [scopeType, setScopeType] = useState(selectedPdvId === 'ALL' ? 'ALL' : 'SINGLE');
  const [filterPdvId, setFilterPdvId] = useState(selectedPdvId === 'ALL' ? (pdvs[0]?.id || '') : selectedPdvId);
  const [filterZone, setFilterZone] = useState('ALL');

  // Output format options
  const [includeDetailSheet, setIncludeDetailSheet] = useState(true);
  const [includeWeeklyMatrix, setIncludeWeeklyMatrix] = useState(true);

  // Export execution state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // { text, pct }
  const [exportError, setExportError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(null);

  // Month list
  const months2026 = [
    { value: '2026-01', label: 'Enero 2026' },
    { value: '2026-02', label: 'Febrero 2026' },
    { value: '2026-03', label: 'Marzo 2026' },
    { value: '2026-04', label: 'Abril 2026' },
    { value: '2026-05', label: 'Mayo 2026' },
    { value: '2026-06', label: 'Junio 2026' },
    { value: '2026-07', label: 'Julio 2026' },
    { value: '2026-08', label: 'Agosto 2026' },
    { value: '2026-09', label: 'Septiembre 2026' },
    { value: '2026-10', label: 'Octubre 2026' },
    { value: '2026-11', label: 'Noviembre 2026' },
    { value: '2026-12', label: 'Diciembre 2026' },
  ];

  // Helper: dates for a given week
  function getDatesForWeek(startDateStr) {
    const start = new Date(startDateStr + 'T12:00:00Z');
    return DAYS_NAME.map((name, idx) => {
      const d = new Date(start.getTime() + idx * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      return {
        dayOfWeek: name,
        date: dateStr,
        formattedDate: d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
        isSunday: idx === 6
      };
    });
  }

  // Calculate target weeks based on active exportMode
  const targetWeeks = useMemo(() => {
    if (exportMode === 'SINGLE_WEEK') {
      const found = ALL_WEEKS_2026.find(w => w.weekStart === singleWeek);
      return found ? [found] : [];
    }

    if (exportMode === 'WEEK_RANGE') {
      const startIndex = ALL_WEEKS_2026.findIndex(w => w.weekStart === rangeStartWeek);
      const endIndex = ALL_WEEKS_2026.findIndex(w => w.weekStart === rangeEndWeek);
      if (startIndex === -1 || endIndex === -1) return [];
      const minIdx = Math.min(startIndex, endIndex);
      const maxIdx = Math.max(startIndex, endIndex);
      return ALL_WEEKS_2026.slice(minIdx, maxIdx + 1);
    }

    if (exportMode === 'MONTH_FORTNIGHT') {
      // Find weeks whose dates overlap with selectedMonth
      return ALL_WEEKS_2026.filter(w => {
        const dates = getDatesForWeek(w.weekStart);
        return dates.some(d => d.date.startsWith(selectedMonth));
      });
    }

    if (exportMode === 'CUSTOM_DATES') {
      if (!customStartDate || !customEndDate) return [];
      const minDate = customStartDate <= customEndDate ? customStartDate : customEndDate;
      const maxDate = customStartDate <= customEndDate ? customEndDate : customStartDate;
      return ALL_WEEKS_2026.filter(w => {
        const dates = getDatesForWeek(w.weekStart);
        return dates.some(d => d.date >= minDate && d.date <= maxDate);
      });
    }

    if (exportMode === 'ALL_HISTORICAL') {
      // Return all known loaded weeks
      return ALL_WEEKS_2026.filter(w => KNOWN_WEEKS_WITH_DATA.includes(w.weekStart));
    }

    return [];
  }, [exportMode, singleWeek, rangeStartWeek, rangeEndWeek, selectedMonth, customStartDate, customEndDate]);

  // Quick preset buttons
  function applyPreset(presetType) {
    if (presetType === 'ANIVERSARIO') {
      setExportMode('WEEK_RANGE');
      setRangeStartWeek('2026-08-31'); // Sem 36
      setRangeEndWeek('2026-10-05'); // Sem 41
    } else if (presetType === 'LAST_4_WEEKS') {
      setExportMode('WEEK_RANGE');
      setRangeStartWeek('2026-09-21'); // Sem 39
      setRangeEndWeek('2026-10-12'); // Sem 42
    } else if (presetType === 'OCTUBRE') {
      setExportMode('MONTH_FORTNIGHT');
      setSelectedMonth('2026-10');
      setFortnightType('FULL_MONTH');
    } else if (presetType === 'ALL_KNOWN') {
      setExportMode('ALL_HISTORICAL');
    }
  }

  // Filter PDVs allowed for current user
  const allowedPdvs = useMemo(() => {
    if (isSupervisor) {
      const mySup = supervisors.find(s => s.name === currentUser?.fullName || s.id === currentUser?.supervisorId);
      if (mySup) return pdvs.filter(p => p.supervisorId === mySup.id);
    }
    return pdvs;
  }, [pdvs, supervisors, isSupervisor, currentUser]);

  // Unique zones
  const availableZones = useMemo(() => {
    const set = new Set();
    pdvs.forEach(p => {
      const sup = supervisors.find(s => s.id === p.supervisorId);
      const z = p.zoneName || sup?.zoneName || sup?.name;
      if (z) set.add(z);
    });
    return Array.from(set).sort();
  }, [pdvs, supervisors]);

  // Execute export
  async function handleExecuteExport() {
    if (!targetWeeks || targetWeeks.length === 0) {
      setExportError('No se encontraron semanas en el lapso seleccionado.');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const allShiftsByWeek = {}; // weekStart -> array of schedules
      const totalSteps = targetWeeks.length;

      // 1. Fetch schedules for each week in lapso
      for (let i = 0; i < targetWeeks.length; i++) {
        const w = targetWeeks[i];
        setExportProgress({
          text: `Recopilando programación: ${w.label} (${i + 1} de ${totalSteps})...`,
          pct: Math.round(((i + 0.5) / totalSteps) * 60)
        });

        // If this week is currently loaded in memory, use it
        let weekScheds = [];
        if (w.weekStart === selectedWeekStart && Object.keys(currentScheduleMatrix).length > 0) {
          weekScheds = Object.values(currentScheduleMatrix);
        } else {
          // Check localStorage first
          let localRaw = null;
          if (typeof window !== 'undefined' && window.localStorage) {
            localRaw = window.localStorage.getItem(`control_turnos_schedules_${w.weekStart}`);
          }

          if (localRaw) {
            try {
              weekScheds = JSON.parse(localRaw);
            } catch (e) {}
          }

          // If still empty, fetch from API / Supabase
          if (!weekScheds || weekScheds.length === 0) {
            try {
              weekScheds = await api.getSchedules({ weekStart: w.weekStart });
            } catch (err) {
              console.warn(`Could not load schedules for week ${w.weekStart}:`, err);
              weekScheds = [];
            }
          }
        }

        allShiftsByWeek[w.weekStart] = weekScheds || [];
      }

      setExportProgress({
        text: 'Consolidando colaboradores, horas suplementarias y descansos...',
        pct: 75
      });

      // 2. Filter employees by scope
      let targetEmployees = allHistoricalEmployees.length > 0 ? allHistoricalEmployees : [];
      if (scopeType === 'SINGLE') {
        targetEmployees = targetEmployees.filter(e => e.pdvId === filterPdvId || e.pdv_id === filterPdvId);
      } else if (filterZone !== 'ALL') {
        const zonePdvs = pdvs.filter(p => {
          const sup = supervisors.find(s => s.id === p.supervisorId);
          return (p.zoneName === filterZone || sup?.zoneName === filterZone || sup?.name === filterZone);
        }).map(p => p.id);
        targetEmployees = targetEmployees.filter(e => zonePdvs.includes(e.pdvId) || zonePdvs.includes(e.pdv_id));
      }

      if (targetEmployees.length === 0) {
        // Fallback: collect unique employees found in the fetched schedules
        const empMap = new Map();
        Object.values(allShiftsByWeek).forEach(schedList => {
          schedList.forEach(s => {
            const uid = s.userId || s.id;
            if (uid && !empMap.has(uid)) {
              empMap.set(uid, s.employee || s.user || { id: uid, fullName: s.user?.full_name || 'Colaborador', documentId: s.user?.document_id });
            }
          });
        });
        targetEmployees = Array.from(empMap.values());
      }

      // 3. Compile Master Consolidated Summary (Pestaña 1)
      const consolidatedSummaryRows = [];
      const chronologicalDailyRows = [];
      const weeklyMatrixRows = [];

      // Date bounds filter for CUSTOM_DATES or FORTNIGHT
      let boundStart = null;
      let boundEnd = null;
      if (exportMode === 'CUSTOM_DATES') {
        boundStart = customStartDate <= customEndDate ? customStartDate : customEndDate;
        boundEnd = customStartDate <= customEndDate ? customEndDate : customStartDate;
      } else if (exportMode === 'MONTH_FORTNIGHT') {
        if (fortnightType === 'Q1') {
          boundStart = `${selectedMonth}-01`;
          boundEnd = `${selectedMonth}-15`;
        } else if (fortnightType === 'Q2') {
          boundStart = `${selectedMonth}-16`;
          boundEnd = `${selectedMonth}-31`;
        }
      }

      targetEmployees.forEach(emp => {
        const empPdv = pdvs.find(p => p.id === emp.pdvId || p.id === emp.pdv_id) || {};
        const sup = supervisors.find(s => s.id === empPdv.supervisorId);

        let totalMonSatHoursLapso = 0;
        let totalExcessHoursLapso = 0;
        let totalSundayHoursLapso = 0;
        let totalSundaysWorkedCount = 0;
        let totalRestDaysCount = 0;
        let totalMedicalLeaveCount = 0;
        let totalNetHoursLapso = 0;
        let totalWeeksEvaluated = 0;

        targetWeeks.forEach(w => {
          const weekScheds = allShiftsByWeek[w.weekStart] || [];
          const found = weekScheds.find(s => s.userId === emp.id || (emp.documentId && s.user?.document_id && String(s.user.document_id) === String(emp.documentId)));
          
          const weekDates = getDatesForWeek(w.weekStart);
          let userShifts = [];

          if (found && found.shifts && found.shifts.length > 0) {
            totalWeeksEvaluated++;
            userShifts = weekDates.map(wd => {
              const sh = found.shifts.find(s => s.date === wd.date);
              if (sh) {
                const shiftType = sh.shiftType || (sh.isDayOff ? 'DESCANSO' : 'ORDINARIO');
                const calc = calculateShiftHours(sh.startTime, sh.endTime, wd.date, {}, shiftType);
                return { ...wd, ...sh, shiftType, isDayOff: shiftType === 'DESCANSO' || Boolean(sh.isDayOff), ...calc };
              }
              return {
                ...wd,
                shiftType: 'NO_PROGRAMADO',
                isDayOff: false,
                startTime: '',
                endTime: '',
                netHours: 0
              };
            });
          } else {
            userShifts = weekDates.map(wd => ({
              ...wd,
              shiftType: 'NO_PROGRAMADO',
              isDayOff: false,
              startTime: '',
              endTime: '',
              netHours: 0
            }));
          }

          // Filter by date bounds if needed
          const filteredShifts = userShifts.filter(sh => {
            if (boundStart && sh.date < boundStart) return false;
            if (boundEnd && sh.date > boundEnd) return false;
            return true;
          });

          // Metrics for this week
          const monSatStats = calculateMonSatHours(filteredShifts, 42);
          const sundayStats = countMonthlySundays([], emp.id, w.weekStart.substring(0, 7), filteredShifts);

          totalMonSatHoursLapso += (monSatStats.monSatHours || 0);
          totalExcessHoursLapso += (monSatStats.excessHours || 0);
          totalSundayHoursLapso += (monSatStats.sundayHours || 0);
          totalSundaysWorkedCount += (sundayStats.workedSundaysCount || 0);
          totalNetHoursLapso += (monSatStats.totalHours || 0);

          filteredShifts.forEach(sh => {
            if (sh.shiftType === 'DESCANSO') totalRestDaysCount++;
            if (sh.shiftType === 'INCAPACIDAD' || sh.shiftType === 'LICENCIA') totalMedicalLeaveCount++;

            // Push to daily chronological row
            if (includeDetailSheet) {
              chronologicalDailyRows.push({
                'Fecha': sh.date,
                'Día': sh.dayOfWeek,
                'Semana': w.label,
                'Semana Inicio': w.weekStart,
                'Colaborador': emp.fullName,
                'Cédula': emp.documentId || emp.code,
                'Cargo': emp.position || 'ASESOR(A) DE IMAGEN',
                'Punto de Venta': empPdv.name || emp.pdvId,
                'Código PDV': empPdv.code || '-',
                'Ciudad': empPdv.city || '-',
                'Zona Regional': empPdv.zoneName || sup?.zoneName || sup?.name || '-',
                'Tipo de Turno': sh.shiftType,
                'Hora Entrada': formatTo12Hour(sh.startTime) || '-',
                'Hora Salida': formatTo12Hour(sh.endTime) || '-',
                'Horas Netas': sh.netHours || 0,
                'Almuerzo (hrs)': sh.lunchHours || 0,
                'Horas Diurnas': sh.dayHours || 0,
                'Horas Nocturnas': sh.nightHours || 0,
                'Estado': found?.isSubmitted ? 'BLOQUEADO OFICIAL' : 'BORRADOR'
              });
            }
          });

          // Weekly matrix row
          if (includeWeeklyMatrix) {
            const matrixRow = {
              'Semana': w.label,
              'Semana Inicio': w.weekStart,
              'Colaborador': emp.fullName,
              'Cédula': emp.documentId || emp.code,
              'Cargo': emp.position || 'ASESOR(A) DE IMAGEN',
              'Punto de Venta': empPdv.name || emp.pdvId,
              'Código PDV': empPdv.code || '-',
              'Ciudad': empPdv.city || '-',
              'Zona': empPdv.zoneName || sup?.zoneName || sup?.name || '-'
            };

            filteredShifts.forEach(sh => {
              if (sh.shiftType === 'ORDINARIO') {
                matrixRow[`${sh.dayOfWeek} (${sh.date})`] = `${formatTimeRange12h(sh.startTime || '10:00', sh.endTime || '20:30')} (${sh.netHours || 0}h)`;
              } else {
                matrixRow[`${sh.dayOfWeek} (${sh.date})`] = `${sh.shiftType} (${sh.shiftType === 'NO_PROGRAMADO' ? '0h' : '7h'})`;
              }
            });

            matrixRow['Total L-S (42h)'] = monSatStats.monSatHours || 0;
            matrixRow['Horas Extras (>42h)'] = monSatStats.excessHours || 0;
            matrixRow['Domingos/Festivos'] = monSatStats.sundayHours || 0;
            matrixRow['Total Semana'] = monSatStats.totalHours || 0;
            weeklyMatrixRows.push(matrixRow);
          }
        });

        // Consolidated employee summary
        consolidatedSummaryRows.push({
          'Colaborador': emp.fullName,
          'Cédula / Documento': emp.documentId || emp.code,
          'Cargo': emp.position || 'ASESOR(A) DE IMAGEN',
          'Tipo Vinculación': (emp.contractType || 'FIJO').toUpperCase(),
          'Punto de Venta': empPdv.name || emp.pdvId,
          'Código PDV': empPdv.code || '-',
          'Ciudad': empPdv.city || '-',
          'Zona Regional': empPdv.zoneName || sup?.zoneName || sup?.name || '-',
          'Supervisor Directo': sup?.name || '-',
          'Semanas Evaluadas': totalWeeksEvaluated,
          'Total Horas L-S (42h max)': Number(totalMonSatHoursLapso.toFixed(1)),
          'Total Horas Extras (>42h)': Number(totalExcessHoursLapso.toFixed(1)),
          'Total Horas Dominicales': Number(totalSundayHoursLapso.toFixed(1)),
          'Domingos Trabajados (Mes)': totalSundaysWorkedCount,
          'Días de Descanso (7h)': totalRestDaysCount,
          'Días Incapacidad/Licencia': totalMedicalLeaveCount,
          'Total Horas Netas Período': Number(totalNetHoursLapso.toFixed(1)),
          'Lapso Consultado': getLapsoDescription()
        });
      });

      setExportProgress({
        text: 'Generando archivo Excel (.xlsx) con estilos y pestañas...',
        pct: 90
      });

      // 4. Generate Workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: Resumen
      const wsSummary = XLSX.utils.json_to_sheet(consolidatedSummaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Consolidado_Horas');

      // Sheet 2: Detalle Diario
      if (includeDetailSheet && chronologicalDailyRows.length > 0) {
        const wsDetail = XLSX.utils.json_to_sheet(chronologicalDailyRows);
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle_Diario_Turnos');
      }

      // Sheet 3: Matriz Semanal
      if (includeWeeklyMatrix && weeklyMatrixRows.length > 0) {
        const wsMatrix = XLSX.utils.json_to_sheet(weeklyMatrixRows);
        XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matriz_Semanal_Horarios');
      }

      // File name construction
      const scopeLabel = scopeType === 'ALL' 
        ? (filterZone !== 'ALL' ? `Zona_${filterZone.replace(/\s+/g, '_')}` : 'Nacional_Todas_Tiendas')
        : (pdvs.find(p => p.id === filterPdvId)?.code || 'PDV');
      
      const fileLapsoStr = getLapsoFileString();
      const fileName = `Programacion_Horarios_${scopeLabel}_${fileLapsoStr}.xlsx`;

      XLSX.writeFile(wb, fileName);

      // Record Audit Event
      recordAuditEvent({
        userName: currentUser?.fullName || currentUser?.username || 'Usuario',
        userRole: currentUser?.role || 'USUARIO',
        action: 'EXPORT_SCHEDULE_TIME_RANGE',
        actionLabel: 'Exportación de Horarios por Lapso',
        pdvId: scopeType === 'ALL' ? 'NACIONAL' : filterPdvId,
        detail: `Descargó reporte de programación (${consolidatedSummaryRows.length} colaboradores, ${targetWeeks.length} semanas: ${getLapsoDescription()})`
      });

      setExportSuccess(`✓ Reporte descargado exitosamente: "${fileName}" con ${consolidatedSummaryRows.length} colaboradores y ${targetWeeks.length} semanas analizadas.`);
      setExportProgress(null);

    } catch (err) {
      console.error('Error generating custom range Excel:', err);
      setExportError(err.message || 'Error inesperado al generar el archivo Excel.');
      setExportProgress(null);
    } finally {
      setIsExporting(false);
    }
  }

  function getLapsoDescription() {
    if (exportMode === 'SINGLE_WEEK') {
      const f = ALL_WEEKS_2026.find(w => w.weekStart === singleWeek);
      return f ? f.label : singleWeek;
    }
    if (exportMode === 'WEEK_RANGE') {
      const startW = ALL_WEEKS_2026.find(w => w.weekStart === rangeStartWeek);
      const endW = ALL_WEEKS_2026.find(w => w.weekStart === rangeEndWeek);
      return `Desde ${startW?.label || rangeStartWeek} hasta ${endW?.label || rangeEndWeek}`;
    }
    if (exportMode === 'MONTH_FORTNIGHT') {
      const mObj = months2026.find(m => m.value === selectedMonth);
      const fLabel = fortnightType === 'Q1' ? '1ra Quincena (Días 1-15)' : fortnightType === 'Q2' ? '2da Quincena (Días 16-30/31)' : 'Mes Completo';
      return `${mObj?.label || selectedMonth} - ${fLabel}`;
    }
    if (exportMode === 'CUSTOM_DATES') {
      return `Fechas ${customStartDate} al ${customEndDate}`;
    }
    if (exportMode === 'ALL_HISTORICAL') {
      return 'Histórico Completo (Todas las Semanas con Datos)';
    }
    return 'Lapso Personalizado';
  }

  function getLapsoFileString() {
    if (exportMode === 'SINGLE_WEEK') return `Semana_${singleWeek}`;
    if (exportMode === 'WEEK_RANGE') return `Semanas_${rangeStartWeek}_a_${rangeEndWeek}`;
    if (exportMode === 'MONTH_FORTNIGHT') return `${selectedMonth}_${fortnightType}`;
    if (exportMode === 'CUSTOM_DATES') return `Del_${customStartDate}_al_${customEndDate}`;
    if (exportMode === 'ALL_HISTORICAL') return 'Historico_Completo';
    return 'Personalizado';
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl text-white shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Centro de Exportaciones Avanzadas</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/30">
                  LAPSOS PERSONALIZADOS
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Descargar Programación de Turnos a Excel
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">

          {/* Preset Quick Badges */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Accesos Rápidos a Lapsos Habituales:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset('ANIVERSARIO')}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>🎉 Campaña Aniversario (Semanas 36 a 41)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('LAST_4_WEEKS')}
                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>📅 Últimas 4 Semanas (Sem 39 a 42)</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('OCTUBRE')}
                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>🗓️ Mes de Octubre Completo</span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset('ALL_KNOWN')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>📦 Todo el Histórico Oficial</span>
              </button>
            </div>
          </div>

          {/* 1. SELECCIONADOR DE MODO DE LAPSO DE TIEMPO */}
          <div className="space-y-3">
            <label className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-emerald-400" />
              <span>1. Selecciona cómo deseas definir el lapso de tiempo:</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setExportMode('SINGLE_WEEK')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  exportMode === 'SINGLE_WEEK'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs">Una Sola Semana</div>
                <div className="text-[10px] text-slate-500 mt-1">Semana individual específica</div>
              </button>

              <button
                type="button"
                onClick={() => setExportMode('WEEK_RANGE')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  exportMode === 'WEEK_RANGE'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs">Rango de Semanas</div>
                <div className="text-[10px] text-slate-500 mt-1">De Semana X a Semana Y</div>
              </button>

              <button
                type="button"
                onClick={() => setExportMode('MONTH_FORTNIGHT')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  exportMode === 'MONTH_FORTNIGHT'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs">Mes o Quincena</div>
                <div className="text-[10px] text-slate-500 mt-1">Corte mensual o quincenal</div>
              </button>

              <button
                type="button"
                onClick={() => setExportMode('CUSTOM_DATES')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  exportMode === 'CUSTOM_DATES'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs">Fechas Libres</div>
                <div className="text-[10px] text-slate-500 mt-1">Desde DD/MM hasta DD/MM</div>
              </button>

              <button
                type="button"
                onClick={() => setExportMode('ALL_HISTORICAL')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  exportMode === 'ALL_HISTORICAL'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs">Todo el Histórico</div>
                <div className="text-[10px] text-slate-500 mt-1">Todas las semanas cargadas</div>
              </button>
            </div>
          </div>

          {/* PARAMETROS ESPECÍFICOS SEGÚN EL MODO ELEGIDO */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            
            {/* Si es SINGLE_WEEK */}
            {exportMode === 'SINGLE_WEEK' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Selecciona la semana a descargar:</label>
                <select
                  value={singleWeek}
                  onChange={(e) => setSingleWeek(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                >
                  {ALL_WEEKS_2026.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>
                      {w.label} {KNOWN_WEEKS_WITH_DATA.includes(w.weekStart) ? '✓ (Con Datos)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Si es WEEK_RANGE */}
            {exportMode === 'WEEK_RANGE' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Semana Inicial (Desde):</label>
                  <select
                    value={rangeStartWeek}
                    onChange={(e) => setRangeStartWeek(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  >
                    {ALL_WEEKS_2026.map(w => (
                      <option key={w.weekStart} value={w.weekStart}>
                        {w.label} {KNOWN_WEEKS_WITH_DATA.includes(w.weekStart) ? '✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Semana Final (Hasta):</label>
                  <select
                    value={rangeEndWeek}
                    onChange={(e) => setRangeEndWeek(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  >
                    {ALL_WEEKS_2026.map(w => (
                      <option key={w.weekStart} value={w.weekStart}>
                        {w.label} {KNOWN_WEEKS_WITH_DATA.includes(w.weekStart) ? '✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Si es MONTH_FORTNIGHT */}
            {exportMode === 'MONTH_FORTNIGHT' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Selecciona el Mes:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  >
                    {months2026.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Corte de Liquidación:</label>
                  <select
                    value={fortnightType}
                    onChange={(e) => setFortnightType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  >
                    <option value="FULL_MONTH">Mes Completo (1 al último día)</option>
                    <option value="Q1">1ra Quincena (Días 1 al 15)</option>
                    <option value="Q2">2da Quincena (Días 16 al cierre)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Si es CUSTOM_DATES */}
            {exportMode === 'CUSTOM_DATES' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Fecha de Inicio:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Fecha de Fin:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                  />
                </div>
              </div>
            )}

            {/* Si es ALL_HISTORICAL */}
            {exportMode === 'ALL_HISTORICAL' && (
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-bold text-emerald-400">✓ Se incluirán todas las semanas registradas en el sistema:</p>
                <p className="text-[11px] text-slate-400">
                  {KNOWN_WEEKS_WITH_DATA.length} semanas oficiales (Semanas 27 a 43, correspondientes a Julio, Agosto, Septiembre y Octubre 2026).
                </p>
              </div>
            )}

            {/* Resumen del Lapso */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">Semanas que componen este reporte:</span>
              <span className="font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800">
                {targetWeeks.length} semana(s) seleccionada(s)
              </span>
            </div>
          </div>

          {/* 2. ALCANCE (TODOS LOS PDVS O PDV ESPECÍFICO) */}
          <div className="space-y-3">
            <label className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-400" />
              <span>2. Alcance de Tiendas (PDVs):</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setScopeType('ALL')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                  scopeType === 'ALL' && filterZone === 'ALL'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-md shadow-blue-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-bold text-xs">Nacional Completo</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Todas las 101 tiendas del país</div>
              </button>

              <button
                type="button"
                onClick={() => setScopeType('SINGLE')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                  scopeType === 'SINGLE'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-md shadow-blue-500/10'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-bold text-xs">Punto de Venta Específico</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Descargar una sola tienda</div>
              </button>

              <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filtrar por Zona:</label>
                <select
                  value={filterZone}
                  onChange={(e) => {
                    setFilterZone(e.target.value);
                    if (e.target.value !== 'ALL') setScopeType('ALL');
                  }}
                  className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-bold"
                >
                  <option value="ALL">Todas las Zonas</option>
                  {availableZones.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dropdown if SINGLE PDV selected */}
            {scopeType === 'SINGLE' && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Selecciona el Punto de Venta:</label>
                <select
                  value={filterPdvId}
                  onChange={(e) => setFilterPdvId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-bold"
                >
                  {allowedPdvs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({p.city})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 3. PESTAÑAS Y FORMATO DEL EXCEL */}
          <div className="space-y-2">
            <label className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>3. Estructura de pestañas en el archivo Excel:</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Resumen Consolidado</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Total de horas 42h, horas extras, dominicales y descansos por colaborador.
                </p>
              </div>

              <label className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDetailSheet}
                  onChange={(e) => setIncludeDetailSheet(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400 mt-0.5"
                />
                <div>
                  <div className="font-bold text-slate-200">Detalle Diario Cronológico</div>
                  <p className="text-[10px] text-slate-400">
                    Fila por cada día programado con entradas, salidas, horas netas y nocturnas.
                  </p>
                </div>
              </label>

              <label className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeWeeklyMatrix}
                  onChange={(e) => setIncludeWeeklyMatrix(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400 mt-0.5"
                />
                <div>
                  <div className="font-bold text-slate-200">Matriz Semanal Tradicional</div>
                  <p className="text-[10px] text-slate-400">
                    Columnas horizontales de Lunes a Domingo por cada semana para nómina.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Feedback & Progress Banners */}
          {exportProgress && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {exportProgress.text}
                </span>
                <span className="font-mono font-bold text-blue-400">{exportProgress.pct}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${exportProgress.pct}%` }}
                ></div>
              </div>
            </div>
          )}

          {exportError && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          {exportSuccess && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            <span>Lapso a exportar: </span>
            <strong className="text-white">{getLapsoDescription()}</strong>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={isExporting || targetWeeks.length === 0}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-xs rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generando Excel...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>DESCARGAR EXCEL (.XLSX)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
