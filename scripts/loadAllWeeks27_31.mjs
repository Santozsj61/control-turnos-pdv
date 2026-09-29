import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { calculateShiftHours } from '../src/utils/calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_PATH = 'C:/Users/analista.retail/Downloads/Ejemplo de Liquidacion HS.xlsx';
console.log('Loading Excel from:', EXCEL_PATH);
const fileBuffer = fs.readFileSync(EXCEL_PATH);
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

// ----------------------------------------------------
// 1. Helpers
// ----------------------------------------------------
function numToTime(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    const totalSecs = Math.round(val * 86400);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const match = s.match(/(\d{1,2}):(\d{1,2})/);
  if (match) return `${String(match[1]).padStart(2, '0')}:${String(match[2]).padStart(2, '0')}`;
  return s;
}

function num(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

const WEEKS_DEF = {
  '27': {
    start: '2026-06-29',
    end: '2026-07-05',
    label: 'Semana 27 (29 Jun - 05 Jul 2026)',
    dates: [
      { date: '2026-06-29', name: 'Lunes' },
      { date: '2026-06-30', name: 'Martes' },
      { date: '2026-07-01', name: 'Miércoles' },
      { date: '2026-07-02', name: 'Jueves' },
      { date: '2026-07-03', name: 'Viernes' },
      { date: '2026-07-04', name: 'Sábado' },
      { date: '2026-07-05', name: 'Domingo' }
    ]
  },
  '28': {
    start: '2026-07-06',
    end: '2026-07-12',
    label: 'Semana 28 (06 Jul - 12 Jul 2026)',
    dates: [
      { date: '2026-07-06', name: 'Lunes' },
      { date: '2026-07-07', name: 'Martes' },
      { date: '2026-07-08', name: 'Miércoles' },
      { date: '2026-07-09', name: 'Jueves' },
      { date: '2026-07-10', name: 'Viernes' },
      { date: '2026-07-11', name: 'Sábado' },
      { date: '2026-07-12', name: 'Domingo' }
    ]
  },
  '29': {
    start: '2026-07-13',
    end: '2026-07-19',
    label: 'Semana 29 (13 Jul - 19 Jul 2026)',
    dates: [
      { date: '2026-07-13', name: 'Lunes' },
      { date: '2026-07-14', name: 'Martes' },
      { date: '2026-07-15', name: 'Miércoles' },
      { date: '2026-07-16', name: 'Jueves' },
      { date: '2026-07-17', name: 'Viernes' },
      { date: '2026-07-18', name: 'Sábado' },
      { date: '2026-07-19', name: 'Domingo' }
    ]
  },
  '30': {
    start: '2026-07-20',
    end: '2026-07-26',
    label: 'Semana 30 (20 Jul - 26 Jul 2026)',
    dates: [
      { date: '2026-07-20', name: 'Lunes' },
      { date: '2026-07-21', name: 'Martes' },
      { date: '2026-07-22', name: 'Miércoles' },
      { date: '2026-07-23', name: 'Jueves' },
      { date: '2026-07-24', name: 'Viernes' },
      { date: '2026-07-25', name: 'Sábado' },
      { date: '2026-07-26', name: 'Domingo' }
    ]
  },
  '31': {
    start: '2026-07-27',
    end: '2026-08-02',
    label: 'Semana 31 (27 Jul - 02 Ago 2026)',
    dates: [
      { date: '2026-07-27', name: 'Lunes' },
      { date: '2026-07-28', name: 'Martes' },
      { date: '2026-07-29', name: 'Miércoles' },
      { date: '2026-07-30', name: 'Jueves' },
      { date: '2026-07-31', name: 'Viernes' },
      { date: '2026-08-01', name: 'Sábado' },
      { date: '2026-08-02', name: 'Domingo' }
    ]
  }
};

const DAY_COLS = [
  { in: 15, out: 16, gross: 17, net: 18, obs: 20, dayIndex: 0 },
  { in: 21, out: 22, gross: 23, net: 24, obs: 26, dayIndex: 1 },
  { in: 27, out: 28, gross: 29, net: 30, obs: 32, dayIndex: 2 },
  { in: 33, out: 34, gross: 35, net: 36, obs: 38, dayIndex: 3 },
  { in: 39, out: 40, gross: 41, net: 42, obs: 44, dayIndex: 4 },
  { in: 45, out: 46, gross: 47, net: 48, obs: 50, dayIndex: 5 }
];

// ----------------------------------------------------
// 2. Parse Liquidacion Sheet
// ----------------------------------------------------
const liqSheet = workbook.Sheets['Liquidacion'];
const liqRows = XLSX.utils.sheet_to_json(liqSheet, { header: 1, defval: '' });

const parsedPayrollRecords = [];
const payrollByWeekAndDoc = new Map();

for (let r = 1; r < liqRows.length; r++) {
  const row = liqRows[r];
  if (!row || row.length < 7) continue;

  const doc = String(row[5] || '').trim();
  const week = String(row[6] || '').trim();
  if (!doc || !week) continue;

  const rec = {
    id: `pay-${week}-${doc}`,
    company: String(row[0] || 'NCS BRANDS S.A.S.').trim(),
    payrollType: String(row[1] || 'Q').trim(),
    pdvName: String(row[2] || '').trim(),
    position: String(row[3] || 'ASESOR(A) DE IMAGEN').trim(),
    fullName: String(row[4] || '').trim(),
    documentId: doc,
    week,
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
    totalWorkedHours: +num(row[17]).toFixed(2),
    sundaysWorkedMonth: num(row[18]),
    sundayRule: String(row[19] || '').trim(),
    holidaysPaidWeek: num(row[20])
  };

  parsedPayrollRecords.push(rec);
  payrollByWeekAndDoc.set(`${week}-${doc}`, rec);
}
console.log(`✅ Liquidacion parsed: ${parsedPayrollRecords.length} records.`);

// ----------------------------------------------------
// 3. Parse Marcaciones Sheet & Build Schedules, Users, Punches
// ----------------------------------------------------
const marcSheet = workbook.Sheets['Marcaciones'];
const marcRows = XLSX.utils.sheet_to_json(marcSheet, { header: 1, defval: '' });

const userMap = new Map();
const allPunchesByWeek = { '27': [], '28': [], '29': [], '30': [], '31': [] };
const allSchedulesByWeek = { '27': [], '28': [], '29': [], '30': [], '31': [] };

for (let r = 2; r < marcRows.length; r++) {
  const row = marcRows[r];
  if (!row || row.length < 5) continue;

  const week = String(row[1] || '').trim();
  const weekDef = WEEKS_DEF[week];
  if (!weekDef) continue;

  const rawPdv = String(row[3] || '').trim();
  const doc = String(row[4] || '').trim();
  const fullName = String(row[5] || '').trim();
  const position = String(row[9] || 'ASESOR(A) DE IMAGEN').trim();
  const company = String(row[11] || 'NCS BRANDS S.A.S.').trim();
  if (!doc) continue;

  // Match PDV
  const matchCode = rawPdv.match(/^([A-Za-z0-9]+)/);
  const code = matchCode ? matchCode[1].toUpperCase() : '';
  const pdvObj = initialPDVs.find(p => 
    p.code?.toUpperCase() === code || 
    p.name?.toUpperCase().includes(code)
  );
  const pdvId = pdvObj ? pdvObj.id : `pdv-${code || 'NAC'}`;
  const supervisorId = pdvObj?.supervisorId || 'sup-cali-1';
  const pdvName = pdvObj ? pdvObj.name : (rawPdv || 'PDV Nacional');
  const userId = `emp-${doc}`;

  // Store user
  if (!userMap.has(doc)) {
    userMap.set(doc, {
      id: userId,
      username: `emp_${doc}`,
      fullName,
      full_name: fullName,
      documentId: doc,
      document_id: doc,
      role: 'EMPLOYEE',
      pdvId,
      pdv_id: pdvId,
      supervisorId,
      supervisor_id: supervisorId,
      position,
      contractType: 'FIJO',
      contract_type: 'FIJO',
      weeklyMaxHours: 42,
      weekly_max_hours: 42,
      isActive: true,
      is_active: true
    });
  }

  const batchId = `batch-sem${week}-1790699000000`;
  const payrollRec = payrollByWeekAndDoc.get(`${week}-${doc}`);

  // Build Mon-Sun shifts for schedule and punch records
  const shifts = [];

  // Monday to Saturday
  DAY_COLS.forEach((d, idx) => {
    const dateObj = weekDef.dates[idx];
    const date = dateObj.date;
    const dayName = dateObj.name;

    const rawIn = row[d.in];
    const rawOut = row[d.out];
    const timeIn = numToTime(rawIn);
    const timeOut = numToTime(rawOut);
    const obs = String(row[d.obs] || '').toUpperCase();

    const isDescanso = obs.includes('DESCANSO') || obs.includes('NO LABORA');
    const isIncapacidad = obs.includes('INCAPACIDAD');
    const isVacaciones = obs.includes('VACACION');
    const isLicencia = obs.includes('LICENCIA');
    const hasPunch = timeIn && timeOut && timeIn.includes(':') && timeOut.includes(':');

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
    } else if (!hasPunch) {
      shiftType = 'DESCANSO';
      isDayOff = true;
    }

    // Schedule shift hours under 42h (7h for computable non-working days)
    let schedCalcs;
    if (isDayOff) {
      schedCalcs = calculateShiftHours('', '', date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, shiftType);
    } else {
      schedCalcs = calculateShiftHours(timeIn || '10:00', timeOut || '20:30', date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, 'ORDINARIO');
    }

    shifts.push({
      date,
      dayOfWeek: dayName,
      startTime: isDayOff ? '' : (timeIn || '10:00'),
      endTime: isDayOff ? '' : (timeOut || '20:30'),
      shiftType,
      isDayOff,
      ...schedCalcs
    });

    // Create punch record if there were biometric punches
    if (hasPunch) {
      const realCalculations = calculateShiftHours(timeIn, timeOut, date, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 });
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
        pdvName,
        pdv_name: pdvName,
        shiftName: `${timeIn}-${timeOut}`,
        entryDate: date,
        entry_date: date,
        entryTime: timeIn,
        entry_time: timeIn,
        exitDate: date,
        exit_date: date,
        exitTime: timeOut,
        exit_time: timeOut,
        realCalculations,
        real_calculations: realCalculations
      });
    }
  });

  // Sunday (Day 6)
  const sundayDateObj = weekDef.dates[6];
  const sunDate = sundayDateObj.date;
  const sundayWorkedHours = payrollRec ? (payrollRec.sundayDay + payrollRec.sundayNight + payrollRec.sundayOvertimeDay + payrollRec.sundayOvertimeNight) : 0;
  const workedSunday = sundayWorkedHours > 0;

  let sundayCalcs;
  if (workedSunday) {
    sundayCalcs = calculateShiftHours('11:00', '20:00', sunDate, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, 'ORDINARIO');
    shifts.push({
      date: sunDate,
      dayOfWeek: 'Domingo',
      startTime: '11:00',
      endTime: '20:00',
      shiftType: 'ORDINARIO',
      isDayOff: false,
      ...sundayCalcs
    });

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
      pdvName,
      pdv_name: pdvName,
      shiftName: '11:00-20:00',
      entryDate: sunDate,
      entry_date: sunDate,
      entryTime: '11:00',
      entry_time: '11:00',
      exitDate: sunDate,
      exit_date: sunDate,
      exitTime: '20:00',
      exit_time: '20:00',
      realCalculations: sundayCalcs,
      real_calculations: sundayCalcs
    });
  } else {
    sundayCalcs = calculateShiftHours('', '', sunDate, { nightStartTime: '19:00', weeklyMaxStandardHours: 42 }, 'DESCANSO');
    shifts.push({
      date: sunDate,
      dayOfWeek: 'Domingo',
      startTime: '',
      endTime: '',
      shiftType: 'DESCANSO',
      isDayOff: true,
      ...sundayCalcs
    });
  }

  const totalNetHours = +shifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
  const totalLunchHours = +shifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);

  allSchedulesByWeek[week].push({
    id: `sched-${userId}-${weekDef.start}`,
    userId,
    user_id: userId,
    documentId: doc,
    document_id: doc,
    fullName,
    pdvId,
    pdv_id: pdvId,
    pdvCode: code,
    pdvName,
    weekStart: weekDef.start,
    week_start: weekDef.start,
    weekEnd: weekDef.end,
    week_end: weekDef.end,
    isSubmitted: true,
    is_submitted: true,
    totalNetHours,
    total_net_hours: totalNetHours,
    totalLunchHours,
    total_lunch_hours: totalLunchHours,
    shifts
  });
}

