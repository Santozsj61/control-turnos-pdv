import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = 'D:/Users/analista.retail/Downloads/horarios habituales.xlsx';
const buf = fs.readFileSync(excelPath);
const wb = xlsx.read(buf, { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

function numToTime(val) {
  if (val === null || val === undefined || val === '' || val === 0) return null;
  if (typeof val === 'string') return val.trim();
  const totalMinutes = Math.round(val * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

const dayKeys = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const shortDays = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

const storeSchedules = {};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const co = r[0];
  const rawName = (r[1] || '').toString().trim();
  const match = rawName.match(/^([A-Za-z0-9]+)/);
  const code = match ? match[1].toUpperCase() : null;
  const locationType = (r[2] || '').toString().trim();

  const daysObj = {};
  const byDayIndex = [];

  for (let d = 0; d < 7; d++) {
    const open = numToTime(r[3 + d * 2]);
    const close = numToTime(r[4 + d * 2]);
    const isClosed = !open || !close || (open === '00:00' && close === '00:00');
    
    const dayData = {
      dayIndex: d,
      dayKey: dayKeys[d],
      dayName: dayNames[d],
      shortDay: shortDays[d],
      open: isClosed ? null : open,
      close: isClosed ? null : close,
      isClosed,
      label: isClosed ? 'Cerrado' : `${open} - ${close}`
    };

    daysObj[dayKeys[d]] = dayData;
    byDayIndex.push(dayData);
  }

  storeSchedules[code] = {
    co,
    code,
    name: rawName,
    locationType,
    days: daysObj,
    byDayIndex
  };
}

const codeMapStr = JSON.stringify(storeSchedules, null, 2);

const outputContent = `/**
 * Horarios Habituales Oficiales por Punto de Venta (PDV)
 * Extraído del archivo oficial: horarios habituales.xlsx
 * Incluye los 101 PDVs con sus horarios de apertura y cierre por día de la semana (Lunes a Domingo).
 * No modificable en la interfaz (estricto solo lectura).
 */

export const HABITUAL_SCHEDULES_BY_CODE = ${codeMapStr};

/**
 * Normaliza y busca el horario habitual para un PDV dado (por ID, código, nombre u objeto)
 */
export function getHabitualScheduleForPdv(pdvOrCode) {
  if (!pdvOrCode) return null;
  
  // Si es un objeto PDV
  let code = null;
  if (typeof pdvOrCode === 'object') {
    code = pdvOrCode.code;
    if (!code && pdvOrCode.name) {
      const m = pdvOrCode.name.match(/^([A-Za-z0-9]+)/);
      if (m) code = m[1];
    }
  } else if (typeof pdvOrCode === 'string') {
    const clean = pdvOrCode.trim();
    if (HABITUAL_SCHEDULES_BY_CODE[clean.toUpperCase()]) {
      return HABITUAL_SCHEDULES_BY_CODE[clean.toUpperCase()];
    }
    const m = clean.match(/^([A-Za-z0-9]+)/);
    if (m) code = m[1];
  }

  if (code) {
    const upper = code.toUpperCase();
    if (HABITUAL_SCHEDULES_BY_CODE[upper]) {
      return HABITUAL_SCHEDULES_BY_CODE[upper];
    }
  }

  // Fallback si no coincide exactamente
  const defaultDays = [
    { dayIndex: 0, dayKey: 'lunes', dayName: 'Lunes', shortDay: 'LUN', open: '10:00', close: '20:30', isClosed: false, label: '10:00 - 20:30' },
    { dayIndex: 1, dayKey: 'martes', dayName: 'Martes', shortDay: 'MAR', open: '10:00', close: '20:30', isClosed: false, label: '10:00 - 20:30' },
    { dayIndex: 2, dayKey: 'miercoles', dayName: 'Miércoles', shortDay: 'MIÉ', open: '10:00', close: '20:30', isClosed: false, label: '10:00 - 20:30' },
    { dayIndex: 3, dayKey: 'jueves', dayName: 'Jueves', shortDay: 'JUE', open: '10:00', close: '20:30', isClosed: false, label: '10:00 - 20:30' },
    { dayIndex: 4, dayKey: 'viernes', dayName: 'Viernes', shortDay: 'VIE', open: '10:00', close: '20:30', isClosed: false, label: '10:00 - 20:30' },
    { dayIndex: 5, dayKey: 'sabado', dayName: 'Sábado', shortDay: 'SÁB', open: '10:00', close: '20:30', isClosed: false, label: '10:00 - 20:30' },
    { dayIndex: 6, dayKey: 'domingo', dayName: 'Domingo', shortDay: 'DOM', open: '11:00', close: '19:00', isClosed: false, label: '11:00 - 19:00' },
  ];
  return {
    co: 0,
    code: 'DEFAULT',
    name: 'Horario Habitual Estándar',
    locationType: 'Estándar',
    byDayIndex: defaultDays
  };
}

/**
 * Obtiene el horario habitual para un día específico (dayIndex: 0=Lunes ... 6=Domingo)
 */
export function getHabitualDaySchedule(pdvOrCode, dayIndex) {
  const pdvSched = getHabitualScheduleForPdv(pdvOrCode);
  if (!pdvSched || !pdvSched.byDayIndex) return null;
  const idx = typeof dayIndex === 'number' ? dayIndex : 0;
  return pdvSched.byDayIndex[idx] || null;
}

/**
 * Verifica si un turno programado o marcación cae fuera del horario habitual del PDV
 */
export function checkOutsideHabitualHours(pdvOrCode, dayIndex, startTime, endTime) {
  const daySched = getHabitualDaySchedule(pdvOrCode, dayIndex);
  if (!daySched) return { isOutside: false };
  if (daySched.isClosed) {
    return {
      isOutside: true,
      reason: 'PDV cerrado habitualmente este día',
      habitualRange: 'Cerrado'
    };
  }
  if (!startTime || !endTime) return { isOutside: false, habitualRange: daySched.label };
  
  const toMin = (t) => {
    if (!t) return 0;
    const parts = t.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };

  const startMin = toMin(startTime);
  const endMin = toMin(endTime);
  const openMin = toMin(daySched.open);
  const closeMin = toMin(daySched.close);

  const startsBefore = startMin < openMin;
  const endsAfter = endMin > closeMin;

  if (startsBefore || endsAfter) {
    const reasons = [];
    if (startsBefore) reasons.push(\`Inicia antes (\${startTime} vs \${daySched.open})\`);
    if (endsAfter) reasons.push(\`Termina después (\${endTime} vs \${daySched.close})\`);
    return {
      isOutside: true,
      reason: reasons.join(', '),
      habitualRange: daySched.label
    };
  }

  return { isOutside: false, habitualRange: daySched.label };
}
`;

fs.writeFileSync(path.join(__dirname, '../src/data/habitualSchedules.js'), outputContent, 'utf8');
console.log('Successfully generated src/data/habitualSchedules.js with 101 PDVs!');

// Also update initialPDVs in src/data/seedData.js and server/data/database.json
const seedDataPath = path.join(__dirname, '../src/data/seedData.js');
let seedContent = fs.readFileSync(seedDataPath, 'utf8');

const pdvStart = seedContent.indexOf('export const initialPDVs =');
const pdvEnd = seedContent.indexOf('export const initialUsers =');
if (pdvStart !== -1 && pdvEnd !== -1) {
  const oldPdvs = JSON.parse(seedContent.substring(pdvStart + 'export const initialPDVs ='.length, pdvEnd).trim().replace(/;$/, ''));
  const updatedPdvs = oldPdvs.map(p => {
    const code = p.code ? p.code.toUpperCase() : '';
    const hab = storeSchedules[code];
    return {
      ...p,
      locationType: hab ? hab.locationType : (p.locationType || 'Centro Comercial'),
      habitualSchedule: hab ? hab.days : {},
      habitualScheduleList: hab ? hab.byDayIndex : []
    };
  });

  const newPdvsStr = 'export const initialPDVs = ' + JSON.stringify(updatedPdvs, null, 2) + ';\n\n';
  seedContent = seedContent.substring(0, pdvStart) + newPdvsStr + seedContent.substring(pdvEnd);
  fs.writeFileSync(seedDataPath, seedContent, 'utf8');
  console.log('Successfully updated initialPDVs in src/data/seedData.js!');

  // Update server/data/database.json if it exists
  const dbPath = path.join(__dirname, '../server/data/database.json');
  if (fs.existsSync(dbPath)) {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (db.pdvs) {
      db.pdvs = updatedPdvs;
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
      console.log('Successfully updated pdvs in server/data/database.json!');
    }
  }
}
