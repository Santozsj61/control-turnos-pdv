import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initialSupervisors, initialPDVs, initialUsers } from './seedData.js';
import { calculateShiftHours, calculateMonSatHours, countMonthlySundays } from './calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getInitialDB() {
  return {
    users: [...initialUsers],
    supervisors: [...initialSupervisors],
    pdvs: [...initialPDVs],
    schedules: [],
    permissions: [],
    punchBatches: [],
    punchRecords: [],
    supplementaryJustifications: [],
    config: {
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
    }
  };
}

export function loadDB() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const init = getInitialDB();
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), 'utf-8');
    return init;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.users) data.users = [...initialUsers];
    if (!data.supervisors) data.supervisors = [...initialSupervisors];
    if (!data.pdvs) data.pdvs = [...initialPDVs];
    if (!data.schedules) data.schedules = [];
    if (!data.permissions) data.permissions = [];
    if (!data.punchBatches) data.punchBatches = [];
    if (!data.punchRecords) data.punchRecords = [];
    if (!data.supplementaryJustifications) data.supplementaryJustifications = [];
    return data;
  } catch (err) {
    const init = getInitialDB();
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2), 'utf-8');
    return init;
  }
}

export function saveDB(data) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export const db = {
  getUsers: (filters = {}) => {
    let list = loadDB().users;
    if (filters.role) list = list.filter(u => u.role === filters.role);
    if (filters.pdvId) list = list.filter(u => u.pdvId === filters.pdvId);
    return list;
  },
  getSupervisors: () => loadDB().supervisors,
  getPDVs: () => loadDB().pdvs,
  getConfig: () => loadDB().config,
  updateConfig: (cfg) => {
    const data = loadDB();
    data.config = { ...data.config, ...cfg };
    saveDB(data);
    return data.config;
  },
  getSchedules: (filters = {}) => {
    let list = loadDB().schedules;
    if (filters.pdvId) list = list.filter(s => s.pdvId === filters.pdvId);
    if (filters.weekStart) list = list.filter(s => s.weekStart === filters.weekStart);
    return list;
  },
  saveBatchPdvSchedules: ({ pdvId, weekStart, weekEnd, schedules }) => {
    const data = loadDB();
    data.schedules = data.schedules.filter(s => !(s.pdvId === pdvId && s.weekStart === weekStart));
    for (const item of schedules) {
      data.schedules.push({
        id: `sched-${item.userId}-${weekStart}`,
        userId: item.userId,
        pdvId,
        weekStart,
        weekEnd: weekEnd || weekStart,
        isSubmitted: true,
        shifts: item.shifts,
        totalNetHours: item.shifts.reduce((a, b) => a + (b.netHours || 0), 0)
      });
    }
    saveDB(data);
    return data.schedules;
  },
  getPermissions: (filters = {}) => {
    let list = loadDB().permissions;
    if (filters.status) list = list.filter(p => p.status === filters.status);
    if (filters.pdvId) list = list.filter(p => p.pdvId === filters.pdvId);
    return list;
  },
  createPermission: (p) => {
    const data = loadDB();
    const newP = { id: `perm-${Date.now()}`, status: 'PENDING', requestedAt: new Date().toISOString(), ...p };
    data.permissions.unshift(newP);
    saveDB(data);
    return newP;
  },
  updatePermissionStatus: (id, status, notes, reviewerId) => {
    const data = loadDB();
    const perm = data.permissions.find(p => p.id === id);
    if (perm) {
      perm.status = status;
      perm.supervisorNotes = notes;
      perm.reviewerId = reviewerId;
      perm.reviewedAt = new Date().toISOString();
      saveDB(data);
    }
    return perm;
  },
  getPunchBatches: () => loadDB().punchBatches,
  getPunchRecords: () => loadDB().punchRecords,
  savePunchBatch: (batchInfo, records) => {
    const data = loadDB();
    const batch = { id: `batch-${Date.now()}`, uploadedAt: new Date().toISOString(), ...batchInfo, recordCount: records.length };
    data.punchBatches.unshift(batch);
    const rows = records.map((r, i) => ({ id: `punch-${batch.id}-${i+1}`, batchId: batch.id, ...r }));
    data.punchRecords.push(...rows);
    saveDB(data);
    return { batch, recordCount: rows.length };
  }
};
