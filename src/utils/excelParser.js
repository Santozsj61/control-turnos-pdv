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

/**
 * Parsea el archivo oficial de Liquidación de Horas Suplementarias de Nómina (ej. "Ejemplo de Liquidacion HS.xlsx")
 * Con hojas canónicas:
 * 1. "Liquidacion" (Consolidado oficial por colaborador con 21 columnas canónicas de nómina)
 * 2. "Marcaciones" (Desglose diario Lun-Sáb, franjas diurnas/nocturnas y festivos)
 */
export function parsePayrollLiquidation(data) {
  let workbook;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
  } else {
    workbook = XLSX.read(data, { type: 'binary', cellDates: false, raw: true });
  }

  const sheetNames = workbook.SheetNames;
  const liqSheetName = sheetNames.find(s => normalizeKey(s).includes('liquidacion')) ||
                       sheetNames.find(s => normalizeKey(s).includes('nomina')) ||
                       sheetNames[0];

  const worksheet = workbook.Sheets[liqSheetName];
  if (!worksheet) {
    throw new Error('No se encontró la hoja de Liquidación en el archivo Excel.');
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  if (!rawRows || rawRows.length < 2) {
    throw new Error('La hoja de Liquidación está vacía o no contiene encabezados válidos.');
  }

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const rowStr = rawRows[r].map(normalizeKey).join(' ');
    if (rowStr.includes('documento') || rowStr.includes('cedula') || rowStr.includes('horasordinarias') || rowStr.includes('recargonocturno')) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = rawRows[headerRowIndex];
  function findCol(keywords) {
    for (let c = 0; c < headerRow.length; c++) {
      const norm = normalizeKey(headerRow[c]);
      for (const kw of keywords) {
        if (norm.includes(kw)) return c;
      }
    }
    return -1;
  }

  const COLS = {
    empresa: findCol(['empresa']),
    tipoNomina: findCol(['tipodenomina', 'tiponomina']),
    pdv: findCol(['puntodeventa', 'pdv']),
    cargo: findCol(['cargo']),
    nombre: findCol(['nombre']),
    documento: findCol(['documento', 'cedula']),
    semana: findCol(['semana']),
    ord: findCol(['horasordinarias']),
    rn: findCol(['recargonocturnoordinario']),
    hed: findCol(['horaextradiurna']),
    hen: findCol(['horaextranocturna']),
    rdd: findCol(['recargodiurnodominical']),
    rnd: findCol(['recargonocturnodominical']),
    hedd: findCol(['horaextradiurnadominical']),
    hend: findCol(['horaextranocturnadominical']),
    rdf: findCol(['recargodiurnofestivo']),
    rnf: findCol(['recargonocturnofestivo']),
    totalHoras: findCol(['totalhorastrabajadas', 'totalhoras']),
    domingosMes: findCol(['ndomingoslaborados', 'domingoslaborados']),
    reglaDom: findCol(['regladominical']),
    festivosSemana: findCol(['nfestivospagados', 'festivospagados'])
  };

  function num(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  const records = [];
  let totalOrd = 0;
  let totalRN = 0;
  let totalHED = 0;
  let totalHEN = 0;
  let totalRDD = 0;
  let totalRND = 0;
  let totalHEDD = 0;
  let totalHEND = 0;
  let totalRDF = 0;
  let totalRNF = 0;
  let totalHoras = 0;
  let countDomingosPagados = 0;
  let countDomingosNoPagados = 0;
  let detectedWeek = '';

  const pdvAggMap = {};
  const companyAggMap = {};

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length < 3) continue;

    const doc = String(COLS.documento !== -1 ? row[COLS.documento] : '').trim();
    const nombre = String(COLS.nombre !== -1 ? row[COLS.nombre] : '').trim();
    if (!doc && !nombre) continue;

    const empresa = String(COLS.empresa !== -1 ? row[COLS.empresa] : '').trim() || 'NCS BRANDS S.A.S.';
    const tipoNomina = String(COLS.tipoNomina !== -1 ? row[COLS.tipoNomina] : '').trim() || 'Q';
    const pdvName = String(COLS.pdv !== -1 ? row[COLS.pdv] : '').trim();
    const cargo = String(COLS.cargo !== -1 ? row[COLS.cargo] : '').trim();
    const semana = String(COLS.semana !== -1 ? row[COLS.semana] : '').trim();
    if (semana && !detectedWeek) detectedWeek = semana;

    const ord = num(COLS.ord !== -1 ? row[COLS.ord] : 0);
    const rn = num(COLS.rn !== -1 ? row[COLS.rn] : 0);
    const hed = num(COLS.hed !== -1 ? row[COLS.hed] : 0);
    const hen = num(COLS.hen !== -1 ? row[COLS.hen] : 0);
    const rdd = num(COLS.rdd !== -1 ? row[COLS.rdd] : 0);
    const rnd = num(COLS.rnd !== -1 ? row[COLS.rnd] : 0);
    const hedd = num(COLS.hedd !== -1 ? row[COLS.hedd] : 0);
    const hend = num(COLS.hend !== -1 ? row[COLS.hend] : 0);
    const rdf = num(COLS.rdf !== -1 ? row[COLS.rdf] : 0);
    const rnf = num(COLS.rnf !== -1 ? row[COLS.rnf] : 0);
    const totalH = num(COLS.totalHoras !== -1 ? row[COLS.totalHoras] : 0);

    const numDom = num(COLS.domingosMes !== -1 ? row[COLS.domingosMes] : 0);
    const reglaDom = String(COLS.reglaDom !== -1 ? row[COLS.reglaDom] : '').trim();
    const numFest = num(COLS.festivosSemana !== -1 ? row[COLS.festivosSemana] : 0);

    if (reglaDom.toLowerCase().includes('se paga') && !reglaDom.toLowerCase().includes('no')) {
      countDomingosPagados++;
    } else if (reglaDom.toLowerCase().includes('no se paga')) {
      countDomingosNoPagados++;
    }

    totalOrd += ord;
    totalRN += rn;
    totalHED += hed;
    totalHEN += hen;
    totalRDD += rdd;
    totalRND += rnd;
    totalHEDD += hedd;
    totalHEND += hend;
    totalRDF += rdf;
    totalRNF += rnf;
    totalHoras += (totalH || (ord + hed + hen + rdd + rnd + hedd + hend + rdf + rnf));

    const totalOvertime = hed + hen + hedd + hend;
    const totalNight = rn + rnd + rnf;
    const totalSunday = rdd + rnd + hedd + hend;
    const totalHoliday = rdf + rnf;
    const totalSpecial = totalOvertime + totalNight + totalSunday + totalHoliday;

    // Agrupación por PDV
    const pdvKey = pdvName || 'SIN_PDV';
    if (!pdvAggMap[pdvKey]) {
      pdvAggMap[pdvKey] = {
        pdvName: pdvKey,
        employees: 0,
        ord: 0,
        overtime: 0,
        night: 0,
        sunday: 0,
        holiday: 0,
        totalSpecial: 0,
        totalWorked: 0
      };
    }
    pdvAggMap[pdvKey].employees++;
    pdvAggMap[pdvKey].ord += ord;
    pdvAggMap[pdvKey].overtime += totalOvertime;
    pdvAggMap[pdvKey].night += totalNight;
    pdvAggMap[pdvKey].sunday += totalSunday;
    pdvAggMap[pdvKey].holiday += totalHoliday;
    pdvAggMap[pdvKey].totalSpecial += totalSpecial;
    pdvAggMap[pdvKey].totalWorked += (totalH || (ord + totalSpecial));

    // Agrupación por Empresa
    const empKey = empresa || 'NCS BRANDS S.A.S.';
    if (!companyAggMap[empKey]) {
      companyAggMap[empKey] = { company: empKey, employees: 0, totalSpecial: 0, totalWorked: 0 };
    }
    companyAggMap[empKey].employees++;
    companyAggMap[empKey].totalSpecial += totalSpecial;
    companyAggMap[empKey].totalWorked += (totalH || (ord + totalSpecial));

    records.push({
      documentId: doc,
      name: nombre,
      company: empresa,
      payrollType: tipoNomina,
      pdvName,
      position: cargo,
      week: semana,
      ordinaryHours: +ord.toFixed(2),
      nightSurchargeOrd: +rn.toFixed(2),
      overtimeDay: +hed.toFixed(2),
      overtimeNight: +hen.toFixed(2),
      sundayDay: +rdd.toFixed(2),
      sundayNight: +rnd.toFixed(2),
      sundayOvertimeDay: +hedd.toFixed(2),
      sundayOvertimeNight: +hend.toFixed(2),
      holidayDay: +rdf.toFixed(2),
      holidayNight: +rnf.toFixed(2),
      totalWorkedHours: +(totalH || (ord + totalSpecial)).toFixed(2),
      sundaysWorkedMonth: numDom,
      sundayRule: reglaDom,
      holidaysPaidWeek: numFest,
      totalOvertime: +totalOvertime.toFixed(2),
      totalNight: +totalNight.toFixed(2),
      totalSunday: +totalSunday.toFixed(2),
      totalHoliday: +totalHoliday.toFixed(2),
      totalSpecial: +totalSpecial.toFixed(2)
    });
  }

  const totalOvertimeConsolidated = totalHED + totalHEN + totalHEDD + totalHEND;
  const totalNightConsolidated = totalRN + totalRND + totalRNF;
  const totalSundayConsolidated = totalRDD + totalRND + totalHEDD + totalHEND;
  const totalHolidayConsolidated = totalRDF + totalRNF;
  const totalSpecialConsolidated = totalOvertimeConsolidated + totalNightConsolidated + totalSundayConsolidated + totalHolidayConsolidated;

  return {
    success: true,
    sheetUsed: liqSheetName,
    week: detectedWeek || '27',
    recordCount: records.length,
    summary: {
      totalEmployees: records.length,
      totalOrdinaryHours: +totalOrd.toFixed(2),
      overtime: {
        total: +totalOvertimeConsolidated.toFixed(2),
        day: +totalHED.toFixed(2),
        night: +totalHEN.toFixed(2),
        sundayDay: +totalHEDD.toFixed(2),
        sundayNight: +totalHEND.toFixed(2)
      },
      night: {
        total: +totalNightConsolidated.toFixed(2),
        ordinary: +totalRN.toFixed(2),
        sunday: +totalRND.toFixed(2),
        holiday: +totalRNF.toFixed(2)
      },
      sunday: {
        total: +totalSundayConsolidated.toFixed(2),
        day: +totalRDD.toFixed(2),
        night: +totalRND.toFixed(2),
        overtimeDay: +totalHEDD.toFixed(2),
        overtimeNight: +totalHEND.toFixed(2)
      },
      holiday: {
        total: +totalHolidayConsolidated.toFixed(2),
        day: +totalRDF.toFixed(2),
        night: +totalRNF.toFixed(2)
      },
      totalSpecial: +totalSpecialConsolidated.toFixed(2),
      totalWorkedHours: +totalHoras.toFixed(2),
      sundaysPaidCount: countDomingosPagados,
      sundaysNotPaidCount: countDomingosNoPagados
    },
    byPdv: Object.values(pdvAggMap).map(p => ({
      ...p,
      overtimeHours: +p.overtime.toFixed(1),
      nightHours: +p.night.toFixed(1),
      sundayHours: +p.sunday.toFixed(1),
      holidayHours: +p.holiday.toFixed(1),
      totalSpecialHours: +p.totalSpecial.toFixed(1),
      totalWorkedHours: +p.totalWorked.toFixed(1)
    })).sort((a, b) => b.totalSpecialHours - a.totalSpecialHours),
    byCompany: Object.values(companyAggMap),
    records
  };
}