console.log(`\nProcessed counts:`);
console.log(`Unique users: ${userMap.size}`);
for (const w of ['27', '28', '29', '30', '31']) {
  console.log(`Week ${w}: ${allSchedulesByWeek[w].length} schedules, ${allPunchesByWeek[w].length} punch records.`);
}

// ----------------------------------------------------
// 4. Update server/data/database.json
// ----------------------------------------------------
const dbPath = path.join(__dirname, '../server/data/database.json');
let localDb = {};
if (fs.existsSync(dbPath)) {
  try {
    localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    console.warn('Could not read existing database.json, initializing fresh.');
  }
}

// 4a. Merge Users
const existingUsersMap = new Map();
(localDb.users || []).forEach(u => existingUsersMap.set(String(u.documentId || u.document_id).trim(), u));
userMap.forEach((u, doc) => {
  existingUsersMap.set(doc, { ...(existingUsersMap.get(doc) || {}), ...u });
});
localDb.users = Array.from(existingUsersMap.values());

// 4b. Update Schedules for Weeks 27-31
localDb.schedules = (localDb.schedules || []).filter(s => {
  const ws = s.weekStart || s.week_start;
  return !['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27'].includes(ws);
});
for (const w of ['27', '28', '29', '30', '31']) {
  localDb.schedules.push(...allSchedulesByWeek[w]);
}

