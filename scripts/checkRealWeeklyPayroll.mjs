import { OFFICIAL_PAYROLL_BY_WEEK } from '../src/data/officialPayrollData.js';

console.log('=== REAL PAYROLL DATA PER WEEK ===');
const weeks = ['27', '28', '29', '30', '31'];
for (const w of weeks) {
  const data = OFFICIAL_PAYROLL_BY_WEEK[w];
  const s = data.summary;
  console.log(`\nSEMANA ${w}:`);
  console.log(`  Horas Extras (HED+HEN+HEDD+HEND): ${s.overtime.total}h (Diurna: ${s.overtime.day}h, Nocturna: ${s.overtime.night}h, Dom Diur: ${s.overtime.sundayDay}h, Dom Noc: ${s.overtime.sundayNight}h)`);
  console.log(`  Recargo Nocturno (RN+RND+RNF): ${s.night.total}h (Ord: ${s.night.ordinary}h, Dom: ${s.night.sunday}h, Fest: ${s.night.holiday}h)`);
  console.log(`  Dominicales (RDD+RND+HEDD+HEND): ${s.sunday.total}h (RDD: ${s.sunday.day}h, RND: ${s.sunday.night}h, Extras: ${s.sunday.overtimeDay + s.sunday.overtimeNight}h)`);
  console.log(`    Regla 3er Dom: ${s.sundaysPaidCount} colaboradores con pago / ${s.sundaysNotPaidCount} sin pago`);
  console.log(`  Festivos (RDF+RNF): ${s.holiday.total}h (RDF: ${s.holiday.day}h, RNF: ${s.holiday.night}h)`);
  console.log(`  TOTAL ESPECIAL: ${s.totalSpecial}h`);
  console.log(`  TOTAL ORDINARIAS: ${s.totalOrdinaryHours}h`);
  console.log(`  TOTAL GENERAL: ${s.totalWorkedHours}h`);
}