export function parseMallaExcel(data, customWeekStart = '2026-07-06') {
  let workbook;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
  } else {
    workbook = XLSX.read(data, { type: 'binary', cellDates: false, raw: true });
  }

  const targetSheetName = workbook.SheetNames.find(n => 
    n.toLowerCase().includes('cronograma') || 
    n.toLowerCase().includes('malla') || 
    n.toLowerCase().includes('horario')
  ) || workbook.SheetNames[0];

  const ws = workbook.Sheets[targetSheetName];
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rawRows || rawRows.length < 2) {
    throw new Error('La hoja de cronograma está vacía o no tiene encabezados válidos.');
  }

  const start = new Date(customWeekStart + 'T12:00:00Z');
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(start.getTime() + i * 86400000);
    weekDates.push({
      date: cur.toISOString().split('T')[0],
      dayName: dayNames[i],
      inCol: 3 + i * 2,
      outCol: 4 + i * 2
    });
  }

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

  const schedules = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length < 3) continue;
    const rawPdv = String(row[0] || '').trim();
    const doc = String(row[1] || '').trim();
    const fullName = String(row[2] || '').trim();
    if (!doc || !rawPdv) continue;

    const matchCode = rawPdv.match(/^([A-Za-z0-9]+)/);
    const code = matchCode ? matchCode[1] : '';

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

    schedules.push({
      id: `sched-${userId}-${customWeekStart}`,
      userId,
      user_id: userId,
      documentId: doc,
      document_id: doc,
      fullName,
      pdvCode: code,
      pdvName: rawPdv,
      weekStart: customWeekStart,
      week_start: customWeekStart,
      weekEnd: weekDates[weekDates.length - 1].date,
      week_end: weekDates[weekDates.length - 1].date,
      isSubmitted: true,
      is_submitted: true,
      totalNetHours,
      total_net_hours: totalNetHours,
      totalLunchHours,
      total_lunch_hours: totalLunchHours,
      shifts
    });
  }

  return {
    success: true,
    sheetUsed: targetSheetName,
    weekStart: customWeekStart,
    recordCount: schedules.length,
    schedules
  };
}

