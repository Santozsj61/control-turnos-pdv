import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { calculateShiftHours } from '../src/utils/calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_PATH = fs.existsSync('C:/Users/analista.retail/Downloads/Sem 28.xlsx')
  ? 'C:/Users/analista.retail/Downloads/Sem 28.xlsx'
  : path.join(__dirname, '../Sem_28_copy.xlsx');

console.log('Loading Excel from:', EXCEL_PATH);
const fileBuffer = fs.readFileSync(EXCEL_PATH);
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

// ----------------------------------------------------
// 1. Helper Functions
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

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return s;
}

// ----------------------------------------------------
// 2. Parse Cronograma (Malla Semana 28: 2026-07-06 -> 2026-07-12)
// ----------------------------------------------------
const cronoSheet = workbook.Sheets['Cronograma'];
const cronoRows = XLSX.utils.sheet_to_json(cronoSheet, { header: 1, defval: '' });

const weekDates = [
  { date: '2026-07-06', dayName: 'Lunes', inCol: 3, outCol: 4 },
  { date: '2026-07-07', dayName: 'Martes', inCol: 5, outCol: 6 },
  { date: '2026-07-08', dayName: 'Miércoles', inCol: 7, outCol: 8 },
  { date: '2026-07-09', dayName: 'Jueves', inCol: 9, outCol: 10 },
  { date: '2026-07-10', dayName: 'Viernes', inCol: 11, outCol: 12 },
  { date: '2026-07-11', dayName: 'Sábado', inCol: 13, outCol: 14 },
  { date: '2026-07-12', dayName: 'Domingo', inCol: 15, outCol: 16 }
];

const parsedSchedules = [];
const parsedUsers = [];

for (let r = 1; r < cronoRows.length; r++) {
  const row = cronoRows[r];
  if (!row || row.length < 3) continue;

  const rawPdv = String(row[0] || '').trim();
  const doc = String(row[1] || '').trim();
  const fullName = String(row[2] || '').trim();
  if (!doc || !rawPdv) continue;

  const matchCode = rawPdv.match(/^([A-Za-z0-9]+)/);
  const code = matchCode ? matchCode[1] : '';
  const pdvObj = initialPDVs.find(p => 
    p.code?.toUpperCase() === code.toUpperCase() || 
    p.name?.toUpperCase().includes(code.toUpperCase())
  );
  const pdvId = pdvObj ? pdvObj.id : `pdv-${code}`;
  const supervisorId = pdvObj?.supervisorId || 'sup-cali-1';

  const shifts = weekDates.map(wd => {
    const rawIn = row[wd.inCol];
    const rawOut = row[wd.outCol];
    const timeIn = numToTime(rawIn);
    const timeOut = numToTime(rawOut);

    const isDescanso = typeof rawIn === 'string' && (rawIn.toLowerCase().includes('descanso') || rawIn.toLowerCase().includes('no labora'));
    const isIncapacidad = typeof rawIn === 'string' && rawIn.toLowerCase().includes('incapacidad');
    const isVacaciones = typeof rawIn === 'string' && rawIn.toLowerCase().includes('vacacion');
    const isLicencia = typeof rawIn === 'string' && rawIn.toLowerCase().includes('licencia');
    const isNoProg = typeof rawIn === 'string' && (rawIn.toLowerCase().includes('no programado') || rawIn === '');

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
    } else if (isNoProg || (!timeIn && !timeOut)) {
      shiftType = 'NO_PROGRAMADO';
      isDayOff = true;
    }

    const hasTimes = timeIn && timeOut && timeIn.includes(':') && timeOut.includes(':');
    let calcs;
    if (hasTimes && !isDayOff) {
      calcs = calculateShiftHours(timeIn, timeOut, wd.date, { nightStartTime: '19:00' }, 'ORDINARIO');
    } else {
      calcs = calculateShiftHours('', '', wd.date, { nightStartTime: '19:00' }, shiftType);
    }

    return {
      date: wd.date,
      dayOfWeek: wd.dayName,
      startTime: hasTimes ? timeIn : '',
      endTime: hasTimes ? timeOut : '',
      shiftType,
      isDayOff,
      ...calcs
    };
  });

  const totalNetHours = +shifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
  const totalLunchHours = +shifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);
  const userId = `emp-${doc}`;

  parsedUsers.push({
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
    position: 'ASESOR(A) DE IMAGEN',
    contractType: 'FIJO',
    contract_type: 'FIJO',
    isActive: true,
    is_active: true
  });

  parsedSchedules.push({
    id: `sched-${userId}-2026-07-06`,
    userId,
    user_id: userId,
    documentId: doc,
    document_id: doc,
    fullName,
    pdvId,
    pdv_id: pdvId,
    pdvCode: code,
    pdvName: pdvObj ? pdvObj.name : rawPdv,
    weekStart: '2026-07-06',
    week_start: '2026-07-06',
    weekEnd: '2026-07-12',
    week_end: '2026-07-12',
    isSubmitted: true,
    is_submitted: true,
    totalNetHours,
    total_net_hours: totalNetHours,
    totalLunchHours,
    total_lunch_hours: totalLunchHours,
    shifts
  });
}

