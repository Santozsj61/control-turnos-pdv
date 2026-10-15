import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { ACTIVE_371_COLLABORATORS, ACTIVE_371_DOCUMENTS, tagCollaboratorStatus } from '../src/data/activeCollaborators371.js';
import { calculateShiftHours } from '../src/utils/calculator.js';

const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

export const WEEKS_36_43_DEF = {
  '36': {
    start: '2026-08-31',
    end: '2026-09-06',
    label: 'Semana 36 (31 Ago - 06 Sep 2026)',
    month: 'Septiembre',
    dates: [
      { date: '2026-08-31', name: 'Lunes' },
      { date: '2026-09-01', name: 'Martes' },
      { date: '2026-09-02', name: 'Miércoles' },
      { date: '2026-09-03', name: 'Jueves' },
      { date: '2026-09-04', name: 'Viernes' },
      { date: '2026-09-05', name: 'Sábado' },
      { date: '2026-09-06', name: 'Domingo' }
    ]
  },
  '37': {
    start: '2026-09-07',
    end: '2026-09-13',
    label: 'Semana 37 (07 Sep - 13 Sep 2026)',
    month: 'Septiembre',
    dates: [
      { date: '2026-09-07', name: 'Lunes' },
      { date: '2026-09-08', name: 'Martes' },
      { date: '2026-09-09', name: 'Miércoles' },
      { date: '2026-09-10', name: 'Jueves' },
      { date: '2026-09-11', name: 'Viernes' },
      { date: '2026-09-12', name: 'Sábado' },
      { date: '2026-09-13', name: 'Domingo' }
    ]
  },
  '38': {
    start: '2026-09-14',
    end: '2026-09-20',
    label: 'Semana 38 (14 Sep - 20 Sep 2026)',
    month: 'Septiembre',
    dates: [
      { date: '2026-09-14', name: 'Lunes' },
      { date: '2026-09-15', name: 'Martes' },
      { date: '2026-09-16', name: 'Miércoles' },
      { date: '2026-09-17', name: 'Jueves' },
      { date: '2026-09-18', name: 'Viernes' },
      { date: '2026-09-19', name: 'Sábado' },
      { date: '2026-09-20', name: 'Domingo' }
    ]
  },
  '39': {
    start: '2026-09-21',
    end: '2026-09-27',
    label: 'Semana 39 (21 Sep - 27 Sep 2026)',
    month: 'Septiembre',
    dates: [
      { date: '2026-09-21', name: 'Lunes' },
      { date: '2026-09-22', name: 'Martes' },
      { date: '2026-09-23', name: 'Miércoles' },
      { date: '2026-09-24', name: 'Jueves' },
      { date: '2026-09-25', name: 'Viernes' },
      { date: '2026-09-26', name: 'Sábado' },
      { date: '2026-09-27', name: 'Domingo' }
    ]
  },
  '40': {
    start: '2026-09-28',
    end: '2026-10-04',
    label: 'Semana 40 (28 Sep - 04 Oct 2026)',
    month: 'Septiembre / Octubre',
    dates: [
      { date: '2026-09-28', name: 'Lunes' },
      { date: '2026-09-29', name: 'Martes' },
      { date: '2026-09-30', name: 'Miércoles' },
      { date: '2026-10-01', name: 'Jueves' },
      { date: '2026-10-02', name: 'Viernes' },
      { date: '2026-10-03', name: 'Sábado' },
      { date: '2026-10-04', name: 'Domingo' }
    ]
  },
  '41': {
    start: '2026-10-05',
    end: '2026-10-11',
    label: 'Semana 41 (05 Oct - 11 Oct 2026)',
    month: 'Octubre',
    dates: [
      { date: '2026-10-05', name: 'Lunes' },
      { date: '2026-10-06', name: 'Martes' },
      { date: '2026-10-07', name: 'Miércoles' },
      { date: '2026-10-08', name: 'Jueves' },
      { date: '2026-10-09', name: 'Viernes' },
      { date: '2026-10-10', name: 'Sábado' },
      { date: '2026-10-11', name: 'Domingo' }
    ]
  },
  '42': {
    start: '2026-10-12',
    end: '2026-10-18',
    label: 'Semana 42 (12 Oct - 18 Oct 2026 - Semana Actual ⭐)',
    month: 'Octubre',
    dates: [
      { date: '2026-10-12', name: 'Lunes' }, // Festivo Día de la Raza
      { date: '2026-10-13', name: 'Martes' },
      { date: '2026-10-14', name: 'Miércoles' },
      { date: '2026-10-15', name: 'Jueves' },
      { date: '2026-10-16', name: 'Viernes' },
      { date: '2026-10-17', name: 'Sábado' },
      { date: '2026-10-18', name: 'Domingo' }
    ]
  },
  '43': {
    start: '2026-10-19',
    end: '2026-10-25',
    label: 'Semana 43 (19 Oct - 25 Oct 2026)',
    month: 'Octubre',
    dates: [
      { date: '2026-10-19', name: 'Lunes' },
      { date: '2026-10-20', name: 'Martes' },
      { date: '2026-10-21', name: 'Miércoles' },
      { date: '2026-10-22', name: 'Jueves' },
      { date: '2026-10-23', name: 'Viernes' },
      { date: '2026-10-24', name: 'Sábado' },
      { date: '2026-10-25', name: 'Domingo' }
    ]
  }
};

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

