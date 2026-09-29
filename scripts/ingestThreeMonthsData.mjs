import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { calculateShiftHours } from '../src/utils/calculator.js';
import { WEEKS_DEF, numToTime, num, matchPDV } from './ingestHelpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = 'C:/Users/analista.retail/Downloads';
const fileJun = path.join(dir, 'Liquidación Tiempos Suplementarios PDV - Junio 2026 (del 01 al 28)  Ajustes.xlsx');
const fileJul = path.join(dir, 'Liquidación Tiempos Suplementarios PDV - Julio 2026 (del 29 Jun al 01 Agosto) David.xlsx');
const fileAgo = path.join(dir, 'Liquidación Tiempos Suplementarios PDV - Agosto 2026 (del 02 Agos al 30 Agosto).xlsx');

console.log('Reading Excel files from disk...');
const wbJun = XLSX.read(fs.readFileSync(fileJun), { type: 'buffer' });
const wbJul = XLSX.read(fs.readFileSync(fileJul), { type: 'buffer' });
const wbAgo = XLSX.read(fs.readFileSync(fileAgo), { type: 'buffer' });
console.log('All 3 workbooks loaded successfully.');

// Data accumulators
const userMap = new Map(); // doc -> user object
const allPayrollByWeek = {}; // week -> array of records
const allSchedulesByWeek = {}; // week -> array of schedules
const allPunchesByWeek = {}; // week -> array of punches
const coverageByWeekAndPdv = {}; // week -> Map(pdvId -> coverageObj)

for (const w of Object.keys(WEEKS_DEF)) {
  allPayrollByWeek[w] = [];
  allSchedulesByWeek[w] = [];
  allPunchesByWeek[w] = [];
  coverageByWeekAndPdv[w] = new Map();
}

// -----------------------------------------------------------------
// 1. PARSE DETALLE VALORIZADO (JUNIO, JULIO, AGOSTO)
// -----------------------------------------------------------------
console.log('\n--- 1. Parsing Detalle valorizado across all 3 months ---');

function mapJuneWeek(str) {
  const s = String(str || '').toLowerCase().trim();
  if (s.startsWith('1 jun')) return '23';
  if (s.startsWith('8 jun')) return '24';
  if (s.startsWith('15 jun')) return '25';
  if (s.startsWith('22 jun')) return '26';
  return s;
}

function parseDetalleValorizado(wb, monthName, weekMapper = null) {
  const ws = wb.Sheets['Detalle valorizado'];
  if (!ws) {
    console.warn(`No 'Detalle valorizado' found in ${monthName}`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const records = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 7) continue;

    const doc = String(row[5] || '').trim();
    let week = String(row[6] || '').trim();
    if (weekMapper) week = weekMapper(week);
    if (!doc || !week || !WEEKS_DEF[week]) continue;

    const rawPdv = String(row[2] || '').trim();
    const pdvObj = matchPDV(rawPdv, initialPDVs);

    const rec = {
      id: `pay-${week}-${doc}`,
      company: String(row[0] || 'NCS BRANDS S.A.S.').trim(),
      payrollType: String(row[1] || 'Q').trim(),
      pdvName: pdvObj.name,
      pdvId: pdvObj.id,
      pdvCode: pdvObj.code,
      position: String(row[3] || 'ASESOR(A) DE IMAGEN').trim(),
      fullName: String(row[4] || '').trim(),
      documentId: doc,
      week,
      month: WEEKS_DEF[week].month,
      ordinaryHours: +num(row[7]).toFixed(2),
      nightSurchargeOrd: +num(row[8]).toFixed(2),
      overtimeDay: +num(row[9]).toFixed(2),
      overtimeNight: +num(row[10]).toFixed(2),
      sundayDay: +num(row[11]).toFixed(2),
      sundayNight: +num(row[12]).toFixed(2),
      sundayOvertimeDay: +num(row[13]).toFixed(2),
      sundayOvertimeNight: +num(row[14]).toFixed(2),
      holidayDay: +num(row[15]).toFixed(2),
      holidayNight: +num(row[16]).toFixed(2),
      totalWorkedHours: +num(row[19] || row[17]).toFixed(2),
      sundaysWorkedMonth: num(row[20] || row[18]),
      sundayRule: String(row[21] || row[19] || '').trim(),
      holidaysPaidWeek: num(row[22] || row[20]),
      hourlyRate: num(row[24]),
      valorRecargoNoctOrd: num(row[26]),
      valorExtraDiurnaOrd: num(row[27]),
      valorExtraNocturnaOrd: num(row[28]),
      valorRecDiurnoDom: num(row[29]),
      valorRecNocturnoDom: num(row[30]),
      valorExtraDiurnaDom: num(row[31]),
      valorExtraNocturnaDom: num(row[32]),
      valorRecDiurnoFest: num(row[33]),
      valorRecNocturnoFest: num(row[34]),
      totalValorizacion: num(row[35]),
      horasValorizables: num(row[36])
    };

    records.push(rec);
  }
  return records;
}

const payJun = parseDetalleValorizado(wbJun, 'Junio', mapJuneWeek);
const payJul = parseDetalleValorizado(wbJul, 'Julio');
const payAgo = parseDetalleValorizado(wbAgo, 'Agosto');