console.log(`Cronograma Parsed: ${parsedSchedules.length} schedules across ${parsedUsers.length} employees.`);

// ----------------------------------------------------
// 3. Parse Marcacion (Marcaciones Biométricas)
// ----------------------------------------------------
const marcaSheet = workbook.Sheets['Marcacion'];
const marcaRows = XLSX.utils.sheet_to_json(marcaSheet, { defval: '' });

const batchId = `batch-sem28-${Date.now()}`;
const parsedPunches = [];

marcaRows.forEach((r, idx) => {
  const doc = String(r['Documento de Identidad'] || r['Documento'] || '').trim();
  if (!doc) return;

  const nombre = String(r['Nombre'] || '').trim();
  const apellido1 = String(r['Primer Apellido'] || '').trim();
  const apellido2 = String(r['Segundo Apellido'] || '').trim();
  const fullName = `${nombre} ${apellido1} ${apellido2}`.replace(/\s+/g, ' ').trim();
  const position = String(r['Especialidad'] || 'ASESOR(A) DE IMAGEN').trim();
  const area = String(r['Área'] || 'RETAIL').trim();
  const supervisorName = String(r['Supervisor'] || 'Líder Regional').trim();
  const shiftName = String(r['Turno'] || '').trim();

  const entryDate = normalizeDate(r['Fecha Entrada'] || r['Fecha entrada']);
  const entryTime = String(r['Hora Entrada'] || r['Hora entrada'] || '').trim();
  const exitDate = normalizeDate(r['Fecha Salida'] || r['Fecha salida']) || entryDate;
  const exitTime = String(r['Hora Salida'] || r['Hora salida'] || '').trim();

  const cleanIn = entryTime.substring(0, 5);
  const cleanOut = exitTime.substring(0, 5);

  let realCalculations = {
    grossHours: 0,
    lunchHours: 0,
    netHours: 0,
    dayHours: 0,
    nightHours: 0,
    isSunday: false,
    sundayDayHours: 0,
    sundayNightHours: 0,
    lunchApplied: false,
    lunchReason: 'Sin marcación completa'
  };

  if (cleanIn && cleanOut && cleanIn.includes(':') && cleanOut.includes(':')) {
    realCalculations = calculateShiftHours(cleanIn, cleanOut, entryDate, { nightStartTime: '19:00' });
  }

  // Lookup matching schedule for PDV name
  const matchedSched = parsedSchedules.find(s => s.documentId === doc);

  parsedPunches.push({
    id: `punch-sem28-${idx + 1}`,
    batchId,
    batch_id: batchId,
    documentId: doc,
    document_id: doc,
    code: `COD-${doc.slice(-4)}`,
    fullName,
    full_name: fullName,
    position,
    area,
    supervisorName,
    supervisor_name: supervisorName,
    pdvName: matchedSched ? matchedSched.pdvName : 'PDV Nacional',
    pdv_name: matchedSched ? matchedSched.pdvName : 'PDV Nacional',
    shiftName,
    entryDate,
    entry_date: entryDate,
    entryTime,
    entry_time: entryTime,
    exitDate,
    exit_date: exitDate,
    exitTime,
    exit_time: exitTime,
    rutEmployer: String(r['Rut Empleador'] || ''),
    insideEntry: String(r['Dentro de Recinto(Entrada)'] || ''),
    insideExit: String(r['Dentro de Recinto(Salida)'] || ''),
    realCalculations,
    real_calculations: realCalculations
  });
});

