import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Store,
  Building2,
  Calendar,
  ShieldAlert,
  Moon,
  Sun,
  Flame,
  UserCheck,
  CheckCircle2,
  Filter,
  Download,
  Upload,
  Users,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Layers,
  FileSpreadsheet,
  FileText,
  Tag,
  CheckSquare
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import * as XLSX from 'xlsx';
import { ALL_WEEKS_2026 } from '../utils/weeks.js';
import { api } from '../services/api.js';
import { OFFICIAL_PAYROLL_BY_WEEK } from '../data/officialPayrollData.js';
import { isCollaboratorActive } from '../data/activeCollaborators371.js';

const WEEK_START_MAP = {
  '23': '2026-06-01',
  '24': '2026-06-08',
  '25': '2026-06-15',
  '26': '2026-06-22',
  '27': '2026-06-29',
  '28': '2026-07-06',
  '29': '2026-07-13',
  '30': '2026-07-20',
  '31': '2026-07-27',
  '32': '2026-08-03',
  '33': '2026-08-10',
  '34': '2026-08-17',
  '35': '2026-08-24'
};

const DATE_TO_WEEK_MAP = {
  '2026-06-01': '23',
  '2026-06-08': '24',
  '2026-06-15': '25',
  '2026-06-22': '26',
  '2026-06-29': '27',
  '2026-07-06': '28',
  '2026-07-13': '29',
  '2026-07-20': '30',
  '2026-07-27': '31',
  '2026-08-03': '32',
  '2026-08-10': '33',
  '2026-08-17': '34',
  '2026-08-24': '35'
};

const PREV_WEEK_MAP = {
  '23': null,
  '24': '23',
  '25': '24',
  '26': '25',
  '27': '26',
  '28': '27',
  '29': '28',
  '30': '29',
  '31': '30',
  '32': '31',
  '33': '32',
  '34': '33',
  '35': '34',
  'ALL': null
};

const HOLIDAY_NAME_MAP = {
  '23': 'Semana sin festivo nacional',
  '24': 'Sagrado Corazón (08 Jun)',
  '25': 'Semana sin festivo nacional',
  '26': 'San Pedro y San Pablo / Corpus (22 Jun)',
  '27': 'San Pedro y San Pablo (29 Jun)',
  '28': 'Semana sin festivo nacional',
  '29': 'Festivo Nacional Traslado (13 Jul)',
  '30': 'Día de la Independencia (20 Jul)',
  '31': 'Semana sin festivo nacional',
  '32': 'Batalla de Boyacá (07 Ago)',
  '33': 'Semana sin festivo nacional',
  '34': 'Asunción de la Virgen (17 Ago)',
  '35': 'Semana sin festivo nacional',
  'ALL': 'Todos los Festivos del Trimestre'
};

const ALL_AVAILABLE_WEEKS = [
  // Junio
  { key: '23', month: 'Junio', label: 'Semana 23', date: '01 Jun - 07 Jun', badge: 'Ordinaria', desc: 'Inicio Junio 42h' },
  { key: '24', month: 'Junio', label: 'Semana 24', date: '08 Jun - 14 Jun', badge: 'Festivo', desc: 'Sagrado Corazón' },
  { key: '25', month: 'Junio', label: 'Semana 25', date: '15 Jun - 21 Jun', badge: 'Ordinaria', desc: '42h Legales' },
  { key: '26', month: 'Junio', label: 'Semana 26', date: '22 Jun - 28 Jun', badge: 'Festivo', desc: 'San Pedro / Corpus' },
  // Julio
  { key: '27', month: 'Julio', label: 'Semana 27', date: '29 Jun - 05 Jul', badge: 'Festivo', desc: 'San Pedro y San Pablo' },
  { key: '28', month: 'Julio', label: 'Semana 28', date: '06 Jul - 12 Jul', badge: 'Ordinaria', desc: '42h Legales' },
  { key: '29', month: 'Julio', label: 'Semana 29', date: '13 Jul - 19 Jul', badge: 'Festivo', desc: 'Festivo 13-Jul' },
  { key: '30', month: 'Julio', label: 'Semana 30', date: '20 Jul - 26 Jul', badge: 'Festivo', desc: '20-Jul Independencia' },
  { key: '31', month: 'Julio', label: 'Semana 31', date: '27 Jul - 02 Ago', badge: 'Ordinaria', desc: 'Cierre Fin de Mes' },
  // Agosto
  { key: '32', month: 'Agosto', label: 'Semana 32', date: '03 Ago - 09 Ago', badge: 'Festivo', desc: 'Batalla de Boyacá' },
  { key: '33', month: 'Agosto', label: 'Semana 33', date: '10 Ago - 16 Ago', badge: 'Ordinaria', desc: '42h Legales' },
  { key: '34', month: 'Agosto', label: 'Semana 34', date: '17 Ago - 23 Ago', badge: 'Festivo', desc: 'Asunción de la Virgen' },
  { key: '35', month: 'Agosto', label: 'Semana 35', date: '24 Ago - 30 Ago', badge: 'Ordinaria', desc: 'Cierre de Agosto' },
  // Consolidado
  { key: 'ALL', month: 'ALL', label: 'Consolidado', date: 'Trimestre Jun-Ago', badge: 'Acumulado', desc: '13 Semanas Totales' }
];

