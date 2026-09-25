import * as XLSX from 'xlsx';
import { calculateShiftHours } from './calculator.js';

function normalizeKey(str) {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeDate(rawVal) {
  if (!rawVal) return '';
  if (typeof rawVal === 'number') {
    const dateObj = XLSX.SSF.parse_date_code(rawVal);
    if (dateObj) {
      const y = dateObj.y;
      const m = String(dateObj.m).padStart(2, '0');
      const d = String(dateObj.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(rawVal).trim();
  
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, '0');
    const d = String(ymdMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

function normalizeTime(rawVal) {
  if (rawVal === undefined || rawVal === null || rawVal === '') return '';
  
  if (typeof rawVal === 'number') {
    const totalSecs = Math.round(rawVal * 86400);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const str = String(rawVal).trim();
  const timeMatch = str.match(/(\d{1,2}):(\d{1,2})(:(\d{1,2}))?/);
  if (timeMatch) {
    const h = String(timeMatch[1]).padStart(2, '0');
    const m = String(timeMatch[2]).padStart(2, '0');
    const s = timeMatch[4] ? String(timeMatch[4]).padStart(2, '0') : '00';
    return `${h}:${m}:${s}`;
  }

  return str;
}

export function parsePunchExcel(data) {
  let workbook;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
  } else {
    workbook = XLSX.read(data, { type: 'binary', cellDates: false, raw: true });
  }
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  if (!rawRows || rawRows.length < 2) {
    throw new Error('El archivo Excel está vacío o no contiene encabezados válidos.');
  }

  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const rowStr = rawRows[r].map(normalizeKey).join(' ');
    if (rowStr.includes('documento') || rowStr.includes('codigo') || rowStr.includes('cumento') || (rowStr.includes('hora') && rowStr.includes('entrada'))) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0;
  }

  const rawHeaders = rawRows[headerRowIndex].map(h => String(h).trim());
  const headerMap = {};

  rawHeaders.forEach((h, colIdx) => {
    const norm = normalizeKey(h);
    if (norm.includes('cod') || norm === 'id') headerMap.code = colIdx;
    if (norm.includes('document') || norm.includes('identic') || norm.includes('identid') || norm.includes('cedula')) headerMap.documentId = colIdx;
    if (norm === 'nombre' || norm.includes('nombres')) headerMap.name = colIdx;
    if (norm.includes('primerapell') || norm === 'apellido1' || norm === 'apellido') headerMap.lastName1 = colIdx;
    if (norm.includes('segundoapell') || norm === 'apellido2') headerMap.lastName2 = colIdx;
    if (norm.includes('especial') || norm.includes('cargo') || norm.includes('rol')) headerMap.position = colIdx;
    if (norm.includes('area')) headerMap.area = colIdx;
    if (norm.includes('contrat')) headerMap.contract = colIdx;
    if (norm.includes('supervis') || norm.includes('jefe')) headerMap.supervisor = colIdx;
    if (norm.includes('turno')) headerMap.shift = colIdx;
    
    if (norm.includes('fecha') && norm.includes('entrad')) headerMap.entryDate = colIdx;
    else if (norm.includes('fecha') && !headerMap.entryDate) headerMap.entryDate = colIdx;

    if (norm.includes('hora') && norm.includes('entrad')) headerMap.entryTime = colIdx;
    else if (norm === 'entrada' && !headerMap.entryTime) headerMap.entryTime = colIdx;

    if (norm.includes('fecha') && norm.includes('salid')) headerMap.exitDate = colIdx;
    if (norm.includes('hora') && norm.includes('salid')) headerMap.exitTime = colIdx;
    else if (norm === 'salida' && !headerMap.exitTime) headerMap.exitTime = colIdx;

    if (norm.includes('rut')) headerMap.rutEmployer = colIdx;
    if (norm.includes('recinto') && norm.includes('entrad')) headerMap.insideEntry = colIdx;
    if (norm.includes('recinto') && norm.includes('salid')) headerMap.insideExit = colIdx;
  });

  const parsedRecords = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const code = headerMap.code !== undefined ? String(row[headerMap.code] || '').trim() : '';
    const documentId = headerMap.documentId !== undefined ? String(row[headerMap.documentId] || '').trim() : '';
    const name = headerMap.name !== undefined ? String(row[headerMap.name] || '').trim() : '';
    const lastName1 = headerMap.lastName1 !== undefined ? String(row[headerMap.lastName1] || '').trim() : '';
    const lastName2 = headerMap.lastName2 !== undefined ? String(row[headerMap.lastName2] || '').trim() : '';
    
    const fullNameParts = [name, lastName1, lastName2].filter(Boolean);
    const fullName = fullNameParts.length > 0 ? fullNameParts.join(' ') : `Colaborador ${documentId || code}`;

    const position = headerMap.position !== undefined ? String(row[headerMap.position] || '').trim() : 'ASESOR(A) DE IMAGEN';
    const area = headerMap.area !== undefined ? String(row[headerMap.area] || '').trim() : 'RETAIL';
    const supervisor = headerMap.supervisor !== undefined ? String(row[headerMap.supervisor] || '').trim() : '';
    const shift = headerMap.shift !== undefined ? String(row[headerMap.shift] || '').trim() : '';

    const entryDate = headerMap.entryDate !== undefined ? normalizeDate(row[headerMap.entryDate]) : '';
    const entryTime = headerMap.entryTime !== undefined ? normalizeTime(row[headerMap.entryTime]) : '';
    const exitDate = headerMap.exitDate !== undefined ? normalizeDate(row[headerMap.exitDate]) : entryDate;
    const exitTime = headerMap.exitTime !== undefined ? normalizeTime(row[headerMap.exitTime]) : '';

    const rutEmployer = headerMap.rutEmployer !== undefined ? String(row[headerMap.rutEmployer] || '').trim() : '';
    const insideEntry = headerMap.insideEntry !== undefined ? String(row[headerMap.insideEntry] || '').trim() : '';
    const insideExit = headerMap.insideExit !== undefined ? String(row[headerMap.insideExit] || '').trim() : '';

    if (!documentId && !code && !entryDate) continue;

    let punchCalculations = {
      grossHours: 0,
      lunchHours: 0,
      netHours: 0,
      dayHours: 0,
      nightHours: 0,
      isSunday: false,
      sundayDayHours: 0,
      sundayNightHours: 0,
      lunchApplied: false,
      lunchReason: 'Sin registro completo de entrada y salida'
    };

    if (entryTime && exitTime && entryDate) {
      punchCalculations = calculateShiftHours(entryTime.substring(0, 5), exitTime.substring(0, 5), entryDate);
    }

    parsedRecords.push({
      code,
      documentId,
      name,
      lastName1,
      lastName2,
      fullName,
      position,
      area,
      supervisorName: supervisor,
      shiftName: shift,
      entryDate,
      entryTime,
      exitDate,
      exitTime,
      rutEmployer,
      insideEntry,
      insideExit,
      realCalculations: punchCalculations
    });
  }

  return parsedRecords;
}

/**
 * Parsea reportes de novedades (CSV o Excel)
 * Columnas esperadas: Cédula, Nombres y apellidos, Desc.Concepto, Fecha Inicial, Fecha Final
 */
export function parseNoveltiesReport(data) {
  let rows = [];

  if (typeof data === 'string') {
    const lines = data.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) throw new Error('El archivo de novedades no contiene suficientes filas.');
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
    rows = lines.map(line => line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, '')));
  } else {
    let workbook;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
    } else {
      workbook = XLSX.read(data, { type: 'binary', cellDates: false, raw: true });
    }
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  }

  if (!rows || rows.length < 2) {
    throw new Error('El archivo de novedades está vacío o no contiene registros válidos.');
  }

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowStr = rows[r].map(normalizeKey).join(' ');
    if (rowStr.includes('cedula') || rowStr.includes('documento') || rowStr.includes('concepto') || rowStr.includes('inicial')) {
      headerRowIndex = r;
      break;
    }
  }

  const rawHeaders = rows[headerRowIndex].map(h => String(h).trim());
  const headerMap = {};

  rawHeaders.forEach((h, colIdx) => {
    const norm = normalizeKey(h);
    if (norm.includes('cedula') || norm.includes('document') || norm.includes('identid') || norm === 'id') headerMap.documentId = colIdx;
    if (norm.includes('nombre') || norm.includes('apellido') || norm.includes('colaborador')) headerMap.fullName = colIdx;
    if (norm.includes('concepto') || norm.includes('novedad') || norm.includes('tipo') || norm.includes('motivo')) headerMap.concept = colIdx;
    if ((norm.includes('fecha') && norm.includes('inici')) || norm.includes('desde') || norm === 'inicio') headerMap.startDate = colIdx;
    if ((norm.includes('fecha') && norm.includes('final')) || norm.includes('hasta') || norm === 'fin') headerMap.endDate = colIdx;
  });

  const parsedNovelties = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const documentId = headerMap.documentId !== undefined ? String(row[headerMap.documentId] || '').trim().replace(/\D/g, '') : '';
    const fullName = headerMap.fullName !== undefined ? String(row[headerMap.fullName] || '').trim() : '';
    const rawConcept = headerMap.concept !== undefined ? String(row[headerMap.concept] || '').trim() : 'NOVEDAD';
    const startDate = headerMap.startDate !== undefined ? normalizeDate(row[headerMap.startDate]) : '';
    const endDate = headerMap.endDate !== undefined ? normalizeDate(row[headerMap.endDate]) : startDate;

    if (!documentId || !startDate) continue;

    const upperConcept = rawConcept.toUpperCase();
    let shiftType = 'LICENCIA';
    let label = 'Novedad';

    if (upperConcept.includes('VACACION')) {
      shiftType = 'VACACIONES';
      label = 'Vacaciones';
    } else if (upperConcept.includes('INCAPACIDAD')) {
      shiftType = 'INCAPACIDAD';
      label = 'Incapacidad';
    } else if (upperConcept.includes('MATERNIDAD')) {
      shiftType = 'LICENCIA';
      label = 'Licencia Maternidad';
    } else if (upperConcept.includes('PATERNIDAD')) {
      shiftType = 'LICENCIA';
      label = 'Licencia Paternidad';
    } else if (upperConcept.includes('FAMILIA')) {
      shiftType = 'PERMISO';
      label = 'Día de la Familia';
    } else if (upperConcept.includes('PERMISO')) {
      shiftType = 'PERMISO';
      label = 'Permiso Personal';
    } else if (upperConcept.includes('LICENCIA')) {
      shiftType = 'LICENCIA';
      label = 'Licencia';
    } else if (upperConcept.includes('DESCANSO')) {
      shiftType = 'DESCANSO';
      label = 'Descanso';
    }

    parsedNovelties.push({
      documentId,
      fullName,
      rawConcept,
      shiftType,
      label,
      isNovelty7h: true,
      netHours: 7.0,
      startDate,
      endDate: endDate || startDate
    });
  }

  return parsedNovelties;
}