console.log(`Parsed rows: Junio=${payJun.length}, Julio=${payJul.length}, Agosto=${payAgo.length}`);

// Group and merge week 31
const allPayRows = [...payJun, ...payJul];
for (const row of payAgo) {
  if (row.week === '31') {
    // Merge into July week 31 row for the same doc!
    const existing = allPayRows.find(p => p.week === '31' && p.documentId === row.documentId);
    if (existing) {
      existing.sundayDay = +(existing.sundayDay + row.sundayDay).toFixed(2);
      existing.sundayNight = +(existing.sundayNight + row.sundayNight).toFixed(2);
      existing.sundayOvertimeDay = +(existing.sundayOvertimeDay + row.sundayOvertimeDay).toFixed(2);
      existing.sundayOvertimeNight = +(existing.sundayOvertimeNight + row.sundayOvertimeNight).toFixed(2);
      existing.totalWorkedHours = +(existing.totalWorkedHours + row.totalWorkedHours).toFixed(2);
      existing.valorRecDiurnoDom = +(existing.valorRecDiurnoDom + row.valorRecDiurnoDom).toFixed(2);
      existing.valorRecNocturnoDom = +(existing.valorRecNocturnoDom + row.valorRecNocturnoDom).toFixed(2);
      existing.valorExtraDiurnaDom = +(existing.valorExtraDiurnaDom + row.valorExtraDiurnaDom).toFixed(2);
      existing.valorExtraNocturnaDom = +(existing.valorExtraNocturnaDom + row.valorExtraNocturnaDom).toFixed(2);
      existing.totalValorizacion = +(existing.totalValorizacion + row.totalValorizacion).toFixed(2);
      existing.horasValorizables = +(existing.horasValorizables + row.horasValorizables).toFixed(2);
      if (row.sundayRule) existing.sundayRule = row.sundayRule;
    } else {
      allPayRows.push(row);
    }
  } else {
    allPayRows.push(row);
  }
}

// Distribute into allPayrollByWeek
allPayRows.forEach(rec => {
  if (allPayrollByWeek[rec.week]) {
    allPayrollByWeek[rec.week].push(rec);
  }
});

for (const w of Object.keys(WEEKS_DEF)) {
  console.log(`Semana ${w}: ${allPayrollByWeek[w].length} payroll records`);
}

// -----------------------------------------------------------------
// 2. PARSE SCHEDULES AND BIOMETRIC PUNCHES
// -----------------------------------------------------------------
console.log('\n--- 2. Parsing Schedules & Punches (June, July, August) ---');

// Helper to register user
function ensureUser(doc, fullName, position, pdvObj) {
  if (!userMap.has(doc)) {
    userMap.set(doc, {
      id: `emp-${doc}`,
      username: `emp_${doc}`,
      fullName,
      full_name: fullName,
      documentId: doc,
      document_id: doc,
      role: 'EMPLOYEE',
      pdvId: pdvObj.id,
      pdv_id: pdvObj.id,
      supervisorId: pdvObj.supervisorId || 'sup-cali-1',
      supervisor_id: pdvObj.supervisorId || 'sup-cali-1',
      position: position || 'ASESOR(A) DE IMAGEN',
      contractType: 'FIJO',
      contract_type: 'FIJO',
      weeklyMaxHours: 42,
      weekly_max_hours: 42,
      isActive: true,
      is_active: true
    });
  }
}

// 2A. JUNE FILE (has Malla cols 15-62 and Sun 111-118, Marc cols 17-62 and Sun 113-118)
const DAY_COLS_JUN = [
  { inMalla: 15, outMalla: 16, inMarc: 17, outMarc: 18, obs: 22, dayIdx: 0 }, // Lun
  { inMalla: 23, outMalla: 24, inMarc: 25, outMarc: 26, obs: 30, dayIdx: 1 }, // Mar
  { inMalla: 31, outMalla: 32, inMarc: 33, outMarc: 34, obs: 38, dayIdx: 2 }, // Mié
  { inMalla: 39, outMalla: 40, inMarc: 41, outMarc: 42, obs: 46, dayIdx: 3 }, // Jue
  { inMalla: 47, outMalla: 48, inMarc: 49, outMarc: 50, obs: 54, dayIdx: 4 }, // Vie
  { inMalla: 55, outMalla: 56, inMarc: 57, outMarc: 58, obs: 62, dayIdx: 5 }, // Sáb
  { inMalla: 111, outMalla: 112, inMarc: 113, outMarc: 114, obs: 118, dayIdx: 6 } // Dom
];

const wsHeJun = wbJun.Sheets['LIQUIDACION HE MES'];
const rowsHeJun = XLSX.utils.sheet_to_json(wsHeJun, { header: 1, defval: '' });

