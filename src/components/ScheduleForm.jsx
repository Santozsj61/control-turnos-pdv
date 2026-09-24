import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Lock, AlertCircle, CheckCircle2, Send, Coffee, Info, 
  Sparkles, ArrowRight, ShieldAlert, Store, UserPlus, User, Edit3, 
  HeartPulse, Palmtree, FileCheck2, AlertTriangle, ChevronDown, Wrench,
  Save, Trash2, Check, RefreshCw, Layers, ShieldCheck, BadgeCheck,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, Building2, Eye,
  FileSpreadsheet, Download, Upload, Users, UserMinus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  ALL_WEEKS_2026, 
  CURRENT_WEEK_START, 
  CURRENT_WEEK_NUMBER, 
  formatExcelTime, 
  detectWeekFromHeaders, 
  cleanNormalizeStr 
} from '../utils/weeks.js';
import { calculateShiftHours, calculateMonSatHours, countMonthlySundays } from '../utils/calculator.js';
import { api } from '../services/api.js';
import { supabase } from '../services/supabaseClient.js';

const DAYS_NAME = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const SHIFT_TYPES = [
  { value: 'ORDINARIO', label: 'Turno Ordinario', hours: 'Horario', color: 'blue', desc: 'Jornada laboral con horario definido' },
  { value: 'DESCANSO', label: 'Descanso (7h)', hours: '7.0h', color: 'slate', desc: 'Día libre de descanso semanal computable (7.0 hrs)' },
  { value: 'INCAPACIDAD', label: 'Incapacidad (7h)', hours: '7.0h', color: 'rose', desc: 'Incapacidad médica legal (computa 7.0 hrs)' },
  { value: 'VACACIONES', label: 'Vacaciones (7h)', hours: '7.0h', color: 'emerald', desc: 'Período vacacional remunerado (computa 7.0 hrs)' },
  { value: 'LICENCIA', label: 'Licencia (7h)', hours: '7.0h', color: 'indigo', desc: 'Licencia reglamentaria / luto (computa 7.0 hrs)' },
  { value: 'NO_PROGRAMADO', label: 'No Programado', hours: '0.0h', color: 'amber', desc: 'Sin programación asignada (computa 0.0 hrs)' }
];

export const STANDARD_SHIFT_PRESETS = [
  { label: '10:00 - 20:30 (9.0h Netas | Almuerzo 1.5h)', start: '10:00', end: '20:30' },
  { label: '10:00 - 18:00 (6.5h Netas | Almuerzo 1.5h)', start: '10:00', end: '18:00' },
  { label: '11:00 - 19:00 (6.5h Netas | Almuerzo 1.5h)', start: '11:00', end: '19:00' },
  { label: '12:00 - 20:30 (7.0h Netas | Almuerzo 1.5h)', start: '12:00', end: '20:30' },
  { label: '14:00 - 20:30 (6.5h Netas | Sin Almuerzo)', start: '14:00', end: '20:30' },
  { label: '10:00 - 17:00 (5.5h Netas | Almuerzo 1.5h)', start: '10:00', end: '17:00' },
  { label: '13:58 - 20:28 (6.5h Netas | Sin Almuerzo)', start: '13:58', end: '20:28' }
];