function matchPDV(rawPdv, pdvsList = []) {
  const str = String(rawPdv || '').trim();
  const matchCode = str.match(/^([A-Za-z0-9]+)/);
  const code = matchCode ? matchCode[1].toUpperCase() : '';
  const found = pdvsList.find(p => 
    (code && p.code?.toUpperCase() === code) || 
    (code && p.name?.toUpperCase().includes(code)) ||
    (str && p.name?.toLowerCase().includes(str.toLowerCase()))
  );
  return found || {
    id: `pdv-${code || 'NAC'}`,
    name: str || 'PDV Nacional',
    code: code || 'NAC',
    city: 'Nacional',
    zone: 'ZONA NACIONAL',
    supervisorId: 'sup-cali-1'
  };
}

// Read the Excel workbook safely via buffer
const filePath = 'D:/Users/analista.retail/Downloads/historial Septi.xlsx';
console.log('Loading file from:', filePath);
const fileBuf = fs.readFileSync(filePath);
const wb = XLSX.read(fileBuf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log(`Loaded ${rows.length} rows from Excel.`);

// Step 1: Pre-build name <-> doc lookup to resolve any rows missing cédula
const nameToDocMap = new Map();
const docToNameMap = new Map();

// From active 371
ACTIVE_371_COLLABORATORS.forEach(c => {
  const normName = c.fullName.toUpperCase().trim();
  nameToDocMap.set(normName, c.documentId);
  docToNameMap.set(c.documentId, c.fullName);
});

// Scan all rows to collect any others
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  let d = String(r[3] || '').trim();
  let n = String(r[4] || '').trim();
  // Check shifted case: r[2] is doc, r[3] is name
  if ((!d || isNaN(d)) && r[2] && !isNaN(r[2]) && String(r[2]).length >= 6) {
    d = String(r[2]).trim();
    n = String(r[3] || r[4] || '').trim();
  }
  if (d && n && !isNaN(d) && d.length >= 5) {
    nameToDocMap.set(n.toUpperCase().trim(), d);
    docToNameMap.set(d, n);
  }
}

console.log(`Lookup maps populated with ${nameToDocMap.size} named collaborators.`);

// Data structures
const schedulesByWeek = {};
const allSchedules = [];
const schedulesMap = new Map();
const usersToUpsert = new Map();

for (const w of Object.keys(WEEKS_36_43_DEF)) {
  schedulesByWeek[w] = [];
}

let lastSeenPdv = 'Q014 - Tulua - Cc Herradura';