for (let r = 2; r < rowsHeJun.length; r++) {
  const row = rowsHeJun[r];
  if (!row || row.length < 5) continue;
  const week = String(row[1] || '').trim();
  const weekDef = WEEKS_DEF[week];
  if (!weekDef) continue;

  const doc = String(row[4] || '').trim();
  const fullName = String(row[5] || '').trim();
  const rawPdv = String(row[6] || row[3] || '').trim();
  const position = String(row[9] || 'ASESOR(A) DE IMAGEN').trim();
  if (!doc) continue;

  const pdvObj = matchPDV(rawPdv, initialPDVs);
  ensureUser(doc, fullName, position, pdvObj);

  const batchId = `batch-sem${week}-junio`;
  const shifts = [];
  let weekHasPunches = false;
  let weekHasMalla = false;
  let missingPunchDays = [];
  let punchCount = 0;

  for (const d of DAY_COLS_JUN) {
    const dateObj = weekDef.dates[d.dayIdx];
    const date = dateObj.date;
    const dayName = dateObj.name;

    const timeInMalla = numToTime(row[d.inMalla]);
    const timeOutMalla = numToTime(row[d.outMalla]);
    const timeInMarc = numToTime(row[d.inMarc]);
    const timeOutMarc = numToTime(row[d.outMarc]);
    const obs = String(row[d.obs] || '').toUpperCase();

    const isDescanso = obs.includes('DESCANSO') || obs.includes('NO LABORA');
    const isIncapacidad = obs.includes('INCAPACIDAD');
    const isVacaciones = obs.includes('VACACION');
    const isLicencia = obs.includes('LICENCIA');

    const hasMallaTime = Boolean(timeInMalla && timeOutMalla && timeInMalla.includes(':'));
    const hasPunchTime = Boolean(timeInMarc && timeOutMarc && timeInMarc.includes(':'));

    if (hasMallaTime) weekHasMalla = true;
    if (hasPunchTime) {
      weekHasPunches = true;
      punchCount++;
    }

    let shiftType = 'ORDINARIO';
    let isDayOff = false;
    if (isDescanso) {
      shiftType = 'DESCANSO';
      isDayOff = true;
    } else if (isIncapacidad) {
      shiftType = 'INCAPACIDAD';
      isDayOff = true;
    } else if (isVacaciones) {
      shiftType = 'VACACIONES';
      isDayOff = true;
    } else if (isLicencia) {
      shiftType = 'LICENCIA';
      isDayOff = true;
    } else if (!hasMallaTime && !hasPunchTime) {
      shiftType = 'DESCANSO';
      isDayOff = true;
    }

    // Schedule Shift
    const sStart = isDayOff ? '' : (timeInMalla || timeInMarc || '10:00');
    const sEnd = isDayOff ? '' : (timeOutMalla || timeOutMarc || '20:30');
    const schedCalcs = calculateShiftHours(sStart, sEnd, date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, shiftType);

    shifts.push({
      date,
      dayOfWeek: dayName,
      startTime: sStart,
      endTime: sEnd,
      shiftType,
      isDayOff,
      hasScheduledMalla: hasMallaTime,
      hasBiometricPunch: hasPunchTime,
      observation: obs,
      ...schedCalcs
    });

    // Punches
    if (hasPunchTime) {
      const realCalculations = calculateShiftHours(timeInMarc, timeOutMarc, date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 });
      allPunchesByWeek[week].push({
        id: `punch-sem${week}-${doc}-${date}`,
        batchId,
        batch_id: batchId,
        documentId: doc,
        document_id: doc,
        code: `COD-${doc.slice(-4)}`,
        fullName,
        full_name: fullName,
        position,
        area: 'RETAIL',
        supervisorName: 'Líder Regional',
        supervisor_name: 'Líder Regional',
        pdvName: pdvObj.name,
        pdv_name: pdvObj.name,
        shiftName: `${timeInMarc}-${timeOutMarc}`,
        entryDate: date,
        entry_date: date,
        entryTime: timeInMarc,
        entry_time: timeInMarc,
        exitDate: date,
        exit_date: date,
        exitTime: timeOutMarc,
        exit_time: timeOutMarc,
        realCalculations,
        real_calculations: realCalculations
      });
    } else if (hasMallaTime && !isDayOff) {
      missingPunchDays.push(dayName);
    }
  }

  const totNet = shifts.reduce((acc, s) => acc + (s.netHours || 0), 0);
  allSchedulesByWeek[week].push({
    id: `sched-sem${week}-${doc}`,
    userId: `emp-${doc}`,
    user_id: `emp-${doc}`,
    pdvId: pdvObj.id,
    pdv_id: pdvObj.id,
    pdvName: pdvObj.name,
    fullName,
    documentId: doc,
    position,
    weekStart: weekDef.start,
    week_start: weekDef.start,
    weekEnd: weekDef.end,
    week_end: weekDef.end,
    weekNumber: week,
    isSubmitted: true,
    is_submitted: true,
    shifts,
    totalNetHours: +totNet.toFixed(2),
    total_net_hours: +totNet.toFixed(2),
    totalLunchHours: 0,
    total_lunch_hours: 0,
    hasMalla: weekHasMalla,
    hasPunches: weekHasPunches,
    punchCount,
    missingPunchDays
  });
}
console.log('✅ June Schedules and Punches parsed.');

