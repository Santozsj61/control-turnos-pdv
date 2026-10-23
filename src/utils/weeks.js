/**
 * Calendario Oficial de Semanas y Consecutivos 2026
 * Consecutivos Semana 1 a Semana 53 con detección dinámica en tiempo real.
 */

// Set de semanas cargadas en memoria (inicializado con las 9 semanas históricas oficiales)
export const LOADED_WEEKS_SET = new Set([
  '2026-06-29', // Sem 27 (29 Jun - 05 Jul 2026)
  '2026-07-06', // Sem 28 (06 Jul - 12 Jul 2026)
  '2026-07-13', // Sem 29 (13 Jul - 19 Jul 2026)
  '2026-07-20', // Sem 30 (20 Jul - 26 Jul 2026)
  '2026-07-27', // Sem 31 (27 Jul - 02 Ago 2026)
  '2026-08-03', // Sem 32 (03 Ago - 09 Ago 2026)
  '2026-08-10', // Sem 33 (10 Ago - 16 Ago 2026)
  '2026-08-17', // Sem 34 (17 Ago - 23 Ago 2026)
  '2026-08-24', // Sem 35 (24 Ago - 30 Ago 2026)
  '2026-08-31', // Sem 36 (31 Ago - 06 Sep 2026)
  '2026-09-07', // Sem 37 (07 Sep - 13 Sep 2026)
  '2026-09-14', // Sem 38 (14 Sep - 20 Sep 2026)
  '2026-09-21', // Sem 39 (21 Sep - 27 Sep 2026)
  '2026-09-28', // Sem 40 (28 Sep - 04 Oct 2026)
  '2026-10-05', // Sem 41 (05 Oct - 11 Oct 2026)
  '2026-10-12', // Sem 42 (12 Oct - 18 Oct 2026)
  '2026-10-19'  // Sem 43 (19 Oct - 25 Oct 2026)
]);

export const KNOWN_WEEKS_WITH_DATA = Array.from(LOADED_WEEKS_SET);

/**
 * Registra una semana que acaba de recibir datos (programación, marcaciones o novedades)
 */
export function registerLoadedWeek(weekStart) {
  if (!weekStart) return;
  LOADED_WEEKS_SET.add(weekStart);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('weeks_data_updated', { detail: { weekStart } }));
  }
}

/**
 * Registra múltiples semanas con datos cargados
 */
export function registerLoadedWeeks(weeksArray) {
  if (!Array.isArray(weeksArray)) return;
  weeksArray.forEach(w => {
    if (w) LOADED_WEEKS_SET.add(w);
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('weeks_data_updated', { detail: { weeks: weeksArray } }));
  }
}

/**
 * Verifica si una semana específica cuenta con datos cargados (oficiales o en almacenamiento local)
 */