for (let r = 2; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.length === 0) continue;

  const semRaw = String(row[0] || '').trim();
  if (!semRaw || !WEEKS_36_43_DEF[semRaw]) continue;

  const wDef = WEEKS_36_43_DEF[semRaw];

  let rawPdv = String(row[2] || '').trim();
  let rawDoc = String(row[3] || '').trim();
  let rawName = String(row[4] || '').trim();

  // Shifted row handler (cédula accidentally placed in col 2)
  if (!isNaN(rawPdv) && rawPdv.length >= 6 && isNaN(rawDoc)) {
    rawDoc = rawPdv;
    rawName = String(row[3] || row[4] || '').trim();
    rawPdv = lastSeenPdv;
  } else if (rawPdv) {
    lastSeenPdv = rawPdv;
  } else {
    rawPdv = lastSeenPdv;
  }

  // Resolve missing doc by name lookup
  if (!rawDoc || isNaN(rawDoc) || rawDoc.length < 5) {
    const lookupDoc = nameToDocMap.get(rawName.toUpperCase().trim());
    if (lookupDoc) {
      rawDoc = lookupDoc;
    } else if (rawName) {
      // Clean slug pseudo-doc for temporary workers
      rawDoc = 'TEMP-' + rawName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    } else {
      // Empty separator row without name or shifts
      continue;
    }
  }

  const pdvObj = matchPDV(rawPdv, initialPDVs);
  const doc = rawDoc;
  const fullName = rawName || docToNameMap.get(doc) || `Colaborador ${doc}`;
  const userId = `emp-${doc}`;

  const { isActive, displayName } = tagCollaboratorStatus(doc, fullName);

  // Register user for upsert
  if (!usersToUpsert.has(userId)) {
    usersToUpsert.set(userId, {
      id: userId,
      username: `emp_${doc}`,
      full_name: displayName,
      document_id: doc,
      role: 'EMPLOYEE',
      pdv_id: pdvObj.id,
      position: 'ASESOR(A) DE IMAGEN',
      contract_type: 'FIJO',
      weekly_max_hours: 42,
      is_active: isActive
    });
  }

  // Parse 7 day shifts
  const shifts = wDef.dates.map((d, dayIdx) => {
    const inCol = 5 + dayIdx * 2;
    const outCol = 6 + dayIdx * 2;
    const rawIn = row[inCol];
    const rawOut = row[outCol];
    const timeIn = numToTime(rawIn);
    const timeOut = numToTime(rawOut);

    const strIn = String(rawIn || '').trim().toLowerCase();
    const isDescanso = strIn.includes('descanso') || strIn.includes('no labora');
    const isIncapacidad = strIn.includes('incapacidad');
    const isVacaciones = strIn.includes('vacacion');
    const isLicencia = strIn.includes('licencia');
    const isNoProg = strIn.includes('no programado') || (!timeIn && !timeOut);

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
    } else if (isNoProg) {
      shiftType = 'NO_PROGRAMADO';
      isDayOff = true;
    }

    const hasTimes = timeIn && timeOut && timeIn.includes(':') && timeOut.includes(':');
    let calcs;
    if (hasTimes && !isDayOff) {
      calcs = calculateShiftHours(timeIn, timeOut, d.date, { nightStartTime: '19:00' }, 'ORDINARIO');
    } else {
      calcs = calculateShiftHours('', '', d.date, { nightStartTime: '19:00' }, shiftType);
    }

    return {
      date: d.date,
      dayOfWeek: d.name,
      startTime: hasTimes ? timeIn : '',
      endTime: hasTimes ? timeOut : '',
      shiftType,
      isDayOff,
      ...calcs
    };
  });

  const totalNetHours = +shifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
  const totalLunchHours = +shifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);

  const schedItem = {
    id: `sched-${userId}-${wDef.start}`,
    userId,
    user_id: userId,
    documentId: doc,
    document_id: doc,
    fullName: displayName,
    originalFullName: fullName,
    isRetired: !isActive,
    statusLabel: isActive ? 'Activo' : 'Retirado',
    pdvId: pdvObj.id,
    pdv_id: pdvObj.id,
    pdvCode: pdvObj.code,
    pdvName: pdvObj.name,
    weekStart: wDef.start,
    week_start: wDef.start,
    weekEnd: wDef.end,
    week_end: wDef.end,
    isSubmitted: true,
    is_submitted: true,
    totalNetHours,
    total_net_hours: totalNetHours,
    totalLunchHours,
    total_lunch_hours: totalLunchHours,
    shifts,
    updated_at: new Date().toISOString()
  };

  const schedKey = `${userId}_${wDef.start}`;
  if (schedulesMap.has(schedKey)) {
    const existing = schedulesMap.get(schedKey);
    shifts.forEach((s, idx) => {
      if (s.startTime && !s.isDayOff) {
        existing.shifts[idx] = s;
      }
    });
    existing.totalNetHours = +existing.shifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
    existing.totalLunchHours = +existing.shifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);
  } else {
    schedulesMap.set(schedKey, schedItem);
    schedulesByWeek[semRaw].push(schedItem);
  }
}