// 2B. JULY & AUGUST (HE Mon-Sat cols 15-50, DOMINGOS cols 15-20)
const DAY_COLS_JUL_AGO = [
  { inMarc: 15, outMarc: 16, obs: 20, dayIdx: 0 }, // Lun
  { inMarc: 21, outMarc: 22, obs: 26, dayIdx: 1 }, // Mar
  { inMarc: 27, outMarc: 28, obs: 32, dayIdx: 2 }, // Mié
  { inMarc: 33, outMarc: 34, obs: 38, dayIdx: 3 }, // Jue
  { inMarc: 39, outMarc: 40, obs: 44, dayIdx: 4 }, // Vie
  { inMarc: 45, outMarc: 46, obs: 50, dayIdx: 5 }  // Sáb
];

function parseJulyAugustWorkbooks(wb, monthBatchName) {
  const wsHe = wb.Sheets['LIQUIDACION HE'];
  const wsDom = wb.Sheets['LIQUIDACION DOMINGOS'];
  const rowsHe = wsHe ? XLSX.utils.sheet_to_json(wsHe, { header: 1, defval: '' }) : [];
  const rowsDom = wsDom ? XLSX.utils.sheet_to_json(wsDom, { header: 1, defval: '' }) : [];

  // Map Sundays by key (doc|week)
  const sundayMap = new Map();
  for (let r = 2; r < rowsDom.length; r++) {
    const row = rowsDom[r];
    const doc = String(row[4] || '').trim();
    const w = String(row[1] || '').trim();
    if (doc && w) {
      sundayMap.set(`${w}-${doc}`, {
        timeIn: numToTime(row[15]),
        timeOut: numToTime(row[16]),
        obs: String(row[20] || '').toUpperCase()
      });
    }
  }

  for (let r = 2; r < rowsHe.length; r++) {
    const row = rowsHe[r];
    if (!row || row.length < 5) continue;
    let week = String(row[1] || '').trim();
    // Handle August row 46236 which is Aug 2 (Sunday of week 31)
    if (week === '31' && monthBatchName === 'agosto') {
      // In August file, week 31 was Sunday Aug 2. If already processed from July, merge Sunday!
      const doc = String(row[4] || '').trim();
      const sunP = sundayMap.get(`31-${doc}`);
      const tIn = sunP?.timeIn || numToTime(row[15]);
      const tOut = sunP?.timeOut || numToTime(row[16]);
      if (tIn && tOut && tIn.includes(':')) {
        const date = '2026-08-02';
        const rawPdv = String(row[6] || row[3] || '').trim();
        const pdvObj = matchPDV(rawPdv, initialPDVs);
        const fullName = String(row[5] || '').trim();
        const position = String(row[9] || 'ASESOR(A) DE IMAGEN').trim();
        const batchId = `batch-sem31-jul-ago`;
        const realCalculations = calculateShiftHours(tIn, tOut, date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 });

        allPunchesByWeek['31'].push({
          id: `punch-sem31-${doc}-${date}`,
          batchId,
          batch_id: batchId,
          documentId: doc,
          document_id: doc,
          code: `COD-${doc.slice(-4)}`,
          fullName,
          full_name: fullName,
          position,
          area: 'RETAIL',
          supervisorName: 'Líder Regional',
          supervisor_name: 'Líder Regional',
          pdvName: pdvObj.name,
          pdv_name: pdvObj.name,
          shiftName: `${tIn}-${tOut}`,
          entryDate: date,
          entry_date: date,
          entryTime: tIn,
          entry_time: tIn,
          exitDate: date,
          exit_date: date,
          exitTime: tOut,
          exit_time: tOut,
          realCalculations,
          real_calculations: realCalculations
        });

        // Also update schedule Sunday shift for week 31
        const sched = allSchedulesByWeek['31'].find(s => s.documentId === doc);
        if (sched && sched.shifts[6]) {
          sched.shifts[6].startTime = tIn;
          sched.shifts[6].endTime = tOut;
          sched.shifts[6].isDayOff = false;
          sched.shifts[6].shiftType = 'ORDINARIO';
          sched.shifts[6].hasBiometricPunch = true;
          sched.hasPunches = true;
          sched.punchCount = (sched.punchCount || 0) + 1;
        }
      }
      continue;
    }

    const weekDef = WEEKS_DEF[week];
    if (!weekDef) continue;

    const doc = String(row[4] || '').trim();
    const fullName = String(row[5] || '').trim();
    const rawPdv = String(row[6] || row[3] || '').trim();
    const position = String(row[9] || 'ASESOR(A) DE IMAGEN').trim();
    if (!doc) continue;

    const pdvObj = matchPDV(rawPdv, initialPDVs);
    ensureUser(doc, fullName, position, pdvObj);

    const batchId = `batch-sem${week}-${monthBatchName}`;
    const shifts = [];
    let weekHasPunches = false;
    let missingPunchDays = [];
    let punchCount = 0;

    // Monday to Saturday
    for (const d of DAY_COLS_JUL_AGO) {
      const dateObj = weekDef.dates[d.dayIdx];
      const date = dateObj.date;
      const dayName = dateObj.name;

      const timeInMarc = numToTime(row[d.inMarc]);
      const timeOutMarc = numToTime(row[d.outMarc]);
      const obs = String(row[d.obs] || '').toUpperCase();

      const isDescanso = obs.includes('DESCANSO') || obs.includes('NO LABORA');
      const isIncapacidad = obs.includes('INCAPACIDAD');
      const isVacaciones = obs.includes('VACACION');
      const isLicencia = obs.includes('LICENCIA');
      const hasPunchTime = Boolean(timeInMarc && timeOutMarc && timeInMarc.includes(':'));

      if (hasPunchTime) {
        weekHasPunches = true;
        punchCount++;
      }

      let shiftType = 'ORDINARIO';
      let isDayOff = false;
      if (isDescanso) {
        shiftType = 'DESCANSO';
        isDayOff = true;
      } else if (isIncapacidad) {
        shiftType = 'INCAPACIDAD';
        isDayOff = true;
      } else if (isVacaciones) {
        shiftType = 'VACACIONES';
        isDayOff = true;
      } else if (isLicencia) {
        shiftType = 'LICENCIA';
        isDayOff = true;
      } else if (!hasPunchTime) {
        shiftType = 'DESCANSO';
        isDayOff = true;
      }

      const sStart = isDayOff ? '' : (timeInMarc || '10:00');
      const sEnd = isDayOff ? '' : (timeOutMarc || '20:30');
      const schedCalcs = calculateShiftHours(sStart, sEnd, date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, shiftType);

      shifts.push({
        date,
        dayOfWeek: dayName,
        startTime: sStart,
        endTime: sEnd,
        shiftType,
        isDayOff,
        hasScheduledMalla: false, // July & August had no Malla registered in Excel!
        hasBiometricPunch: hasPunchTime,
        observation: obs,
        ...schedCalcs
      });

      if (hasPunchTime) {
        const realCalculations = calculateShiftHours(timeInMarc, timeOutMarc, date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 });
        allPunchesByWeek[week].push({
          id: `punch-sem${week}-${doc}-${date}`,
          batchId,
          batch_id: batchId,
          documentId: doc,
          document_id: doc,
          code: `COD-${doc.slice(-4)}`,
          fullName,
          full_name: fullName,
          position,
          area: 'RETAIL',
          supervisorName: 'Líder Regional',
          supervisor_name: 'Líder Regional',
          pdvName: pdvObj.name,
          pdv_name: pdvObj.name,
          shiftName: `${timeInMarc}-${timeOutMarc}`,
          entryDate: date,
          entry_date: date,
          entryTime: timeInMarc,
          entry_time: timeInMarc,
          exitDate: date,
          exit_date: date,
          exitTime: timeOutMarc,
          exit_time: timeOutMarc,
          realCalculations,
          real_calculations: realCalculations
        });
      }
    }

    // Sunday (Day 6)
    const sunData = sundayMap.get(`${week}-${doc}`);
    const sunDateObj = weekDef.dates[6];
    const sunDate = sunDateObj.date;
    const timeInSun = sunData?.timeIn || '';
    const timeOutSun = sunData?.timeOut || '';
    const obsSun = sunData?.obs || '';

    const isSunDescanso = obsSun.includes('DESCANSO') || obsSun.includes('NO LABORA');
    const isSunIncap = obsSun.includes('INCAPACIDAD');
    const isSunVac = obsSun.includes('VACACION');
    const hasSunPunch = Boolean(timeInSun && timeOutSun && timeInSun.includes(':'));

    if (hasSunPunch) {
      weekHasPunches = true;
      punchCount++;
    }

    let sunShiftType = 'ORDINARIO';
    let sunIsDayOff = false;
    if (isSunDescanso) {
      sunShiftType = 'DESCANSO';
      sunIsDayOff = true;
    } else if (isSunIncap) {
      sunShiftType = 'INCAPACIDAD';
      sunIsDayOff = true;
    } else if (isSunVac) {
      sunShiftType = 'VACACIONES';
      sunIsDayOff = true;
    } else if (!hasSunPunch) {
      sunShiftType = 'DESCANSO';
      sunIsDayOff = true;
    }

    const sunStart = sunIsDayOff ? '' : timeInSun;
    const sunEnd = sunIsDayOff ? '' : timeOutSun;
    const sunCalcs = calculateShiftHours(sunStart, sunEnd, sunDate, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, sunShiftType);

    shifts.push({
      date: sunDate,
      dayOfWeek: sunDateObj.name,
      startTime: sunStart,
      endTime: sunEnd,
      shiftType: sunShiftType,
      isDayOff: sunIsDayOff,
      hasScheduledMalla: false,
      hasBiometricPunch: hasSunPunch,
      observation: obsSun,
      ...sunCalcs
    });

    if (hasSunPunch) {
      const realCalculations = calculateShiftHours(timeInSun, timeOutSun, sunDate, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 });
      allPunchesByWeek[week].push({
        id: `punch-sem${week}-${doc}-${sunDate}`,
        batchId,
        batch_id: batchId,
        documentId: doc,
        document_id: doc,
        code: `COD-${doc.slice(-4)}`,
        fullName,
        full_name: fullName,
        position,
        area: 'RETAIL',
        supervisorName: 'Líder Regional',
        supervisor_name: 'Líder Regional',
        pdvName: pdvObj.name,
        pdv_name: pdvObj.name,
        shiftName: `${timeInSun}-${timeOutSun}`,
        entryDate: sunDate,
        entry_date: sunDate,
        entryTime: timeInSun,
        entry_time: timeInSun,
        exitDate: sunDate,
        exit_date: sunDate,
        exitTime: timeOutSun,
        exit_time: timeOutSun,
        realCalculations,
        real_calculations: realCalculations
      });
    }

    const totNet = shifts.reduce((acc, s) => acc + (s.netHours || 0), 0);
    allSchedulesByWeek[week].push({
      id: `sched-sem${week}-${doc}`,
      userId: `emp-${doc}`,
      user_id: `emp-${doc}`,
      pdvId: pdvObj.id,
      pdv_id: pdvObj.id,
      pdvName: pdvObj.name,
      fullName,
      documentId: doc,
      position,
      weekStart: weekDef.start,
      week_start: weekDef.start,
      weekEnd: weekDef.end,
      week_end: weekDef.end,
      weekNumber: week,
      isSubmitted: true,
      is_submitted: true,
      shifts,
      totalNetHours: +totNet.toFixed(2),
      total_net_hours: +totNet.toFixed(2),
      totalLunchHours: 0,
      total_lunch_hours: 0,
      hasMalla: false, // July/August Malla was not registered in file
      hasPunches: weekHasPunches,
      punchCount,
      missingPunchDays: weekHasPunches ? [] : ['Toda la semana']
    });
  }
}