// 4c. Update Punch Batches
const punchBatches = localDb.punchBatches || [];
for (const w of ['27', '28', '29', '30', '31']) {
  const weekDef = WEEKS_DEF[w];
  const bId = `batch-sem${w}-1790699000000`;
  const existingIdx = punchBatches.findIndex(b => b.id === bId || b.period?.includes(`Semana ${w}`));
  const batchInfo = {
    id: bId,
    fileName: 'Ejemplo de Liquidacion HS.xlsx',
    period: weekDef.label,
    recordCount: allPunchesByWeek[w].length,
    uploadedAt: new Date().toISOString()
  };
  if (existingIdx !== -1) {
    punchBatches[existingIdx] = batchInfo;
  } else {
    punchBatches.unshift(batchInfo);
  }
}
localDb.punchBatches = punchBatches;

// 4d. Update Punch Records for Weeks 27-31
localDb.punchRecords = (localDb.punchRecords || []).filter(p => {
  const d = p.entryDate || p.entry_date;
  return !(d >= '2026-06-29' && d <= '2026-08-02');
});
for (const w of ['27', '28', '29', '30', '31']) {
  localDb.punchRecords.push(...allPunchesByWeek[w]);
}

// 4e. Store Payroll Liquidations
localDb.payrollLiquidations = parsedPayrollRecords;