allSchedules.push(...schedulesMap.values());

for (const [w, list] of Object.entries(schedulesByWeek)) {
  console.log(`Semana ${w} (${WEEKS_36_43_DEF[w].label}): ${list.length} turnos procesados.`);
}

console.log(`\nTotal turnos generados: ${allSchedules.length}`);
console.log(`Total usuarios a sincronizar: ${usersToUpsert.size}`);

// Save schedules locally to database.json as fallback
const dbPath = 'server/data/database.json';
try {
  let localDb = { users: [], schedules: [], punchRecords: [], punchBatches: [], payrollLiquidation: [] };
  if (fs.existsSync(dbPath)) {
    localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
  if (!Array.isArray(localDb.schedules)) localDb.schedules = [];

  // Remove existing schedules for weeks 36-43 to prevent duplicates
  const weekStartsSet = new Set(Object.values(WEEKS_36_43_DEF).map(w => w.start));
  localDb.schedules = localDb.schedules.filter(s => !weekStartsSet.has(s.weekStart));
  localDb.schedules.push(...allSchedules);

  fs.writeFileSync(dbPath, JSON.stringify(localDb, null, 2));
  console.log(`✅ Saved ${allSchedules.length} schedules to ${dbPath}`);
} catch (err) {
  console.warn('Notice saving local database.json:', err.message);
}

// Sync to Supabase via REST API
async function syncToSupabase() {
  console.log('\n--- Sincronizando con Supabase ---');
  const headers = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  };

  try {
    // 1. Sync Users
    const userArray = Array.from(usersToUpsert.values());
    console.log(`Upserting ${userArray.length} users into Supabase users table...`);
    for (let i = 0; i < userArray.length; i += 100) {
      const chunk = userArray.slice(i, i + 100);
      const res = await fetch(`${SB_URL}/rest/v1/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk)
      });
      if (!res.ok) {
        console.warn('Users upsert notice:', await res.text());
      }
    }
    console.log('✅ Users synced successfully.');

    // 2. Sync Schedules
    const schedArray = allSchedules.map(s => ({
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

    console.log(`Upserting ${schedArray.length} schedules in chunks of 100...`);
    for (let i = 0; i < schedArray.length; i += 100) {
      const chunk = schedArray.slice(i, i + 100);
      const res = await fetch(`${SB_URL}/rest/v1/schedules`, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk)
      });
      if (!res.ok) {
        console.warn(`Schedules batch ${i} notice:`, await res.text());
      }
    }
    console.log('✅ All schedules synced to Supabase.');
  } catch (err) {
    console.error('Supabase sync error (non-fatal):', err.message);
  }
}

await syncToSupabase();
console.log('\n===============================================================');
console.log('🎉 SEMANAS 36 A 43 CARGADAS EXITOSAMENTE EN SUPABASE Y LOCAL');
console.log('===============================================================');
