import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initialSupervisors, initialPDVs, initialUsers } from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'database.json');

function selectiveCleanDB() {
  // 1. MASTER DATA PRESERVED
  const users = [...initialUsers];
  const supervisors = [...initialSupervisors];
  const pdvs = [...initialPDVs];
  const config = {
    lunchDurationHours: 1.5,
    lunchCutoffTime: '12:30',
    lunchMinShiftDuration: 6.0,
    dayStartTime: '06:00',
    nightStartTime: '21:00',
    weeklyMaxStandardHours: 42,
    maxSundaysPerMonth: 2,
    lateToleranceMinutes: 10,
    earlyExitToleranceMinutes: 10,
    maintenanceApprovalEmail: 'mantenimiento.obras@quest.com.co'
  };

  // 2. TRANSACTIONAL / OPERATIONAL DATA PURGED TO ZERO
  const schedules = [];
  const permissions = [];
  const punchBatches = [];
  const punchRecords = [];
  const supplementaryJustifications = [];

  const cleanDB = {
    users,
    supervisors,
    pdvs,
    schedules,
    permissions,
    punchBatches,
    punchRecords,
    supplementaryJustifications,
    config
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(cleanDB, null, 2), 'utf-8');

  console.log('--- Limpieza Selectiva Completada ---');
  console.log('DATOS MAESTROS CONSERVADOS:');
  console.log(`• Puntos de Venta (PDVs): ${cleanDB.pdvs.length}`);
  console.log(`• Zonas Regionales: ${cleanDB.supervisors.length}`);
  console.log(`• Usuarios y Perfiles: ${cleanDB.users.length}`);
  console.log(`• Reglas y Parámetros: Conservados (42h, CST, etc.)`);
  console.log('\nREGISTROS TRANSACCIONALES PURGADOS (Estado 0):');
  console.log(`• Programaciones de Horarios: ${cleanDB.schedules.length}`);
  console.log(`• Lotes de Marcaciones: ${cleanDB.punchBatches.length}`);
  console.log(`• Registros de Marcaciones: ${cleanDB.punchRecords.length}`);
  console.log(`• Solicitudes de Permisos / Novedades: ${cleanDB.permissions.length}`);
  console.log(`• Justificaciones Suplementarias: ${cleanDB.supplementaryJustifications.length}`);
}

selectiveCleanDB();
