import fs from 'fs';
import { parsePunchExcel } from '../src/utils/excelParser.js';

const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

const FILE = 'C:/Users/analista.retail/.gemini/antigravity/brain/ee9a10d7-aa9a-4918-8b9f-cc85f73616cc/.user_uploaded/media_1792101708961_b14a73bd.xlsx';
const recs = parsePunchExcel(fs.readFileSync(FILE));
console.log('Registros parseados:', recs.length);

async function getAll(table, select) {
  let all = []; let from = 0;
  while (true) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=${select}`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    const d = await r.json();
    if (!Array.isArray(d) || d.length === 0) break;
    all.push(...d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return all;
}

const users = await getAll('users', 'id,document_id,pdv_id');
const pdvs = await getAll('pdvs', 'id,name');
const pdvName = new Map(pdvs.map(p => [p.id, p.name]));
const userByDoc = new Map(users.map(u => [String(u.document_id).trim(), u]));

const dates = recs.map(r => r.entryDate).sort();
const minD = dates[0], maxD = dates[dates.length - 1];

// Reemplazo limpio del rango para evitar duplicados
const del = await fetch(`${SB_URL}/rest/v1/punch_records?entry_date=gte.${minD}&entry_date=lte.${maxD}`, { method: 'DELETE', headers });
console.log('Delete rango', minD, maxD, '->', del.status);

const batchId = `batch-punch-${minD}-${maxD}`;
await fetch(`${SB_URL}/rest/v1/punch_batches?id=eq.${batchId}`, { method: 'DELETE', headers });
const bres = await fetch(`${SB_URL}/rest/v1/punch_batches`, {
  method: 'POST', headers,
  body: JSON.stringify({
    id: batchId, file_name: 'marcaciones semanas 36-41.xlsx', file_size: fs.statSync(FILE).size,
    period: `${minD} a ${maxD}`, store: 'Todos los PDVs', record_count: recs.length, uploaded_at: new Date().toISOString()
  })
});
console.log('Batch ->', bres.status, bres.status >= 300 ? await bres.text() : '');

const rows = recs.map((r, i) => {
  const doc = String(r.documentId).trim();
  const u = userByDoc.get(doc) || userByDoc.get(doc.replace(/^0+/, ''));
  return {
    id: `punch-${batchId}-${i + 1}`,
    batch_id: batchId,
    document_id: doc,
    code: r.code || `COD-${doc.slice(-4)}`,
    full_name: r.fullName,
    position: r.position,
    pdv_name: r.pdvName || (u?.pdv_id ? pdvName.get(u.pdv_id) || '' : ''),
    supervisor_name: r.supervisorName || 'Líder Regional',
    entry_date: r.entryDate,
    entry_time: r.entryTime,
    exit_date: r.exitDate || r.entryDate,
    exit_time: r.exitTime || '-',
    real_calculations: r.realCalculations || {}
  };
});

let ok = 0;
for (let c = 0; c < rows.length; c += 500) {
  const res = await fetch(`${SB_URL}/rest/v1/punch_records`, { method: 'POST', headers, body: JSON.stringify(rows.slice(c, c + 500)) });
  if (res.status >= 300) { console.error('Error chunk', c, await res.text()); process.exit(1); }
  ok += Math.min(500, rows.length - c);
}
console.log('Insertados:', ok);
const check = await fetch(`${SB_URL}/rest/v1/punch_records?select=id&batch_id=eq.${batchId}`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
console.log('Conteo en BD:', check.headers.get('content-range'));