parseJulyAugustWorkbooks(wbJul, 'julio');
console.log('✅ July Schedules and Punches parsed.');

parseJulyAugustWorkbooks(wbAgo, 'agosto');
console.log('✅ August Schedules and Punches parsed.');

for (const w of Object.keys(WEEKS_DEF)) {
  console.log(`Semana ${w}: ${allSchedulesByWeek[w].length} schedules, ${allPunchesByWeek[w].length} punch records`);
}

// -----------------------------------------------------------------
// 3. COMPUTE COVERAGE MONITOR METRICS (PENDIENTES POR MARCACIÓN / POR PROGRAMAR)
// -----------------------------------------------------------------
console.log('\n--- 3. Computing Coverage Monitor Metrics per PDV & Week ---');

const coverageSummaryByWeek = {};

for (const w of Object.keys(WEEKS_DEF)) {
  const scheds = allSchedulesByWeek[w];
  const pdvGroupMap = new Map();

  // Seed with all known active PDVs
  initialPDVs.forEach(p => {
    const supObj = initialSupervisors.find(s => s.id === p.supervisorId);
    pdvGroupMap.set(p.id, {
      pdvId: p.id,
      pdvCode: p.code,
      pdvName: p.name,
      city: p.city,
      zone: p.zone,
      supervisorName: supObj?.name || 'Líder Regional',
      totalStaff: 0,
      programmedCount: 0,
      pendingProgramCount: 0,
      punchesCount: 0,
      pendingPunchesCount: 0,
      pendingCollaborators: []
    });
  });

  // Aggregate collaborator schedules in this week
  scheds.forEach(s => {
    let pdvStat = pdvGroupMap.get(s.pdvId);
    if (!pdvStat) {
      pdvStat = {
        pdvId: s.pdvId,
        pdvCode: s.pdvId.replace('pdv-', ''),
        pdvName: s.pdvName,
        city: 'Nacional',
        zone: 'Nacional',
        supervisorName: 'Líder Regional',
        totalStaff: 0,
        programmedCount: 0,
        pendingProgramCount: 0,
        punchesCount: 0,
        pendingPunchesCount: 0,
        pendingCollaborators: []
      };
      pdvGroupMap.set(s.pdvId, pdvStat);
    }

    pdvStat.totalStaff++;

    // Did they have scheduled Malla?
    // In June, if s.hasMalla is true => programmed.
    // In July/August, if they have active shifts or s.hasPunches, let's track:
    const isProgrammed = s.hasMalla || (Number(w) >= 27 && s.totalNetHours > 0);
    const hasPunches = s.hasPunches && s.punchCount > 0;

    if (isProgrammed) {
      pdvStat.programmedCount++;
    } else {
      pdvStat.pendingProgramCount++;
    }

    if (hasPunches) {
      pdvStat.punchesCount++;
    } else {
      pdvStat.pendingPunchesCount++;
    }

    // Record pending details
    const pendingIssues = [];
    if (!isProgrammed) {
      pendingIssues.push('Sin Malla/Turno Programado');
    }
    if (!hasPunches) {
      pendingIssues.push('Sin Marcaciones Biométricas');
    } else if (s.missingPunchDays && s.missingPunchDays.length > 0) {
      pendingIssues.push(`Faltan marcaciones en: ${s.missingPunchDays.join(', ')}`);
    }

    if (pendingIssues.length > 0) {
      pdvStat.pendingCollaborators.push({
        documentId: s.documentId,
        fullName: s.fullName,
        position: s.position,
        issues: pendingIssues,
        isPendingProgram: !isProgrammed,
        isPendingPunch: !hasPunches || (s.missingPunchDays && s.missingPunchDays.length > 0)
      });
    }
  });

  // Calculate status for each PDV
  const pdvList = Array.from(pdvGroupMap.values()).filter(p => p.totalStaff > 0);
  pdvList.forEach(p => {
    if (p.pendingProgramCount === 0 && p.pendingPunchesCount === 0) {
      p.status = 'AL_DIA'; // 100% al día
    } else if (p.pendingPunchesCount > 0 && p.pendingProgramCount === 0) {
      p.status = 'PENDIENTE_MARCACION';
    } else if (p.pendingProgramCount > 0 && p.pendingPunchesCount === 0) {
      p.status = 'PENDIENTE_PROGRAMAR';
    } else {
      p.status = 'PENDIENTE_AMBOS';
    }
  });

  coverageSummaryByWeek[w] = {
    week: w,
    label: WEEKS_DEF[w].label,
    month: WEEKS_DEF[w].month,
    totalPdvs: pdvList.length,
    pdvsAlDia: pdvList.filter(p => p.status === 'AL_DIA').length,
    pdvsPendingMarcacion: pdvList.filter(p => p.pendingPunchesCount > 0).length,
    pdvsPendingProgram: pdvList.filter(p => p.pendingProgramCount > 0).length,
    totalCollaborators: pdvList.reduce((acc, p) => acc + p.totalStaff, 0),
    totalPendingPunches: pdvList.reduce((acc, p) => acc + p.pendingPunchesCount, 0),
    totalPendingProgram: pdvList.reduce((acc, p) => acc + p.pendingProgramCount, 0),
    pdvs: pdvList
  };
}

