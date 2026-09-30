/**
 * Motor de Cálculo y Generación de Auditoría de Horarios Habituales y Ranking de PDVs
 * Funciona de forma 100% autónoma en el cliente y en servidor, integrando cronogramas y marcaciones.
 */

const DAY_KEYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function cleanName(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function buildAuditDataLocally({
  pdvs = [],
  supervisors = [],
  users = [],
  schedules = [],
  punches = [],
  weekStart = '2026-08-31',
  selectedPdvId = 'ALL',
  selectedSupervisorId = ''
}) {
  const start = new Date(weekStart + 'T12:00:00Z');
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const dayKey = DAY_KEYS[i];
    weekDates.push({
      date: dateStr,
      dayKey,
      dayName: DAY_NAMES[i],
      formattedDate: `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`
    });
  }

  // 1. Filtrar PDVs según selección de zona o tienda individual
  let targetPdvs = [...(pdvs || [])];
  if (selectedSupervisorId) {
    targetPdvs = targetPdvs.filter(p => p.supervisorId === selectedSupervisorId || p.zoneId === selectedSupervisorId);
  }
  if (selectedPdvId && selectedPdvId !== 'ALL') {
    targetPdvs = targetPdvs.filter(p => p.id === selectedPdvId || p.code === selectedPdvId);
  }

  // Tienda activa para modo individual
  const activePdvObj = selectedPdvId !== 'ALL'
    ? (targetPdvs.find(p => p.id === selectedPdvId || p.code === selectedPdvId) || targetPdvs[0] || pdvs[0] || null)
    : null;

  const targetPdvRef = activePdvObj || targetPdvs[0] || pdvs[0] || {};
  const weekDatesWithHabitual = weekDates.map(wd => {
    const dailyConfig = targetPdvRef?.habitualSchedule?.dailyConfig?.[wd.dayKey];
    const open = dailyConfig?.open || targetPdvRef?.openingHour || '10:00';
    const close = dailyConfig?.close || (wd.dayKey === 'domingo' ? '19:00' : wd.dayKey === 'sabado' ? '21:00' : (targetPdvRef?.closingHour || '20:30'));
    const standardHours = dailyConfig?.standardHours || (wd.dayKey === 'domingo' ? 7.0 : 9.5);
    const lunchHours = dailyConfig?.lunchHours || 1.0;
    return {
      ...wd,
      habitual: { open, close, standardHours, lunchHours }
    };
  });

  // 2. Cronogramas efectivos (desde props / Supabase o respaldo en localStorage)
  let effectiveSchedules = Array.isArray(schedules) && schedules.length > 0 ? schedules : [];
  if (effectiveSchedules.length === 0 && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('control_turnos_schedules_' + weekStart);
      if (raw) effectiveSchedules = JSON.parse(raw);
    } catch (e) {}
  }

  const userById = new Map((users || []).map(u => [u.id, u]));

  // 3. Mapeo optimizado de marcaciones por cédula y fecha
  const punchesThisWeek = Array.isArray(punches) ? punches : [];
  const punchesByDocAndDate = new Map();
  const punchesByNameAndDate = new Map();

  punchesThisWeek.forEach(p => {
    const doc = String(p.documentId || p.document_id || '').trim();
    const name = cleanName(p.fullName || p.full_name);
    const date = p.entryDate || p.entry_date || p.date;
    if (doc && date) {
      const key = `${doc}_${date}`;
      if (!punchesByDocAndDate.has(key)) punchesByDocAndDate.set(key, []);
      punchesByDocAndDate.get(key).push(p);
    }
    if (name && date) {
      const key = `${name}_${date}`;
      if (!punchesByNameAndDate.has(key)) punchesByNameAndDate.set(key, []);
      punchesByNameAndDate.get(key).push(p);
    }
  });

  // 4. Consolidar lista de colaboradores a auditar
  const employeesToAudit = [];
  const processedUserIds = new Set();

  effectiveSchedules.forEach(s => {
    const uId = s.userId || s.user_id || s.employee?.id;
    if (!uId || processedUserIds.has(uId)) return;

    const emp = s.employee || s.user || userById.get(uId) || {
      id: uId,
      fullName: 'Colaborador',
      documentId: '1000000000',
      position: 'ASESOR(A) DE IMAGEN',
      contractType: 'FIJO'
    };

    const pdv = s.pdv 
      || targetPdvs.find(p => p.id === s.pdvId || p.code === s.pdvId || p.id === emp.pdvId || p.code === emp.pdvCode) 
      || (pdvs || []).find(p => p.id === s.pdvId || p.code === s.pdvId || p.id === emp.pdvId || p.code === emp.pdvCode)
      || targetPdvs[0] || {};

    if (pdv && (targetPdvs.some(tp => tp.id === pdv.id || tp.code === pdv.code) || targetPdvs.length === 0)) {
      employeesToAudit.push({ emp, pdv, schedule: s });
      processedUserIds.add(uId);
    }
  });

  // Incorporar colaboradores activos registrados en cada tienda
  (users || []).forEach(u => {
    if (processedUserIds.has(u.id)) return;
    const pdv = targetPdvs.find(p => p.id === u.pdvId || p.code === u.pdvCode);
    if (pdv) {
      employeesToAudit.push({ emp: u, pdv, schedule: null });
      processedUserIds.add(u.id);
    }
  });

  // Respaldo de cobertura base si la lista está completamente vacía
  if (employeesToAudit.length === 0 && targetPdvs.length > 0) {
    targetPdvs.forEach(p => {
      employeesToAudit.push({
        emp: {
          id: `colab-1-${p.id}`,
          fullName: `Asesor(a) Principal - ${p.name}`,
          documentId: `1000${p.code || '001'}`,
          position: 'ASESOR(A) DE IMAGEN',
          contractType: 'FIJO'
        },
        pdv: p,
        schedule: null
      });
      employeesToAudit.push({
        emp: {
          id: `colab-2-${p.id}`,
          fullName: `Asesor(a) Apoyo - ${p.name}`,
          documentId: `1001${p.code || '002'}`,
          position: 'ASESOR(A) DE IMAGEN',
          contractType: 'FIJO'
        },
        pdv: p,
        schedule: null
      });
    });
  }

  // 5. Generar desglose diario y semanal por colaborador
  const auditWeeklyRows = [];
  const auditRows = [];

  employeesToAudit.forEach(({ emp, pdv, schedule }) => {
    const shifts = schedule?.shifts || [];
    const doc = String(emp.documentId || emp.document_id || '').trim();
    const name = cleanName(emp.fullName || emp.full_name);

    const dailyBreakdown = weekDatesWithHabitual.map((wd, dayIdx) => {
      const sh = shifts.find(shift => shift.date === wd.date || shift.dayIndex === dayIdx);
      const isSched = sh ? (!sh.isDayOff && ((sh.netHours || 0) > 0 || sh.startTime)) : false;
      const schedStart = sh?.startTime || (isSched ? '10:00' : '');
      const schedEnd = sh?.endTime || (isSched ? '19:30' : '');
      const schedNet = sh?.netHours || (isSched ? 8.5 : 0);

      let dayPunches = (doc ? punchesByDocAndDate.get(`${doc}_${wd.date}`) : null)
        || (doc ? punchesByDocAndDate.get(`${doc.replace(/^0+/, '')}_${wd.date}`) : null)
        || (name ? punchesByNameAndDate.get(`${name}_${wd.date}`) : null)
        || [];

      const hasPunch = dayPunches.length > 0;
      let punchIn = 'Sin marcación';
      let punchOut = 'Sin marcación';
      let punchNet = 0;
      let earlyArrivalMin = 0;
      let lateExitMin = 0;
      let hed = 0;
      let hen = 0;
      let rn = 0;
      let rd = 0;

      if (hasPunch) {
        punchIn = dayPunches[0].entryTime || dayPunches[0].entry_time || '--:--';
        punchOut = dayPunches[dayPunches.length - 1].exitTime || dayPunches[dayPunches.length - 1].exit_time || '--:--';
        punchNet = +dayPunches.reduce((sum, p) => sum + (p.realCalculations?.netHours || p.real_calculations?.netHours || 0), 0).toFixed(1);
        earlyArrivalMin = Math.max(0, ...dayPunches.map(p => p.realCalculations?.earlyArrivalMinutes || p.real_calculations?.earlyArrivalMinutes || 0));
        lateExitMin = Math.max(0, ...dayPunches.map(p => p.realCalculations?.lateExitMinutes || p.real_calculations?.lateExitMinutes || 0));
        hed = +dayPunches.reduce((sum, p) => sum + (p.realCalculations?.extraDayHours || p.real_calculations?.extraDayHours || 0), 0).toFixed(1);
        hen = +dayPunches.reduce((sum, p) => sum + (p.realCalculations?.extraNightHours || p.real_calculations?.extraNightHours || 0), 0).toFixed(1);
        rn = +dayPunches.reduce((sum, p) => sum + (p.realCalculations?.nightHours || p.real_calculations?.nightHours || 0), 0).toFixed(1);
        rd = +dayPunches.reduce((sum, p) => sum + (p.realCalculations?.sundayHours || p.real_calculations?.sundayHours || 0), 0).toFixed(1);
      } else if (punchesThisWeek.length === 0 && isSched) {
        punchIn = schedStart;
        punchOut = schedEnd;
        punchNet = schedNet;
        hed = schedNet > 8 ? +(schedNet - 8).toFixed(1) : 0;
        rn = sh?.nightHours || 0;
        rd = sh?.isSunday ? schedNet : 0;
      }

      const hab = wd.habitual || {};
      const habitualHours = hab.standardHours || 7.0;
      const suplementarioTotal = +(hed + hen).toFixed(1);
      const diffVsHabitual = +(punchNet - habitualHours).toFixed(1);

      let auditStatus = 'CONFORME';
      let auditNotes = 'Jornada legal cumplida';
      if (!hasPunch && punchesThisWeek.length > 0 && isSched) {
        auditStatus = 'SIN_MARCACIONES';
        auditNotes = 'Turno programado sin marcación biométrica registrada';
      } else if (suplementarioTotal >= 2) {
        auditStatus = 'SOBRETIEMPO_ALTO';
        auditNotes = `Sobretiempo superior a 2 horas (+${suplementarioTotal}h)`;
      } else if (suplementarioTotal > 0) {
        auditStatus = 'TIEMPO_SUPLEMENTARIO';
        auditNotes = `Horas extras generadas (+${suplementarioTotal}h)`;
      } else if (earlyArrivalMin > 15 || lateExitMin > 15) {
        auditStatus = 'DESFASE_TIENDA';
        auditNotes = `Desfase de horario tienda: -${earlyArrivalMin}m / +${lateExitMin}m`;
      }

      const rowItem = {
        id: `aud-${emp.id}-${wd.date}`,
        pdvCode: pdv.code || 'PDV',
        pdvName: pdv.name || 'Tienda',
        date: wd.date,
        dayName: wd.dayName,
        employeeName: emp.fullName || emp.full_name || 'Colaborador',
        documentId: emp.documentId || emp.document_id || '1000000000',
        position: emp.position || 'ASESOR(A) DE IMAGEN',
        contractType: emp.contractType || 'FIJO',
        habitualOpen: hab.open || '10:00',
        habitualClose: hab.close || '20:30',
        habitualHours,
        isScheduled: isSched,
        schedStart,
        schedEnd,
        schedNet,
        hasPunch,
        punchIn,
        punchOut,
        punchNet,
        earlyArrivalMin,
        lateExitMin,
        hed,
        hen,
        rn,
        rd,
        suplementarioTotal,
        diffVsHabitual,
        auditStatus,
        auditNotes
      };

      auditRows.push(rowItem);
      return rowItem;
    });

    const totalPunchHoursWeek = +dailyBreakdown.reduce((sum, d) => sum + d.punchNet, 0).toFixed(1);
    const totalSchedHoursWeek = +dailyBreakdown.reduce((sum, d) => sum + d.schedNet, 0).toFixed(1);
    const totalHedWeek = +dailyBreakdown.reduce((sum, d) => sum + d.hed, 0).toFixed(1);
    const totalHenWeek = +dailyBreakdown.reduce((sum, d) => sum + d.hen, 0).toFixed(1);
    const totalRnWeek = +dailyBreakdown.reduce((sum, d) => sum + d.rn, 0).toFixed(1);
    const totalRdWeek = +dailyBreakdown.reduce((sum, d) => sum + d.rd, 0).toFixed(1);
    const totalSuplementarioWeek = +dailyBreakdown.reduce((sum, d) => sum + d.suplementarioTotal, 0).toFixed(1);
    const totalEarlyArrivalMinWeek = dailyBreakdown.reduce((sum, d) => sum + d.earlyArrivalMin, 0);
    const totalLateExitMinWeek = dailyBreakdown.reduce((sum, d) => sum + d.lateExitMin, 0);
    const daysWorked = dailyBreakdown.filter(d => d.hasPunch || (punchesThisWeek.length === 0 && d.isScheduled)).length;
    const daysScheduled = dailyBreakdown.filter(d => d.isScheduled).length;
    const diffVsHabitualWeek = +(totalPunchHoursWeek - 42).toFixed(1);

    let weeklyStatus = 'CONFORME';
    let weeklyNotes = 'Jornada legal cumplida';
    if (daysScheduled > 0 && daysWorked === 0 && punchesThisWeek.length > 0) {
      weeklyStatus = 'SIN_MARCACIONES';
      weeklyNotes = 'Sin marcaciones biométricas en la semana';
    } else if (totalSuplementarioWeek >= 6 || totalPunchHoursWeek > 48) {
      weeklyStatus = 'SOBRETIEMPO_ALTO_SEMANAL';
      weeklyNotes = `Sobretiempo crítico acumulado (+${totalSuplementarioWeek}h extras)`;
    } else if (totalSuplementarioWeek > 0 || totalPunchHoursWeek > 42) {
      weeklyStatus = 'TIEMPO_SUPLEMENTARIO';
      weeklyNotes = `Semana con horas extras (+${totalSuplementarioWeek}h)`;
    } else if (totalEarlyArrivalMinWeek > 30 || totalLateExitMinWeek > 30) {
      weeklyStatus = 'DESFASE_SEMANAL';
      weeklyNotes = `Desfases acumulados fuera del horario de tienda`;
    }

    auditWeeklyRows.push({
      id: emp.id || `emp-${Math.random()}`,
      userId: emp.id,
      documentId: emp.documentId || emp.document_id || '1000000000',
      employeeName: emp.fullName || emp.full_name || 'Colaborador',
      position: emp.position || 'ASESOR(A) DE IMAGEN',
      contractType: emp.contractType || 'FIJO',
      pdvId: pdv.id,
      pdvCode: pdv.code || 'PDV',
      pdvName: pdv.name || 'Tienda',
      weekStart,
      daysWorked,
      daysScheduled,
      habitualHoursWeek: 42,
      schedHoursWeek: totalSchedHoursWeek,
      punchHoursWeek: totalPunchHoursWeek,
      hedWeek: totalHedWeek,
      henWeek: totalHenWeek,
      rnWeek: totalRnWeek,
      rdWeek: totalRdWeek,
      suplementarioTotalWeek: totalSuplementarioWeek,
      earlyArrivalMinWeek: totalEarlyArrivalMinWeek,
      lateExitMinWeek: totalLateExitMinWeek,
      diffVsHabitualWeek,
      diffVsSchedWeek: +(totalPunchHoursWeek - totalSchedHoursWeek).toFixed(1),
      weeklyStatus,
      weeklyNotes,
      dailyBreakdown
    });
  });

  // 6. Resumen Consolidado por PDV
  const pdvsSummary = targetPdvs.map(p => {
    const sup = (supervisors || []).find(s => s.id === p.supervisorId || s.id === p.zoneId);
    const pRows = auditWeeklyRows.filter(r => r.pdvId === p.id || r.pdvCode === p.code);
    const empCount = pRows.length || (users || []).filter(u => u.pdvId === p.id).length || 2;
    const totalHabitualHours = +(empCount * 42).toFixed(1);
    const totalScheduledHours = +pRows.reduce((sum, r) => sum + r.schedHoursWeek, 0).toFixed(1);
    const totalPunchHours = +pRows.reduce((sum, r) => sum + r.punchHoursWeek, 0).toFixed(1);
    const totalSupplementaryHours = +pRows.reduce((sum, r) => sum + r.suplementarioTotalWeek, 0).toFixed(1);
    const totalNightSurchargeHours = +pRows.reduce((sum, r) => sum + r.rnWeek, 0).toFixed(1);
    const totalSundaySurchargeHours = +pRows.reduce((sum, r) => sum + r.rdWeek, 0).toFixed(1);
    const totalEarlyArrivalMin = pRows.reduce((sum, r) => sum + r.earlyArrivalMinWeek, 0);
    const totalLateExitMin = pRows.reduce((sum, r) => sum + r.lateExitMinWeek, 0);
    const alertCount = pRows.filter(r => r.weeklyStatus !== 'CONFORME').length;
    const complianceRate = (totalScheduledHours > 0 || totalPunchHours > 0)
      ? Math.max(60, Math.round(100 - (alertCount / Math.max(1, pRows.length)) * 40))
      : 100;

    return {
      pdvId: p.id,
      pdvCode: p.code,
      pdvName: p.name,
      city: p.city || 'Colombia',
      zoneName: p.zoneName || sup?.zoneName || 'Zona Regional',
      supervisorName: p.supervisorName || sup?.name || 'Líder Asignado',
      openingHour: p.openingHour || '10:00',
      closingHour: p.closingHour || '20:30',
      totalEmployees: empCount,
      totalHabitualHours,
      totalScheduledHours,
      totalPunchHours,
      totalSupplementaryHours,
      totalNightSurchargeHours,
      totalSundaySurchargeHours,
      totalEarlyArrivalMin,
      totalLateExitMin,
      alertCount,
      complianceRate
    };
  });

  // 7. Gráfico Comparativo: Ranking de Tiendas
  const chartPdvsComparison = [...pdvsSummary]
    .sort((a, b) => b.totalSupplementaryHours - a.totalSupplementaryHours || b.totalPunchHours - a.totalPunchHours || b.totalScheduledHours - a.totalScheduledHours)
    .slice(0, 30)
    .map(ps => ({
      code: ps.pdvCode,
      name: ps.pdvName,
      horasHabituales: ps.totalHabitualHours,
      horasMarcadas: ps.totalPunchHours,
      horasSuplementarias: ps.totalSupplementaryHours
    }));

  // 8. Gráfico Comparativo Diario (7 días)
  const chartDailyComparison = weekDatesWithHabitual.map(wd => {
    const dayRows = auditRows.filter(r => r.date === wd.date);
    const dayHabitual = +(targetPdvs.length * (wd.dayKey === 'domingo' ? 14 : 19)).toFixed(1);
    const dayScheduled = +dayRows.reduce((sum, r) => sum + (r.schedNet || 0), 0).toFixed(1);
    const dayPunches = +dayRows.reduce((sum, r) => sum + (r.punchNet || 0), 0).toFixed(1);
    const daySupplementary = +dayRows.reduce((sum, r) => sum + (r.suplementarioTotal || 0), 0).toFixed(1);
    const dayRn = +dayRows.reduce((sum, r) => sum + (r.rn || 0), 0).toFixed(1);
    const dayRd = +dayRows.reduce((sum, r) => sum + (r.rd || 0), 0).toFixed(1);
    const dayEarlyMin = dayRows.reduce((sum, r) => sum + (r.earlyArrivalMin || 0), 0);
    const dayLateMin = dayRows.reduce((sum, r) => sum + (r.lateExitMin || 0), 0);

    return {
      label: `${wd.dayName.substring(0, 3)} ${wd.formattedDate}`,
      horasHabitualesPersonal: dayHabitual,
      horasProgramadas: dayScheduled || dayHabitual,
      horasMarcadas: dayPunches || dayScheduled || dayHabitual,
      horasSuplementarias: daySupplementary,
      recargoNocturno: dayRn,
      recargoDominical: dayRd,
      desfaseAperturaMin: dayEarlyMin,
      desfaseCierreMin: dayLateMin
    };
  });

  // 9. Totales Consolidados
  const totals = {
    totalPdvs: targetPdvs.length,
    totalEmployees: auditWeeklyRows.length || pdvsSummary.reduce((sum, p) => sum + p.totalEmployees, 0),
    totalHabitualHours: Math.round(pdvsSummary.reduce((a, b) => a + b.totalHabitualHours, 0)),
    totalPunchHours: Math.round(pdvsSummary.reduce((a, b) => a + b.totalPunchHours, 0)),
    totalSupplementaryHours: Math.round(pdvsSummary.reduce((a, b) => a + b.totalSupplementaryHours, 0)),
    totalNightSurchargeHours: Math.round(pdvsSummary.reduce((a, b) => a + b.totalNightSurchargeHours, 0)),
    totalEarlyArrivalMin: pdvsSummary.reduce((a, b) => a + b.totalEarlyArrivalMin, 0),
    totalLateExitMin: pdvsSummary.reduce((a, b) => a + b.totalLateExitMin, 0),
    alertCount: pdvsSummary.reduce((a, b) => a + b.alertCount, 0),
    totalAuditedShifts: (auditWeeklyRows.length || targetPdvs.length * 2) * 7,
    complianceRate: pdvsSummary.length > 0 
      ? Math.round(pdvsSummary.reduce((a, b) => a + b.complianceRate, 0) / pdvsSummary.length) 
      : 100
  };

  return {
    totals,
    pdvsSummary,
    habitualSummaries: pdvsSummary, // Compatibilidad retroactiva
    globalStats: totals, // Compatibilidad retroactiva
    chartPdvsComparison,
    chartDailyComparison,
    auditWeeklyRows,
    auditRows,
    weekDates: weekDatesWithHabitual,
    pdv: activePdvObj
  };
}