/**
 * Asocia novedades a una matriz o lista de programaciones
 */
export function applyNoveltiesToSchedules(schedules, novelties) {
  if (!schedules || !novelties || novelties.length === 0) return schedules;

  const noveltiesByDoc = new Map();
  novelties.forEach(nov => {
    const doc = String(nov.documentId).trim();
    if (!noveltiesByDoc.has(doc)) noveltiesByDoc.set(doc, []);
    noveltiesByDoc.get(doc).push(nov);
  });

  return schedules.map(sched => {
    const doc = String(sched.documentId || sched.employee?.documentId || '').trim();
    const empNovs = noveltiesByDoc.get(doc);
    if (!empNovs || empNovs.length === 0) return sched;

    let hasChanges = false;
    const updatedShifts = (sched.shifts || []).map(shift => {
      const shiftDate = shift.date;
      const matchedNov = empNovs.find(n => n.startDate <= shiftDate && shiftDate <= n.endDate);
      if (matchedNov) {
        hasChanges = true;
        return {
          ...shift,
          shiftType: matchedNov.shiftType,
          isDayOff: matchedNov.shiftType === 'DESCANSO',
          isNovelty7h: true,
          netHours: 7.0,
          startTime: '',
          endTime: '',
          permissionReason: `${matchedNov.label}: ${matchedNov.rawConcept}`,
          hasApprovedPermission: true
        };
      }
      return shift;
    });

    return hasChanges ? { ...sched, shifts: updatedShifts } : sched;
  });
}