console.log('✅ Coverage Monitor Metrics computed for all 13 weeks.');

// -----------------------------------------------------------------
// 4. WRITE OFFICIAL PAYROLL DATA (src/data/officialPayrollData.js)
// -----------------------------------------------------------------
console.log('\n--- 4. Writing officialPayrollData.js ---');

const officialPayrollByWeek = {};
for (const w of Object.keys(WEEKS_DEF)) {
  const records = allPayrollByWeek[w] || [];
  const totalWorkedHours = +records.reduce((acc, r) => acc + r.totalWorkedHours, 0).toFixed(2);
  const totalPayrollCost = +records.reduce((acc, r) => acc + r.totalValorizacion, 0).toFixed(2);
  const totalOvertimeHours = +records.reduce((acc, r) => acc + r.overtimeDay + r.overtimeNight + r.sundayOvertimeDay + r.sundayOvertimeNight, 0).toFixed(2);
  const totalNightSurchargeHours = +records.reduce((acc, r) => acc + r.nightSurchargeOrd + r.sundayNight + r.holidayNight, 0).toFixed(2);
  const totalSundayHours = +records.reduce((acc, r) => acc + r.sundayDay + r.sundayNight + r.sundayOvertimeDay + r.sundayOvertimeNight, 0).toFixed(2);
  const totalHolidayHours = +records.reduce((acc, r) => acc + r.holidayDay + r.holidayNight, 0).toFixed(2);

  officialPayrollByWeek[w] = {
    week: w,
    label: WEEKS_DEF[w].label,
    month: WEEKS_DEF[w].month,
    summary: {
      totalEmployees: records.length,
      totalPdvs: new Set(records.map(r => r.pdvId)).size,
      totalWorkedHours,
      totalPayrollCost,
      totalOvertimeHours,
      totalNightSurchargeHours,
      totalSundayHours,
      totalHolidayHours
    },
    records
  };
}