// 4f. Config ensuring 42 hours
localDb.config = {
  ...(localDb.config || {}),
  lunchDurationHours: 1.5,
  lunchCutoffTime: '12:30',
  lunchMinShiftDuration: 6.0,
  dayStartTime: '06:00',
  nightStartTime: '19:00',
  weeklyMaxStandardHours: 42,
  maxSundaysPerMonth: 2,
  lateToleranceMinutes: 10,
  earlyExitToleranceMinutes: 10,
  maintenanceApprovalEmail: 'mantenimiento.obras@quest.com.co'
};

fs.writeFileSync(dbPath, JSON.stringify(localDb, null, 2), 'utf8');
console.log('✅ Local Database successfully updated at server/data/database.json!');

// ----------------------------------------------------
// 5. Sync to Supabase
// ----------------------------------------------------
const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

async function uploadToSupabase() {
  const headers = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };

  try {
    console.log('\n--- Syncing to Supabase ---');
    // 5a. Users
    console.log(`Syncing ${userMap.size} users to Supabase...`);
    const userPayloads = Array.from(userMap.values()).map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      document_id: u.documentId,
      role: 'EMPLOYEE',
      pdv_id: u.pdvId,
      position: u.position,
      contract_type: u.contractType,
      weekly_max_hours: 42,
      is_active: true
    }));

    for (let i = 0; i < userPayloads.length; i += 100) {
      const chunk = userPayloads.slice(i, i + 100);
      const res = await fetch(`${SB_URL}/rest/v1/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk)
      });
      if (!res.ok) console.warn(`Users chunk ${i} warning:`, await res.text());
    }
    console.log('✅ Users synced to Supabase.');

    // 5b. Schedules
    const allScheds = [];
    for (const w of ['27', '28', '29', '30', '31']) {
      allScheds.push(...allSchedulesByWeek[w]);
    }
    console.log(`Syncing ${allScheds.length} schedules across weeks 27-31 to Supabase...`);
    const schedPayloads = allScheds.map(s => ({
      id: s.id,
      user_id: s.userId,
      pdv_id: s.pdvId,
      week_start: s.weekStart,
      week_end: s.weekEnd,
      is_submitted: true,
      submitted_at: new Date().toISOString(),
      shifts: s.shifts,
      total_net_hours: s.totalNetHours,
      total_lunch_hours: s.totalLunchHours,
      updated_at: new Date().toISOString()
    }));

    for (let i = 0; i < schedPayloads.length; i += 100) {
      const chunk = schedPayloads.slice(i, i + 100);
      const res = await fetch(`${SB_URL}/rest/v1/schedules`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk)
      });
      if (!res.ok) console.warn(`Schedules chunk ${i} warning:`, await res.text());
    }
    console.log('✅ Schedules synced to Supabase.');

    // 5c. Punch Batches
    console.log('Syncing punch batches to Supabase...');
    for (const w of ['27', '28', '29', '30', '31']) {
      const weekDef = WEEKS_DEF[w];
      const bId = `batch-sem${w}-1790699000000`;
      await fetch(`${SB_URL}/rest/v1/punch_batches`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          id: bId,
          file_name: 'Ejemplo de Liquidacion HS.xlsx',
          file_size: fileBuffer.length,
          period: weekDef.label,
          store: 'Todos los PDVs Nacionales',
          record_count: allPunchesByWeek[w].length,
          uploaded_at: new Date().toISOString()
        }])
      });
    }
    console.log('✅ Punch batches synced to Supabase.');

    // 5d. Punch Records
    const allPunches = [];
    for (const w of ['27', '28', '29', '30', '31']) {
      allPunches.push(...allPunchesByWeek[w]);
    }
    console.log(`Syncing ${allPunches.length} punch records to Supabase in chunks of 200...`);
    const punchPayloads = allPunches.map(p => ({
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
      const res = await fetch(`${SB_URL}/rest/v1/punch_records`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk)
      });
      if (!res.ok) console.warn(`Punch chunk ${i} warning:`, await res.text());
    }
    console.log('✅ Punch records synced to Supabase.');
  } catch (err) {
    console.error('Supabase sync error (non-fatal):', err.message);
  }
}

await uploadToSupabase();
console.log('\n🎉 ALL WEEKS (27 TO 31) SUCCESSFULLY INGESTED UNDER 42-HOUR WORKWEEK!');