export function isWeekLoaded(weekStart) {
  if (!weekStart) return false;
  if (LOADED_WEEKS_SET.has(weekStart)) return true;
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(`control_turnos_schedules_${weekStart}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          LOADED_WEEKS_SET.add(weekStart);
          return true;
        }
      } catch (e) {}
    }
  }
  return false;
}

/**
 * Detecta dinámicamente la semana actual basada en la fecha del sistema (reloj real)
 */
export function getCurrentWeekCalculation() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  // Semana 1 ISO-8601 de 2026 inicia el lunes 29 de Diciembre de 2025
  let curMon = new Date(Date.UTC(2025, 11, 29, 12, 0, 0));

  for (let w = 1; w <= 53; w++) {
    const curSun = new Date(curMon.getTime() + 6 * 86400000);
    const startStr = curMon.toISOString().split('T')[0];
    const endStr = curSun.toISOString().split('T')[0];

    if (todayStr >= startStr && todayStr <= endStr) {
      return {
        weekNumber: w,
        weekStart: startStr,
        weekEnd: endStr,
        today: todayStr
      };
    }
    curMon = new Date(curMon.getTime() + 7 * 86400000);
  }

  // Fallback para fechas fuera del calendario 2026
  if (todayStr < '2025-12-29') {
    return { weekNumber: 1, weekStart: '2025-12-29', weekEnd: '2026-01-04', today: todayStr };
  }
  return { weekNumber: 53, weekStart: '2026-12-28', weekEnd: '2027-01-03', today: todayStr };
}

const currentCalc = getCurrentWeekCalculation();
export const CURRENT_WEEK_NUMBER = currentCalc.weekNumber;
export const CURRENT_WEEK_START = currentCalc.weekStart;
export const CURRENT_WEEK_END = currentCalc.weekEnd;

export function getAllWeeks2026() {
  const weeks = [];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Semana 1 ISO-8601 de 2026 inicia el lunes 29 de Diciembre de 2025
  let curMon = new Date(Date.UTC(2025, 11, 29, 12, 0, 0));

  for (let w = 1; w <= 53; w++) {
    const curSun = new Date(curMon.getTime() + 6 * 86400000);
    const startStr = curMon.toISOString().split('T')[0];
    const endStr = curSun.toISOString().split('T')[0];

    const d1 = curMon.getUTCDate();
    const m1 = monthNames[curMon.getUTCMonth()];
    const y1 = curMon.getUTCFullYear();

    const d2 = curSun.getUTCDate();
    const m2 = monthNames[curSun.getUTCMonth()];
    const y2 = curSun.getUTCFullYear();

    weeks.push({
      weekNumber: w,
      weekStart: startStr,
      weekEnd: endStr,
      get isCurrent() {
        return this.weekNumber === getCurrentWeekCalculation().weekNumber;
      },
      get hasData() {
        return isWeekLoaded(this.weekStart);
      },
      get label() {
        let tag = '';
        if (this.isCurrent) tag += ' (Semana Actual ⭐)';
        if (this.hasData) tag += ' 📊 (Datos cargados)';
        return `Semana ${this.weekNumber}: ${String(d1).padStart(2, '0')} ${m1} - ${String(d2).padStart(2, '0')} ${m2} ${y2}${tag}`;
      },
      get shortLabel() {
        return `Sem ${this.weekNumber} (${String(d1).padStart(2, '0')} ${m1} - ${String(d2).padStart(2, '0')} ${m2})${this.hasData ? ' 📊' : ''}${this.isCurrent ? ' ⭐' : ''}`;
      }
    });

    curMon = new Date(curMon.getTime() + 7 * 86400000);
  }
  return weeks;
}

export const ALL_WEEKS_2026 = getAllWeeks2026();

export function cleanNormalizeStr(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte valores horarios de Excel (decimales como 0.4166667 o strings como "10:00")
 * a formato estándar "HH:MM".
 */
export function formatExcelTime(val) {
  if (val === undefined || val === null || val === '') return '';

  // 1. Si es un string decimal (ej: "0.41666666666666674" o "0.8333333333333333") o número directo
  let num = typeof val === 'number' ? val : (typeof val === 'string' && !isNaN(val) && val.trim() !== '' && !val.includes(':') ? parseFloat(val) : null);

  if (num !== null && !isNaN(num)) {
    if (num >= 0 && num <= 1.05) {
      const totalMinutes = Math.round(num * 24 * 60);
      const h = Math.floor(totalMinutes / 60) % 24;
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // 2. Si ya viene con formato HH:MM o similar
  const str = String(val).trim();
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${String(timeMatch[1]).padStart(2, '0')}:${String(timeMatch[2]).padStart(2, '0')}`;
  }

  return str;
}

/**
 * Convierte una hora en formato "HH:MM" o "HH:MM:SS" (24h) a formato amigable de 12 horas: "hh:mm AM/PM".
 * Si ya viene en formato 12h o es inválido, retorna el valor limpio.
 * Ejemplos:
 * "10:00" -> "10:00 AM"
 * "13:00" -> "01:00 PM"
 * "20:30" -> "08:30 PM"
 * "00:00" -> "12:00 AM"
 * "12:00" -> "12:00 PM"
 */
