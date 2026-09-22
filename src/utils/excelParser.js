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
    workbook = XLSX.read(data, { type: 'array', cellDates: false });
  } else {
    workbook = XLSX.read(data, { type: 'binary', cellDates: false });
  }
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
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