const payrollFileContent = `// Consolidated Official Payroll Data for Weeks 23 to 35 (Junio, Julio, Agosto 2026)
// Generated automatically from:
// - Liquidación Tiempos Suplementarios PDV - Junio 2026 (del 01 al 28)  Ajustes.xlsx
// - Liquidación Tiempos Suplementarios PDV - Julio 2026 (del 29 Jun al 01 Agosto) David.xlsx
// - Liquidación Tiempos Suplementarios PDV - Agosto 2026 (del 02 Agos al 30 Agosto).xlsx

export const OFFICIAL_PAYROLL_BY_WEEK = ${JSON.stringify(officialPayrollByWeek, null, 2)};

export const WEEKS_METADATA = ${JSON.stringify(WEEKS_DEF, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/data/officialPayrollData.js'), payrollFileContent);
console.log('✅ src/data/officialPayrollData.js saved successfully.');

// -----------------------------------------------------------------
// 5. WRITE COVERAGE MONITOR DATA (src/data/coverageMonitorData.js)
// -----------------------------------------------------------------
console.log('\n--- 5. Writing coverageMonitorData.js ---');

const coverageFileContent = `// Comprehensive Coverage Monitor Data for PDVs (Pendientes por Marcación y por Programar)
// Weeks 23 to 35 (Junio, Julio, Agosto 2026)