export function formatTo12Hour(val, includeSeconds = false) {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val).trim();
  if (!str || str === '-' || str === '--:--') return str;

  // Si ya tiene AM o PM
  if (/am|pm/i.test(str)) return str;

  // Si es un rango de horas (ej: "10:00 - 20:30" o "10:00-20:30")
  if (str.includes('-') && str.includes(':')) {
    const parts = str.split('-').map(p => p.trim());
    if (parts.length === 2 && parts[0].includes(':') && parts[1].includes(':')) {
      return `${formatTo12Hour(parts[0], includeSeconds)} - ${formatTo12Hour(parts[1], includeSeconds)}`;
    }
  }

  // Detectar formato HH:MM o HH:MM:SS
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return str;

  let h = parseInt(match[1], 10);
  const m = match[2];
  const s = match[3];

  if (isNaN(h)) return str;

  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;

  const hStr = String(h).padStart(2, '0');
  if (includeSeconds && s !== undefined) {
    return `${hStr}:${m}:${s} ${ampm}`;
  }
  return `${hStr}:${m} ${ampm}`;
}

/**
 * Convierte un rango de inicio y fin a formato 12h: "10:00 AM - 08:30 PM"
 */
export function formatTimeRange12h(startTime, endTime) {
  const s = formatExcelTime(startTime);
  const e = formatExcelTime(endTime);
  if (!s && !e) return '';
  if (!e) return formatTo12Hour(s);
  if (!s) return formatTo12Hour(e);
  return `${formatTo12Hour(s)} - ${formatTo12Hour(e)}`;
}

/**
 * Detecta automáticamente a qué semana del año pertenece un archivo Excel/CSV
 * inspeccionando los encabezados de columnas (ej: "Lunes 29 Junio", "21 Septiembre", etc.)
 */