export default function ScheduleForm({ currentUser, pdvs, supervisors, onOpenPermissionTab, onReloadUsers }) {
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isEmployee = currentUser?.role === 'EMPLOYEE';

  const currentSupervisorObj = supervisors.find(s => 
    s.name === currentUser?.fullName || 
    s.id === currentUser?.supervisorId || 
    currentUser?.id?.includes(s.id)
  );

  // Allowed PDVs based on security scope
  const allowedPdvs = (isAdmin || isHrAdmin || isAuditorVrx)
    ? pdvs
    : isSupervisor
    ? pdvs.filter(p => p.supervisorId === currentSupervisorObj?.id || p.supervisorId === currentUser?.supervisorId)
    : pdvs.filter(p => p.id === currentUser?.pdvId || p.code === currentUser?.pdvId);

  // PDV Selection state: 'ALL' or a specific pdv.id
  const [selectedPdvId, setSelectedPdvId] = useState(
    isEmployee 
      ? (currentUser.pdvId || allowedPdvs[0]?.id || 'pdv-1')
      : (isSupervisor || isHrAdmin || isAuditorVrx)
      ? 'ALL' 
      : (allowedPdvs[0]?.id || pdvs[0]?.id || 'pdv-1')
  );

  // Synchronize scope when currentUser or role changes
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === 'EMPLOYEE') {
      setSelectedPdvId(currentUser.pdvId || allowedPdvs[0]?.id || 'pdv-1');
    } else if (currentUser.role === 'SUPERVISOR' || currentUser.role === 'HR_ADMIN' || currentUser.role === 'ADMIN' || currentUser.role === 'AUDITOR_VRX') {
      setSelectedPdvId('ALL');
    }
  }, [currentUser?.id, currentUser?.role]);

  const [selectedWeekStart, setSelectedWeekStart] = useState(CURRENT_WEEK_START);
  const [allEmployees, setAllEmployees] = useState([]);
  const [allHistoricalEmployees, setAllHistoricalEmployees] = useState([]);
  
  // Matrix state: { [userId]: { shifts: [], isSubmitted: false, submittedAt: null, notes: '', monSatStats: {}, sundayStats: {}, pdv: {} } }
  const [scheduleMatrix, setScheduleMatrix] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPunches, setUploadingPunches] = useState(false);
  const [uploadingSchedule, setUploadingSchedule] = useState(false);
  const [message, setMessage] = useState(null);

  // Filters & Sorting state
  const [filterHours, setFilterHours] = useState('ALL'); // 'ALL' | 'LE_42' | 'GT_42'
  const [filterSundays, setFilterSundays] = useState('ALL'); // 'ALL' | 'WITH_SUNDAY' | 'NO_SUNDAY' | 'APPROVAL_REQUIRED'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'pdv' | 'hours'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'
  
  // Modal states & Employee creation fields (Fijo vs Temporal)
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newDocId, setNewDocId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPosition, setNewPosition] = useState('ASESOR(A) DE IMAGEN');
  const [newContractType, setNewContractType] = useState('FIJO'); // 'FIJO' or 'TEMPORAL'
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { userId, dayIndex }

  const activeSupervisor = currentSupervisorObj || supervisors.find(s => s.id === allowedPdvs[0]?.supervisorId);
  const activeSinglePdv = selectedPdvId !== 'ALL' ? (allowedPdvs.find(p => p.id === selectedPdvId) || allowedPdvs[0]) : null;

  const [showPlantillaModal, setShowPlantillaModal] = useState(false);
  const [plantillaSearchTerm, setPlantillaSearchTerm] = useState('');

  const activePdvPersonnel = useMemo(() => {
    const currentTargetId = selectedPdvId !== 'ALL' ? selectedPdvId : (currentUser?.pdvId || activeSinglePdv?.id);
    if (currentTargetId && currentTargetId !== 'ALL') {
      return allHistoricalEmployees.filter(e => e.pdvId === currentTargetId || e.pdv_id === currentTargetId);
    }
    if (isSupervisor) {
      return allHistoricalEmployees.filter(e => allowedPdvs.some(ap => ap.id === e.pdvId || ap.code === e.pdvId));
    }
    return allHistoricalEmployees;
  }, [allHistoricalEmployees, selectedPdvId, currentUser?.pdvId, activeSinglePdv, isSupervisor, allowedPdvs]);

  async function handleRemovePdvMember(memberId, memberName) {
    if (isEmployee || isSupervisor || isHrAdmin) {
      setMessage({ type: 'error', text: 'Acceso Denegado: Los Puntos de Venta no tienen autorización para desvincular personal.' });
      return;
    }
    if (!window.confirm(`¿Confirmas desvincular a "${memberName}" de este PDV? Dejará de figurar en la dotación de la tienda.`)) {
      return;
    }
    const currentTargetId = selectedPdvId !== 'ALL' ? selectedPdvId : (currentUser?.pdvId || activeSinglePdv?.id || 'pdv-1');
    try {
      await api.removePdvMember(memberId, currentTargetId, selectedWeekStart);
      setMessage({ type: 'success', text: `✓ Colaborador ${memberName} desvinculado del PDV exitosamente.` });
      setAllEmployees(prev => prev.filter(e => e.id !== memberId));
      setAllHistoricalEmployees(prev => prev.map(e => e.id === memberId ? { ...e, pdvId: null, pdv_id: null } : e));
      loadScheduleData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error al desvincular colaborador.' });
    }
  }

  // Generate date descriptors for the selected week
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

  // Load all employees and schedules for the selected scope & Week
  async function loadScheduleData() {
    setLoading(true);
    setMessage(null);
    try {
      let usersUrl = '/api/users?role=EMPLOYEE';
      let schedUrl = `/api/schedules?weekStart=${selectedWeekStart}`;

      if (isEmployee) {
        usersUrl += `&pdvId=${currentUser.pdvId}`;
        schedUrl += `&pdvId=${currentUser.pdvId}`;
      } else if (isSupervisor) {
        const supId = currentSupervisorObj?.id || currentUser.supervisorId;
        if (selectedPdvId && selectedPdvId !== 'ALL') {
          usersUrl += `&pdvId=${selectedPdvId}`;
          schedUrl += `&pdvId=${selectedPdvId}`;
        } else {
          usersUrl += `&supervisorId=${supId}`;
          schedUrl += `&supervisorId=${supId}`;
        }
      } else if (isAdmin || isHrAdmin || isAuditorVrx) {
        if (selectedPdvId && selectedPdvId !== 'ALL') {
          usersUrl += `&pdvId=${selectedPdvId}`;
          schedUrl += `&pdvId=${selectedPdvId}`;
        }
      }

      // 1. Fetch Users for Active Scope
      let emps = [];
      try {
        const resUsers = await fetch(usersUrl);
        const jsonUsers = await resUsers.json();
        if (jsonUsers.success && Array.isArray(jsonUsers.data)) {
          emps = jsonUsers.data.filter(u => u.role === 'EMPLOYEE');
        }
      } catch (e) {
        // Fallback on Vercel client-side
      }

      if (emps.length === 0) {
        try {
          const fallbackUsers = await api.getUsers();
          if (Array.isArray(fallbackUsers)) {
            emps = fallbackUsers.filter(u => u.role === 'EMPLOYEE');
          }
        } catch (e) {}
      }

      // Merge any custom employees uploaded from Excel
      try {
        const savedCustom = localStorage.getItem('control_turnos_custom_employees');
        if (savedCustom) {
          const parsedCustom = JSON.parse(savedCustom);
          if (Array.isArray(parsedCustom)) {
            parsedCustom.forEach(ce => {
              if (!emps.some(e => e.id === ce.id || (ce.documentId && String(e.documentId) === String(ce.documentId)))) {
                emps.push(ce);
              }
            });
          }
        }
      } catch (e) {}

      // Filter by selected PDV if not 'ALL'
      let filteredEmps = emps;
      if (selectedPdvId && selectedPdvId !== 'ALL') {
        filteredEmps = emps.filter(e => e.pdvId === selectedPdvId);
      } else if (isSupervisor) {
        filteredEmps = emps.filter(e => allowedPdvs.some(ap => ap.id === e.pdvId || ap.code === e.pdvId));
      } else if (currentUser?.role === 'PDV') {
        filteredEmps = emps.filter(e => e.pdvId === currentUser.pdvId || e.pdvId === activeSinglePdv?.id);
      }
      setAllEmployees(filteredEmps);
      setAllHistoricalEmployees(emps);

      // 2. Fetch Schedules (Supabase cloud first, then local fallback)
      let existingScheds = [];
      try {
        if (api.isConfigured) {
          const filters = { weekStart: selectedWeekStart };
          if (selectedPdvId && selectedPdvId !== 'ALL') filters.pdvId = selectedPdvId;
          const supScheds = await api.getSchedules(filters);
          if (Array.isArray(supScheds) && supScheds.length > 0) {
            existingScheds = supScheds;
          }
        }
      } catch (e) {
        console.warn('Supabase schedules fetch notice:', e);
      }

      if (existingScheds.length === 0) {
        try {
          const resSched = await fetch(schedUrl);
          const jsonSched = await resSched.json();
          if (jsonSched.success && Array.isArray(jsonSched.data)) {
            existingScheds = jsonSched.data;
          }
        } catch (e) {}
      }

      // Fallback / merge with localStorage schedules for this week
      try {
        const localScheds = localStorage.getItem('control_turnos_schedules_' + selectedWeekStart);
        if (localScheds) {
          const parsed = JSON.parse(localScheds);
          if (Array.isArray(parsed)) {
            parsed.forEach(ls => {
              if (!existingScheds.some(es => es.userId === ls.userId)) {
                existingScheds.push(ls);
              }
            });
          }
        }
      } catch (e) {}

      // 3. Incorporate any employees found in existingScheds (e.g., uploaded by another user in Supabase)
      existingScheds.forEach(es => {
        const u = es.user || {};
        if (isSupervisor && !allowedPdvs.some(ap => ap.id === es.pdvId || ap.code === es.pdvId)) {
          return;
        }
        if (currentUser?.role === 'PDV' && es.pdvId !== currentUser.pdvId && es.pdvId !== activeSinglePdv?.id) {
          return;
        }
        if (!emps.some(e => e.id === es.userId || (u.document_id && String(e.documentId) === String(u.document_id)))) {
          const newEmp = {
            id: es.userId,
            fullName: u.full_name || `COLABORADOR ${es.userId}`,
            documentId: u.document_id || (es.userId.startsWith('emp-doc-') ? es.userId.replace('emp-doc-', '') : '1000000000'),
            position: u.position || 'ASESOR(A) DE IMAGEN',
            role: 'EMPLOYEE',
            pdvId: es.pdvId || selectedPdvId || 'pdv-1',
            contractType: u.contract_type || 'FIJO'
          };
          emps.push(newEmp);
          if (!filteredEmps.some(fe => fe.id === newEmp.id)) {
            filteredEmps.push(newEmp);
          }
        }
      });

      const weekDates = getDatesForWeek(selectedWeekStart);
      const newMatrix = {};

      for (const emp of filteredEmps) {
        const found = existingScheds.find(s => s.userId === emp.id || (emp.documentId && s.user?.document_id && String(s.user.document_id) === String(emp.documentId)));
        const empPdv = pdvs.find(p => p.id === emp.pdvId) || allowedPdvs.find(p => p.id === emp.pdvId) || {};
        let userShifts = [];
        let isSubmitted = false;
        let submittedAt = null;
        let notes = '';

        if (found && found.shifts && found.shifts.length > 0) {
          isSubmitted = Boolean(found.isSubmitted);
          submittedAt = found.submittedAt;
          notes = found.notes || '';
          userShifts = weekDates.map((wd) => {
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
              grossHours: 0,
              lunchHours: 0,
              netHours: 0,
              dayHours: 0,
              nightHours: 0
            };
          });
        } else {
          // If this is an employee uploaded from an Excel file, and they have NO schedule for this week:
          // DO NOT show them in this week! (They remain strictly anchored to the week they were uploaded)
          const isCustomEmp = emp.id?.startsWith('emp-doc-') || emp.isCustom;
          if (isCustomEmp) {
            continue;
          }

          // Unprogrammed regular store employee: start with empty/no programado, NOT fake work hours
          isSubmitted = false;
          userShifts = weekDates.map((wd) => ({
            ...wd,
            shiftType: 'NO_PROGRAMADO',
            isDayOff: false,
            startTime: '',
            endTime: '',
            grossHours: 0,
            lunchHours: 0,
            netHours: 0,
            dayHours: 0,
            nightHours: 0
          }));
        }

        const monSatStats = calculateMonSatHours(userShifts, 42);
        const sundayStats = countMonthlySundays([], emp.id, selectedWeekStart.substring(0, 7), userShifts);

        newMatrix[emp.id] = {
          userId: emp.id,
          employee: emp,
          pdv: empPdv,
          isSubmitted,
          submittedAt,
          notes,
          shifts: userShifts,
          monSatStats,
          sundayStats
        };
      }

      setScheduleMatrix(newMatrix);

    } catch (err) {
      console.error('Error loading schedules:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScheduleData();
  }, [selectedPdvId, selectedWeekStart, currentUser?.id, currentUser?.role]);

  // Recalculate preview for a single user locally & synchronously
  function recalculateUserPreview(userId, shiftsList, currentMatrix = scheduleMatrix) {
    try {
      const month = selectedWeekStart.substring(0, 7);
      const calculatedShifts = (shiftsList || []).map(s => {
        const shiftType = s.shiftType || (s.isDayOff ? 'DESCANSO' : 'ORDINARIO');
        const calc = calculateShiftHours(s.startTime, s.endTime, s.date, {}, shiftType);
        return {
          ...s,
          shiftType,
          isDayOff: shiftType === 'DESCANSO' || s.isDayOff,
          ...calc
        };
      });

      const monSatStats = calculateMonSatHours(calculatedShifts, 42);
      const sundayStats = countMonthlySundays([], userId, month, calculatedShifts);

      setScheduleMatrix(prev => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || currentMatrix[userId] || {}),
          shifts: calculatedShifts,
          monSatStats,
          sundayStats
        }
      }));
    } catch (err) {
      console.error('Error recalculating user preview:', err);
    }
  }

  // Export schedule to Excel for Talento Humano / Admin
  function handleExportScheduleExcel() {
    if (!filteredAndSortedEmployees || filteredAndSortedEmployees.length === 0) {
      setMessage({ type: 'error', text: 'No hay datos de programación disponibles para exportar.' });
      return;
    }

    const weekDates = getDatesForWeek(selectedWeekStart);
    const exportRows = filteredAndSortedEmployees.map(emp => {
      const userRow = scheduleMatrix[emp.id] || { shifts: [], monSatStats: {}, sundayStats: {}, pdv: {} };
      const empPdv = userRow.pdv || pdvs.find(p => p.id === emp.pdvId) || {};
      const sup = supervisors.find(s => s.id === empPdv.supervisorId);

      const rowObj = {
        'Colaborador': emp.fullName,
        'Cédula / Documento': emp.documentId || emp.code,
        'Cargo': emp.position || 'ASESOR(A) DE IMAGEN',
        'Tipo Vinculación': (emp.contractType || 'FIJO').toUpperCase(),
        'Punto de Venta (PDV)': empPdv.name || emp.pdvId,
        'Código PDV': empPdv.code || '-',
        'Ciudad': empPdv.city || '-',
        'Zona Asignada': empPdv.zoneName || sup?.zoneName || sup?.name || '-',
      };

      // Add each day column (Lunes a Domingo)
      weekDates.forEach((wd, idx) => {
        const shift = userRow.shifts?.[idx] || {};
        const shiftType = shift.shiftType || (shift.isDayOff ? 'DESCANSO' : 'ORDINARIO');
        if (shiftType === 'ORDINARIO') {
          rowObj[`${wd.dayOfWeek} (${wd.formattedDate})`] = `${shift.startTime || '10:00'} - ${shift.endTime || '20:30'} (${shift.netHours || 0}h netas)`;
        } else {
          rowObj[`${wd.dayOfWeek} (${wd.formattedDate})`] = `${shiftType} (${shiftType === 'NO_PROGRAMADO' ? '0.0h' : '7.0h'})`;
        }
      });

      rowObj['Total Horas L-S (42h)'] = userRow.monSatStats?.monSatHours || 0;
      rowObj['Exceso Horas Extras (>42h)'] = userRow.monSatStats?.excessHours || 0;
      rowObj['Horas Dom/Fest'] = userRow.monSatStats?.sundayHours || 0;
      rowObj['Total Horas Semanales'] = userRow.monSatStats?.totalHours || 0;
      rowObj['Domingos Trabajados en el Mes'] = userRow.sundayStats?.workedSundaysCount || 0;
      rowObj['Estado Programación'] = userRow.isSubmitted ? 'OFICIAL BLOQUEADO' : 'BORRADOR';

      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Programacion_Semanal');
    
    const scopeLabel = selectedPdvId === 'ALL' ? 'Nacional_Todas_Tiendas' : (activeSinglePdv?.code || 'PDV');
    XLSX.writeFile(wb, `Programacion_Horarios_${scopeLabel}_Semana_${selectedWeekStart}.xlsx`);
    
    setMessage({
      type: 'success',
      text: `✓ Reporte de programación semanal exportado exitosamente a Excel (${exportRows.length} colaboradores).`
    });
  }

  // Upload punch records Excel (Exclusive for Talento Humano & Admin)
  async function handleUploadPunchesExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPunches(true);
    setMessage(null);

    try {
      const res = await api.uploadPunchFile(file);
      setMessage({
        type: 'success',
        text: `✓ Archivo procesado correctamente (${res?.recordCount || 0} marcaciones sincronizadas en Supabase).`
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error de comunicación al subir archivo de marcaciones.' });
    } finally {
      setUploadingPunches(false);
      e.target.value = '';
    }
  }

  // Parse shift string from Excel cell
  function parseShiftCellString(cellVal, weekDayObj) {
    const val = String(cellVal || '').trim().toUpperCase();
    if (!val || val === '-' || val.includes('NO_PROG') || val.includes('SIN TURNO')) {
      return {
        ...weekDayObj,
        shiftType: 'NO_PROGRAMADO',
        isDayOff: false,
        startTime: '',
        endTime: '',
        grossHours: 0,
        lunchHours: 0,
        netHours: 0,
        dayHours: 0,
        nightHours: 0
      };
    }

    if (val.includes('DESCANSO') || val.includes('LIBRE') || val === 'D' || val === 'OFF') {
      return {
        ...weekDayObj,
        shiftType: 'DESCANSO',
        isDayOff: true,
        startTime: '',
        endTime: '',
        grossHours: 0,
        lunchHours: 0,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    if (val.includes('INCAPACIDAD') || val.includes('INC') || val.includes('MEDIC')) {
      return {
        ...weekDayObj,
        shiftType: 'INCAPACIDAD',
        isDayOff: false,
        startTime: '08:00',
        endTime: '16:00',
        grossHours: 8,
        lunchHours: 1,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    if (val.includes('VACACION') || val.includes('VAC')) {
      return {
        ...weekDayObj,
        shiftType: 'VACACIONES',
        isDayOff: false,
        startTime: '08:00',
        endTime: '16:00',
        grossHours: 8,
        lunchHours: 1,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    if (val.includes('LICENCIA') || val.includes('LIC') || val.includes('LUTO')) {
      return {
        ...weekDayObj,
        shiftType: 'LICENCIA',
        isDayOff: false,
        startTime: '08:00',
        endTime: '16:00',
        grossHours: 8,
        lunchHours: 1,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    // Extract time range (e.g. "10:00 - 20:30", "10:00 a 20:30", "14:00-20:30 (6.5h netas)")
    const timeMatches = val.match(/(\d{1,2}:\d{2})\s*(?:-|a|to|\s)\s*(\d{1,2}:\d{2})/i);
    if (timeMatches) {
      const startTime = timeMatches[1].padStart(5, '0');
      const endTime = timeMatches[2].padStart(5, '0');
      return {
        ...weekDayObj,
        shiftType: 'ORDINARIO',
        isDayOff: false,
        startTime,
        endTime,
        grossHours: 0,
        lunchHours: 0,
        netHours: 0,
        dayHours: 0,
        nightHours: 0
      };
    }

    // Default fallback shift
    return {
      ...weekDayObj,
      shiftType: 'ORDINARIO',
      isDayOff: false,
      startTime: '10:00',
      endTime: '20:30',
      grossHours: 0,
      lunchHours: 0,
      netHours: 0,
      dayHours: 0,
      nightHours: 0
    };
  }

  function parseDayShiftFromInOut(inVal, outVal, weekDayObj) {
    const rawInClean = cleanNormalizeStr(inVal);
    const rawOutClean = cleanNormalizeStr(outVal);

    if (rawInClean.includes('descanso') || rawOutClean.includes('descanso') || inVal?.toLowerCase() === 'd' || (!inVal && !outVal)) {
      return {
        ...weekDayObj,
        shiftType: 'DESCANSO',
        isDayOff: true,
        startTime: '',
        endTime: '',
        grossHours: 0,
        lunchHours: 0,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    if (rawInClean.includes('vacaciones') || rawOutClean.includes('vacaciones') || rawInClean === 'v' || rawInClean.includes('vac')) {
      return {
        ...weekDayObj,
        shiftType: 'VACACIONES',
        isDayOff: false,
        startTime: '08:00',
        endTime: '16:00',
        grossHours: 8,
        lunchHours: 1,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    if (rawInClean.includes('incapacidad') || rawOutClean.includes('incapacidad') || rawInClean === 'inc' || rawInClean.includes('med')) {
      return {
        ...weekDayObj,
        shiftType: 'INCAPACIDAD',
        isDayOff: false,
        startTime: '08:00',
        endTime: '16:00',
        grossHours: 8,
        lunchHours: 1,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    if (rawInClean.includes('licencia') || rawOutClean.includes('licencia') || rawInClean.includes('luto')) {
      return {
        ...weekDayObj,
        shiftType: 'LICENCIA',
        isDayOff: false,
        startTime: '08:00',
        endTime: '16:00',
        grossHours: 8,
        lunchHours: 1,
        netHours: 7,
        dayHours: 7,
        nightHours: 0
      };
    }

    const startMatch = String(inVal).match(/(\d{1,2}:\d{2})/);
    const endMatch = String(outVal).match(/(\d{1,2}:\d{2})/);

    if (startMatch && endMatch) {
      const startTime = startMatch[1].padStart(5, '0');
      const endTime = endMatch[1].padStart(5, '0');
      const calc = calculateShiftHours(startTime, endTime, weekDayObj.date);
      return {
        ...weekDayObj,
        shiftType: 'ORDINARIO',
        isDayOff: false,
        startTime,
        endTime,
        grossHours: calc.grossHours || 0,
        lunchHours: calc.lunchHours || 0,
        netHours: calc.netHours || 0,
        dayHours: calc.dayHours || 0,
        nightHours: calc.nightHours || 0
      };
    }

    return parseShiftCellString(inVal || outVal, weekDayObj);
  }

  // Upload schedule programming Excel (Auditor VRX & Admin)
  async function handleUploadScheduleExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSchedule(true);
    setMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

          if (!rawData || rawData.length === 0) {
            setMessage({ type: 'error', text: 'El archivo Excel no contiene datos de programación válidos.' });
            setUploadingSchedule(false);
            return;
          }

          // Detección inteligente de semana a partir de encabezados (ej: "Lunes 29 Junio", etc.)
          const detectedWeek = detectWeekFromHeaders(Object.keys(rawData[0]));
          let activeWeekStart = selectedWeekStart;
          if (detectedWeek && detectedWeek.weekStart) {
            activeWeekStart = detectedWeek.weekStart;
            setSelectedWeekStart(detectedWeek.weekStart);
          }

          const weekDates = getDatesForWeek(activeWeekStart);
          let updatedCount = 0;
          let newMatrix = { ...scheduleMatrix };
          let updatedEmployees = [...allEmployees];

          for (const row of rawData) {
            const docKey = Object.keys(row).find(k => 
              k.toLowerCase().includes('cedula') || 
              k.toLowerCase().includes('cédula') || 
              k.toLowerCase().includes('document') || 
              k.toLowerCase().includes('ident') ||
              k.toLowerCase().includes('codigo') ||
              k.toLowerCase().includes('código')
            );
            const nameKey = Object.keys(row).find(k => 
              k.toLowerCase().includes('colaborador') || 
              k.toLowerCase().includes('nombre') || 
              k.toLowerCase().includes('empleado')
            );
            const pdvKey = Object.keys(row).find(k => 
              k.toLowerCase().includes('pdv') || 
              k.toLowerCase().includes('punto') || 
              k.toLowerCase().includes('tienda')
            );

            const docVal = docKey ? String(row[docKey]).trim() : '';
            const nameVal = nameKey ? String(row[nameKey]).trim().toUpperCase() : '';
            const pdvVal = pdvKey ? String(row[pdvKey]).trim() : '';

            // Match existing employee
            let emp = allEmployees.find(e => 
              (docVal && String(e.documentId).trim() === docVal) || 
              (docVal && String(e.code).trim() === docVal) ||
              (nameVal && e.fullName.toUpperCase().includes(nameVal))
            );

            // If not found in current loaded scope, find or associate
            if (!emp && (docVal || nameVal)) {
              const matchedPdv = pdvs.find(p => p.name?.toLowerCase().includes(pdvVal.toLowerCase()) || p.code === pdvVal || p.id === pdvVal) || allowedPdvs[0] || { id: 'pdv-1', name: 'PDV Principal' };
              emp = {
                id: `emp-doc-${docVal || Date.now()}`,
                fullName: nameVal || `COLABORADOR ${docVal}`,
                documentId: docVal || '1000000000',
                position: 'ASESOR(A) DE IMAGEN',
                role: 'EMPLOYEE',
                pdvId: matchedPdv.id,
                contractType: 'FIJO'
              };
              updatedEmployees.push(emp);
            }

            if (!emp) continue;

            // Parse 7 days: Detecta columnas pares [Ingreso / Salida] de la plantilla oficial o columna única de rango
            const dayShifts = weekDates.map((wd, dayIdx) => {
              const dayName = wd.dayOfWeek.toLowerCase();
              const dayKey = dayName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

              // 1. Columnas separadas de Ingreso y Salida (Plantilla oficial Quest)
              const inColKey = Object.keys(row).find(k => {
                const kClean = cleanNormalizeStr(k);
                return kClean.includes(dayKey) && (kClean.includes('ingreso') || kClean.includes('entrada') || kClean.includes('in') || kClean.includes('inicio'));
              });

              const outColKey = Object.keys(row).find(k => {
                const kClean = cleanNormalizeStr(k);
                return kClean.includes(dayKey) && (kClean.includes('salida') || kClean.includes('out') || kClean.includes('fin'));
              });

              if (inColKey || outColKey) {
                const inVal = inColKey ? formatExcelTime(row[inColKey]) : '';
                const outVal = outColKey ? formatExcelTime(row[outColKey]) : '';
                return parseDayShiftFromInOut(inVal, outVal, wd);
              }

              // 2. Columna única de turno (Formato tradicional)
              const colKey = Object.keys(row).find(k => {
                const kClean = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return kClean.includes(dayKey) || 
                       kClean.includes(wd.date) || 
                       kClean.includes(`dia ${dayIdx + 1}`);
              });

              const cellVal = colKey ? String(row[colKey]).trim() : '';
              return parseShiftCellString(cellVal, wd);
            });

            const empPdv = pdvs.find(p => p.id === emp.pdvId) || allowedPdvs.find(p => p.id === emp.pdvId) || {};

            const monSatStats = calculateMonSatHours(dayShifts, 42);
            const sundayStats = countMonthlySundays([], emp.id, activeWeekStart.substring(0, 7), dayShifts);

            newMatrix[emp.id] = {
              userId: emp.id,
              employee: emp,
              pdv: empPdv,
              isSubmitted: true,
              submittedAt: new Date().toISOString(),
              notes: 'Programación semanal cargada e importada desde Excel por Auditor VRX',
              shifts: dayShifts,
              monSatStats,
              sundayStats
            };

            updatedCount++;
          }

          setAllEmployees(updatedEmployees);
          setScheduleMatrix(newMatrix);

          // Save to localStorage immediately
          try {
            localStorage.setItem('control_turnos_schedules_' + activeWeekStart, JSON.stringify(Object.values(newMatrix)));
            localStorage.setItem('control_turnos_custom_employees', JSON.stringify(updatedEmployees));
          } catch (e) {
            console.warn('localStorage error:', e);
          }

          // Persist batch to server / Supabase with resilience
          let cloudSaved = false;
          try {
            const targetPdvId = selectedPdvId !== 'ALL' ? selectedPdvId : (allowedPdvs[0]?.id || 'pdv-1');
            if (api.isConfigured) {
              await api.saveBatchPdvSchedules({
                pdvId: targetPdvId,
                weekStart: activeWeekStart,
                weekEnd: weekDates[6].date,
                schedules: Object.values(newMatrix).map(u => ({
                  userId: u.userId,
                  documentId: u.employee?.documentId,
                  fullName: u.employee?.fullName,
                  position: u.employee?.position,
                  shifts: u.shifts,
                  notes: 'Programación semanal importada desde archivo Excel por Auditor VRX'
                }))
              });
              cloudSaved = true;
            } else {
              await fetch('/api/schedules/batch-pdv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  pdvId: targetPdvId,
                  weekStart: activeWeekStart,
                  weekEnd: weekDates[6].date,
                  forceAdmin: true,
                  schedules: Object.values(newMatrix).map(u => ({
                    userId: u.userId,
                    documentId: u.employee?.documentId,
                    fullName: u.employee?.fullName,
                    position: u.employee?.position,
                    shifts: u.shifts,
                    notes: 'Programación semanal importada desde archivo Excel por Auditor VRX'
                  }))
                })
              }).catch(() => {});
            }
          } catch (err) {
            console.error('Error saving to cloud database:', err);
            setMessage({ type: 'error', text: `Aviso de Nube: ${err.message}` });
          }

          const weekTag = detectedWeek ? ` (${detectedWeek.shortLabel})` : '';
          setMessage({
            type: 'success',
            text: `✓ ¡Programación semanal vinculada y guardada exitosamente en la NUBE para ${updatedCount} colaborador(es)${weekTag}! ${cloudSaved ? '☁️ Sincronizado en Supabase.' : ''}`
          });
          setUploadingSchedule(false);
        } catch (err) {
          console.error('Error parsing schedule Excel:', err);
          setMessage({ type: 'error', text: 'Error al interpretar el formato del archivo Excel de programación.' });
          setUploadingSchedule(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar el archivo Excel de programación.' });
      setUploadingSchedule(false);
    } finally {
      e.target.value = '';
    }
  }

  // In-cell quick shift assignment (Only active for PDV / Admin before locking)
  function handleAssignShift(userId, dayIndex, presetOrType) {
    if (isSupervisor || isHrAdmin) return; // Read-only for Zone Leader and HR Admin
    const userRow = scheduleMatrix[userId];
    if (!userRow) return;

    const shifts = [...userRow.shifts];
    const targetShift = { ...shifts[dayIndex] };

    // Check if presetOrType is a special leave/rest type
    if (['DESCANSO', 'INCAPACIDAD', 'VACACIONES', 'LICENCIA', 'NO_PROGRAMADO'].includes(presetOrType)) {
      targetShift.shiftType = presetOrType;
      if (presetOrType === 'DESCANSO' || presetOrType === 'NO_PROGRAMADO') {
        targetShift.isDayOff = true;
        targetShift.startTime = '';
        targetShift.endTime = '';
      } else {
        targetShift.isDayOff = false;
        targetShift.startTime = '08:00';
        targetShift.endTime = '16:00';
      }
    } else {
      const [start, end] = presetOrType.split('-');
      targetShift.shiftType = 'ORDINARIO';
      targetShift.isDayOff = false;
      targetShift.startTime = start ? start.trim() : '10:00';
      targetShift.endTime = end ? end.trim() : '20:30';
    }

    shifts[dayIndex] = targetShift;

    const updatedMatrix = {
      ...scheduleMatrix,
      [userId]: {
        ...userRow,
        shifts
      }
    };
    setScheduleMatrix(updatedMatrix);
    recalculateUserPreview(userId, shifts, updatedMatrix);
    setEditingCell(null);
  }

  // Custom Time change for cell
  function handleCustomTimeChange(userId, dayIndex, field, value) {
    if (isSupervisor || isHrAdmin) return;
    const userRow = scheduleMatrix[userId];
    if (!userRow) return;

    const shifts = [...userRow.shifts];
    shifts[dayIndex] = {
      ...shifts[dayIndex],
      shiftType: 'ORDINARIO',
      isDayOff: false,
      [field]: value
    };

    const updatedMatrix = {
      ...scheduleMatrix,
      [userId]: {
        ...userRow,
        shifts
      }
    };
    setScheduleMatrix(updatedMatrix);
    recalculateUserPreview(userId, shifts, updatedMatrix);
  }

  // Mass action: Apply standard shift to all employees
  function handleApplyStandardToAll() {
    if (isSupervisor || isHrAdmin) return;
    const updated = { ...scheduleMatrix };
    Object.keys(updated).forEach(userId => {
      const uShifts = updated[userId].shifts.map((sh, idx) => {
        if (idx === 3) {
          return { ...sh, shiftType: 'DESCANSO', isDayOff: true, startTime: '', endTime: '' };
        }
        return { ...sh, shiftType: 'ORDINARIO', isDayOff: false, startTime: '10:00', endTime: '20:30' };
      });
      updated[userId] = { ...updated[userId], shifts: uShifts };
      recalculateUserPreview(userId, uShifts, updated);
    });
    setScheduleMatrix(updated);
    setMessage({ type: 'success', text: 'Se aplicó el horario estándar (10:00 - 20:30) con descanso a todos los colaboradores.' });
  }

  // Mass action: Rotate rest days among team
  function handleRotateDaysOff() {
    if (isSupervisor || isHrAdmin) return;
    const updated = { ...scheduleMatrix };
    const userIds = Object.keys(updated);
    userIds.forEach((uId, empIdx) => {
      const restDayIdx = (empIdx % 6) + 1;
      const uShifts = updated[uId].shifts.map((sh, idx) => {
        if (idx === restDayIdx) {
          return { ...sh, shiftType: 'DESCANSO', isDayOff: true, startTime: '', endTime: '' };
        }
        return { ...sh, shiftType: 'ORDINARIO', isDayOff: false, startTime: '10:00', endTime: '20:30' };
      });
      updated[uId] = { ...updated[uId], shifts: uShifts };
      recalculateUserPreview(uId, uShifts, updated);
    });
    setScheduleMatrix(updated);
    setMessage({ type: 'success', text: 'Descansos rotados equitativamente entre los colaboradores.' });
  }

  // Remove / delete employee line from schedule before saving & locking (Disabled for Supervisor & HR Admin)
  async function handleRemoveEmployeeLine(emp) {
    if (isSupervisor || isHrAdmin) {
      setMessage({ type: 'error', text: 'Acceso Denegado: En el perfil actual no está permitido eliminar colaboradores de la programación.' });
      return;
    }
    const userRow = scheduleMatrix[emp.id];
    if (userRow?.isSubmitted && !isAdmin && !isAuditorVrx) {
      setMessage({ type: 'error', text: 'La programación ya está bloqueada oficialmente. No se pueden eliminar líneas.' });
      return;
    }

    const confirmed = window.confirm(`¿Estás seguro de quitar la línea de "${emp.fullName}" de la programación de esta semana antes de guardar y bloquear?`);
    if (!confirmed) return;

    // 1. Remove from all employees states
    setAllEmployees(prev => prev.filter(e => e.id !== emp.id && (!emp.documentId || String(e.documentId) !== String(emp.documentId))));
    setAllHistoricalEmployees(prev => prev.filter(e => e.id !== emp.id && (!emp.documentId || String(e.documentId) !== String(emp.documentId))));

    // 2. Remove from matrix and update localStorage immediately
    setScheduleMatrix(prev => {
      const next = { ...prev };
      delete next[emp.id];
      Object.keys(next).forEach(k => {
        if (next[k]?.employee?.documentId && String(next[k]?.employee?.documentId) === String(emp.documentId)) {
          delete next[k];
        }
      });
      try {
        localStorage.setItem('control_turnos_schedules_' + selectedWeekStart, JSON.stringify(Object.values(next)));
      } catch (e) {}
      return next;
    });

    // 3. Remove from custom employees in localStorage
    try {
      const savedCustom = localStorage.getItem('control_turnos_custom_employees');
      if (savedCustom) {
        const parsed = JSON.parse(savedCustom);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(e => e.id !== emp.id && (!emp.documentId || String(e.documentId) !== String(emp.documentId)));
          localStorage.setItem('control_turnos_custom_employees', JSON.stringify(filtered));
        }
      }
    } catch (e) {}

    // 4. Remote Supabase and server deletion
    try {
      if (api.isConfigured && supabase) {
        await supabase.from('schedules').delete().eq('user_id', emp.id).eq('week_start', selectedWeekStart);
      }
      const targetPdvId = selectedPdvId !== 'ALL' ? selectedPdvId : (allowedPdvs[0]?.id || 'pdv-1');
      await fetch(`/api/users/${emp.id}/pdv-member?pdvId=${targetPdvId}&weekStart=${selectedWeekStart}`, {
        method: 'DELETE'
      }).catch(() => {});
    } catch (err) {
      console.warn('Error deleting schedule row in cloud:', err);
    }

    setMessage({
      type: 'success',
      text: `✓ Línea de "${emp.fullName}" eliminada correctamente de la programación semanal.`
    });
  }

  // Register a new employee to this PDV (Disabled for Supervisor & HR Admin)
  async function handleRegisterPdvMember(e) {
    e.preventDefault();
    if (isSupervisor || isHrAdmin) {
      setMessage({ type: 'error', text: 'Acceso Denegado: En el perfil actual no está permitido registrar colaboradores en la programación semanal.' });
      return;
    }
    if (!newDocId.trim() || !newFullName.trim()) {
      setMessage({ type: 'error', text: 'Cédula y Nombre Completo son obligatorios.' });
      return;
    }

    const targetPdvId = selectedPdvId !== 'ALL' ? selectedPdvId : (allowedPdvs[0]?.id || 'pdv-1');

    try {
      const data = await api.addPdvMember({
        pdvId: targetPdvId,
        documentId: newDocId.trim(),
        fullName: newFullName.trim().toUpperCase(),
        position: newPosition,
        contractType: newContractType
      });

      if (data) {
        setIsAddingPerson(false);
        setNewDocId('');
        setNewFullName('');
        setNewContractType('FIJO');

        const newEmpObj = {
          id: data.id,
          fullName: data.fullName || data.full_name || newFullName.trim().toUpperCase(),
          documentId: data.documentId || data.document_id || newDocId.trim(),
          code: data.code || `COD-${newDocId.slice(-4)}`,
          position: data.position || newPosition,
          role: 'EMPLOYEE',
          pdvId: targetPdvId,
          contractType: data.contractType || data.contract_type || newContractType
        };

        // Initialize 7 shifts in schedule matrix immediately
        const weekDates = getDatesForWeek(selectedWeekStart);
        const blankShifts = weekDates.map((d, dayIdx) => ({
          dayOfWeek: d.dayOfWeek,
          date: d.date,
          dayIndex: dayIdx,
          shiftType: 'NO_PROGRAMADO',
          startTime: '',
          endTime: '',
          grossHours: 0,
          lunchHours: 0,
          netHours: 0,
          isSunday: d.isSunday,
          isDayOff: false
        }));

        setScheduleMatrix(prev => ({
          ...prev,
          [data.id]: {
            userId: data.id,
            employee: newEmpObj,
            shifts: blankShifts,
            totalNetHours: 0,
            totalLunchHours: 0,
            notes: '',
            isSubmitted: false
          }
        }));

        setAllEmployees(prev => {
          if (!prev.some(e => e.id === data.id)) {
            return [...prev, newEmpObj];
          }
          return prev;
        });

        setAllHistoricalEmployees(prev => {
          if (!prev.some(e => e.id === data.id)) {
            return [...prev, newEmpObj];
          }
          return prev;
        });

        setMessage({ 
          type: 'success', 
          text: `✓ Colaborador ${newEmpObj.fullName} asociado y agregado a la grilla exitosamente.` 
        });

        if (onReloadUsers) onReloadUsers();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error al registrar colaborador en el servidor.' });
    }
  }

  // Save and lock schedule for active scope (Disabled for Supervisor & HR Admin)
  async function handleSaveBatchPdv() {
    if (isSupervisor || isHrAdmin) {
      setMessage({ type: 'error', text: 'Acceso Denegado: Talento Humano y Supervisores no tienen permisos de guardar ni modificar programación de tiendas.' });
      return;
    }

    const blockedEmps = Object.values(scheduleMatrix).filter(u => u.sundayStats?.requiresApproval);
    if (blockedEmps.length > 0 && !isAdmin && !isAuditorVrx) {
      setMessage({
        type: 'error',
        text: `⚠️ Bloqueo Dominical: ${blockedEmps.map(b => b.employee?.fullName).join(', ')} supera el límite legal de 2 domingos trabajados en el mes. Requiere autorización previa del Líder de Zona.`
      });
      setShowConfirmModal(false);
      return;
    }

    setSaving(true);
    setMessage(null);
    setShowConfirmModal(false);

    try {
      const weekDates = getDatesForWeek(selectedWeekStart);
      const weekEnd = weekDates[6].date;
      const targetPdvId = selectedPdvId !== 'ALL' ? selectedPdvId : (allowedPdvs[0]?.id || 'pdv-1');

      // 1. Mark in memory as submitted & locked
      const updatedMatrix = { ...scheduleMatrix };
      Object.keys(updatedMatrix).forEach(uid => {
        updatedMatrix[uid] = {
          ...updatedMatrix[uid],
          isSubmitted: true,
          submittedAt: new Date().toISOString()
        };
      });
      setScheduleMatrix(updatedMatrix);

      // 2. Persist to localStorage immediately
      try {
        localStorage.setItem('control_turnos_schedules_' + selectedWeekStart, JSON.stringify(Object.values(updatedMatrix)));
      } catch (e) {
        console.warn('localStorage save warning:', e);
      }

      // 3. Attempt server / Supabase save with graceful fallback
      let cloudSynced = false;
      try {
        if (api.isConfigured) {
          await api.saveBatchPdvSchedules({
            pdvId: targetPdvId,
            weekStart: selectedWeekStart,
            weekEnd,
            schedules: Object.values(updatedMatrix).map(u => ({
              userId: u.userId,
              documentId: u.employee?.documentId,
              fullName: u.employee?.fullName,
              position: u.employee?.position,
              shifts: u.shifts,
              notes: isAuditorVrx ? 'Ajuste / corrección oficial auditada por Control & Compliance (VRX)' : (u.notes || 'Programación semanal registrada por PDV / Tienda')
            }))
          });
          cloudSynced = true;
        } else {
          await fetch('/api/schedules/batch-pdv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pdvId: targetPdvId,
              weekStart: selectedWeekStart,
              weekEnd,
              forceAdmin: isAdmin || isAuditorVrx,
              schedules: Object.values(updatedMatrix).map(u => ({
                userId: u.userId,
                documentId: u.employee?.documentId,
                fullName: u.employee?.fullName,
                position: u.employee?.position,
                shifts: u.shifts,
                notes: isAuditorVrx ? 'Ajuste / corrección oficial auditada por Control & Compliance (VRX)' : (u.notes || 'Programación semanal registrada por PDV / Tienda')
              }))
            })
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Error saving batch schedule to cloud:', err);
        setMessage({ type: 'error', text: `Aviso de Nube: ${err.message}` });
      }

      setMessage({
        type: 'success',
        text: `✓ ¡Programación semanal GUARDADA y BLOQUEADA exitosamente para ${Object.keys(updatedMatrix).length} colaborador(es)! ${cloudSynced ? '☁️ Sincronizado en tiempo real en la Nube.' : ''}`
      });
    } catch (err) {
      console.error('Error saving batch schedule:', err);
      setMessage({ type: 'error', text: 'Error inesperado al procesar la programación semanal.' });
    } finally {
      setSaving(false);
    }
  }

  const weekDates = getDatesForWeek(selectedWeekStart);

  // -----------------------------------------------------------------
  // ZONE / NATIONAL CONSOLIDATED MULTITIENDA SUMMARY & METRICS
  // -----------------------------------------------------------------
  const zonePdvSummaries = useMemo(() => {
    return allowedPdvs.map(pdv => {
      const pdvEmps = allEmployees.filter(e => e.pdvId === pdv.id);
      const totalHours = pdvEmps.reduce((acc, emp) => {
        const row = scheduleMatrix[emp.id];
        return acc + (row?.monSatStats?.totalHours || 0);
      }, 0);
      const overtimeCount = pdvEmps.filter(emp => {
        const row = scheduleMatrix[emp.id];
        return row?.monSatStats?.exceeds42;
      }).length;
      const isLocked = pdvEmps.length > 0 && pdvEmps.every(emp => scheduleMatrix[emp.id]?.isSubmitted);
      return {
        pdv,
        empCount: pdvEmps.length,
        totalHours: +totalHours.toFixed(1),
        overtimeCount,
        isLocked
      };
    });
  }, [allowedPdvs, allEmployees, scheduleMatrix]);

  const zoneTotalHours = (isSupervisor || (currentUser?.role === 'PDV'))
    ? Object.values(scheduleMatrix)
        .filter(u => allowedPdvs.some(ap => ap.id === u.employee?.pdvId || ap.id === u.pdv?.id))
        .reduce((acc, u) => acc + (u.monSatStats?.totalHours || 0), 0)
    : Object.values(scheduleMatrix).reduce((acc, u) => acc + (u.monSatStats?.totalHours || 0), 0);

  const zoneOvertimeCount = Object.values(scheduleMatrix).filter(u => u.monSatStats?.exceeds42).length;
  const zoneSundayCount = Object.values(scheduleMatrix).filter(u => (u.monSatStats?.sundayHours || 0) > 0).length;
  const zoneSundayApprovalReqCount = Object.values(scheduleMatrix).filter(u => u.sundayStats?.requiresApproval).length;

  // -----------------------------------------------------------------
  // FILTERING & SORTING PIPELINE
  // -----------------------------------------------------------------
  const filteredAndSortedEmployees = useMemo(() => {
    let result = [...allEmployees];

    // 1. Filter by specific PDV
    if (selectedPdvId && selectedPdvId !== 'ALL') {
      result = result.filter(e => e.pdvId === selectedPdvId);
    } else if (isSupervisor) {
      result = result.filter(e => allowedPdvs.some(ap => ap.id === e.pdvId || ap.code === e.pdvId));
    } else if (currentUser?.role === 'PDV') {
      result = result.filter(e => e.pdvId === currentUser.pdvId || e.pdvId === activeSinglePdv?.id);
    }

    // "si esta en blanco no visualizar": For Supervisor or locked schedule, hide empty rows.
    // In draft/editing mode, keep the PDV's registered staff visible so they can be scheduled!
    const isLocked = result.length > 0 && result.every(e => scheduleMatrix[e.id]?.isSubmitted);
    if (isSupervisor || (currentUser?.role === 'PDV' && isLocked)) {
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        if (!row || !row.shifts || row.shifts.length === 0) return false;
        return row.shifts.some(s => 
          s.shiftType && 
          s.shiftType !== 'NO_PROGRAMADO' && 
          (s.startTime || s.isDayOff || s.shiftType === 'DESCANSO' || s.shiftType === 'VACACIONES' || s.shiftType === 'INCAPACIDAD' || s.shiftType === 'LICENCIA')
        );
      });
    }

    // 2. Filter by Weekly Hours
    if (filterHours === 'LE_42') {
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        return (row?.monSatStats?.monSatHours || 0) <= 42 && !row?.monSatStats?.exceeds42;
      });
    } else if (filterHours === 'GT_42') {
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        return row?.monSatStats?.exceeds42 || (row?.monSatStats?.excessHours || 0) > 0;
      });
    }

    // 3. Filter by Sundays
    if (filterSundays === 'WITH_SUNDAY') {
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        return (row?.monSatStats?.sundayHours || 0) > 0;
      });
    } else if (filterSundays === 'NO_SUNDAY') {
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        return (row?.monSatStats?.sundayHours || 0) === 0;
      });
    } else if (filterSundays === 'APPROVAL_REQUIRED') {
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        return row?.sundayStats?.requiresApproval;
      });
    }

    // 4. Search Filter (Name, Document, PDV name)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(e => {
        const row = scheduleMatrix[e.id];
        const matchName = e.fullName?.toLowerCase().includes(q);
        const matchDoc = String(e.documentId || '').includes(q);
        const matchPdv = row?.pdv?.name?.toLowerCase().includes(q) || row?.pdv?.code?.toLowerCase().includes(q);
        return matchName || matchDoc || matchPdv;
      });
    }

    // 5. Sorting (Nombre de Colaborador, PDV, Cantidad Total de Horas Semanales)
    result.sort((a, b) => {
      let comparison = 0;
      const rowA = scheduleMatrix[a.id];
      const rowB = scheduleMatrix[b.id];

      if (sortBy === 'name') {
        comparison = (a.fullName || '').localeCompare(b.fullName || '');
      } else if (sortBy === 'pdv') {
        const pdvA = rowA?.pdv?.name || '';
        const pdvB = rowB?.pdv?.name || '';
        comparison = pdvA.localeCompare(pdvB);
      } else if (sortBy === 'hours') {
        const hoursA = rowA?.monSatStats?.totalHours || 0;
        const hoursB = rowB?.monSatStats?.totalHours || 0;
        comparison = hoursA - hoursB;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [allEmployees, scheduleMatrix, selectedPdvId, filterHours, filterSundays, searchTerm, sortBy, sortDirection]);

  function handleToggleSort(field) {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  }

  const isPdvFullyLocked = filteredAndSortedEmployees.length > 0 && 
    filteredAndSortedEmployees.every(emp => scheduleMatrix[emp.id]?.isSubmitted);

  return (
    <div className="max-w-[98%] xl:max-w-[1650px] 2xl:max-w-[1850px] mx-auto px-2 sm:px-4 py-6 space-y-6">
      
      {/* ---------------------------------------------------- */}
      {/* 1. TOP HEADER & ZONE / NATIONAL CONTEXT */}
      {/* ---------------------------------------------------- */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl shadow-md flex items-center justify-center ${
              isHrAdmin ? 'bg-emerald-600' : isSupervisor ? 'bg-amber-600' : 'bg-blue-600'
            }`}>
              {isHrAdmin ? <User className="w-6 h-6 text-white" /> : isSupervisor ? <Building2 className="w-6 h-6 text-white" /> : <Store className="w-6 h-6 text-white" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-400/30">
                  {isAuditorVrx
                    ? 'AUDITORÍA & CONTROL (VRX) • SUPERVISIÓN Y AJUSTES NACIONALES'
                    : isHrAdmin
                    ? 'TALENTO HUMANO (HR) • CONTROL Y AUDITORÍA NACIONAL DE HORARIOS'
                    : isSupervisor 
                    ? `SUPERVISIÓN REGIONAL: ${activeSupervisor?.zoneName || activeSupervisor?.name || 'ZONA ASIGNADA'}` 
                    : isEmployee 
                    ? 'Mi PDV Asignado' 
                    : 'Gestión de Horarios Semanales'}
                </span>
                {isAuditorVrx ? (
                  <span className="text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-400/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> PERFIL AUDITOR VRX (CORRECCIONES & IMPORT/EXPORT)
                  </span>
                ) : isHrAdmin ? (
                  <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> PERFIL TALENTO HUMANO (CONSULTA Y DESCARGA)
                  </span>
                ) : isSupervisor ? (
                  <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> PERFIL LÍDER DE ZONA
                  </span>
                ) : isPdvFullyLocked ? (
                  <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> BLOQUEADO OFICIAL
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> BORRADOR EN EDICIÓN
                  </span>
                )}
              </div>

              <h2 className="text-xl font-black text-white mt-1 flex items-center gap-2.5">
                <span>
                  {selectedPdvId === 'ALL' 
                    ? (isHrAdmin || isAuditorVrx || isAdmin)
                      ? 'Consolidado Nacional: Todos los Puntos de Venta (101 PDVs)'
                      : `Resumen Consolidado: ${activeSupervisor?.zoneName || 'Todos los PDVs'}` 
                    : activeSinglePdv?.name}
                </span>
                {selectedPdvId !== 'ALL' && activeSinglePdv?.city && (
                  <span className="text-xs font-semibold text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700">
                    {activeSinglePdv.city}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isHrAdmin ? (
                  <span>Alcance: <strong>101 Tiendas Nacionales</strong> • <strong>15 Zonas Regionales</strong></span>
                ) : (
                  <span>Líder de Zona Responsable: <strong>{activeSupervisor?.name}</strong> • PDVs en Zona: <strong>{allowedPdvs.length} Tiendas</strong></span>
                )}
              </p>
            </div>
          </div>

          {/* Scope Selectors */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Store selector */}
            {!isEmployee && (
              <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700 w-full sm:w-auto">
                <Store className="w-4 h-4 text-blue-400 ml-1 shrink-0" />
                <label className="text-xs text-slate-300 font-semibold shrink-0">Punto de Venta:</label>
                <select
                  value={selectedPdvId}
                  onChange={(e) => setSelectedPdvId(e.target.value)}
                  className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 w-full sm:w-60"
                >
                  {(isSupervisor || isAdmin || isHrAdmin || isAuditorVrx) && (
                    <option value="ALL">🏢 Ver Todos los PDVs ({allowedPdvs.length} tiendas)</option>
                  )}
                  {allowedPdvs.map(p => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Week Selector */}
            <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700 w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-blue-400 ml-1 shrink-0" />
              <label className="text-xs text-slate-300 font-semibold shrink-0">Semana:</label>
              <select
                value={selectedWeekStart}
                onChange={(e) => setSelectedWeekStart(e.target.value)}
                className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 max-w-[280px]"
              >
                {ALL_WEEKS_2026.map(w => (
                  <option key={w.weekStart} value={w.weekStart}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* PDV / Zone KPI Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">PDVs Disponibles</span>
            <span className="text-base font-black text-white flex items-center gap-1.5 mt-0.5">
              <Store className="w-4 h-4 text-blue-400" />
              {allowedPdvs.length} tiendas
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowPlantillaModal(true)}
            className="bg-slate-800/60 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-700/60 hover:border-indigo-500/50 text-left transition group cursor-pointer"
            title="Hacer clic para comprobar y auditar la plantilla de personal de este PDV"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Personal Registrado</span>
              <span className="text-[10px] text-indigo-400 font-bold group-hover:underline">Auditar ↗</span>
            </div>
            <span className="text-base font-black text-white flex items-center gap-1.5 mt-0.5">
              <Users className="w-4 h-4 text-indigo-400" />
              {activePdvPersonnel.length} colaboradores
            </span>
          </button>

          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Horas Semanales</span>
            <span className="text-base font-black text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <Clock className="w-4 h-4 text-emerald-400" />
              {zoneTotalHours.toFixed(1)} hrs
            </span>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Horas Extras (&gt;42h)</span>
            <span className={`text-base font-black flex items-center gap-1.5 mt-0.5 ${zoneOvertimeCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              {zoneOvertimeCount} colaboradores
            </span>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Domingos Trabajados</span>
            <span className={`text-base font-black flex items-center gap-1.5 mt-0.5 ${zoneSundayApprovalReqCount > 0 ? 'text-amber-400' : 'text-purple-300'}`}>
              <Calendar className="w-4 h-4 text-purple-400" />
              {zoneSundayCount} {zoneSundayApprovalReqCount > 0 && <span className="text-rose-400 text-xs font-bold">({zoneSundayApprovalReqCount} req. aprob.)</span>}
            </span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. RESUMEN MULTITIENDA DE ZONA / NACIONAL */}
      {/* ---------------------------------------------------- */}
      {(isSupervisor || isHrAdmin || selectedPdvId === 'ALL') && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                isHrAdmin ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                <Building2 className="w-3.5 h-3.5" />
                {isHrAdmin ? 'Directorio de Puntos de Venta Nacionales' : 'Resumen Multitienda de Zona'}
              </span>
              <span className="text-xs text-slate-500 font-semibold">
                Haz clic en cualquier PDV para filtrar inmediatamente su personal:
              </span>
            </div>
            {selectedPdvId !== 'ALL' && (
              <button
                onClick={() => setSelectedPdvId('ALL')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
              >
                <span>Mostrar Todos ({allowedPdvs.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1 max-h-64 overflow-y-auto pr-1">
            {zonePdvSummaries.map(({ pdv, empCount, totalHours, overtimeCount, isLocked }) => {
              const isSelected = selectedPdvId === pdv.id;
              return (
                <button
                  key={pdv.id}
                  type="button"
                  onClick={() => setSelectedPdvId(isSelected ? 'ALL' : pdv.id)}
                  className={`p-3 rounded-xl border text-left transition relative ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-extrabold text-xs text-slate-900 truncate" title={pdv.name}>
                      {pdv.name}
                    </div>
                    {isLocked ? (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> Bloqueado
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded shrink-0">
                        Borrador
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                    <span>{pdv.city} • <strong>{empCount} colab.</strong></span>
                    <span className="font-mono font-bold text-slate-800">{totalHours}h sem</span>
                  </div>

                  {overtimeCount > 0 && (
                    <div className="mt-1 text-[10px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{overtimeCount} con horas extras (&gt;42h)</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert Messages */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-in fade-in duration-150 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs' : 'bg-rose-50 text-rose-800 border border-rose-200 shadow-xs'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs font-bold text-slate-500 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. BARRA DE FILTROS & ORDENAMIENTO & DESCARGA EXCEL */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          
          {/* Filters controls */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar colaborador, cédula o PDV..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Filter by PDV */}
            {allowedPdvs.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <Store className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
                <select
                  value={selectedPdvId}
                  onChange={(e) => setSelectedPdvId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer max-w-[180px]"
                >
                  <option value="ALL">Todos los PDVs ({allowedPdvs.length})</option>
                  {allowedPdvs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter by Hours */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <Clock className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              <select
                value={filterHours}
                onChange={(e) => setFilterHours(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer"
              >
                <option value="ALL">Todas las Horas</option>
                <option value="LE_42">Jornada Legal (≤ 42h)</option>
                <option value="GT_42">Horas Extras (&gt; 42h)</option>
              </select>
            </div>

            {/* Filter by Sundays */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              <select
                value={filterSundays}
                onChange={(e) => setFilterSundays(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden pr-2 cursor-pointer"
              >
                <option value="ALL">Todos los Domingos</option>
                <option value="WITH_SUNDAY">Con Domingo Laborado</option>
                <option value="NO_SUNDAY">Sin Domingo Laborado</option>
                <option value="APPROVAL_REQUIRED">Requieren Aprobación (3er Dom)</option>
              </select>
            </div>

            {(filterHours !== 'ALL' || filterSundays !== 'ALL' || searchTerm || (selectedPdvId !== 'ALL' && (isSupervisor || isHrAdmin))) && (
              <button
                onClick={() => {
                  setFilterHours('ALL');
                  setFilterSundays('ALL');
                  setSearchTerm('');
                  if (isSupervisor || isHrAdmin) setSelectedPdvId('ALL');
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 px-2 py-1"
              >
                Limpiar Filtros
              </button>
            )}
          </div>

          {/* Sorting Controls */}
          <div className="flex items-center gap-2 text-xs w-full lg:w-auto justify-end">
            <span className="text-slate-500 font-bold shrink-0 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" />
              Ordenar por:
            </span>
            
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleToggleSort('name')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 ${
                  sortBy === 'name' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Colaborador</span>
                {sortBy === 'name' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>

              <button
                type="button"
                onClick={() => handleToggleSort('pdv')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 ${
                  sortBy === 'pdv' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>PDV</span>
                {sortBy === 'pdv' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>

              <button
                type="button"
                onClick={() => handleToggleSort('hours')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1 ${
                  sortBy === 'hours' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Total Horas</span>
                {sortBy === 'hours' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Botón Comprobar y Auditar Plantilla del PDV */}
            <button
              type="button"
              onClick={() => setShowPlantillaModal(true)}
              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3.5 py-2 rounded-xl transition border border-indigo-200 cursor-pointer shadow-xs"
              title="Auditar y comprobar la lista del personal de este PDV"
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>👥 Comprobar Plantilla del PDV ({activePdvPersonnel.length})</span>
            </button>

            {/* STRICT ROLE RESTRICTION: Hide "+ Registrar Colaborador" for Supervisor & HR Admin */}
            {!isSupervisor && !isHrAdmin && (
              <button
                onClick={() => setIsAddingPerson(!isAddingPerson)}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs px-3.5 py-2 rounded-xl transition border border-blue-200"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Registrar Colaborador en PDV</span>
              </button>
            )}

            {isHrAdmin && (
              <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span>Modo Talento Humano (HR): Visualización, auditoría y descarga de horarios (Sin permisos de modificación).</span>
              </div>
            )}

            {isSupervisor && (
              <div className="text-xs font-bold text-amber-800 bg-amber-50 px-3.5 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Modo Supervisión Regional: Solo lectura y aprobación de la Zona.</span>
              </div>
            )}

            {!isPdvFullyLocked && !isSupervisor && !isHrAdmin && (
              <>
                <button
                  onClick={handleApplyStandardToAll}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-xl transition border border-slate-200"
                  title="Aplica turno estándar 10:00-20:30 a todos los colaboradores"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Aplicar Estándar (10:00 - 20:30)</span>
                </button>

                <button
                  onClick={handleRotateDaysOff}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-xl transition border border-slate-200"
                  title="Rota días de descanso de lunes a sábado equitativamente"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
                  <span>Rotar Descansos</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* BOTÓN SINCRONIZAR NUBE (Exclusivo Perfil Maestro Auditor VRX & Admin) */}
            {(isAuditorVrx || isAdmin) && (
              <button
                type="button"
                onClick={() => {
                  loadScheduleData();
                  setMessage({ type: 'success', text: '✓ Sincronizado con la base de datos central en la Nube.' });
                }}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-xs cursor-pointer"
                title="Refrescar y traer las últimas modificaciones guardadas en la nube"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
                <span>Sincronizar Nube</span>
              </button>
            )}

            {/* BOTÓN CARGAR PROGRAMACIÓN EXCEL (Exclusivo Auditor VRX & Administrador) */}
            {(isAuditorVrx || isAdmin) && (
              <label className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-md shadow-indigo-600/20" title="Cargar archivo Excel con la programación semanal de horarios">
                <FileSpreadsheet className="w-4 h-4 text-white" />
                <span>{uploadingSchedule ? 'Importando Programación...' : 'Cargar Programación Excel'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={uploadingSchedule}
                  onChange={handleUploadScheduleExcel}
                  className="hidden"
                />
              </label>
            )}

            {/* BOTÓN CARGAR MARCACIONES EXCEL (Talento Humano, Administrador & Auditor VRX) */}
            {(isHrAdmin || isAdmin || isAuditorVrx) && (
              <label className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-md shadow-slate-900/20" title="Cargar archivo Excel con las marcaciones semanales (reloj biométrico)">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>{uploadingPunches ? 'Cargando Marcaciones...' : 'Cargar Excel Marcaciones'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={uploadingPunches}
                  onChange={handleUploadPunchesExcel}
                  className="hidden"
                />
              </label>
            )}

            {/* BOTÓN DESCARGAR EXCEL (Exclusivo Talento Humano, Administrador & Auditor VRX) */}
            {(isHrAdmin || isAdmin || isAuditorVrx) && (
              <button
                type="button"
                onClick={handleExportScheduleExcel}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-md shadow-emerald-600/20"
                title="Descargar toda la información de horarios de los colaboradores a Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Descargar Excel Horarios</span>
              </button>
            )}

            {/* Guardar y Bloquear: Exclusivo PDV / Admin / Auditor VRX (Oculto para HR y Supervisor) */}
            {!isSupervisor && !isHrAdmin && (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={saving || filteredAndSortedEmployees.length === 0}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs px-5 py-2 rounded-xl transition shadow-md shadow-blue-500/20"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Guardando...' : isAuditorVrx ? 'Guardar y Aplicar Correcciones Auditadas' : isPdvFullyLocked && !isAdmin ? 'Programación Bloqueada' : 'Guardar y Bloquear Programación PDV'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. MODAL: REGISTRAR COLABORADOR (Solo Admin / PDV) */}
      {/* ---------------------------------------------------- */}
      {isAddingPerson && !isSupervisor && !isHrAdmin && (
        <form onSubmit={handleRegisterPdvMember} className="bg-slate-50 p-5 rounded-2xl border border-blue-200 shadow-sm space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <span>Registrar / Asociar Nuevo Colaborador al PDV</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingPerson(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕ Cerrar
            </button>
          </div>

          {/* Selector de colaboradores con registro previo / semanas anteriores */}
          {allHistoricalEmployees.length > 0 && (
            <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200 text-xs">
              <label className="block font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>📋 Seleccionar Colaborador con Registro en Semanas Anteriores / Histórico:</span>
              </label>
              <select
                onChange={(e) => {
                  const selectedVal = e.target.value;
                  if (!selectedVal) return;
                  const found = allHistoricalEmployees.find(u => String(u.documentId).trim() === selectedVal.trim() || u.id === selectedVal);
                  if (found) {
                    setNewDocId(found.documentId || found.code || '');
                    setNewFullName(found.fullName || '');
                    setNewPosition(found.position || 'ASESOR(A) DE IMAGEN');
                    setNewContractType(found.contractType || 'FIJO');
                  }
                }}
                className="w-full bg-white border border-blue-300 rounded-lg p-2 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- Seleccionar Colaborador Previo para Reincorporar con 1 Clic --</option>
                {allHistoricalEmployees.map(u => (
                  <option key={u.id} value={u.documentId || u.id}>
                    {u.fullName} - CC: {u.documentId} ({u.position || 'Asesor'}) [{u.contractType || 'Fijo'}]
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-blue-700 mt-1 block font-medium">
                Al seleccionar un colaborador previo, sus datos se autocompletarán inmediatamente.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Cédula / Documento *</label>
              <input
                type="text"
                required
                placeholder="Ej: 1091678220"
                value={newDocId}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewDocId(val);
                  const match = allHistoricalEmployees.find(u => String(u.documentId).trim() === val.trim() || String(u.code).trim() === val.trim());
                  if (match) {
                    setNewFullName(match.fullName || '');
                    setNewPosition(match.position || 'ASESOR(A) DE IMAGEN');
                    setNewContractType(match.contractType || 'FIJO');
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Solo 1 PDV por semana</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Nombre Completo *</label>
              <input
                type="text"
                required
                placeholder="Ej: DAYANA ANDREA MORENO"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tipo de Vinculación *</label>
              <select
                value={newContractType}
                onChange={(e) => setNewContractType(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
              >
                <option value="FIJO">Fijo (Planta)</option>
                <option value="TEMPORAL">Temporal (Apoyo)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Cargo / Especialidad</label>
              <select
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
              >
                <option value="ASESOR(A) DE IMAGEN">ASESOR(A) DE IMAGEN</option>
                <option value="ADMINISTRADOR(A) PUNTO DE VENTA">ADMINISTRADOR(A) PUNTO DE VENTA</option>
                <option value="AUXILIAR DE BODEGA">AUXILIAR DE BODEGA</option>
                <option value="CAJERO(A) PRINCIPAL">CAJERO(A) PRINCIPAL</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingPerson(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-xs"
            >
              Asociar Colaborador y Agregar a la Grilla
            </button>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. MAIN HORIZONTAL SCHEDULE MATRIX (Lunes a Domingo) */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase font-extrabold tracking-wider">
                <th className="p-3.5 w-72 border-r border-slate-800 sticky left-0 bg-slate-900 z-10">
                  <div className="flex items-center justify-between">
                    <span>Colaborador ({filteredAndSortedEmployees.length})</span>
                    <span className="text-[10px] text-slate-400 font-normal">Orden: {sortBy} ({sortDirection})</span>
                  </div>
                </th>
                {weekDates.map((wd) => (
                  <th
                    key={wd.date}
                    className={`p-3 text-center border-r border-slate-800 ${
                      wd.isSunday ? 'bg-purple-950 text-purple-200' : ''
                    }`}
                  >
                    <div>{wd.dayOfWeek}</div>
                    <div className="text-[10px] font-normal text-slate-300">{wd.formattedDate}</div>
                  </th>
                ))}
                <th className="p-3 text-center w-24 border-r border-slate-800 bg-slate-800">
                  <div>L-S (42h)</div>
                </th>
                <th className="p-3 text-center w-20 border-r border-slate-800 bg-slate-800">
                  <div>Dom/Fest</div>
                </th>
                <th className="p-3 text-center w-24 border-r border-slate-800 bg-blue-950 text-blue-200">
                  <div>Total Sem</div>
                </th>
                <th className="p-3 text-center w-28 bg-slate-800">
                  <div>Domingos Mes</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredAndSortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-slate-400">
                    <Store className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <div className="font-bold text-slate-600">
                      No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Utilice las opciones de importación desde Excel o el botón de nuevo colaborador para iniciar la programación.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAndSortedEmployees.map((emp, empIdx) => {
                  const userRow = scheduleMatrix[emp.id] || { shifts: [], monSatStats: {}, sundayStats: {}, pdv: {} };
                  const monSatHours = userRow.monSatStats?.monSatHours || 0;
                  const excessHours = userRow.monSatStats?.excessHours || 0;
                  const exceeds42 = userRow.monSatStats?.exceeds42;
                  const sundayHours = userRow.monSatStats?.sundayHours || 0;
                  const totalWeekHours = userRow.monSatStats?.totalHours || 0;
                  const workedSundaysCount = userRow.sundayStats?.workedSundaysCount || 0;
                  const requiresApproval = userRow.sundayStats?.requiresApproval;
                  const isTemporal = (emp.contractType || 'FIJO').toUpperCase() === 'TEMPORAL';
                  const empPdv = userRow.pdv || pdvs.find(p => p.id === emp.pdvId) || {};

                  return (
                    <tr key={emp.id} className={`hover:bg-slate-50/80 transition ${empIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      {/* Employee Identity Column (Sticky) with Fijo vs Temporal Badge & PDV Name */}
                      <td className="p-3 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 leading-tight">{emp.fullName}</span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${
                            isTemporal 
                              ? 'bg-amber-100 text-amber-800 border-amber-300' 
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}>
                            {isTemporal ? 'Temporal' : 'Fijo'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono font-bold">CC: {emp.documentId}</span>
                          <span className="truncate text-slate-600">{emp.position}</span>
                        </div>
                        {empPdv.name && (
                          <div className="text-[10px] font-bold text-blue-700 mt-1 flex items-center gap-1">
                            <Store className="w-3 h-3 text-blue-500" />
                            <span className="truncate">{empPdv.name}</span>
                          </div>
                        )}
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            {userRow.isSubmitted ? (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> Oficial
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                                Borrador
                              </span>
                            )}
                          </div>

                          {/* STRICT ROLE RESTRICTION: Hide "Eliminar Línea" for isSupervisor & isHrAdmin */}
                          {!isSupervisor && !isHrAdmin && (!userRow.isSubmitted || isAdmin || isAuditorVrx) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEmployeeLine(emp)}
                              title="Eliminar esta línea de la programación antes de guardar y bloquear"
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-1.5 py-0.5 rounded transition flex items-center gap-1 text-[10px] font-bold border border-transparent hover:border-rose-200"
                            >
                              <Trash2 className="w-3 h-3 text-rose-500" />
                              <span className="text-rose-600">Eliminar Línea</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 7 Day Shift Columns (Lunes a Domingo) */}
                      {weekDates.map((wd, dayIdx) => {
                        const shift = userRow.shifts?.[dayIdx] || {};
                        const shiftType = shift.shiftType || (shift.isDayOff ? 'DESCANSO' : 'ORDINARIO');
                        const isCellEditing = editingCell?.userId === emp.id && editingCell?.dayIndex === dayIdx;
                        const isShiftLocked = isSupervisor || isHrAdmin || (userRow.isSubmitted && !shift.correctionRequested && !isAdmin && !isAuditorVrx);

                        let badgeColor = 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100';
                        if (shiftType === 'DESCANSO') badgeColor = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
                        else if (shiftType === 'INCAPACIDAD') badgeColor = 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100';
                        else if (shiftType === 'VACACIONES') badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100';
                        else if (shiftType === 'LICENCIA') badgeColor = 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100';
                        else if (shiftType === 'NO_PROGRAMADO') badgeColor = 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100';

                        return (
                          <td
                            key={wd.date}
                            className={`p-2 border-r border-slate-200 text-center align-middle ${
                              wd.isSunday ? 'bg-purple-50/30' : ''
                            }`}
                          >
                            {/* In-Cell Display Pill */}
                            <button
                              type="button"
                              onClick={() => {
                                if (!isShiftLocked) setEditingCell({ userId: emp.id, dayIndex: dayIdx });
                              }}
                              disabled={isShiftLocked}
                              className={`w-full p-2 rounded-xl border text-center transition flex flex-col items-center justify-center gap-0.5 ${badgeColor} ${
                                isCellEditing ? 'ring-2 ring-blue-600 shadow-md bg-blue-100/90 font-bold' : ''
                              } ${
                                isShiftLocked ? 'cursor-default opacity-90' : 'cursor-pointer hover:shadow-xs'
                              }`}
                            >
                              {shiftType === 'ORDINARIO' ? (
                                <>
                                  <div className="font-extrabold text-[11px] leading-tight text-slate-900">
                                    {shift.startTime || '--:--'} - {shift.endTime || '--:--'}
                                  </div>
                                  <div className="text-[9px] font-bold text-slate-500 flex items-center gap-1">
                                    <span>{shift.netHours || 0} hrs</span>
                                    {shift.lunchApplied && (
                                      <span title="Deducción de 1:30 de almuerzo" className="text-amber-600 font-extrabold">☕</span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-extrabold text-[10px] uppercase leading-tight">
                                    {shiftType}
                                  </div>
                                  <div className="text-[9px] font-semibold text-slate-500">
                                    {shiftType === 'NO_PROGRAMADO' ? '0.0 hrs' : '7.0 hrs'}
                                  </div>
                                </>
                              )}

                              {shift.correctionRequested && (
                                <span className="bg-rose-600 text-white text-[8px] px-1 py-0.2 rounded font-extrabold animate-pulse mt-0.5">
                                  ⚠️ Corrección
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}

                      {/* Mon-Sat Hours Total (with 42h limit warning) */}
                      <td className="p-3 text-center border-r border-slate-200 bg-slate-50/50">
                        <div className={`font-black text-sm ${exceeds42 ? 'text-rose-700' : 'text-slate-900'}`}>
                          {monSatHours} hrs
                        </div>
                        {exceeds42 ? (
                          <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-1.5 py-0.2 rounded-full border border-rose-300 block mt-0.5">
                            +{excessHours}h excede 42h
                          </span>
                        ) : (
                          <span className="text-[9px] text-emerald-700 font-bold block mt-0.5">
                            ✓ L-S Cumple
                          </span>
                        )}
                      </td>

                      {/* Sunday / Holiday Hours */}
                      <td className="p-3 text-center border-r border-slate-200 bg-slate-50/50">
                        <div className="font-bold text-purple-900 text-xs">
                          {sundayHours > 0 ? `${sundayHours}h` : '0h'}
                        </div>
                      </td>

                      {/* Total Weekly Hours */}
                      <td className="p-3 text-center border-r border-slate-200 bg-blue-50/40">
                        <div className="font-black text-blue-900 text-sm">
                          {totalWeekHours} hrs
                        </div>
                      </td>

                      {/* Monthly Sundays Counter (max 2/month limit) */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            requiresApproval
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : workedSundaysCount === 2
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {workedSundaysCount} / 2 domingos
                          </span>
                        </div>
                        {requiresApproval && (
                          <span className="text-[9px] text-rose-700 font-bold block mt-0.5">
                            ⚠️ Requiere Aprobación
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 5.1 SHIFT CELL EDITOR MODAL (Sin límites de altura ni cortes) */}
      {/* ---------------------------------------------------- */}
      {editingCell && !isSupervisor && !isHrAdmin && (() => {
        const empRow = scheduleMatrix[editingCell.userId];
        const emp = empRow?.employee || allEmployees.find(e => e.id === editingCell.userId) || {};
        const shift = empRow?.shifts?.[editingCell.dayIndex] || {};
        const wd = weekDates[editingCell.dayIndex] || {};
        const shiftType = shift.shiftType || 'NO_PROGRAMADO';

        return (
          <div 
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
            onClick={() => setEditingCell(null)}
          >
            <div 
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Asignación de Turno
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {wd.dayOfWeek} ({wd.formattedDate})
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 mt-1">
                    {emp.fullName}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {emp.position || 'ASESOR(A) DE IMAGEN'} • <span className="font-mono text-slate-600">CC: {emp.documentId}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Shift Type Selector */}
              <div>
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">
                  Tipo de Turno / Novedad
                </label>
                <select
                  value={shiftType}
                  onChange={(e) => handleAssignShift(editingCell.userId, editingCell.dayIndex, e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {SHIFT_TYPES.map(st => (
                    <option key={st.value} value={st.value}>{st.label} ({st.hours})</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {SHIFT_TYPES.find(st => st.value === shiftType)?.desc}
                </p>
              </div>

              {/* Standard Presets & Custom Times (Displayed completely with no scroll limit) */}
              {shiftType === 'ORDINARIO' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                        Horarios Frecuentes PDV (1 Clic)
                      </label>
                      <span className="text-[10px] text-blue-600 font-bold">Selecciona para aplicar de inmediato</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {STANDARD_SHIFT_PRESETS.map((p, pIdx) => {
                        const isCurrent = shift.startTime === p.start && shift.endTime === p.end;
                        return (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => {
                              handleAssignShift(editingCell.userId, editingCell.dayIndex, `${p.start}-${p.end}`);
                              setEditingCell(null);
                            }}
                            className={`text-left text-xs font-bold p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                              isCurrent 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                                : 'bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 border-slate-200'
                            }`}
                          >
                            <div>
                              <div className="font-extrabold text-xs">{p.start} - {p.end}</div>
                              <div className={`text-[10px] ${isCurrent ? 'text-blue-100' : 'text-slate-400'}`}>
                                {p.label.split('|')[0].replace(`${p.start} - ${p.end}`, '').replace('(', '').replace(')', '').trim()}
                              </div>
                            </div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                              isCurrent ? 'bg-blue-700 text-white' : 'bg-white text-blue-600 border border-blue-200'
                            }`}>
                              Aplicar
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Time inputs */}
                  <div className="pt-2 border-t border-slate-200">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1.5">
                      O definir horario manual:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Hora Entrada</label>
                        <input
                          type="time"
                          value={shift.startTime || '10:00'}
                          onChange={(e) => handleCustomTimeChange(editingCell.userId, editingCell.dayIndex, 'startTime', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Hora Salida</label>
                        <input
                          type="time"
                          value={shift.endTime || '20:30'}
                          onChange={(e) => handleCustomTimeChange(editingCell.userId, editingCell.dayIndex, 'endTime', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  {shiftType === 'ORDINARIO' ? `${shift.netHours || 0} hrs netas computadas` : '7.0 hrs computadas'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
                >
                  Listo / Guardar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ---------------------------------------------------- */}
      {/* 6. STATUTORY FOOTNOTES & CONVENTIONS */}
      {/* ---------------------------------------------------- */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
        <div className="font-bold text-slate-800 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <span>Normativa Laboral Colombiana (CST) & Convenciones del Sistema:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-600">
          <div>
            <strong>1. Jornada Ordinaria Máxima:</strong> 42.0 horas semanales de Lunes a Sábado. Toda hora adicional se computa como suplementaria.
          </div>
          <div>
            <strong>2. Descuento de Almuerzo:</strong> Se deducen 1.5 hrs si la jornada es &ge; 6.0 hrs y el ingreso es &le; 12:30 PM (ícono ☕).
          </div>
          <div>
            <strong>3. Novedades y Descansos:</strong> Descanso, Incapacidad, Vacaciones y Licencias computan automáticamente como 7.0 horas.
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 7. CONFIRMATION MODAL: GUARDAR Y BLOQUEAR */}
      {/* ---------------------------------------------------- */}
      {showConfirmModal && !isSupervisor && !isHrAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2.5 rounded-2xl text-blue-700">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  ¿Bloquear Programación Semanal del PDV?
                </h3>
                <p className="text-xs text-slate-500">
                  Punto de Venta: <strong>{activeSinglePdv?.name || 'PDV Seleccionado'}</strong> • Semana: {selectedWeekStart}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Al confirmar, la programación de los <strong>{filteredAndSortedEmployees.length} colaboradores</strong> quedará <strong>OFICIALMENTE REGISTRADA Y BLOQUEADA</strong>. Cualquier modificación posterior requerirá la aprobación formal del Líder de Zona (<strong>{activeSupervisor?.name}</strong>).
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Total Horas Programadas:</span>
                <span className="font-bold text-slate-900">{zoneTotalHours.toFixed(1)} hrs</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-700">
                <span>Colaboradores con Horas Extras (&gt;42h):</span>
                <span className="font-bold text-amber-700">{zoneOvertimeCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveBatchPdv}
                disabled={saving}
                className="px-5 py-2 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-500/30"
              >
                {saving ? 'Guardando...' : 'Sí, Bloquear Programación Oficial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 8. MODAL: COMPROBAR Y AUDITAR PLANTILLA DEL PDV */}
      {/* ---------------------------------------------------- */}
      {showPlantillaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2.5 rounded-2xl text-indigo-700">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>Plantilla Oficial de Personal</span>
                    <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      {activePdvPersonnel.length} colaboradores
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Punto de Venta: <strong>{activeSinglePdv?.name || 'PDV Seleccionado'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlantillaModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Informative Audit Note */}
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3 text-xs text-indigo-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Monitoreo de Plantilla en Tiempo Real:</strong> Aquí puedes verificar los colaboradores vinculados a este PDV. Cuando registres una persona se sumará a esta lista para gestionar y programar sus turnos en la tienda.
              </div>
            </div>

            {/* Search & Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex-1 min-w-48 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar colaborador por nombre o cédula..."
                  value={plantillaSearchTerm}
                  onChange={(e) => setPlantillaSearchTerm(e.target.value)}
                  className="bg-transparent border-none outline-none w-full font-semibold text-slate-800"
                />
              </div>

              {!isSupervisor && !isHrAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPlantillaModal(false);
                    setIsAddingPerson(true);
                  }}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Agregar Persona al PDV</span>
                </button>
              )}
            </div>

            {/* Collaborators Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-extrabold uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Colaborador</th>
                    <th className="p-3">Cédula</th>
                    <th className="p-3">Cargo & Contrato</th>
                    <th className="p-3 text-center">Estado Semana</th>
                    {(isAdmin || isAuditorVrx) && (
                      <th className="p-3 text-center">Acción</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activePdvPersonnel
                    .filter(emp => {
                      if (!plantillaSearchTerm.trim()) return true;
                      const q = plantillaSearchTerm.toLowerCase().trim();
                      return (
                        emp.fullName?.toLowerCase().includes(q) ||
                        String(emp.documentId || '').includes(q)
                      );
                    })
                    .map((emp, idx) => {
                      const empSched = scheduleMatrix[emp.id];
                      const hasShifts = empSched?.shifts?.some(s => s.shiftType && s.shiftType !== 'NO_PROGRAMADO' && (s.startTime || s.isDayOff));
                      const totalHrs = empSched?.totalNetHours || 0;

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono text-[10px] text-slate-400">#{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-900">
                            <div>{emp.fullName}</div>
                            <div className="text-[10px] font-mono text-slate-400">{emp.code || emp.id}</div>
                          </td>
                          <td className="p-3 font-mono font-semibold text-slate-700">
                            {emp.documentId || 'S/N'}
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-800 block text-[11px]">{emp.position || 'ASESOR(A) DE IMAGEN'}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400">{emp.contractType || 'FIJO'}</span>
                          </td>
                          <td className="p-3 text-center">
                            {hasShifts ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Programado ({totalHrs}h)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 font-bold text-[10px] px-2 py-0.5 rounded-full">
                                Sin turnos esta sem.
                              </span>
                            )}
                          </td>
                          {(isAdmin || isAuditorVrx) && (
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePdvMember(emp.id, emp.fullName)}
                                className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-bold transition border border-rose-200 cursor-pointer"
                                title="Desvincular o retirar a este colaborador de la tienda"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                                <span>Desvincular</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}

                  {activePdvPersonnel.length === 0 && (
                    <tr>
                      <td colSpan={(isAdmin || isAuditorVrx) ? 6 : 5} className="p-8 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <div className="font-bold text-slate-600">Sin colaboradores vinculados</div>
                        <p className="text-[11px] text-slate-400 mt-0.5">Utiliza el botón "+ Agregar Persona al PDV" para vincular personal a este punto de venta.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-semibold">
                Total: <strong>{activePdvPersonnel.length} colaboradores activos</strong> en {activeSinglePdv?.code || 'PDV'}
              </span>
              <button
                type="button"
                onClick={() => setShowPlantillaModal(false)}
                className="px-5 py-2 text-xs font-black bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition cursor-pointer"
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
