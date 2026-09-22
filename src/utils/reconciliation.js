import { timeToMinutes } from './calculator.js';

export function runReconciliation({ users = [], pdvs = [], supervisors = [], allSchedules = [], allPunches = [], config = {}, weekStart, weekEnd, pdvId, supervisorId, documentId }) {
  const lateTolerance = config.lateToleranceMinutes || config.late_tolerance_minutes || 10;
  const earlyTolerance = config.earlyExitToleranceMinutes || config.early_exit_tolerance_minutes || 10;

  // Filter employees
  let targetEmployees = users.filter(u => u.role === 'EMPLOYEE');
  if (pdvId) targetEmployees = targetEmployees.filter(u => u.pdvId === pdvId || u.pdv_id === pdvId);
  if (supervisorId) {
    const supervisorPdvIds = new Set(pdvs.filter(p => p.supervisorId === supervisorId || p.supervisor_id === supervisorId).map(p => p.id));
    targetEmployees = targetEmployees.filter(u => u.supervisorId === supervisorId || u.supervisor_id === supervisorId || supervisorPdvIds.has(u.pdvId || u.pdv_id));
  }
  if (documentId) targetEmployees = targetEmployees.filter(u => String(u.documentId || u.document_id).trim() === String(documentId).trim());

  const comparisonRows = [];

  // Generate date list for the week (7 days)
  const dates = [];
  if (weekStart) {
    const start = new Date(weekStart + 'T12:00:00Z');
    for (let i = 0; i < 7; i++) {
      const cur = new Date(start.getTime() + i * 86400000);
      dates.push(cur.toISOString().split('T')[0]);
    }
  }

  // Iterate over each employee
  for (const emp of targetEmployees) {
    const empPdvId = emp.pdvId || emp.pdv_id;
    const empSupId = emp.supervisorId || emp.supervisor_id;
    const empDoc = emp.documentId || emp.document_id;
    const empPdv = pdvs.find(p => p.id === empPdvId);
    const empSup = supervisors.find(s => s.id === (empSupId || empPdv?.supervisorId || empPdv?.supervisor_id));
    
    // Find employee's schedule for this week
    const empSchedule = allSchedules.find(s => (s.userId === emp.id || s.user_id === emp.id) && (!weekStart || s.weekStart === weekStart || s.week_start === weekStart));
    const shiftsByDate = {};
    if (empSchedule && empSchedule.shifts) {
      empSchedule.shifts.forEach(sh => {
        shiftsByDate[sh.date] = sh;
      });
    }

    // Get all punches for this employee
    const empPunches = allPunches.filter(p => (empDoc && String(p.documentId || p.document_id).trim() === String(empDoc).trim()) || (emp.code && String(p.code).trim() === String(emp.code).trim()));
    const punchesByDate = {};
    empPunches.forEach(p => {
      const pEntryDate = p.entryDate || p.entry_date;
      if (pEntryDate) {
        if (!punchesByDate[pEntryDate]) punchesByDate[pEntryDate] = [];
        punchesByDate[pEntryDate].push(p);
      }
    });

    if (!empSchedule && empPunches.length === 0) continue;

    const targetDates = dates.length > 0 ? dates : Array.from(new Set([...Object.keys(shiftsByDate), ...Object.keys(punchesByDate)])).sort();

    for (const date of targetDates) {
      const shift = shiftsByDate[date];
      const dayPunches = punchesByDate[date] || [];
      const primaryPunch = dayPunches[0] || null;

      const dateObj = new Date(date + 'T12:00:00Z');
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const dayName = dayNames[dateObj.getUTCDay()];

      // Scheduled Values
      const isScheduled = !!shift && !shift.isDayOff;
      const scheduledStart = isScheduled ? (shift.startTime || '') : '';
      const scheduledEnd = isScheduled ? (shift.endTime || '') : '';
      const scheduledNetHours = isScheduled ? (shift.netHours || 0) : 0;
      const scheduledLunchHours = isScheduled ? (shift.lunchHours || 0) : 0;
      const hasPermission = isScheduled && !!shift.hasApprovedPermission;
      const permissionNote = shift?.permissionReason || '';

      // Real Punch Values
      const punchEntryTime = primaryPunch?.entryTime || primaryPunch?.entry_time;
      const punchExitTime = primaryPunch?.exitTime || primaryPunch?.exit_time;
      const punchCalcs = primaryPunch?.realCalculations || primaryPunch?.real_calculations;

      const hasPunch = !!primaryPunch && !!punchEntryTime;
      const realStart = hasPunch ? punchEntryTime.substring(0, 5) : '';
      const realEnd = hasPunch && punchExitTime ? punchExitTime.substring(0, 5) : '';
      const realNetHours = hasPunch ? (punchCalcs?.netHours || 0) : 0;
      const realLunchHours = hasPunch ? (punchCalcs?.lunchHours || 0) : 0;
      const realLunchReason = hasPunch ? (punchCalcs?.lunchReason || '') : '';

      // Discrepancy Analysis
      let status = 'OK_MATCH';
      let statusLabel = 'Conforme';
      let statusColor = 'green';
      let issues = [];

      let entryDiffMinutes = 0;
      let exitDiffMinutes = 0;
      let hoursDiff = +(realNetHours - scheduledNetHours).toFixed(2);

      if (isScheduled && !hasPunch) {
        status = 'ABSENT';
        statusLabel = 'Ausencia (Sin Marcación)';
        statusColor = 'red';
        issues.push('Turno programado pero no se registra marcación en reloj biométrico.');
      } else if (!isScheduled && hasPunch) {
        status = 'UNSCHEDULED_WORK';
        statusLabel = 'Marcación No Programada / Descanso Laborado';
        statusColor = 'purple';
        issues.push('El colaborador laboró sin tener turno programado o en su día de descanso.');
      } else if (!isScheduled && !hasPunch) {
        status = 'DAY_OFF';
        statusLabel = 'Día de Descanso';
        statusColor = 'gray';
      } else if (isScheduled && hasPunch) {
        const schedStartMin = timeToMinutes(scheduledStart);
        const schedEndMin = timeToMinutes(scheduledEnd);
        const realStartMin = timeToMinutes(realStart);
        const realEndMin = realEnd ? timeToMinutes(realEnd) : null;

        entryDiffMinutes = realStartMin - schedStartMin;
        if (entryDiffMinutes > lateTolerance) {
          issues.push(`Llegada tarde: +${entryDiffMinutes} min de retraso.`);
        } else if (entryDiffMinutes < -15) {
          issues.push(`Ingreso anticipado: ${Math.abs(entryDiffMinutes)} min antes.`);
        }

        if (realEndMin !== null) {
          exitDiffMinutes = realEndMin - schedEndMin;
          if (exitDiffMinutes < -earlyTolerance) {
            issues.push(`Salida anticipada: ${Math.abs(exitDiffMinutes)} min antes de la hora.`);
          } else if (exitDiffMinutes > 15) {
            issues.push(`Salida posterior: +${exitDiffMinutes} min adicionales.`);
          }
        } else {
          issues.push('Falta marcación de salida.');
        }

        if (issues.length === 0) {
          status = 'OK_MATCH';
          statusLabel = 'Cumplimiento Exacto';
          statusColor = 'green';
        } else if (entryDiffMinutes > lateTolerance) {
          status = 'LATE_ARRIVAL';
          statusLabel = `Llegada Tarde (+${entryDiffMinutes}m)`;
          statusColor = 'yellow';
        } else if (exitDiffMinutes < -earlyTolerance) {
          status = 'EARLY_DEPARTURE';
          statusLabel = `Salida Anticipada (${exitDiffMinutes}m)`;
          statusColor = 'orange';
        } else if (hoursDiff > 0.5) {
          status = 'OVERTIME';
          statusLabel = `Tiempo Adicional (+${hoursDiff}h)`;
          statusColor = 'blue';
        } else {
          status = 'VARIANCE';
          statusLabel = 'Novedad de Horario';
          statusColor = 'amber';
        }
      }

      comparisonRows.push({
        id: `${emp.id}-${date}`,
        userId: emp.id,
        userCode: emp.code,
        documentId: empDoc,
        fullName: emp.fullName || emp.full_name,
        position: emp.position,
        pdvId: empPdvId || 'pdv-unassigned',
        pdvName: empPdv ? empPdv.name : 'Sin PDV',
        pdvCity: empPdv ? empPdv.city : '',
        supervisorId: empSup?.id || '',
        supervisorName: empSup ? empSup.name : (empPdv?.supervisorName || empPdv?.supervisor_name || 'Sin supervisor'),
        date,
        dayName,
        isScheduled,
        scheduledStart,
        scheduledEnd,
        scheduledNetHours,
        scheduledLunchHours,
        hasPermission,
        permissionNote,
        hasPunch,
        realStart,
        realEnd,
        realNetHours,
        realLunchHours,
        realLunchReason,
        entryDiffMinutes,
        exitDiffMinutes,
        hoursDiff,
        status,
        statusLabel,
        statusColor,
        issues,
        correctionRequested: !!shift?.correctionRequested,
        correctionReason: shift?.correctionReason || '',
        correctionStatus: shift?.correctionStatus || 'NONE',
        correctionRequestedAt: shift?.correctionRequestedAt || null,
        correctionRequestedBy: shift?.correctionRequestedBy || null,
        employeeCorrectionNotes: shift?.employeeCorrectionNotes || '',
        correctedAt: shift?.correctedAt || null
      });
    }
  }

  // Group by PDV to produce PDV-level Summaries
  const pdvMap = {};
  pdvs.forEach(p => {
    pdvMap[p.id] = {
      pdvId: p.id,
      pdvCode: p.code,
      pdvName: p.name,
      city: p.city,
      supervisorName: p.supervisorName || p.supervisor_name,
      employeeCount: 0,
      scheduledHours: 0,
      realHours: 0,
      hoursDiff: 0,
      exactCount: 0,
      lateCount: 0,
      earlyCount: 0,
      absenceCount: 0,
      unscheduledCount: 0,
      permissionCount: 0,
      rows: []
    };
  });

  comparisonRows.forEach(row => {
    if (!pdvMap[row.pdvId]) {
      pdvMap[row.pdvId] = {
        pdvId: row.pdvId,
        pdvCode: 'PDV-VAR',
        pdvName: row.pdvName,
        city: row.pdvCity || '',
        supervisorName: row.supervisorName,
        employeeCount: 0,
        scheduledHours: 0,
        realHours: 0,
        hoursDiff: 0,
        exactCount: 0,
        lateCount: 0,
        earlyCount: 0,
        absenceCount: 0,
        unscheduledCount: 0,
        permissionCount: 0,
        rows: []
      };
    }

    const group = pdvMap[row.pdvId];
    group.rows.push(row);
    group.scheduledHours += row.scheduledNetHours;
    group.realHours += row.realNetHours;
    if (row.status === 'OK_MATCH') group.exactCount++;
    if (row.status === 'LATE_ARRIVAL') group.lateCount++;
    if (row.status === 'EARLY_DEPARTURE') group.earlyCount++;
    if (row.status === 'ABSENT') group.absenceCount++;
    if (row.status === 'UNSCHEDULED_WORK') group.unscheduledCount++;
    if (row.hasPermission) group.permissionCount++;
  });

  const pdvSummaries = Object.values(pdvMap)
    .filter(g => {
      if (pdvId && g.pdvId !== pdvId) return false;
      if (supervisorId && g.supervisorId !== supervisorId) return false;
      return g.rows.length > 0;
    })
    .map(g => {
      const distinctUsers = new Set(g.rows.map(r => r.userId));
      return {
        ...g,
        employeeCount: distinctUsers.size,
        scheduledHours: +g.scheduledHours.toFixed(2),
        realHours: +g.realHours.toFixed(2),
        hoursDiff: +(g.realHours - g.scheduledHours).toFixed(2),
        complianceRate: g.rows.length > 0 ? Math.round((g.exactCount / g.rows.length) * 100) : 100
      };
    });

  const totalScheduledHours = +comparisonRows.reduce((sum, r) => sum + r.scheduledNetHours, 0).toFixed(2);
  const totalRealHours = +comparisonRows.reduce((sum, r) => sum + r.realNetHours, 0).toFixed(2);
  const totalHoursDifference = +(totalRealHours - totalScheduledHours).toFixed(2);

  const stats = {
    totalRows: comparisonRows.length,
    pdvCount: pdvSummaries.length,
    exactMatches: comparisonRows.filter(r => r.status === 'OK_MATCH').length,
    lateArrivals: comparisonRows.filter(r => r.status === 'LATE_ARRIVAL').length,
    earlyDepartures: comparisonRows.filter(r => r.status === 'EARLY_DEPARTURE').length,
    absences: comparisonRows.filter(r => r.status === 'ABSENT').length,
    unscheduledPunches: comparisonRows.filter(r => r.status === 'UNSCHEDULED_WORK').length,
    permissionsApproved: comparisonRows.filter(r => r.hasPermission).length,
    totalScheduledHours,
    totalRealHours,
    totalHoursDifference
  };

  return { stats, pdvSummaries, rows: comparisonRows };
}
