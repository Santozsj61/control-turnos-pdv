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
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
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

  for (const h of headers) {
    const clean = cleanNormalizeStr(h);
    const regex1 = /lunes.*?(\d{1,2})\s+([a-z]+)/i;
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
  }
  return null;
}
