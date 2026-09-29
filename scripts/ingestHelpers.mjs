import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { calculateShiftHours } from '../src/utils/calculator.js';

const dir = 'C:/Users/analista.retail/Downloads';

// ----------------------------------------------------
// Week Definitions (23 to 35)
// ----------------------------------------------------
export const WEEKS_DEF = {
  '23': {
    start: '2026-06-01',
    end: '2026-06-07',
    label: 'Semana 23 (01 Jun - 07 Jun 2026)',
    month: 'Junio',
    dates: [
      { date: '2026-06-01', name: 'Lunes' },
      { date: '2026-06-02', name: 'Martes' },
      { date: '2026-06-03', name: 'Miércoles' },
      { date: '2026-06-04', name: 'Jueves' },
      { date: '2026-06-05', name: 'Viernes' },
      { date: '2026-06-06', name: 'Sábado' },
      { date: '2026-06-07', name: 'Domingo' }
    ]
  },
  '24': {
    start: '2026-06-08',
    end: '2026-06-14',
    label: 'Semana 24 (08 Jun - 14 Jun 2026)',
    month: 'Junio',
    dates: [
      { date: '2026-06-08', name: 'Lunes' }, // Festivo
      { date: '2026-06-09', name: 'Martes' },
      { date: '2026-06-10', name: 'Miércoles' },
      { date: '2026-06-11', name: 'Jueves' },
      { date: '2026-06-12', name: 'Viernes' },
      { date: '2026-06-13', name: 'Sábado' },
      { date: '2026-06-14', name: 'Domingo' }
    ]
  },
  '25': {
    start: '2026-06-15',
    end: '2026-06-21',
    label: 'Semana 25 (15 Jun - 21 Jun 2026)',
    month: 'Junio',
    dates: [
      { date: '2026-06-15', name: 'Lunes' },
      { date: '2026-06-16', name: 'Martes' },
      { date: '2026-06-17', name: 'Miércoles' },
      { date: '2026-06-18', name: 'Jueves' },
      { date: '2026-06-19', name: 'Viernes' },
      { date: '2026-06-20', name: 'Sábado' },
      { date: '2026-06-21', name: 'Domingo' }
    ]
  },
  '26': {
    start: '2026-06-22',
    end: '2026-06-28',
    label: 'Semana 26 (22 Jun - 28 Jun 2026)',
    month: 'Junio',
    dates: [
      { date: '2026-06-22', name: 'Lunes' }, // Festivo
      { date: '2026-06-23', name: 'Martes' },
      { date: '2026-06-24', name: 'Miércoles' },
      { date: '2026-06-25', name: 'Jueves' },
      { date: '2026-06-26', name: 'Viernes' },
      { date: '2026-06-27', name: 'Sábado' },
      { date: '2026-06-28', name: 'Domingo' }
    ]
  },
  '27': {
    start: '2026-06-29',
    end: '2026-07-05',
    label: 'Semana 27 (29 Jun - 05 Jul 2026)',
    month: 'Julio',
    dates: [
      { date: '2026-06-29', name: 'Lunes' }, // Festivo
      { date: '2026-06-30', name: 'Martes' },
      { date: '2026-07-01', name: 'Miércoles' },
      { date: '2026-07-02', name: 'Jueves' },
      { date: '2026-07-03', name: 'Viernes' },
      { date: '2026-07-04', name: 'Sábado' },
      { date: '2026-07-05', name: 'Domingo' }
    ]
  },
  '28': {
    start: '2026-07-06',
    end: '2026-07-12',
    label: 'Semana 28 (06 Jul - 12 Jul 2026)',
    month: 'Julio',
    dates: [
      { date: '2026-07-06', name: 'Lunes' },
      { date: '2026-07-07', name: 'Martes' },
      { date: '2026-07-08', name: 'Miércoles' },
      { date: '2026-07-09', name: 'Jueves' },
      { date: '2026-07-10', name: 'Viernes' },
      { date: '2026-07-11', name: 'Sábado' },
      { date: '2026-07-12', name: 'Domingo' }
    ]
  },
  '29': {
    start: '2026-07-13',
    end: '2026-07-19',
    label: 'Semana 29 (13 Jul - 19 Jul 2026)',
    month: 'Julio',
    dates: [
      { date: '2026-07-13', name: 'Lunes' }, // Festivo
      { date: '2026-07-14', name: 'Martes' },
      { date: '2026-07-15', name: 'Miércoles' },
      { date: '2026-07-16', name: 'Jueves' },
      { date: '2026-07-17', name: 'Viernes' },
      { date: '2026-07-18', name: 'Sábado' },
      { date: '2026-07-19', name: 'Domingo' }
    ]
  },
  '30': {
    start: '2026-07-20',
    end: '2026-07-26',
    label: 'Semana 30 (20 Jul - 26 Jul 2026)',
    month: 'Julio',
    dates: [
      { date: '2026-07-20', name: 'Lunes' }, // Festivo
      { date: '2026-07-21', name: 'Martes' },
      { date: '2026-07-22', name: 'Miércoles' },
      { date: '2026-07-23', name: 'Jueves' },
      { date: '2026-07-24', name: 'Viernes' },
      { date: '2026-07-25', name: 'Sábado' },
      { date: '2026-07-26', name: 'Domingo' }
    ]
  },
  '31': {
    start: '2026-07-27',
    end: '2026-08-02',
    label: 'Semana 31 (27 Jul - 02 Ago 2026)',
    month: 'Julio / Agosto',
    dates: [
      { date: '2026-07-27', name: 'Lunes' },
      { date: '2026-07-28', name: 'Martes' },
      { date: '2026-07-29', name: 'Miércoles' },
      { date: '2026-07-30', name: 'Jueves' },
      { date: '2026-07-31', name: 'Viernes' },
      { date: '2026-08-01', name: 'Sábado' },
      { date: '2026-08-02', name: 'Domingo' }
    ]
  },
  '32': {
    start: '2026-08-03',
    end: '2026-08-09',
    label: 'Semana 32 (03 Ago - 09 Ago 2026)',
    month: 'Agosto',
    dates: [
      { date: '2026-08-03', name: 'Lunes' },
      { date: '2026-08-04', name: 'Martes' },
      { date: '2026-08-05', name: 'Miércoles' },
      { date: '2026-08-06', name: 'Jueves' },
      { date: '2026-08-07', name: 'Viernes' }, // Festivo
      { date: '2026-08-08', name: 'Sábado' },
      { date: '2026-08-09', name: 'Domingo' }
    ]
  },
  '33': {
    start: '2026-08-10',
    end: '2026-08-16',
    label: 'Semana 33 (10 Ago - 16 Ago 2026)',
    month: 'Agosto',
    dates: [
      { date: '2026-08-10', name: 'Lunes' },
      { date: '2026-08-11', name: 'Martes' },
      { date: '2026-08-12', name: 'Miércoles' },
      { date: '2026-08-13', name: 'Jueves' },
      { date: '2026-08-14', name: 'Viernes' },
      { date: '2026-08-15', name: 'Sábado' },
      { date: '2026-08-16', name: 'Domingo' }
    ]
  },
  '34': {
    start: '2026-08-17',
    end: '2026-08-23',
    label: 'Semana 34 (17 Ago - 23 Ago 2026)',
    month: 'Agosto',
    dates: [
      { date: '2026-08-17', name: 'Lunes' }, // Festivo
      { date: '2026-08-18', name: 'Martes' },
      { date: '2026-08-19', name: 'Miércoles' },
      { date: '2026-08-20', name: 'Jueves' },
      { date: '2026-08-21', name: 'Viernes' },
      { date: '2026-08-22', name: 'Sábado' },
      { date: '2026-08-23', name: 'Domingo' }
    ]
  },
  '35': {
    start: '2026-08-24',
    end: '2026-08-30',
    label: 'Semana 35 (24 Ago - 30 Ago 2026)',
    month: 'Agosto',
    dates: [
      { date: '2026-08-24', name: 'Lunes' },
      { date: '2026-08-25', name: 'Martes' },
      { date: '2026-08-26', name: 'Miércoles' },
      { date: '2026-08-27', name: 'Jueves' },
      { date: '2026-08-28', name: 'Viernes' },
      { date: '2026-08-29', name: 'Sábado' },
      { date: '2026-08-30', name: 'Domingo' }
    ]
  }
};

export function numToTime(val) {
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

export function num(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function matchPDV(rawPdv, pdvsList = []) {
  const str = String(rawPdv || '').trim();
  const matchCode = str.match(/^([A-Za-z0-9]+)/);
  const code = matchCode ? matchCode[1].toUpperCase() : '';
  const found = pdvsList.find(p => 
    (code && p.code?.toUpperCase() === code) || 
    (code && p.name?.toUpperCase().includes(code))
  );
  return found || {
    id: `pdv-${code || 'NAC'}`,
    name: str || 'PDV Nacional',
    code: code || 'NAC',
    city: 'Nacional',
    zone: 'Nacional',
    supervisorId: 'sup-cali-1'
  };
}
