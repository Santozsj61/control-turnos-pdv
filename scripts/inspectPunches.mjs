import fs from 'fs';
import crypto from 'crypto';
import { parsePunchExcel } from '../src/utils/excelParser.js';

const DIR = 'C:/Users/analista.retail/.gemini/antigravity/brain/ee9a10d7-aa9a-4918-8b9f-cc85f73616cc/.user_uploaded/';
const FILES = ['media_1792101708961_b14a73bd.xlsx', 'media_1792101895690_6ed976f7.xlsx'];

const hashes = FILES.map(f => crypto.createHash('md5').update(fs.readFileSync(DIR + f)).digest('hex'));
console.log('MD5:', hashes, 'identicos:', hashes[0] === hashes[1]);

const recs = parsePunchExcel(fs.readFileSync(DIR + FILES[0]));
console.log('registros:', recs.length);
const byDate = {};
recs.forEach(r => { byDate[r.entryDate] = (byDate[r.entryDate] || 0) + 1; });
const dates = Object.keys(byDate).sort();
console.log('rango fechas:', dates[0], '->', dates[dates.length - 1], 'dias:', dates.length);
console.log('muestra:', JSON.stringify(recs.slice(0, 3)));
console.log('sin salida:', recs.filter(r => !r.exitTime || r.exitTime === '-').length);
const bad = recs.filter(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.entryDate));
console.log('fechas invalidas:', bad.length);