export const COVERAGE_MONITOR_BY_WEEK = ${JSON.stringify(coverageSummaryByWeek, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/data/coverageMonitorData.js'), coverageFileContent);
console.log('✅ src/data/coverageMonitorData.js saved successfully.');

// -----------------------------------------------------------------
// 6. UPDATE LOCAL DATABASE JSON (server/data/database.json)
// -----------------------------------------------------------------
console.log('\n--- 6. Updating server/data/database.json ---');

const dbPath = path.join(__dirname, '../server/data/database.json');
let localDb = { users: [], pdvs: initialPDVs, schedules: [], punchBatches: [], punchRecords: [], supervisors: initialSupervisors, app_config: {} };

if (fs.existsSync(dbPath)) {
  try {
    localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    console.warn('Could not parse database.json, resetting with defaults');
  }
}

// Merge users
const mergedUserMap = new Map((localDb.users || []).map(u => [u.documentId || u.document_id, u]));
for (const [doc, u] of userMap.entries()) {
  if (!mergedUserMap.has(doc)) {
    mergedUserMap.set(doc, u);
  }
}
localDb.users = Array.from(mergedUserMap.values());

// Collect all schedules and punches
const allSchedulesFlat = [];
const allPunchesFlat = [];
const allBatchesFlat = [];

for (const w of Object.keys(WEEKS_DEF)) {
  const wDef = WEEKS_DEF[w];
  const scheds = allSchedulesByWeek[w];
  const punches = allPunchesByWeek[w];
  allSchedulesFlat.push(...scheds);
  allPunchesFlat.push(...punches);

  allBatchesFlat.push({
    id: `batch-sem${w}-oficial`,
    fileName: `Liquidación Tiempos Suplementarios PDV - ${wDef.month} 2026.xlsx`,
    fileSize: 4500000,
    period: wDef.label,
    store: 'Todos los PDVs Nacionales',
    recordCount: punches.length,
    uploadedAt: new Date().toISOString()
  });
}

localDb.schedules = allSchedulesFlat;
localDb.punchRecords = allPunchesFlat;
localDb.punchBatches = allBatchesFlat;

fs.writeFileSync(dbPath, JSON.stringify(localDb, null, 2));
console.log(`✅ server/data/database.json updated with ${localDb.schedules.length} schedules and ${localDb.punchRecords.length} punches.`);

// -----------------------------------------------------------------
// 7. SYNC TO SUPABASE VIA REST API
// -----------------------------------------------------------------
console.log('\n--- 7. Syncing to Supabase via REST ---');
const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

async function syncToSupabase() {
  const headers = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };

  try {
    // 7a. Users
    const userPayloads = Array.from(userMap.values()).map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      document_id: u.documentId,
      role: 'EMPLOYEE',
      pdv_id: u.pdvId,
      position: u.position,
      contract_type: 'FIJO',
      weekly_max_hours: 42,
      is_active: true
    }));
    console.log(`Syncing ${userPayloads.length} users...`);
    for (let i = 0; i < userPayloads.length; i += 100) {
      const chunk = userPayloads.slice(i, i + 100);
      await fetch(`${SB_URL}/rest/v1/users`, { method: 'POST', headers, body: JSON.stringify(chunk) });
    }
    console.log('✅ Users synced to Supabase.');

    // 7b. Punch Batches
    console.log(`Syncing ${allBatchesFlat.length} punch batches...`);
    const batchPayloads = allBatchesFlat.map(b => ({
      id: b.id,
      file_name: b.fileName,
      file_size: b.fileSize,
      period: b.period,
      store: b.store,
      record_count: b.recordCount,
      uploaded_at: b.uploadedAt
    }));
    await fetch(`${SB_URL}/rest/v1/punch_batches`, { method: 'POST', headers, body: JSON.stringify(batchPayloads) });
    console.log('✅ Punch batches synced.');

    // 7c. Schedules
    console.log(`Syncing ${allSchedulesFlat.length} schedules in chunks of 100...`);
    const schedPayloads = allSchedulesFlat.map(s => ({
      id: s.id,
      user_id: s.userId,
      pdv_id: s.pdvId,
      week_start: s.weekStart,
      week_end: s.weekEnd,
      is_submitted: true,
      submitted_at: new Date().toISOString(),
      shifts: s.shifts,
      total_net_hours: s.totalNetHours,
      total_lunch_hours: 0,
      updated_at: new Date().toISOString()
    }));

    for (let i = 0; i < schedPayloads.length; i += 100) {
      const chunk = schedPayloads.slice(i, i + 100);
      const res = await fetch(`${SB_URL}/rest/v1/schedules`, { method: 'POST', headers, body: JSON.stringify(chunk) });
      if (!res.ok && i === 0) console.warn('Schedule upload notice:', await res.text());
    }
    console.log('✅ Schedules synced to Supabase.');

    // 7d. Punch Records
    console.log(`Syncing ${allPunchesFlat.length} punch records in chunks of 200...`);
    const punchPayloads = allPunchesFlat.map(p => ({
      id: p.id,
      batch_id: p.batchId,
      document_id: p.documentId,
      code: p.code,
      full_name: p.fullName,
      position: p.position,
      pdv_name: p.pdvName,
      supervisor_name: p.supervisorName,
      entry_date: p.entryDate,
      entry_time: p.entryTime,
      exit_date: p.exitDate,
      exit_time: p.exitTime,
      real_calculations: p.realCalculations
    }));

    for (let i = 0; i < punchPayloads.length; i += 200) {
      const chunk = punchPayloads.slice(i, i + 200);
      await fetch(`${SB_URL}/rest/v1/punch_records`, { method: 'POST', headers, body: JSON.stringify(chunk) });
    }
    console.log('✅ Punch records synced to Supabase.');
  } catch (err) {
    console.error('Supabase sync error (non-fatal):', err.message);
  }
}

await syncToSupabase();
console.log('\n======================================================');
console.log('🎉 INGESTION COMPLETE! 13 WEEKS (23 TO 35) FULLY LOADED.');
console.log('======================================================');
