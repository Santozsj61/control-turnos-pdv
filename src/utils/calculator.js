// Colombian Labor Law & Company Policy Work Hour Calculator

export function timeToMinutes(timeStr) {
  if (timeStr === undefined || timeStr === null || timeStr === '') return 0;
  if (typeof timeStr === 'number') {
    if (timeStr >= 0 && timeStr <= 1.05) return Math.round(timeStr * 24 * 60);
    return Math.round(timeStr);
  }
  const str = String(timeStr).trim();
  if (!str.includes(':') && !isNaN(str) && str !== '') {
    const num = parseFloat(str);
    if (num >= 0 && num <= 1.05) return Math.round(num * 24 * 60);
  }
  const parts = str.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const totalMin = Math.round(minutes);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const COLOMBIAN_HOLIDAYS_2026 = {
  '2026-01-01': 'Año Nuevo',
  '2026-01-12': 'Día de los Reyes Magos',
  '2026-03-23': 'Día de San José',
  '2026-04-02': 'Jueves Santo',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajo',
  '2026-05-18': 'Ascensión del Señor',
  '2026-06-08': 'Corpus Christi',
  '2026-06-15': 'Sagrado Corazón de Jesús',
  '2026-06-29': 'San Pedro y San Pablo',
  '2026-07-20': 'Día de la Independencia',
  '2026-08-07': 'Batalla de Boyacá',
  '2026-08-17': 'La Asunción de la Virgen',
  '2026-10-12': 'Día de la Raza',
  '2026-11-02': 'Todos los Santos',
  '2026-11-16': 'Independencia de Cartagena',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad'
};

export function isColombianHoliday(dateStr) {
  if (!dateStr) return false;
  return !!COLOMBIAN_HOLIDAYS_2026[dateStr];
}

export function getHolidayName(dateStr) {
  if (!dateStr) return null;
  return COLOMBIAN_HOLIDAYS_2026[dateStr] || null;
}

export function calculateShiftHours(startTime, endTime, dateStr, config = {}, shiftType = 'ORDINARIO') {
  const normalizedType = String(shiftType || 'ORDINARIO').toUpperCase();

  let isSunday = false;
  let isHoliday = false;
  let holidayName = null;
  if (dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    isSunday = d.getUTCDay() === 0;
    isHoliday = isColombianHoliday(dateStr);
    holidayName = getHolidayName(dateStr);
  }

  if (['INCAPACIDAD', 'VACACIONES', 'LICENCIA', 'DESCANSO'].includes(normalizedType)) {
    return {
      grossHours: 7,
      lunchHours: 0,
      netHours: 7,
      dayHours: 7,
      nightHours: 0,
      isSunday,
      isHoliday,
      holidayName,
      sundayDayHours: isSunday ? 7 : 0,
      sundayNightHours: 0,
      holidayDayHours: isHoliday ? 7 : 0,
      holidayNightHours: 0,
      sundayOrHolidayHours: (isSunday || isHoliday) ? 7 : 0,
      lunchApplied: false,
      lunchReason: normalizedType === 'DESCANSO' ? 'Descanso computable (7.0 hrs)' : `${normalizedType} legal computable (7.0 hrs)`
    };
  }

  if (normalizedType === 'NO_PROGRAMADO') {
    return {
      grossHours: 0,
      lunchHours: 0,
      netHours: 0,
      dayHours: 0,
      nightHours: 0,
      isSunday,
      isHoliday,
      holidayName,
      sundayDayHours: 0,
      sundayNightHours: 0,
      holidayDayHours: 0,
      holidayNightHours: 0,
      sundayOrHolidayHours: 0,
      lunchApplied: false,
      lunchReason: 'No programado (0.0 hrs)'
    };
  }

  const lunchDuration = config.lunchDurationHours !== undefined ? Number(config.lunchDurationHours) : 1.5;
  const lunchCutoff = config.lunchCutoffMinutes !== undefined 
    ? Number(config.lunchCutoffMinutes) 
    : (config.lunchCutoffTime ? timeToMinutes(config.lunchCutoffTime) : 12 * 60 + 30);
  const lunchMinDuration = config.lunchMinDurationMinutes !== undefined 
    ? Number(config.lunchMinDurationMinutes) 
    : (config.lunchMinShiftDuration !== undefined ? Number(config.lunchMinShiftDuration) * 60 : 6 * 60);
  const dayStart = config.dayStartMinutes !== undefined 
    ? Number(config.dayStartMinutes) 
    : (config.dayStartTime ? timeToMinutes(config.dayStartTime) : 6 * 60);
  const dayEnd = config.dayEndMinutes !== undefined 
    ? Number(config.dayEndMinutes) 
    : (config.nightStartTime ? timeToMinutes(config.nightStartTime) : 21 * 60);

  const cfg = {
    lunchDurationHours: lunchDuration,
    lunchCutoffMinutes: lunchCutoff,
    lunchMinDurationMinutes: lunchMinDuration,
    dayStartMinutes: dayStart,
    dayEndMinutes: dayEnd,
    nightSurcharge: 0.35,
    sundaySurcharge: 0.75,
    ...config
  };

  if (!startTime || !endTime) {
    return {
      grossHours: 0,
      lunchHours: 0,
      netHours: 0,
      dayHours: 0,
      nightHours: 0,
      isSunday,
      sundayDayHours: 0,
      sundayNightHours: 0,
      lunchApplied: false,
      lunchReason: 'Sin horario establecido'
    };
  }

  const startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);

  if (endMin <= startMin) {
    endMin += 1440;
  }

  const grossDurationMinutes = endMin - startMin;
  const grossHours = +(grossDurationMinutes / 60).toFixed(2);

  let lunchMinutes = 0;
  let lunchApplied = false;
  let lunchReason = '';

  const startsAfterCutoff = (startMin % 1440) > cfg.lunchCutoffMinutes;
  const underMinDuration = grossDurationMinutes < cfg.lunchMinDurationMinutes;

  if (startsAfterCutoff) {
    lunchMinutes = 0;
    lunchApplied = false;
    lunchReason = 'Ingreso posterior a las 12:30 PM (Sin deducción de almuerzo)';
  } else if (underMinDuration) {
    lunchMinutes = 0;
    lunchApplied = false;
    lunchReason = 'Jornada menor a 6 horas (Sin deducción de almuerzo)';
  } else {
    lunchMinutes = cfg.lunchDurationHours * 60;
    lunchApplied = true;
    lunchReason = 'Aplica 1:30 de almuerzo reglamentario';
  }

  const lunchHours = +(lunchMinutes / 60).toFixed(2);
  const netDurationMinutes = Math.max(0, grossDurationMinutes - lunchMinutes);
  const netHours = +(netDurationMinutes / 60).toFixed(2);

  let dayMinutes = 0;
  let nightMinutes = 0;

  for (let m = startMin; m < endMin; m++) {
    const modMin = m % 1440;
    if (modMin >= cfg.dayStartMinutes && modMin < cfg.dayEndMinutes) {
      dayMinutes++;
    } else {
      nightMinutes++;
    }
  }

  const factor = grossDurationMinutes > 0 ? netDurationMinutes / grossDurationMinutes : 0;
  const netDayMinutes = dayMinutes * factor;
  const netNightMinutes = nightMinutes * factor;

  const dayHours = +(netDayMinutes / 60).toFixed(2);
  const nightHours = +(netNightMinutes / 60).toFixed(2);

  const sundayDayHours = isSunday ? dayHours : 0;
  const sundayNightHours = isSunday ? nightHours : 0;
  const holidayDayHours = isHoliday ? dayHours : 0;
  const holidayNightHours = isHoliday ? nightHours : 0;
  const sundayOrHolidayHours = (isSunday || isHoliday) ? netHours : 0;

  return {
    grossHours,
    lunchHours,
    netHours,
    dayHours,
    nightHours,
    isSunday,
    isHoliday,
    holidayName,
    sundayDayHours,
    sundayNightHours,
    holidayDayHours,
    holidayNightHours,
    sundayOrHolidayHours,
    lunchApplied,
    lunchReason
  };
}