export function detectWeekFromHeaders(headers) {
  if (!headers || !Array.isArray(headers)) return null;

  const monthsMap = {
    'enero': 1, 'ene': 1,
    'febrero': 2, 'feb': 2,
    'marzo': 3, 'mar': 3,
    'abril': 4, 'abr': 4,
    'mayo': 5, 'may': 5,
    'junio': 6, 'jun': 6,
    'julio': 7, 'jul': 7,
    'agosto': 8, 'ago': 8,
    'septiembre': 9, 'sep': 9, 'setiembre': 9,
    'octubre': 10, 'oct': 10,
    'noviembre': 11, 'nov': 11,
    'diciembre': 12, 'dic': 12
  };

  // 1. Direct week consecutive in header: "Semana 39", "Sem 39", "W39"
  for (const h of headers) {
    const clean = cleanNormalizeStr(h);
    const mSem = clean.match(/(?:semana|sem|w)\s*(\d{1,2})\b/i);
    if (mSem) {
      const num = parseInt(mSem[1], 10);
      const found = ALL_WEEKS_2026.find(w => w.weekNumber === num);
      if (found) return found;
    }
  }

  // 2. Look for "Lunes [dia] [de]? [mes]" (ej: "Lunes 29 Junio", "Lunes 21 de Septiembre")
  for (const h of headers) {
    const clean = cleanNormalizeStr(h);
    const regex1 = /lunes.*?(\d{1,2})\s*(?:de\s+)?([a-z]+)/i;
    const m = clean.match(regex1);
    if (m) {
      const day = parseInt(m[1], 10);
      const mStr = m[2];
      const month = monthsMap[mStr];
      if (day && month) {
        const year = (month === 12 && day >= 28) ? 2025 : 2026;
        const targetDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const found = ALL_WEEKS_2026.find(w => w.weekStart === targetDate);
        if (found) return found;
      }
    }

    // 3. Look for "DD/MM/YYYY", "YYYY-MM-DD" or "DD/MM"
    const regexDate = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/;
    const mDate = clean.match(regexDate);
    if (mDate) {
      let y = 2026, mNum = 1, dNum = 1;
      if (mDate[1]) {
        y = parseInt(mDate[1], 10);
        mNum = parseInt(mDate[2], 10);
        dNum = parseInt(mDate[3], 10);
      } else if (mDate[4] && mDate[5]) {
        dNum = parseInt(mDate[4], 10);
        mNum = parseInt(mDate[5], 10);
        if (mDate[6]) {
          y = mDate[6].length === 2 ? 2000 + parseInt(mDate[6], 10) : parseInt(mDate[6], 10);
        }
      }
      const isoDate = `${y}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      const foundWeek = ALL_WEEKS_2026.find(w => isoDate >= w.weekStart && isoDate <= w.weekEnd);
      if (foundWeek) return foundWeek;
    }
  }

  // 4. Any day header matching "[dia] [mes]" (ej: "29 Junio", "21 Septiembre")
  for (const h of headers) {
    const clean = cleanNormalizeStr(h);
    for (const [mName, mNum] of Object.entries(monthsMap)) {
      const pattern = new RegExp(`(\\d{1,2})\\s*(?:de\\s+)?${mName}`, 'i');
      const match = clean.match(pattern);
      if (match) {
        const day = parseInt(match[1], 10);
        const year = (mNum === 12 && day >= 28) ? 2025 : 2026;
        const iso = `${year}-${String(mNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const found = ALL_WEEKS_2026.find(w => iso >= w.weekStart && iso <= w.weekEnd);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Busca de forma inteligente un PDV por código o nombre dentro de la lista de PDVs.
 * Soporta códigos como 'Q073 - Yumbo', 'Q146 Palmira', 'QST001', 'FQ02', etc.
 */
export function findPdvByCodeOrName(rawPdv, pdvsList) {
  if (!rawPdv || !pdvsList || !Array.isArray(pdvsList) || pdvsList.length === 0) return null;
  const clean = String(rawPdv).trim();
  if (!clean) return null;

  // 1. Coincidencia exacta por ID o por Código
  const exact = pdvsList.find(p => p.id === clean || p.code === clean || (p.code && p.code.toLowerCase() === clean.toLowerCase()));
  if (exact) return exact;

  // 2. Coincidencia exacta por Nombre
  const exactName = pdvsList.find(p => p.name && p.name.toLowerCase() === clean.toLowerCase());
  if (exactName) return exactName;

  // 3. Extraer prefijo y número (ej: "Q073 - Yumbo", "Q146 Palmira", "QST001", "FQ02", "N10")
  const m = clean.match(/^(QST|FQ|Q|N)\s*0*(\d+)/i);
  if (m) {
    const pref = m[1].toUpperCase();
    const num = parseInt(m[2], 10);
    // Buscar coincidencia de prefijo y número
    const foundPrefNum = pdvsList.find(p => {
      const pm = (p.code || p.name || '').match(/^(QST|FQ|Q|N)\s*0*(\d+)/i);
      return pm && pm[1].toUpperCase() === pref && parseInt(pm[2], 10) === num;
    });
    if (foundPrefNum) return foundPrefNum;

    // Buscar coincidencia de solo número si el prefijo no es crítico
    const foundNum = pdvsList.find(p => {
      const pm = (p.code || p.name || '').match(/^(QST|FQ|Q|N)\s*0*(\d+)/i);
      return pm && parseInt(pm[2], 10) === num;
    });
    if (foundNum) return foundNum;
  }

  // 4. Coincidencia normalizada sin caracteres especiales
  const cleanNorm = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanNorm) {
    const foundNorm = pdvsList.find(p => {
      const pNorm = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const pCodeNorm = (p.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (pNorm && (pNorm.includes(cleanNorm) || cleanNorm.includes(pNorm))) ||
             (pCodeNorm && (pCodeNorm.includes(cleanNorm) || cleanNorm.includes(pCodeNorm)));
    });
    if (foundNorm) return foundNorm;
  }

  return null;
}

/**
 * Retorna las semanas del calendario 2026 que intersectan total o parcialmente con un mes YYYY-MM.
 * Ejemplo para '2026-09': semanas 36 (31 Ago - 06 Sep), 37, 38, 39 y 40 (28 Sep - 04 Oct).
 */
export function getWeeksOverlappingMonth(monthStr) {
  if (!monthStr || !monthStr.includes('-')) return [];
  const [y, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mStart = `${monthStr}-01`;
  const mEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return ALL_WEEKS_2026.filter(w => w.weekStart <= mEnd && w.weekEnd >= mStart);
}

export function getWeekStartsForMonth(monthStr) {
  return getWeeksOverlappingMonth(monthStr).map(w => w.weekStart);
}

export function isWeekInMonth(weekStart, monthStr) {
  if (!weekStart || !monthStr) return false;
  const starts = getWeekStartsForMonth(monthStr);
  return starts.includes(weekStart);
}

/**
 * Retorna el lunes (inicio de semana) para una fecha dada en formato YYYY-MM-DD.
 */
export function getMondayForDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = dt.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().split('T')[0];
}
