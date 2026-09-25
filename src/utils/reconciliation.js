import { timeToMinutes } from './calculator.js';

function cleanName(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

export function runReconciliation({
  users = [],
  pdvs = [],
  supervisors = [],
  allSchedules = [],
  allPunches = [],
  config = {},
  weekStart,
  weekEnd,
  pdvId,
  supervisorId,
  documentId
}) {
  const lateTolerance = config.lateToleranceMinutes || config.late_tolerance_minutes || 10;
  const earlyTolerance = config.earlyExitToleranceMinutes || config.early_exit_tolerance_minutes || 10;

  // 1. Build lookup maps for users
  const userById = new Map(users.map(u => [u.id, u]));
  const userByDoc = new Map(users.map(u => [String(u.documentId || u.document_id).trim(), u]));
  const userByName = new Map(users.map(u => [cleanName(u.fullName || u.full_name), u]));

  // Schedules for this week
  const schedulesThisWeek = allSchedules.filter(s => !weekStart || s.weekStart === weekStart || s.week_start === weekStart);
  const schedByUserId = new Map(schedulesThisWeek.map(s => [s.userId || s.user_id, s]));

  // Supervisor by name lookup
  const supByName = new Map(supervisors.map(s => [cleanName(s.name), s]));
  const pdvByName = new Map(pdvs.map(p => [cleanName(p.name), p]));

  // 2. Intelligent Mapping of Punch Records
  // Check for document ID match first, then fallback to name matching (recovering document typos)
  const punchDocMap = new Map(); // punchDoc -> { user, typoMatch }
  const uniquePunchDocs = Array.from(new Set(allPunches.map(p => String(p.documentId || p.document_id).trim()))).filter(Boolean);

  const typoMatches = [];
  const unscheduledDocs = [];

  uniquePunchDocs.forEach(pDoc => {
    let matchedUser = userByDoc.get(pDoc) || userByDoc.get(pDoc.replace(/^0+/, ''));
    let typoInfo = null;

    if (!matchedUser) {
      const punchSample = allPunches.find(p => String(p.documentId || p.document_id).trim() === pDoc);
      const pName = cleanName(punchSample?.fullName || punchSample?.full_name);

      if (pName && userByName.has(pName)) {
        matchedUser = userByName.get(pName);
        typoInfo = {
          punchDoc: pDoc,
          schedDoc: matchedUser.documentId || matchedUser.document_id,
          fullName: matchedUser.fullName || matchedUser.full_name,
          reason: 'Coincidencia exacta de nombre'
        };
      } else if (pName) {
        // Token overlap matching
        const pTokens = pName.split(/\s+/).filter(Boolean);
        for (const [uName, cand] of userByName.entries()) {
          const uTokens = uName.split(/\s+/).filter(Boolean);
          const common = uTokens.filter(t => pTokens.includes(t));
          if (common.length >= 2 && (common.length === uTokens.length || common.length >= pTokens.length - 1)) {
            matchedUser = cand;
            typoInfo = {
              punchDoc: pDoc,
              schedDoc: cand.documentId || cand.document_id,
              fullName: cand.fullName || cand.full_name,
              reason: 'Coincidencia por nombres y apellidos'
            };
            break;
          }
        }
      }
    }

    if (matchedUser) {
      punchDocMap.set(pDoc, { user: matchedUser, typoInfo });
      if (typoInfo) typoMatches.push(typoInfo);
    } else {
      unscheduledDocs.push(pDoc);
    }
  });

  // 3. Create Synthetic Users for Unscheduled Punches
  const unscheduledEmployees = unscheduledDocs.map(pDoc => {
    const punchList = allPunches.filter(p => String(p.documentId || p.document_id).trim() === pDoc);
    const pFirst = punchList[0];
    const supObj = pFirst?.supervisorName ? supByName.get(cleanName(pFirst.supervisorName)) : null;
    const pdvObj = pFirst?.pdvName ? pdvByName.get(cleanName(pFirst.pdvName)) : null;

    return {
      id: `unscheduled-${pDoc}`,
      documentId: pDoc,
      document_id: pDoc,
      code: pFirst?.code || `COD-${pDoc.slice(-4)}`,
      fullName: pFirst?.fullName || 'Colaborador Sin Programar',
      full_name: pFirst?.fullName || 'Colaborador Sin Programar',
      position: pFirst?.position || 'Colaborador No Programado',
      pdvId: pdvObj?.id || pFirst?.pdvId || 'pdv-unassigned',
      pdv_id: pdvObj?.id || pFirst?.pdvId || 'pdv-unassigned',
      pdvName: pFirst?.pdvName || pdvObj?.name || 'Sin PDV (Fuera de Malla)',
      supervisorName: pFirst?.supervisorName || supObj?.name || 'Sin supervisor',
      supervisorId: supObj?.id || pFirst?.supervisorId || '',
      role: 'EMPLOYEE',
      isUnscheduledWorker: true
    };
  });

  // 4. Combine all candidate employees
  let baseEmployees = users.filter(u => u.role === 'EMPLOYEE');
  // Add any employee who has a schedule but was not in users (safety fallback)
  schedulesThisWeek.forEach(s => {
    if (!userById.has(s.userId || s.user_id)) {
      baseEmployees.push({
        id: s.userId || s.user_id,
        fullName: s.user?.fullName || s.user?.full_name || 'Colaborador Programado',
        documentId: s.user?.documentId || s.user?.document_id || '',
        position: s.user?.position || 'Colaborador',
        pdvId: s.pdvId || s.pdv_id,
        supervisorId: s.supervisorId || s.supervisor_id,
        role: 'EMPLOYEE'
      });
    }
  });

  let allTargetEmployees = [...baseEmployees, ...unscheduledEmployees];

  // Apply Filters
  if (pdvId) {
    allTargetEmployees = allTargetEmployees.filter(u => (u.pdvId || u.pdv_id) === pdvId);
  }
  if (supervisorId) {
    const supervisorPdvIds = new Set(pdvs.filter(p => p.supervisorId === supervisorId || p.supervisor_id === supervisorId).map(p => p.id));
    allTargetEmployees = allTargetEmployees.filter(u => 
      (u.supervisorId || u.supervisor_id) === supervisorId || 
      supervisorPdvIds.has(u.pdvId || u.pdv_id)
    );
  }
  if (documentId) {
    allTargetEmployees = allTargetEmployees.filter(u => 
      String(u.documentId || u.document_id).trim() === String(documentId).trim()
    );
  }

  // 5. Generate date list for the week (7 days)
  const dates = [];
  if (weekStart) {
    const start = new Date(weekStart + 'T12:00:00Z');
    for (let i = 0; i < 7; i++) {
      const cur = new Date(start.getTime() + i * 86400000);
      dates.push(cur.toISOString().split('T')[0]);
    }
  }

  const comparisonRows = [];

  // 6. Iterate over each employee in scope
  for (const emp of allTargetEmployees) {
    const empPdvId = emp.pdvId || emp.pdv_id;
    const empSupId = emp.supervisorId || emp.supervisor_id;
    const empDoc = String(emp.documentId || emp.document_id || '').trim();
    const empPdv = pdvs.find(p => p.id === empPdvId);
    const empSup = supervisors.find(s => s.id === (empSupId || empPdv?.supervisorId || empPdv?.supervisor_id));

    // Schedule for this employee
    const empSchedule = schedByUserId.get(emp.id);
    const shiftsByDate = {};
    if (empSchedule && empSchedule.shifts) {
      empSchedule.shifts.forEach(sh => {
        shiftsByDate[sh.date] = sh;
      });
    }

    // Punches for this employee (including typo matched punches)
    const empPunches = allPunches.filter(p => {
      const pDoc = String(p.documentId || p.document_id || '').trim();
      const pCode = String(p.code || '').trim();
      if (empDoc && pDoc === empDoc) return true;
      if (emp.code && pCode === String(emp.code).trim()) return true;
      const punchMapping = punchDocMap.get(pDoc);
      if (punchMapping && punchMapping.user.id === emp.id) return true;
      return false;
    });

    const punchesByDate = {};
    empPunches.forEach(p => {
      const pEntryDate = p.entryDate || p.entry_date;
      if (pEntryDate) {
        if (!punchesByDate[pEntryDate]) punchesByDate[pEntryDate] = [];
        punchesByDate[pEntryDate].push(p);
      }
    });

    // Skip if employee has no schedule and no punches in this week
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
      const realEnd = hasPunch && punchExitTime && punchExitTime !== '-' ? punchExitTime.substring(0, 5) : '';
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
        statusLabel = 'Marcación No Programada / Sin Turno';
        statusColor = 'purple';
        issues.push('El colaborador laboró sin tener turno programado en la malla o fuera de programación.');
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
          issues.push('Falta marcación de salida en reloj biométrico.');
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
        pdvName: empPdv ? empPdv.name : (emp.pdvName || 'Sin PDV (Fuera de Malla)'),
        pdvCity: empPdv ? empPdv.city : '',
        supervisorId: empSup?.id || '',
        supervisorName: empSup ? empSup.name : (emp.supervisorName || empPdv?.supervisorName || empPdv?.supervisor_name || 'Sin supervisor'),
        isUnscheduledWorker: !!emp.isUnscheduledWorker,
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

  // 7. Group by PDV to produce PDV-level Summaries
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
        pdvCode: row.pdvId === 'pdv-unassigned' ? 'NO-MALLA' : 'PDV-VAR',
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

  // 8. Compute Resumen Comparativo de Programación vs Marcaciones
  const scheduledEmpIds = new Set(schedulesThisWeek.map(s => s.userId || s.user_id));
  const punchedDocs = new Set(allPunches.map(p => String(p.documentId || p.document_id).trim()));

  const unscheduledList = unscheduledEmployees.map(u => {
    const uPunches = allPunches.filter(p => String(p.documentId || p.document_id).trim() === u.documentId);
    const totalNet = uPunches.reduce((sum, p) => sum + (p.realCalculations?.netHours || p.real_calculations?.netHours || 0), 0);
    return {
      documentId: u.documentId,
      fullName: u.fullName,
      position: u.position,
      pdvName: u.pdvName,
      supervisorName: u.supervisorName,
      punchCount: uPunches.length,
      totalHours: +totalNet.toFixed(1)
    };
  });

  const missingPunchList = [];
  schedulesThisWeek.forEach(s => {
    const u = userById.get(s.userId || s.user_id);
    const doc = String(u?.documentId || u?.document_id || '').trim();
    const hasPunch = doc && (punchedDocs.has(doc) || punchDocMap.has(doc));
    if (!hasPunch) {
      const pObj = pdvs.find(p => p.id === (s.pdvId || s.pdv_id));
      const sObj = supervisors.find(sup => sup.id === (s.supervisorId || s.supervisor_id || pObj?.supervisorId));
      missingPunchList.push({
        documentId: doc || 'Sin Cédula',
        fullName: u?.fullName || u?.full_name || s.user?.fullName || 'Colaborador Programado',
        position: u?.position || s.user?.position || 'Colaborador',
        pdvName: pObj?.name || s.pdvId || 'PDV',
        supervisorName: sObj?.name || pObj?.supervisorName || 'Sin supervisor',
        scheduledHours: s.totalNetHours || s.total_net_hours || 0
      });
    }
  });

  const matchedEmployeesCount = scheduledEmpIds.size - missingPunchList.length;

  const summary = {
    totalScheduledEmployees: scheduledEmpIds.size,
    totalPunchedEmployees: punchedDocs.size,
    matchedEmployees: matchedEmployeesCount,
    unscheduledEmployeesCount: unscheduledList.length,
    missingPunchEmployeesCount: missingPunchList.length,
    autoMatchedWithTypoCount: typoMatches.length,
    unscheduledEmployees: unscheduledList,
    missingPunchEmployees: missingPunchList,
    autoMatchedWithTypo: typoMatches
  };

  return { stats, pdvSummaries, rows: comparisonRows, summary };
}
