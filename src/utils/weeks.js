/**
 * Calendario Oficial de Semanas y Consecutivos 2026
 * Consecutivos Semana 1 a Semana 53 (Semana Actual: 39)
 */

export const CURRENT_WEEK_NUMBER = 39;
export const CURRENT_WEEK_START = '2026-09-21';
export const CURRENT_WEEK_END = '2026-09-27';

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

    const isCurrent = w === CURRENT_WEEK_NUMBER;
    const tag = isCurrent ? ' (Semana Actual ⭐)' : '';
    const label = `Semana ${w}: ${String(d1).padStart(2, '0')} ${m1} - ${String(d2).padStart(2, '0')} ${m2} ${y2}${tag}`;
    const shortLabel = `Sem ${w} (${String(d1).padStart(2, '0')} ${m1} - ${String(d2).padStart(2, '0')} ${m2})`;

    weeks.push({
      weekNumber: w,
      weekStart: startStr,
      weekEnd: endStr,
      label,
      shortLabel,
      isCurrent
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