console.log(`Marcaciones Parsed: ${parsedPunches.length} punch records.`);

// ----------------------------------------------------
// 4. Update Local Database (server/data/database.json)
// ----------------------------------------------------
const dbPath = path.join(__dirname, '../server/data/database.json');
let localDb = {
  users: [],
  supervisors: [...initialSupervisors],
  pdvs: [...initialPDVs],
  schedules: [],
  permissions: [],
  punchBatches: [],
  punchRecords: [],
  supplementaryJustifications: [],
  config: {
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
  }
};

if (fs.existsSync(dbPath)) {
  try {
    localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    console.warn('Could not read existing db, initializing fresh.');
  }
}

// 4a. Merge Users
const userMap = new Map();
(localDb.users || []).forEach(u => userMap.set(String(u.documentId || u.document_id).trim(), u));
parsedUsers.forEach(u => {
  if (!userMap.has(u.documentId)) {
    userMap.set(u.documentId, u);
  }
});
localDb.users = Array.from(userMap.values());

// 4b. Replace/Add Schedules for week 2026-07-06
localDb.schedules = (localDb.schedules || []).filter(s => (s.weekStart || s.week_start) !== '2026-07-06');
localDb.schedules.push(...parsedSchedules);

// 4c. Add Punch Batch
const punchBatchInfo = {
  id: batchId,
  fileName: 'Sem 28.xlsx',
  period: 'Semana 28 (06 Jul - 12 Jul 2026)',
  recordCount: parsedPunches.length,
  uploadedAt: new Date().toISOString()
};
localDb.punchBatches = localDb.punchBatches || [];
localDb.punchBatches.unshift(punchBatchInfo);

// 4d. Add Punch Records for Week 28
localDb.punchRecords = (localDb.punchRecords || []).filter(p => {
  const d = p.entryDate || p.entry_date;
  return !(d >= '2026-07-06' && d <= '2026-07-12');
});
localDb.punchRecords.push(...parsedPunches);

// Write to database.json
fs.writeFileSync(dbPath, JSON.stringify(localDb, null, 2), 'utf8');
console.log('✅ Local Database successfully updated at server/data/database.json!');

// ----------------------------------------------------
// 5. Upload to Supabase in Batches
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
    console.log('Syncing users to Supabase...');
    const userPayloads = parsedUsers.map(u => ({
      id: u.id,
      username: u.username,
      full_name: u.fullName,
      document_id: u.documentId,
      role: 'EMPLOYEE',
      pdv_id: u.pdvId,
      position: u.position,
      contract_type: u.contractType,
      is_active: true
    }));

    for (let i = 0; i < userPayloads.length; i += 100) {
      const chunk = userPayloads.slice(i, i + 100);
      const res = await fetch(`${SB_URL}/rest/v1/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk)
      });
      if (!res.ok) {
        console.warn(`User chunk ${i} warning:`, await res.text());
      }
    }
    console.log('✅ Users synced to Supabase.');

    console.log('Syncing schedules for week 28 to Supabase...');
    const schedPayloads = parsedSchedules.map(s => ({
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
      if (!res.ok) {
        console.warn(`Schedule chunk ${i} warning:`, await res.text());
      }
    }
    console.log('✅ Schedules synced to Supabase.');

    console.log('Syncing punch batch and records to Supabase...');
    await fetch(`${SB_URL}/rest/v1/punch_batches`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{
        id: batchId,
        file_name: 'Sem 28.xlsx',
        file_size: fileBuffer.length,
        period: 'Semana 28 (06 Jul - 12 Jul 2026)',
        store: 'Todos los PDVs Nacionales',
        record_count: parsedPunches.length,
        uploaded_at: new Date().toISOString()
      }])
    });

    const punchPayloads = parsedPunches.map(p => ({
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
      if (!res.ok) {
        console.warn(`Punch chunk ${i} warning:`, await res.text());
      }
    }
    console.log('✅ Punch records synced to Supabase.');
  } catch (sbErr) {
    console.error('Supabase sync error (non-fatal, local DB is ready):', sbErr.message);
  }
}

await uploadToSupabase();
console.log('🎉 Week 28 processing and ingestion complete!');
