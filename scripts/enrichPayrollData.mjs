import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_PAYROLL_BY_WEEK, WEEKS_METADATA } from '../src/data/officialPayrollData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Enriching OFFICIAL_PAYROLL_BY_WEEK with byPdv and ALL consolidations...');

const enriched = {};
const allRecords = [];

for (const [w, weekData] of Object.entries(OFFICIAL_PAYROLL_BY_WEEK)) {
  if (w === 'ALL') continue;
  const records = weekData.records || [];
  allRecords.push(...records);

  const pdvMap = new Map();
  records.forEach(r => {
    if (!pdvMap.has(r.pdvName)) {
      pdvMap.set(r.pdvName, {
        pdvName: r.pdvName,
        pdvId: r.pdvId,
        pdvCode: r.pdvCode,
        employees: 0,
        totalWorkedHours: 0,
        overtimeHours: 0,
        nightHours: 0,
        sundayHours: 0,
        holidayHours: 0,
        totalSpecialHours: 0,
        totalPayrollCost: 0
      });
    }
    const item = pdvMap.get(r.pdvName);
    item.employees += 1;
    item.totalWorkedHours = +(item.totalWorkedHours + r.totalWorkedHours).toFixed(2);
    const ot = r.overtimeDay + r.overtimeNight + r.sundayOvertimeDay + r.sundayOvertimeNight;
    const nt = r.nightSurchargeOrd + r.sundayNight + r.holidayNight;
    const sn = r.sundayDay + r.sundayNight + r.sundayOvertimeDay + r.sundayOvertimeNight;
    const hd = r.holidayDay + r.holidayNight;
    item.overtimeHours = +(item.overtimeHours + ot).toFixed(2);
    item.nightHours = +(item.nightHours + nt).toFixed(2);
    item.sundayHours = +(item.sundayHours + sn).toFixed(2);
    item.holidayHours = +(item.holidayHours + hd).toFixed(2);
    item.totalSpecialHours = +(item.totalSpecialHours + ot + nt + sn + hd).toFixed(2);
    item.totalPayrollCost = +(item.totalPayrollCost + r.totalValorizacion).toFixed(2);
  });

  const byPdv = Array.from(pdvMap.values()).sort((a, b) => b.totalSpecialHours - a.totalSpecialHours);

  enriched[w] = {
    ...weekData,
    byPdv
  };
}

// Build consolidated 'ALL'
const allPdvMap = new Map();
allRecords.forEach(r => {
  if (!allPdvMap.has(r.pdvName)) {
    allPdvMap.set(r.pdvName, {
      pdvName: r.pdvName,
      pdvId: r.pdvId,
      pdvCode: r.pdvCode,
      employees: new Set(),
      totalWorkedHours: 0,
      overtimeHours: 0,
      nightHours: 0,
      sundayHours: 0,
      holidayHours: 0,
      totalSpecialHours: 0,
      totalPayrollCost: 0
    });
  }
  const item = allPdvMap.get(r.pdvName);
  item.employees.add(r.documentId);
  item.totalWorkedHours = +(item.totalWorkedHours + r.totalWorkedHours).toFixed(2);
  const ot = r.overtimeDay + r.overtimeNight + r.sundayOvertimeDay + r.sundayOvertimeNight;
  const nt = r.nightSurchargeOrd + r.sundayNight + r.holidayNight;
  const sn = r.sundayDay + r.sundayNight + r.sundayOvertimeDay + r.sundayOvertimeNight;
  const hd = r.holidayDay + r.holidayNight;
  item.overtimeHours = +(item.overtimeHours + ot).toFixed(2);
  item.nightHours = +(item.nightHours + nt).toFixed(2);
  item.sundayHours = +(item.sundayHours + sn).toFixed(2);
  item.holidayHours = +(item.holidayHours + hd).toFixed(2);
  item.totalSpecialHours = +(item.totalSpecialHours + ot + nt + sn + hd).toFixed(2);
  item.totalPayrollCost = +(item.totalPayrollCost + r.totalValorizacion).toFixed(2);
});

const allByPdv = Array.from(allPdvMap.values()).map(p => ({
  ...p,
  employees: p.employees.size
})).sort((a, b) => b.totalSpecialHours - a.totalSpecialHours);

const totalWorkedHoursAll = +allRecords.reduce((acc, r) => acc + r.totalWorkedHours, 0).toFixed(2);
const totalPayrollCostAll = +allRecords.reduce((acc, r) => acc + r.totalValorizacion, 0).toFixed(2);
const totalOvertimeHoursAll = +allRecords.reduce((acc, r) => acc + r.overtimeDay + r.overtimeNight + r.sundayOvertimeDay + r.sundayOvertimeNight, 0).toFixed(2);
const totalNightSurchargeHoursAll = +allRecords.reduce((acc, r) => acc + r.nightSurchargeOrd + r.sundayNight + r.holidayNight, 0).toFixed(2);
const totalSundayHoursAll = +allRecords.reduce((acc, r) => acc + r.sundayDay + r.sundayNight + r.sundayOvertimeDay + r.sundayOvertimeNight, 0).toFixed(2);
const totalHolidayHoursAll = +allRecords.reduce((acc, r) => acc + r.holidayDay + r.holidayNight, 0).toFixed(2);

enriched['ALL'] = {
  week: 'ALL',
  label: 'Consolidado Trimestral (Semanas 23 a 35)',
  month: 'Junio - Agosto',
  summary: {
    totalEmployees: new Set(allRecords.map(r => r.documentId)).size,
    totalPdvs: new Set(allRecords.map(r => r.pdvId)).size,
    totalWorkedHours: totalWorkedHoursAll,
    totalPayrollCost: totalPayrollCostAll,
    totalOvertimeHours: totalOvertimeHoursAll,
    totalNightSurchargeHours: totalNightSurchargeHoursAll,
    totalSundayHours: totalSundayHoursAll,
    totalHolidayHours: totalHolidayHoursAll
  },
  byPdv: allByPdv,
  records: allRecords
};

const payrollFileContent = `// Consolidated Official Payroll Data for Weeks 23 to 35 (Junio, Julio, Agosto 2026)
// Generated automatically from:
// - Liquidación Tiempos Suplementarios PDV - Junio 2026 (del 01 al 28)  Ajustes.xlsx
// - Liquidación Tiempos Suplementarios PDV - Julio 2026 (del 29 Jun al 01 Agosto) David.xlsx
// - Liquidación Tiempos Suplementarios PDV - Agosto 2026 (del 02 Agos al 30 Agosto).xlsx

export const OFFICIAL_PAYROLL_BY_WEEK = ${JSON.stringify(enriched, null, 2)};

export const WEEKS_METADATA = ${JSON.stringify(WEEKS_METADATA, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/data/officialPayrollData.js'), payrollFileContent);
console.log('✅ officialPayrollData.js successfully enriched with byPdv and ALL consolidations!');