export function calculateMonSatHours(shifts = [], maxStandardHours = 42) {
  let monSatHours = 0;
  let sundayHours = 0;
  let totalHours = 0;

  shifts.forEach(shift => {
    let isSunday = false;
    if (shift.date) {
      const dateObj = new Date(shift.date + 'T12:00:00Z');
      isSunday = dateObj.getUTCDay() === 0;
    } else if (shift.isSunday || shift.dayName === 'Domingo' || shift.dayOfWeek === 'Domingo') {
      isSunday = true;
    }
    const hours = shift.netHours || 0;

    totalHours += hours;
    if (isSunday) {
      sundayHours += hours;
    } else {
      monSatHours += hours;
    }
  });

  monSatHours = +monSatHours.toFixed(2);
  sundayHours = +sundayHours.toFixed(2);
  totalHours = +totalHours.toFixed(2);

  const limit = maxStandardHours || 42;
  const exceeds42 = monSatHours > limit;
  const excessHours = exceeds42 ? +(monSatHours - limit).toFixed(2) : 0;

  return {
    monSatHours,
    sundayHours,
    totalHours,
    exceeds42,
    excessHours,
    maxStandardHours: limit
  };
}

export function countMonthlySundays(existingSchedules = [], userId, targetMonthStr, currentWeekShifts = []) {
  const workedSundayDates = new Set();

  existingSchedules
    .filter(s => s.userId === userId || s.user_id === userId)
    .forEach(sched => {
      sched.shifts?.forEach(sh => {
        if (sh.date?.startsWith(targetMonthStr)) {
          const d = new Date(sh.date + 'T12:00:00Z');
          if (d.getUTCDay() === 0) {
            const isWorked = !sh.isDayOff && (sh.netHours > 0 || ['ORDINARIO', 'INCAPACIDAD', 'VACACIONES', 'LICENCIA'].includes(sh.shiftType));
            if (isWorked) {
              workedSundayDates.add(sh.date);
            }
          }
        }
      });
    });

  currentWeekShifts.forEach(sh => {
    if (sh.date?.startsWith(targetMonthStr)) {
      const d = new Date(sh.date + 'T12:00:00Z');
      if (d.getUTCDay() === 0) {
        const isWorked = !sh.isDayOff && (sh.netHours > 0 || ['ORDINARIO', 'INCAPACIDAD', 'VACACIONES', 'LICENCIA'].includes(sh.shiftType));
        if (isWorked) {
          workedSundayDates.add(sh.date);
        } else {
          workedSundayDates.delete(sh.date);
        }
      }
    }
  });

  const count = workedSundayDates.size;
  const datesArray = Array.from(workedSundayDates).sort();
  const reachesLimit = count >= 2;
  const exceedsLimit = count > 2;

  return {
    targetMonth: targetMonthStr,
    workedSundaysCount: count,
    workedSundayDates: datesArray,
    reachesLimit,
    exceedsLimit,
    requiresApproval: count >= 3
  };
}