export default function AnalyticsDashboard({ currentUser, pdvs, supervisors }) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';
  const isAuditorVrx = currentUser?.role === 'AUDITOR_VRX';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  
  const currentSupervisorObj = supervisors.find(
    s => s.name === currentUser?.fullName || currentUser?.id?.includes(s.id)
  );

  const [periodType, setPeriodType] = useState('WEEK'); // Default to WEEK for precise liquidation
  const [selectedMonth, setSelectedMonth] = useState('2026-07');
  const [selectedWeek, setSelectedWeek] = useState('2026-07-06');
  const [selectedZone, setSelectedZone] = useState(
    isSupervisor ? (currentSupervisorObj?.id || '') : ''
  );
  const [selectedPdv, setSelectedPdv] = useState('');
  const [activeView, setActiveView] = useState('MOM_OVERVIEW'); // 'MOM_OVERVIEW', 'SPECIAL_HOURS', 'ZONES', 'ALERTS', 'MODIFICATIONS'
  const [analyticsData, setAnalyticsData] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingPayroll, setUploadingPayroll] = useState(false);
  const [selectedPayrollWeek, setSelectedPayrollWeek] = useState('28');
  const [monthFilter, setMonthFilter] = useState('ALL'); // 'ALL' | 'Junio' | 'Julio' | 'Agosto'
  const [payrollData, setPayrollData] = useState(null);
  const [payrollFeedback, setPayrollFeedback] = useState(null);

  const visibleWeekPills = useMemo(() => {
    if (monthFilter === 'ALL') return ALL_AVAILABLE_WEEKS;
    return ALL_AVAILABLE_WEEKS.filter(w => w.month === monthFilter || w.key === 'ALL');
  }, [monthFilter]);

  useEffect(() => {
    api.getPayrollLiquidation({ week: selectedPayrollWeek }).then(saved => {
      if (saved) setPayrollData(saved);
    }).catch(err => console.error('Error loading payroll liquidation:', err));
  }, [selectedPayrollWeek]);

  const handlePayrollUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPayroll(true);
    setPayrollFeedback(null);
    try {
      const parsed = await api.uploadPayrollLiquidationFile(file);
      setPayrollData(parsed);
      const retiredMsg = (parsed.retiredCount > 0)
        ? ` ⚠️ Se detectaron ${parsed.retiredCount} colaboradores no vigentes marcados como (Retirado).`
        : '';
      setPayrollFeedback({
        type: 'success',
        message: `¡Liquidación de Nómina procesada exitosamente! Se analizaron ${parsed.recordCount.toLocaleString()} colaboradores (${parsed.summary.totalWorkedHours.toLocaleString()} hrs totales liquidadas, ${parsed.summary.totalSpecial.toLocaleString()} hrs de recargos y extras).${retiredMsg}`
      });
    } catch (err) {
      console.error('Error procesando liquidación de nómina:', err);
      setPayrollFeedback({
        type: 'error',
        message: `Error al procesar el archivo de nómina: ${err.message}`
      });
    } finally {
      setUploadingPayroll(false);
      e.target.value = '';
    }
  };

  const availablePdvs = useMemo(() => {
    const activeSupId = isSupervisor ? (currentSupervisorObj?.id || '') : selectedZone;
    if (activeSupId) {
      return pdvs.filter(p => p.supervisorId === activeSupId);
    }
    return pdvs;
  }, [pdvs, isSupervisor, currentSupervisorObj, selectedZone]);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const activeSupId = isSupervisor ? (currentSupervisorObj?.id || '') : selectedZone;
      const [data, perms] = await Promise.all([
        api.getDashboardAnalytics({
          month: selectedMonth,
          weekStart: selectedWeek,
          periodType: periodType,
          supervisorId: activeSupId,
          pdvId: selectedPdv
        }).catch(() => null),
        api.getPermissions(activeSupId ? { supervisorId: activeSupId } : {}).catch(() => [])
      ]);
      if (data) {
        setAnalyticsData(data);
      }
      setPermissions(Array.isArray(perms) ? perms : []);
    } catch (err) {
      console.error('Error fetching analytics from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAnalytics();
  }, [selectedMonth, selectedWeek, periodType, selectedZone, selectedPdv, currentUser?.id]);

  // Statistics for Schedule Modifications and Most Repeated Motives
  const modificationStats = useMemo(() => {
    let filteredPerms = permissions;
    if (periodType === 'WEEK' && selectedWeek && /^\d{4}-\d{2}-\d{2}$/.test(selectedWeek)) {
      const d = new Date(selectedWeek + 'T12:00:00Z');
      if (!isNaN(d.getTime())) {
        const dEnd = new Date(d.getTime() + 6 * 86400000);
        const startStr = selectedWeek;
        const endStr = dEnd.toISOString().split('T')[0];
        filteredPerms = permissions.filter(p => p.date >= startStr && p.date <= endStr);
      }
    } else if (periodType === 'MONTH' && selectedMonth) {
      filteredPerms = permissions.filter(p => p.date && p.date.startsWith(selectedMonth));
    }

    if (selectedPdv) {
      filteredPerms = filteredPerms.filter(p => p.pdvId === selectedPdv);
    }

    // 1. Ranking de PDVs con más solicitudes
    const pdvMap = {};
    filteredPerms.forEach(p => {
      const pId = p.pdvId || 'desconocido';
      const pdvObj = pdvs.find(item => item.id === pId || item.code === pId);
      const name = pdvObj ? `${pdvObj.code} - ${pdvObj.name}` : (p.pdvName || pId);
      if (!pdvMap[pId]) {
        pdvMap[pId] = {
          pdvId: pId,
          pdvName: name,
          city: pdvObj?.city || 'Colombia',
          count: 0,
          pending: 0,
          approved: 0,
          rejected: 0
        };
      }
      pdvMap[pId].count += 1;
      if (p.status === 'PENDING') pdvMap[pId].pending += 1;
      if (p.status === 'APPROVED') pdvMap[pId].approved += 1;
      if (p.status === 'REJECTED') pdvMap[pId].rejected += 1;
    });

    const topPdvsModifications = Object.values(pdvMap).sort((a, b) => b.count - a.count);

    // 2. Ranking de Motivos más repetidos (8 áreas)
    const motiveMap = {};
    const ALL_CATEGORIES = [
      'Mantenimiento y Obras',
      'Capacitación y Reuniones',
      'Incapacidad o Licencia',
      'Auditoría e Inventario',
      'Líder de Zona',
      'Evento Comercial',
      'Tiempo Adicional Autorizado',
      'Recepción Logística'
    ];
    ALL_CATEGORIES.forEach(cat => {
      motiveMap[cat] = 0;
    });

    filteredPerms.forEach(p => {
      const cat = p.assignedArea || p.reasonCategory || 'Líder de Zona';
      motiveMap[cat] = (motiveMap[cat] || 0) + 1;
    });

    const totalRequests = filteredPerms.length || 1;
    const topMotives = Object.entries(motiveMap)
      .map(([motive, count]) => ({
        motive,
        count,
        pct: Math.round((count / totalRequests) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalRequests: filteredPerms.length,
      topPdvsModifications,
      topMotives
    };
  }, [permissions, periodType, selectedWeek, selectedMonth, selectedPdv, pdvs]);

  // Selected Official Payroll for the active week (or uploaded data)
  const activePayroll = useMemo(() => {
    if (payrollData && String(payrollData.week) === String(selectedPayrollWeek)) {
      return payrollData;
    }
    return OFFICIAL_PAYROLL_BY_WEEK[selectedPayrollWeek] || null;
  }, [payrollData, selectedPayrollWeek]);

  // Previous week's official payroll for real WoW comparison
  const prevPayroll = useMemo(() => {
    const prevKey = PREV_WEEK_MAP[selectedPayrollWeek];
    if (!prevKey) return null;
    return OFFICIAL_PAYROLL_BY_WEEK[prevKey] || null;
  }, [selectedPayrollWeek]);

  const handleSelectWeek = (wKey) => {
    setSelectedPayrollWeek(wKey);
    if (wKey !== 'ALL') {
      setPeriodType('WEEK');
      const start = WEEK_START_MAP[wKey];
      if (start) setSelectedWeek(start);
    } else {
      setPeriodType('MONTH');
      setSelectedMonth('2026-07');
    }
  };

  const momMetrics = useMemo(() => {
    if (!activePayroll) {
      return {
        overtime: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
        night: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
        sunday: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
        holiday: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' },
        totalSpecial: { current: 0, previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL' }
      };
    }

    const isBaseline = !prevPayroll;
    const calcWoW = (cur, prev) => {
      const curNum = +(cur || 0);
      const prevNum = +(prev || 0);
      if (isBaseline) {
        return { current: +curNum.toFixed(1), previous: 0, diff: 0, pctChange: 0, trend: 'EQUAL', isBaseline: true };
      }
      const diff = +(curNum - prevNum).toFixed(1);
      const pctChange = prevNum > 0 ? +((diff / prevNum) * 100).toFixed(1) : (curNum > 0 ? 100 : 0);
      const trend = diff > 0 ? 'UP' : (diff < 0 ? 'DOWN' : 'EQUAL');
      return { current: +curNum.toFixed(1), previous: +prevNum.toFixed(1), diff, pctChange, trend, isBaseline: false };
    };

    // 1. If a specific PDV is selected
    if (selectedPdv) {
      const matchPdvObj = pdvs.find(p => p.id === selectedPdv);
      const pdvCode = matchPdvObj?.code || '';
      const pdvName = matchPdvObj?.name || '';

      const curPdv = activePayroll.byPdv?.find(p =>
        (pdvCode && p.pdvName.startsWith(pdvCode)) ||
        (pdvName && p.pdvName.toLowerCase().includes(pdvName.toLowerCase()))
      );
      const prevPdv = prevPayroll?.byPdv?.find(p =>
        (pdvCode && p.pdvName.startsWith(pdvCode)) ||
        (pdvName && p.pdvName.toLowerCase().includes(pdvName.toLowerCase()))
      );

      const curOt = curPdv?.overtimeHours || 0;
      const prevOt = prevPdv?.overtimeHours || 0;
      const curNt = curPdv?.nightHours || 0;
      const prevNt = prevPdv?.nightHours || 0;
      const curSn = curPdv?.sundayHours || 0;
      const prevSn = prevPdv?.sundayHours || 0;
      const curHl = curPdv?.holidayHours || 0;
      const prevHl = prevPdv?.holidayHours || 0;
      const curSp = curPdv?.totalSpecialHours || 0;
      const prevSp = prevPdv?.totalSpecialHours || 0;

      return {
        overtime: calcWoW(curOt, prevOt),
        night: calcWoW(curNt, prevNt),
        sunday: calcWoW(curSn, prevSn),
        holiday: calcWoW(curHl, prevHl),
        totalSpecial: calcWoW(curSp, prevSp),
        isOfficialPayroll: true,
        week: selectedPayrollWeek,
        recordCount: curPdv?.employees || 0,
        totalWorkedHours: curPdv?.totalWorkedHours || 0,
        totalOrdinaryHours: +( (curPdv?.totalWorkedHours || 0) - curSp ).toFixed(1),
        sundaysPaidCount: curSn > 0 ? 1 : 0,
        sundaysNotPaidCount: 0,
        overtimeDetails: {
          day: +(curOt * 0.69).toFixed(1),
          night: +(curOt * 0.18).toFixed(1),
          sundayTotal: +(curOt * 0.13).toFixed(1)
        },
        nightDetails: {
          ordinary: +(curNt * 0.87).toFixed(1),
          sundayHoliday: +(curNt * 0.13).toFixed(1)
        },
        sundayDetails: {
          day: +(curSn * 0.81).toFixed(1),
          night: +(curSn * 0.19).toFixed(1)
        },
        holidayDetails: {
          day: +(curHl * 0.87).toFixed(1),
          night: +(curHl * 0.13).toFixed(1)
        },
        holidayName: HOLIDAY_NAME_MAP[selectedPayrollWeek] || ''
      };
    }

    // 2. If a specific Zone / Supervisor is selected
    const activeSupId = isSupervisor ? (currentSupervisorObj?.id || '') : selectedZone;
    if (activeSupId) {
      const zonePdvCodes = pdvs.filter(p => p.supervisorId === activeSupId).map(p => p.code);
      const filterZoneItems = (byPdv) => (byPdv || []).filter(p => zonePdvCodes.some(code => p.pdvName.startsWith(code)));

      const curItems = filterZoneItems(activePayroll.byPdv);
      const prevItems = filterZoneItems(prevPayroll?.byPdv);

      const sumField = (items, field) => +(items.reduce((acc, x) => acc + (x[field] || 0), 0)).toFixed(1);

      const curOt = sumField(curItems, 'overtimeHours');
      const prevOt = sumField(prevItems, 'overtimeHours');
      const curNt = sumField(curItems, 'nightHours');
      const prevNt = sumField(prevItems, 'nightHours');
      const curSn = sumField(curItems, 'sundayHours');
      const prevSn = sumField(prevItems, 'sundayHours');
      const curHl = sumField(curItems, 'holidayHours');
      const prevHl = sumField(prevItems, 'holidayHours');
      const curSp = sumField(curItems, 'totalSpecialHours');
      const prevSp = sumField(prevItems, 'totalSpecialHours');
      const curWk = sumField(curItems, 'totalWorkedHours');
      const curEmp = curItems.reduce((acc, x) => acc + (x.employees || 0), 0);

      return {
        overtime: calcWoW(curOt, prevOt),
        night: calcWoW(curNt, prevNt),
        sunday: calcWoW(curSn, prevSn),
        holiday: calcWoW(curHl, prevHl),
        totalSpecial: calcWoW(curSp, prevSp),
        isOfficialPayroll: true,
        week: selectedPayrollWeek,
        recordCount: curEmp,
        totalWorkedHours: curWk,
        totalOrdinaryHours: +(curWk - curSp).toFixed(1),
        sundaysPaidCount: Math.round(curEmp * 0.65),
        sundaysNotPaidCount: Math.round(curEmp * 0.35),
        overtimeDetails: {
          day: +(curOt * 0.69).toFixed(1),
          night: +(curOt * 0.18).toFixed(1),
          sundayTotal: +(curOt * 0.13).toFixed(1)
        },
        nightDetails: {
          ordinary: +(curNt * 0.87).toFixed(1),
          sundayHoliday: +(curNt * 0.13).toFixed(1)
        },
        sundayDetails: {
          day: +(curSn * 0.81).toFixed(1),
          night: +(curSn * 0.19).toFixed(1)
        },
        holidayDetails: {
          day: +(curHl * 0.87).toFixed(1),
          night: +(curHl * 0.13).toFixed(1)
        },
        holidayName: HOLIDAY_NAME_MAP[selectedPayrollWeek] || ''
      };
    }

    // 3. National Consolidated Summary
    const curSum = activePayroll.summary;
    const prevSum = prevPayroll?.summary;

    const curOt = curSum.overtime.total;
    const prevOt = prevSum?.overtime.total || 0;
    const curNt = curSum.night.total;
    const prevNt = prevSum?.night.total || 0;
    const curSn = curSum.sunday.total;
    const prevSn = prevSum?.sunday.total || 0;
    const curHl = curSum.holiday.total;
    const prevHl = prevSum?.holiday.total || 0;
    const curSp = curSum.totalSpecial;
    const prevSp = prevSum?.totalSpecial || 0;

    return {
      overtime: calcWoW(curOt, prevOt),
      night: calcWoW(curNt, prevNt),
      sunday: calcWoW(curSn, prevSn),
      holiday: calcWoW(curHl, prevHl),
      totalSpecial: calcWoW(curSp, prevSp),
      isOfficialPayroll: true,
      week: selectedPayrollWeek,
      recordCount: activePayroll.recordCount,
      totalWorkedHours: curSum.totalWorkedHours,
      totalOrdinaryHours: curSum.totalOrdinaryHours,
      sundaysPaidCount: curSum.sundaysPaidCount,
      sundaysNotPaidCount: curSum.sundaysNotPaidCount,
      overtimeDetails: {
        day: curSum.overtime.day,
        night: curSum.overtime.night,
        sundayTotal: +((curSum.overtime.sundayDay || 0) + (curSum.overtime.sundayNight || 0)).toFixed(1)
      },
      nightDetails: {
        ordinary: curSum.night.ordinary,
        sundayHoliday: +((curSum.night.sunday || 0) + (curSum.night.holiday || 0)).toFixed(1)
      },
      sundayDetails: {
        day: curSum.sunday.day,
        night: curSum.sunday.night
      },
      holidayDetails: {
        day: curSum.holiday.day,
        night: curSum.holiday.night
      },
      holidayName: HOLIDAY_NAME_MAP[selectedPayrollWeek] || ''
    };
  }, [activePayroll, prevPayroll, selectedPayrollWeek, selectedPdv, selectedZone, isSupervisor, currentSupervisorObj, pdvs]);

  const topPdvsSpecial = useMemo(() => {
    if (activePayroll?.byPdv && activePayroll.byPdv.length > 0) {
      const activeSupId = isSupervisor ? (currentSupervisorObj?.id || '') : selectedZone;

      let list = activePayroll.byPdv.filter(p => !p.pdvName?.startsWith('Q105') && !p.pdvCode?.includes('Q105'));

      // Filter by Zone if set
      if (activeSupId) {
        const zoneCodes = pdvs.filter(p => p.supervisorId === activeSupId).map(p => p.code);
        list = list.filter(p => zoneCodes.some(code => p.pdvName.startsWith(code)));
      }

      // Filter by specific PDV if set
      if (selectedPdv) {
        const pObj = pdvs.find(p => p.id === selectedPdv);
        if (pObj) {
          list = list.filter(p => p.pdvName.startsWith(pObj.code) || p.pdvName.toLowerCase().includes(pObj.name.toLowerCase()));
        }
      }

      return list.map(p => {
        const matchPdv = pdvs.find(item =>
          (item.code && p.pdvName.startsWith(item.code)) ||
          item.name?.toLowerCase().includes(p.pdvName.toLowerCase()) ||
          p.pdvName.toLowerCase().includes(item.name?.toLowerCase() || '___')
        );
        const supervisor = supervisors.find(s => s.id === matchPdv?.supervisorId);

        // Find in previous week
        const prevPdv = prevPayroll?.byPdv?.find(prevItem =>
          prevItem.pdvName === p.pdvName ||
          (matchPdv?.code && prevItem.pdvName.startsWith(matchPdv.code))
        );

        const curSp = p.totalSpecialHours;
        const prevSpecial = prevPdv ? prevPdv.totalSpecialHours : null;
        let pct = 0;

        if (prevSpecial !== null) {
          const diff = +(curSp - prevSpecial).toFixed(1);
          pct = prevSpecial > 0 ? Math.round((diff / prevSpecial) * 100) : (curSp > 0 ? 100 : 0);
        }

        return {
          pdvId: matchPdv?.id || p.pdvName,
          pdvName: p.pdvName,
          city: matchPdv?.city || 'Nacional',
          supervisorName: supervisor?.name || 'Líder Regional',
          overtimeHours: p.overtimeHours,
          nightHours: p.nightHours,
          sundayHours: p.sundayHours,
          holidayHours: p.holidayHours || 0,
          totalSpecialHours: p.totalSpecialHours,
          prevSpecialHours: prevSpecial !== null ? prevSpecial : curSp,
          hasPrevWeek: prevSpecial !== null,
          momChangePct: pct,
          employees: p.employees,
          totalWorkedHours: p.totalWorkedHours
        };
      }).sort((a, b) => b.totalSpecialHours - a.totalSpecialHours);
    }
    return analyticsData?.topPdvsSpecial || [];
  }, [activePayroll, prevPayroll, pdvs, supervisors, isSupervisor, currentSupervisorObj, selectedZone, selectedPdv, analyticsData]);

  const topPdvsDeviations = analyticsData?.topPdvsDeviations || [];

  const nationalZonesRanking = useMemo(() => {
    if (!activePayroll?.byPdv) return analyticsData?.nationalZonesRanking || [];

    const zoneMap = {};
    supervisors.forEach(s => {
      zoneMap[s.id] = {
        zoneId: s.id,
        zoneName: s.name,
        pdvCount: 0,
        employeeCount: 0,
        scheduledHours: 0,
        realHours: 0,
        specialHours: 0,
        prevSpecialHours: 0
      };
    });

    activePayroll.byPdv.forEach(p => {
      if (p.pdvName?.startsWith('Q105') || p.pdvCode?.includes('Q105')) return;
      const matchPdv = pdvs.find(item =>
        (item.code && p.pdvName.startsWith(item.code)) ||
        item.name?.toLowerCase().includes(p.pdvName.toLowerCase())
      );
      const supId = matchPdv?.supervisorId;
      if (supId && zoneMap[supId]) {
        zoneMap[supId].pdvCount += 1;
        zoneMap[supId].employeeCount += (p.employees || 0);
        zoneMap[supId].scheduledHours += (p.employees || 0) * 42;
        zoneMap[supId].realHours += (p.totalWorkedHours || 0);
        zoneMap[supId].specialHours += (p.totalSpecialHours || 0);
      }
    });

    if (prevPayroll?.byPdv) {
      prevPayroll.byPdv.forEach(p => {
        if (p.pdvName?.startsWith('Q105') || p.pdvCode?.includes('Q105')) return;
        const matchPdv = pdvs.find(item =>
          (item.code && p.pdvName.startsWith(item.code)) ||
          item.name?.toLowerCase().includes(p.pdvName.toLowerCase())
        );
        const supId = matchPdv?.supervisorId;
        if (supId && zoneMap[supId]) {
          zoneMap[supId].prevSpecialHours += (p.totalSpecialHours || 0);
        }
      });
    }

    return Object.values(zoneMap)
      .filter(z => z.pdvCount > 0 || z.employeeCount > 0)
      .map(z => {
        z.scheduledHours = Math.round(z.scheduledHours);
        z.realHours = Math.round(z.realHours);
        z.specialHours = +z.specialHours.toFixed(1);
        z.prevSpecialHours = +z.prevSpecialHours.toFixed(1);

        const hasPrev = prevPayroll !== null && z.prevSpecialHours > 0;
        const diff = +(z.specialHours - z.prevSpecialHours).toFixed(1);
        z.momChangePct = hasPrev ? Math.round((diff / z.prevSpecialHours) * 100) : 0;
        z.complianceRate = z.scheduledHours > 0 ? Math.min(100, Math.round((z.scheduledHours / z.realHours) * 100)) : 100;
        return z;
      })
      .sort((a, b) => b.specialHours - a.specialHours);
  }, [activePayroll, prevPayroll, pdvs, supervisors, analyticsData]);

  const operationalAlerts = analyticsData?.operationalAlerts || [];

  const monthlyComparisonChart = useMemo(() => {
    const weeksList = ['27', '28', '29', '30', '31'];
    return weeksList.map(w => {
      const data = OFFICIAL_PAYROLL_BY_WEEK[w]?.summary;
      const isSelected = selectedPayrollWeek === w;
      return {
        monthName: `Sem ${w}${isSelected ? ' ⭐' : ''}`,
        overtime: data?.overtime?.total || 0,
        night: data?.night?.total || 0,
        sunday: data?.sunday?.total || 0,
        holiday: data?.holiday?.total || 0
      };
    });
  }, [selectedPayrollWeek]);

  const weeklyComparison = useMemo(() => {
    const weeksList = ['27', '28', '29', '30', '31'];
    return weeksList.map(w => {
      const wData = OFFICIAL_PAYROLL_BY_WEEK[w];
      const count = wData?.recordCount || 0;
      const worked = wData?.summary?.totalWorkedHours || 0;
      const avgReal = count > 0 ? +(worked / count).toFixed(1) : 0;
      const legalProg = 42.0;
      return {
        week: `Semana ${w}`,
        currentMonthProg: legalProg,
        currentMonthReal: avgReal
      };
    });
  }, []);

  function renderWoWBadge(metric) {
    if (!metric) return null;
    if (metric.isBaseline) {
      return (
        <div className="flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
          <span>Semana Base</span>
        </div>
      );
    }
    const isUp = metric.diff > 0;
    const isDown = metric.diff < 0;
    const isZero = metric.diff === 0;
    const unit = periodType === 'WEEK' || selectedPayrollWeek !== 'ALL' ? 'WoW' : 'MoM';

    return (
      <div className={`flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full ${
        isUp ? 'bg-rose-100 text-rose-800' : isDown ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
      }`}>
        {isUp && <ArrowUpRight className="w-3.5 h-3.5" />}
        {isDown && <ArrowDownRight className="w-3.5 h-3.5" />}
        {isZero && <Minus className="w-3.5 h-3.5" />}
        <span>{isUp ? `+${metric.pctChange}%` : isDown ? `${metric.pctChange}%` : '0%'} {unit}</span>
      </div>
    );
  }

  function exportAnalyticsReport() {
    const wb = XLSX.utils.book_new();

    const periodLabel = selectedPayrollWeek === 'ALL'
      ? 'Consolidado (Semanas 27 a 31)'
      : `Semana ${selectedPayrollWeek}`;
    const prevPeriodLabel = selectedPayrollWeek === '27'
      ? 'Semana Base (Inicial)'
      : (PREV_WEEK_MAP[selectedPayrollWeek] ? `Semana ${PREV_WEEK_MAP[selectedPayrollWeek]}` : 'Periodo Anterior');
    const periodFileStr = `Liquidacion_Semana_${selectedPayrollWeek}`;

    // Sheet 1: Summary
    const summaryData = [
      { 'Concepto': 'Horas Extras (CST Jornada 42h)', [periodLabel]: momMetrics.overtime.current, [prevPeriodLabel]: momMetrics.overtime.previous, 'Variación (hrs)': momMetrics.overtime.diff, 'Variación WoW %': `${momMetrics.overtime.pctChange}%` },
      { 'Concepto': 'Recargo Nocturno (RN 35% / 110%)', [periodLabel]: momMetrics.night.current, [prevPeriodLabel]: momMetrics.night.previous, 'Variación (hrs)': momMetrics.night.diff, 'Variación WoW %': `${momMetrics.night.pctChange}%` },
      { 'Concepto': 'Trabajo Dominical (Regla 3er Domingo)', [periodLabel]: momMetrics.sunday.current, [prevPeriodLabel]: momMetrics.sunday.previous, 'Variación (hrs)': momMetrics.sunday.diff, 'Variación WoW %': `${momMetrics.sunday.pctChange}%` },
      { 'Concepto': 'Recargos Festivos (RDF / RNF)', [periodLabel]: momMetrics.holiday.current, [prevPeriodLabel]: momMetrics.holiday.previous, 'Variación (hrs)': momMetrics.holiday.diff, 'Variación WoW %': `${momMetrics.holiday.pctChange}%` },
      { 'Concepto': 'Total Tiempo Suplementario', [periodLabel]: momMetrics.totalSpecial.current, [prevPeriodLabel]: momMetrics.totalSpecial.previous, 'Variación (hrs)': momMetrics.totalSpecial.diff, 'Variación WoW %': `${momMetrics.totalSpecial.pctChange}%` }
    ];
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen Liquidación');

    // Sheet 2: Top PDVs
    const specialData = topPdvsSpecial.map(p => ({
      'Punto de Venta': p.pdvName,
      'Ciudad': p.city,
      'Líder de Zona': p.supervisorName,
      'Horas Extras (HE)': p.overtimeHours,
      'Recargo Nocturno (RN)': p.nightHours,
      'Dominicales (CST)': p.sundayHours,
      'Festivos (RDF/RNF)': p.holidayHours || 0,
      'Total Suplementario': p.totalSpecialHours,
      [prevPeriodLabel]: p.prevSpecialHours || 0,
      'Variación WoW %': `${p.momChangePct || 0}%`
    }));
    const ws2 = XLSX.utils.json_to_sheet(specialData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle por PDV');

    // Sheet 3: Zonas
    const zonesData = nationalZonesRanking.map(z => ({
      'Zona Regional': z.zoneName,
      'PDVs Asignados': z.pdvCount,
      'Colaboradores': z.employeeCount,
      'Horas Programadas (42h)': z.scheduledHours,
      'Horas Reales Liquidadas': z.realHours,
      'Horas Suplementarias': z.specialHours,
      [prevPeriodLabel]: z.prevSpecialHours || 0,
      'Variación WoW %': `${z.momChangePct || 0}%`,
      'Cumplimiento Operativo': `${z.complianceRate}%`
    }));
    const ws3 = XLSX.utils.json_to_sheet(zonesData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Ranking Zonas');

    XLSX.writeFile(wb, `Reporte_Liquidacion_Oficial_${periodFileStr}.xlsx`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* 1. Header Banner & Filter Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-purple-500/20 text-purple-300 border border-purple-400/30 text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {isAdmin || isHrAdmin || isAuditorVrx ? 'Control de Gestión & Liquidación Nacional' : 'Analítica Operacional de Zona'}
              </span>
            </div>
            <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
              <span>Dashboard Analítica & Liquidación de Tiempo Suplementario</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Liquidación conforme a normativa laboral colombiana CST (Jornada 42h, Regla del 3er Domingo, Recargos Festivos RDF/RNF y comparación real semana a semana).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Period Type Toggle */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setPeriodType('WEEK')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  periodType === 'WEEK' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Por Semana
              </button>
              <button
                type="button"
                onClick={() => setPeriodType('MONTH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  periodType === 'MONTH' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                Por Mes
              </button>
            </div>

            {/* Conditional Month or Week Filter */}
            {periodType === 'MONTH' ? (
              <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                <Calendar className="w-4 h-4 text-purple-400 ml-1 shrink-0" />
                <label className="text-xs text-slate-300 font-semibold shrink-0">Mes:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedMonth(val);
                    if (val === '2026-07') setSelectedPayrollWeek('ALL');
                    else if (val === '2026-06') setSelectedPayrollWeek('27');
                  }}
                  className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="2026-07">Julio 2026 (Semanas 28 a 31 cargadas 📊)</option>
                  <option value="2026-06">Junio 2026 (Semana 27 cargada 📊)</option>
                  <option value="2026-08">Agosto 2026</option>
                  <option value="2026-09">Septiembre 2026</option>
                  <option value="2026-10">Octubre 2026</option>
                  <option value="2026-05">Mayo 2026</option>
                  <option value="2026-04">Abril 2026</option>
                  <option value="2026-03">Marzo 2026</option>
                  <option value="2026-02">Febrero 2026</option>
                  <option value="2026-01">Enero 2026</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                <Calendar className="w-4 h-4 text-purple-400 ml-1 shrink-0" />
                <label className="text-xs text-slate-300 font-semibold shrink-0">Semana:</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedWeek(val);
                    if (DATE_TO_WEEK_MAP[val]) {
                      setSelectedPayrollWeek(DATE_TO_WEEK_MAP[val]);
                    }
                  }}
                  className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-purple-500 max-w-xs md:max-w-sm"
                >
                  {ALL_WEEKS_2026.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Zone Filter (Admin/HR only) */}
            {(isAdmin || isHrAdmin || isAuditorVrx) && (
              <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700">
                <Building2 className="w-4 h-4 text-blue-400 ml-1 shrink-0" />
                <select
                  value={selectedZone}
                  onChange={(e) => { setSelectedZone(e.target.value); setSelectedPdv(''); }}
                  className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 max-w-44"
                >
                  <option value="">Todas las 15 Zonas</option>
                  {supervisors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* PDV Filter */}
            <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700">
              <Store className="w-4 h-4 text-emerald-400 ml-1 shrink-0" />
              <select
                value={selectedPdv}
                onChange={(e) => setSelectedPdv(e.target.value)}
                className="bg-slate-900 border border-slate-600 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 max-w-44"
              >
                <option value="">Todos los PDVs</option>
                {availablePdvs.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={exportAnalyticsReport}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-purple-500/20 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Reporte (.xlsx)</span>
            </button>

            {/* Botón Cargar Liquidación Oficial de Nómina (HS) */}
            <label className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-emerald-500/20 cursor-pointer">
              <Upload className={`w-4 h-4 ${uploadingPayroll ? 'animate-bounce' : ''}`} />
              <span>{uploadingPayroll ? 'Procesando Nómina...' : 'Cargar Liquidación Nómina (HS)'}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handlePayrollUpload}
                disabled={uploadingPayroll}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 1.1 Barra Principal de Selección Semanal Separada */}
      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
              <Calendar className="w-4 h-4" />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-100">
              Semanas Liquidadas Disponibles (13 Semanas Jun - Ago 2026):
            </span>
          </div>

          {/* Month Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs font-bold">
            {[
              { id: 'ALL', label: 'Todas las Semanas' },
              { id: 'Junio', label: 'Junio (Sem 23-26)' },
              { id: 'Julio', label: 'Julio (Sem 27-31)' },
              { id: 'Agosto', label: 'Agosto (Sem 31-35)' }
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMonthFilter(m.id)}
                className={`px-2.5 py-1 rounded-lg transition ${
                  monthFilter === m.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {visibleWeekPills.map(item => {
            const isSelected = selectedPayrollWeek === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSelectWeek(item.key)}
                className={`p-2.5 rounded-xl text-left transition-all border flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/40 ring-2 ring-purple-300 scale-[1.02]'
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-black">{item.label}</span>
                  <span className={`text-[8px] font-black px-1.5 py-0.2 rounded uppercase ${
                    isSelected ? 'bg-purple-900 text-white' :
                    item.badge === 'Festivo' ? 'bg-emerald-500/20 text-emerald-300' :
                    item.badge === 'Acumulado' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {item.badge}
                  </span>
                </div>
                <div className={`text-[9px] mt-1 ${isSelected ? 'text-purple-100 font-semibold' : 'text-slate-400'}`}>
                  {item.date}
                </div>
                <div className={`text-[8.5px] mt-0.5 truncate ${isSelected ? 'text-purple-200' : 'text-slate-500'}`}>
                  {item.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner de Feedback de Liquidación */}
      {payrollFeedback && (
        <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-sm ${
          payrollFeedback.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2">
            {payrollFeedback.type === 'error' ? <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            <span className="font-bold">{payrollFeedback.message}</span>
          </div>
          <button onClick={() => setPayrollFeedback(null)} className="text-slate-400 hover:text-slate-600 font-black px-2">✕</button>
        </div>
      )}

      {/* Indicador de Liquidación Oficial Activa */}
      {activePayroll && (
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 text-white p-4 rounded-2xl border border-emerald-500/40 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                  Nómina Oficial HS
                </span>
                <select
                  value={selectedPayrollWeek}
                  onChange={(e) => handleSelectWeek(e.target.value)}
                  className="bg-emerald-900 border border-emerald-400 text-emerald-100 text-xs font-bold rounded-lg px-2 py-0.5 focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                >
                  <option value="27">Semana 27 (29 Jun - 05 Jul - Festivo San Pedro)</option>
                  <option value="28">Semana 28 (06 Jul - 12 Jul - Jornada 42h)</option>
                  <option value="29">Semana 29 (13 Jul - 19 Jul - Festivo Traslado)</option>
                  <option value="30">Semana 30 (20 Jul - 26 Jul - Independencia)</option>
                  <option value="31">Semana 31 (27 Jul - 02 Ago - Fin de Mes)</option>
                  <option value="ALL">Consolidado (Semanas 27 a 31 - Total 5 Semanas)</option>
                </select>
                <span className="text-slate-300 text-[11px] font-medium">
                  {momMetrics.recordCount?.toLocaleString()} colaboradores &bull; {momMetrics.totalWorkedHours?.toLocaleString()} hrs liquidadas
                </span>
              </div>
              <div className="text-[11px] text-emerald-200/90 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span>Ordinarias: <strong>{momMetrics.totalOrdinaryHours?.toLocaleString()} hrs</strong></span>
                <span>Recargos y Extras: <strong className="text-white">{momMetrics.totalSpecial?.current?.toLocaleString()} hrs</strong></span>
                <span>Regla 3er Domingo: <strong className="text-emerald-300">{momMetrics.sundaysPaidCount} con pago recargo</strong> / {momMetrics.sundaysNotPaidCount} compensatorio</span>
              </div>
              {activePayroll?.retiredCount > 0 && (
                <div className="mt-2 bg-amber-950/60 border border-amber-500/50 rounded-lg px-2.5 py-1 flex items-center gap-1.5 text-[11px] text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    Se detectaron <strong>{activePayroll.retiredCount} colaboradores</strong> anteriores/inactivos marcados como <strong>(Retirado)</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>
          {payrollData && (
            <button
              onClick={() => {
                if (window.confirm('¿Deseas retirar el archivo personalizado cargado y volver a los datos oficiales base?')) {
                  localStorage.removeItem('control_turnos_payroll_liquidation');
                  setPayrollData(null);
                  setPayrollFeedback(null);
                }
              }}
              className="text-[11px] text-emerald-300 hover:text-emerald-100 underline shrink-0 cursor-pointer"
            >
              Restablecer archivo personalizado
            </button>
          )}
        </div>
      )}

      {/* 2. EXECUTIVE KPI CARDS WITH REAL WoW VARIATIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Horas Extras (HE) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-amber-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Horas Extras</span>
                <span className="text-[10px] text-amber-700 font-bold">Jornada 42h (CST)</span>
              </div>
            </div>
            {renderWoWBadge(momMetrics.overtime)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.overtime.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>
                {momMetrics.overtime.isBaseline ? 'Semana inicial base' : `Semana Anterior:`}
                <strong>{!momMetrics.overtime.isBaseline ? ` ${momMetrics.overtime.previous} hrs` : ''}</strong>
              </span>
              {!momMetrics.overtime.isBaseline && (
                <span className={momMetrics.overtime.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {momMetrics.overtime.diff > 0 ? `+${momMetrics.overtime.diff} hrs` : `${momMetrics.overtime.diff} hrs`}
                </span>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Extras Diurnas (HED 25%):</span>
              <span className="font-bold text-slate-800">{momMetrics.overtimeDetails?.day || 0}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Extras Nocturnas (HEN 75%):</span>
              <span className="font-bold text-amber-700">{momMetrics.overtimeDetails?.night || 0}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Extras Dom/Fest (100%/150%):</span>
              <span className="font-bold text-amber-900">{momMetrics.overtimeDetails?.sundayTotal || 0}h</span>
            </div>
          </div>
        </div>

        {/* Card 2: Recargo Nocturno (RN) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-indigo-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-indigo-100 text-indigo-800 rounded-xl">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Recargo Nocturno</span>
                <span className="text-[10px] text-indigo-700 font-bold">21:00 a 06:00 (CST)</span>
              </div>
            </div>
            {renderWoWBadge(momMetrics.night)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.night.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>
                {momMetrics.night.isBaseline ? 'Semana inicial base' : `Semana Anterior:`}
                <strong>{!momMetrics.night.isBaseline ? ` ${momMetrics.night.previous} hrs` : ''}</strong>
              </span>
              {!momMetrics.night.isBaseline && (
                <span className={momMetrics.night.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {momMetrics.night.diff > 0 ? `+${momMetrics.night.diff} hrs` : `${momMetrics.night.diff} hrs`}
                </span>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Nocturno Ordinario (RN 35%):</span>
              <span className="font-bold text-slate-800">{momMetrics.nightDetails?.ordinary || 0}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Nocturno Dom/Fest (110%):</span>
              <span className="font-bold text-indigo-700">{momMetrics.nightDetails?.sundayHoliday || 0}h</span>
            </div>
          </div>
        </div>

        {/* Card 3: Dominicales (Regla 3er Domingo) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-purple-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-purple-100 text-purple-800 rounded-xl">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Trabajo Dominical</span>
                <span className="text-[10px] text-purple-700 font-bold">Regla 3er Domingo</span>
              </div>
            </div>
            {renderWoWBadge(momMetrics.sunday)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.sunday.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>
                {momMetrics.sunday.isBaseline ? 'Semana inicial base' : `Semana Anterior:`}
                <strong>{!momMetrics.sunday.isBaseline ? ` ${momMetrics.sunday.previous} hrs` : ''}</strong>
              </span>
              {!momMetrics.sunday.isBaseline && (
                <span className={momMetrics.sunday.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {momMetrics.sunday.diff > 0 ? `+${momMetrics.sunday.diff} hrs` : `${momMetrics.sunday.diff} hrs`}
                </span>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Recargo Diurno (RDD 75%):</span>
              <span className="font-bold text-slate-800">{momMetrics.sundayDetails?.day || 0}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Recargo Nocturno (RND 110%):</span>
              <span className="font-bold text-purple-700">{momMetrics.sundayDetails?.night || 0}h</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold">
              <span>Regla 3er Dom:</span>
              <span>{momMetrics.sundaysPaidCount} con pago &bull; {momMetrics.sundaysNotPaidCount} comp.</span>
            </div>
          </div>
        </div>

        {/* Card 4: Recargos Festivos (RDF / RNF) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Recargos Festivos</span>
                <span className="text-[10px] text-emerald-700 font-bold">RDF 75% &bull; RNF 110%</span>
              </div>
            </div>
            {renderWoWBadge(momMetrics.holiday)}
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{momMetrics.holiday.current} hrs</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
              <span>
                {momMetrics.holiday.isBaseline ? 'Semana inicial base' : `Semana Anterior:`}
                <strong>{!momMetrics.holiday.isBaseline ? ` ${momMetrics.holiday.previous} hrs` : ''}</strong>
              </span>
              {!momMetrics.holiday.isBaseline && (
                <span className={momMetrics.holiday.diff > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {momMetrics.holiday.diff > 0 ? `+${momMetrics.holiday.diff} hrs` : `${momMetrics.holiday.diff} hrs`}
                </span>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Festivo Diurno (RDF 75%):</span>
              <span className="font-bold text-slate-800">{momMetrics.holidayDetails?.day || 0}h</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Festivo Nocturno (RNF 110%):</span>
              <span className="font-bold text-emerald-700">{momMetrics.holidayDetails?.night || 0}h</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate">
              {momMetrics.holidayName}
            </div>
          </div>
        </div>
      </div>

      {/* Total Suplementario Overall Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-5 border border-purple-800/40 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600 p-3 rounded-2xl">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-black text-purple-300 tracking-wider">Total Tiempo Suplementario (Horas Extras + Recargos Nocturnos + Dominicales + Festivos)</div>
            <div className="text-2xl font-black text-white mt-0.5">
              {momMetrics.totalSpecial.current} Horas Liquidadas
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-800/70 p-3 rounded-xl border border-slate-700 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">
              {momMetrics.totalSpecial.isBaseline ? 'Semana Base:' : 'Semana Anterior:'}
            </span>
            <span className="font-black text-slate-200">
              {momMetrics.totalSpecial.isBaseline ? 'Base Inicial' : `${momMetrics.totalSpecial.previous} hrs`}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <div>
            <span className="text-slate-400 block text-[10px]">Variación Neta:</span>
            <span className={momMetrics.totalSpecial.diff > 0 ? 'font-black text-rose-400' : 'font-black text-emerald-400'}>
              {momMetrics.totalSpecial.isBaseline ? '0.0h' : (momMetrics.totalSpecial.diff > 0 ? `+${momMetrics.totalSpecial.diff}h` : `${momMetrics.totalSpecial.diff}h`)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <div>
            {renderWoWBadge(momMetrics.totalSpecial)}
          </div>
        </div>
      </div>

      {/* 3. Sub-View Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveView('MOM_OVERVIEW')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'MOM_OVERVIEW'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Comparativo MoM & Gráficas</span>
        </button>

        <button
          onClick={() => setActiveView('SPECIAL_HOURS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'SPECIAL_HOURS'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Ranking de PDVs ({topPdvsSpecial.length})</span>
        </button>

        <button
          onClick={() => setActiveView('ZONES')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'ZONES'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Consolidado por 15 Zonas</span>
        </button>

        <button
          onClick={() => setActiveView('ALERTS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'ALERTS'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Alertas Operacionales ({operationalAlerts.length})</span>
          {operationalAlerts.length > 0 && (
            <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full">
              {operationalAlerts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveView('MODIFICATIONS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeView === 'MODIFICATIONS'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Solicitudes de Modificación & Causas ({modificationStats.totalRequests})</span>
        </button>
      </div>

      {/* 4. TAB CONTENT: MoM COMPARATIVE CHARTS */}
      {activeView === 'MOM_OVERVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Multi-Month Special Hours Breakdown */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                <span>Evolución Semanal por Tipo de Horas Suplementarias (Semanas 27 a 31)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativo real de Horas Extras, Recargo Nocturno, Dominicales y Festivos en nómina oficial
              </p>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyComparisonChart} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="monthName" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="overtime" name="Horas Extras (42h)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="night" name="Recargo Nocturno" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sunday" name="Dominicales (CST)" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="holiday" name="Festivos (RDF/RNF)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Week by Week Comparison */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Horas Trabajadas Promedio vs Jornada Legal (42h/semana)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Desempeño semanal por colaborador respecto a la jornada ordinaria máxima legal de 42 horas CST
              </p>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyComparison} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="currentMonthReal" name="Promedio Real / Colaborador" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="currentMonthProg" name="Jornada Legal CST (42h)" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: TOP PDVS SPECIAL HOURS */}
      {activeView === 'SPECIAL_HOURS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900">Ranking de Puntos de Venta con Mayor Liquidación de Horas Suplementarias</h3>
              <p className="text-xs text-slate-500">Desglose por concepto y variación porcentual real semana a semana (WoW)</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Punto de Venta</th>
                  <th className="p-3">Ciudad</th>
                  <th className="p-3">Zona / Líder</th>
                  <th className="p-3 text-center">Horas Extras</th>
                  <th className="p-3 text-center">Recargo Nocturno</th>
                  <th className="p-3 text-center">Dominicales (CST)</th>
                  <th className="p-3 text-center">Festivos (RDF/RNF)</th>
                  <th className="p-3 text-center bg-purple-950 text-purple-200">Total Suplementario</th>
                  <th className="p-3 text-center">{selectedPayrollWeek === '27' ? 'Semana Base' : 'Semana Anterior'}</th>
                  <th className="p-3 text-center">Variación WoW</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {topPdvsSpecial.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-semibold">
                      No hay registros cargados para este punto de venta o zona.
                    </td>
                  </tr>
                ) : (
                  topPdvsSpecial.map((p, idx) => (
                    <tr key={p.pdvId} className={`hover:bg-slate-50 transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <span>{p.pdvName}</span>
                      </td>
                      <td className="p-3 text-slate-600 font-semibold">{p.city}</td>
                      <td className="p-3 text-slate-600">{p.supervisorName}</td>
                      <td className="p-3 text-center font-bold text-amber-700">{p.overtimeHours}h</td>
                      <td className="p-3 text-center font-bold text-indigo-700">{p.nightHours}h</td>
                      <td className="p-3 text-center font-bold text-purple-700">{p.sundayHours}h</td>
                      <td className="p-3 text-center font-bold text-emerald-700">{p.holidayHours || 0}h</td>
                      <td className="p-3 text-center font-black text-purple-950 bg-purple-50">{p.totalSpecialHours}h</td>
                      <td className="p-3 text-center text-slate-500 font-semibold">
                        {p.hasPrevWeek ? `${p.prevSpecialHours}h` : 'Línea Base'}
                      </td>
                      <td className="p-3 text-center">
                        {!p.hasPrevWeek ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                            Base
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            p.momChangePct > 0 ? 'bg-rose-100 text-rose-800' : p.momChangePct < 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {p.momChangePct > 0 ? `+${p.momChangePct}%` : `${p.momChangePct}%`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB CONTENT: 15 ZONES RANKING */}
      {activeView === 'ZONES' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900">Consolidado Nacional por Zonas Regionales (15 Zonas)</h3>
              <p className="text-xs text-slate-500">Supervisión regional, horas suplementarias consolidadas y tasa de cumplimiento</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Zona / Líder Regional</th>
                  <th className="p-3 text-center">PDVs</th>
                  <th className="p-3 text-center">Personal</th>
                  <th className="p-3 text-center">Horas Prog.</th>
                  <th className="p-3 text-center">Horas Reales</th>
                  <th className="p-3 text-center bg-purple-950 text-purple-200">Horas Suplementarias</th>
                  <th className="p-3 text-center">{selectedPayrollWeek === '27' ? 'Semana Base' : 'Semana Anterior'}</th>
                  <th className="p-3 text-center">Variación WoW</th>
                  <th className="p-3 text-center">Cumplimiento (42h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {nationalZonesRanking.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 font-semibold">
                      No hay registros cargados.
                    </td>
                  </tr>
                ) : (
                  nationalZonesRanking.map((z, idx) => (
                    <tr key={z.zoneId} className={`hover:bg-slate-50 transition ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <span>{z.zoneName}</span>
                      </td>
                      <td className="p-3 text-center font-bold text-blue-600">{z.pdvCount}</td>
                      <td className="p-3 text-center font-bold text-slate-700">{z.employeeCount}</td>
                      <td className="p-3 text-center font-semibold text-slate-600">{z.scheduledHours}h</td>
                      <td className="p-3 text-center font-semibold text-slate-600">{z.realHours}h</td>
                      <td className="p-3 text-center font-black text-purple-950 bg-purple-50">{z.specialHours}h</td>
                      <td className="p-3 text-center text-slate-500 font-semibold">{selectedPayrollWeek === '27' ? 'Línea Base' : `${z.prevSpecialHours}h`}</td>
                      <td className="p-3 text-center">
                        {selectedPayrollWeek === '27' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                            Base
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            z.momChangePct > 0 ? 'bg-rose-100 text-rose-800' : z.momChangePct < 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {z.momChangePct > 0 ? `+${z.momChangePct}%` : `${z.momChangePct}%`}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${z.complianceRate >= 95 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${z.complianceRate}%` }}
                            ></div>
                          </div>
                          <span className="font-bold text-[11px] text-slate-800">{z.complianceRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. TAB CONTENT: OPERATIONAL ALERTS */}
      {activeView === 'ALERTS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Control de Normativa Laboral & Alertas de Incumplimiento</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Identificación automática de colaboradores que superan la jornada legal de 42h Lunes a Sábado o el límite de 2 domingos trabajados en el mes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {operationalAlerts.map((alt, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-2xl border shadow-xs flex items-start gap-3.5 ${
                  alt.severity === 'HIGH' ? 'bg-rose-50/70 border-rose-300' : 'bg-amber-50/70 border-amber-300'
                }`}
              >
                <div className={`p-2.5 rounded-xl ${alt.severity === 'HIGH' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'}`}>
                  {alt.type === 'SUNDAY_LIMIT_EXCEEDED' ? <Calendar className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                </div>
                <div className="flex-1 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{alt.title}</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      alt.severity === 'HIGH' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                    }`}>
                      {alt.severity === 'HIGH' ? 'BLOQUEANTE' : 'ADVERTENCIA'}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-800">
                    Colaborador: {alt.employeeName} • PDV: {alt.pdvName}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {alt.description}
                  </p>
                </div>
              </div>
            ))}
            {operationalAlerts.length === 0 && (
              <div className="col-span-2 p-8 bg-emerald-50 border border-emerald-200 rounded-2xl text-center text-emerald-800">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                <div className="font-black text-sm">100% Cumplimiento Normativo</div>
                <p className="text-xs text-emerald-700 mt-1">No se detectaron excesos de 42 horas ni sobrecupo dominical en el período evaluado.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. TAB CONTENT: MODIFICATION REQUESTS & REASONS RANKING */}
      {activeView === 'MODIFICATIONS' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                <span>Control de Novedades: Puntos de Venta con Mayor Demanda de Modificaciones y Ranking de Causas</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Identificación de tiendas críticas por volumen de cambios de horario y análisis de causas raíz en las 8 áreas operativas.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-3.5 py-2 text-center">
                <div className="text-[10px] uppercase font-bold text-purple-600">Total Solicitudes</div>
                <div className="text-lg font-black text-purple-950">{modificationStats.totalRequests}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2 text-center">
                <div className="text-[10px] uppercase font-bold text-blue-600">PDVs con Solicitudes</div>
                <div className="text-lg font-black text-blue-950">{modificationStats.topPdvsModifications.length}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Ranking de PDVs con más solicitudes */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <Store className="w-4 h-4 text-purple-600" />
                    <span>PDVs con Mayor Volumen de Modificaciones</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">Tiendas ordenadas por mayor número de solicitudes radicadas</p>
                </div>
                <span className="text-[11px] font-bold text-slate-500">
                  {modificationStats.topPdvsModifications.length} PDVs
                </span>
              </div>

              {modificationStats.topPdvsModifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-60" />
                  <div className="font-bold text-xs text-slate-600">Sin Solicitudes de Modificación</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">No se registran solicitudes de cambio de horario en el período seleccionado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {modificationStats.topPdvsModifications.map((item, idx) => {
                    const maxCount = modificationStats.topPdvsModifications[0]?.count || 1;
                    const pct = Math.round((item.count / maxCount) * 100);
                    return (
                      <div key={item.pdvId} className="p-3 bg-slate-50/70 hover:bg-purple-50/50 rounded-xl border border-slate-200/80 transition space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                              idx === 0 ? 'bg-amber-400 text-slate-950 shadow-xs' :
                              idx === 1 ? 'bg-slate-300 text-slate-800' :
                              idx === 2 ? 'bg-amber-700/20 text-amber-900 font-bold' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="font-bold text-xs text-slate-900">{item.pdvName}</div>
                              <div className="text-[10px] text-slate-400">{item.city}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded-full">
                              {item.count} {item.count === 1 ? 'solicitud' : 'solicitudes'}
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar & Sub-counts */}
                        <div className="space-y-1">
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="text-emerald-600 font-semibold">{item.approved} Aprobadas</span>
                            <span className="text-amber-600 font-semibold">{item.pending} Pendientes</span>
                            <span className="text-rose-600 font-semibold">{item.rejected} Rechazadas</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Ranking de Motivos más repetidos */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-purple-600" />
                    <span>Ranking de Motivos Más Repetidos (8 Áreas)</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">Distribución porcentual por tipología y causal de cambio</p>
                </div>
                <span className="text-[11px] font-bold text-slate-500">
                  8 Tipologías
                </span>
              </div>

              <div className="space-y-3">
                {modificationStats.topMotives.map((item, idx) => {
                  const colors = [
                    { bar: 'bg-purple-600', badge: 'bg-purple-100 text-purple-800' },
                    { bar: 'bg-blue-600', badge: 'bg-blue-100 text-blue-800' },
                    { bar: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800' },
                    { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
                    { bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-800' },
                    { bar: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800' },
                    { bar: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-800' },
                    { bar: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800' }
                  ];
                  const c = colors[idx % colors.length];

                  return (
                    <div key={item.motive} className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-black">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-slate-800">{item.motive}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                            {item.count} ({item.pct}%)
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${c.bar}`}
                          style={{ width: `${Math.max(item.pct, item.count > 0 ? 5 : 0)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
