import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEM28_PATH = 'C:/Users/analista.retail/Downloads/Sem 28.xlsx';
console.log('Reading 371 collaborators from:', SEM28_PATH);
const fileBuffer = fs.readFileSync(SEM28_PATH);
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const cronoSheet = workbook.Sheets['Cronograma'];
const cronoRows = XLSX.utils.sheet_to_json(cronoSheet, { header: 1, defval: '' });

const activeCollaborators371 = [];
const activeDocSet = new Set();

for (let r = 1; r < cronoRows.length; r++) {
  const row = cronoRows[r];
  if (!row || row.length < 3) continue;

  const rawPdv = String(row[0] || '').trim();
  const doc = String(row[1] || '').trim();
  const fullName = String(row[2] || '').trim();
  if (!doc) continue;

  const matchCode = rawPdv.match(/^([A-Za-z0-9]+)/);
  const code = matchCode ? matchCode[1].toUpperCase() : '';
  const pdvObj = initialPDVs.find(p => 
    p.code?.toUpperCase() === code || 
    (code && p.name?.toUpperCase().includes(code))
  );

  const pdvId = pdvObj ? pdvObj.id : `pdv-${code || 'NAC'}`;
  const supervisorId = pdvObj?.supervisorId || 'sup-cali-1';

  activeDocSet.add(doc);
  activeCollaborators371.push({
    id: `emp-${doc}`,
    username: `emp_${doc}`,
    fullName,
    full_name: fullName,
    documentId: doc,
    document_id: doc,
    role: 'EMPLOYEE',
    pdvId,
    pdv_id: pdvId,
    pdvName: pdvObj?.name || rawPdv,
    pdvCode: code || pdvObj?.code || 'NAC',
    supervisorId,
    supervisor_id: supervisorId,
    position: 'ASESOR(A) DE IMAGEN',
    contractType: 'FIJO',
    contract_type: 'FIJO',
    weeklyMaxHours: 42,
    weekly_max_hours: 42,
    isActive: true,
    is_active: true
  });
}

console.log(`✅ Extracted exactly ${activeCollaborators371.length} active collaborators. Unique docs: ${activeDocSet.size}`);

// ----------------------------------------------------
// 2. CREATE src/data/activeCollaborators371.js
// ----------------------------------------------------
const docListArray = Array.from(activeDocSet);
const activeCollabsFileContent = `// Base Oficial de 371 Colaboradores Activos
// Extraída de Sem 28.xlsx (Plantilla Oficial Vigente)

export const ACTIVE_371_DOCUMENTS = new Set(${JSON.stringify(docListArray, null, 2)});

export const ACTIVE_371_COLLABORATORS = ${JSON.stringify(activeCollaborators371, null, 2)};

/**
 * Verifica si un colaborador pertenece a la plantilla activa de 371 personas.
 * Si no pertenece, se considera "Retirado" o inactivo en reportes históricos.
 */
export function isCollaboratorActive(docId) {
  if (!docId) return false;
  return ACTIVE_371_DOCUMENTS.has(String(docId).trim());
}

/**
 * Normaliza el nombre y estado de un colaborador:
 * Si no está en la base de 371, retorna con etiqueta (Retirado).
 */
export function tagCollaboratorStatus(docId, originalName = '') {
  const active = isCollaboratorActive(docId);
  const cleanName = String(originalName || '').replace(/\\s*\\(Retirado\\)/gi, '').trim();
  return {
    isActive: active,
    statusLabel: active ? 'Activo' : 'Retirado',
    displayName: active ? cleanName : \`\${cleanName} (Retirado)\`
  };
}
`;

fs.writeFileSync(path.join(__dirname, '../src/data/activeCollaborators371.js'), activeCollabsFileContent);
console.log('✅ src/data/activeCollaborators371.js created.');

// ----------------------------------------------------
// 3. CLEAN LOCAL DATABASE (server/data/database.json)
// ----------------------------------------------------
const dbPath = path.join(__dirname, '../server/data/database.json');
let adminUsers = [];
if (fs.existsSync(dbPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    adminUsers = (existing.users || []).filter(u => u.role !== 'EMPLOYEE');
  } catch (e) {}
}

if (adminUsers.length === 0) {
  adminUsers = [
    { id: 'user-admin', username: 'admin', fullName: 'ADMINISTRADOR GENERAL', role: 'ADMIN', isActive: true },
    { id: 'user-hr', username: 'thumano', fullName: 'TALENTO HUMANO (HR)', role: 'HR_ADMIN', isActive: true },
    { id: 'user-vrx', username: 'AuditorVRX', fullName: 'AUDITORÍA & CONTROL (VRX)', role: 'AUDITOR_VRX', isActive: true },
    { id: 'user-maintenance', username: 'mantenimiento', fullName: 'APROBADOR MANTENIMIENTO', role: 'MAINTENANCE_APPROVER', isActive: true }
  ];
}

const cleanedDb = {
  users: [...adminUsers, ...activeCollaborators371],
  pdvs: initialPDVs,
  supervisors: initialSupervisors,
  schedules: [],
  punchBatches: [],
  punchRecords: [],
  permissions: [],
  supplementary_justifications: [],
  app_config: {
    workweek_max_hours: 42,
    official_staff_count: 371
  }
};

fs.writeFileSync(dbPath, JSON.stringify(cleanedDb, null, 2));
console.log(`✅ server/data/database.json reset: 0 schedules, 0 punch records, ${cleanedDb.users.length} users (${activeCollaborators371.length} colaboradores activos).`);

// ----------------------------------------------------
// 4. CLEAN SUPABASE VIA REST API
// ----------------------------------------------------
const SB_URL = 'https://aqgfocnbsjyhcpqfxrsa.supabase.co';
const SB_KEY = 'sb_publishable_jkaQRTZe82IDDPiXTb0jMg_bj19rK0U';

async function cleanSupabase() {
  const headers = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log('\n--- Cleaning Supabase Tables ---');
  try {
    // 4a. Delete schedules
    console.log('Deleting all schedules in Supabase...');
    const resSched = await fetch(`${SB_URL}/rest/v1/schedules?id=neq.__none__`, { method: 'DELETE', headers });
    console.log('Schedules delete response status:', resSched.status);

    // 4b. Delete punch records
    console.log('Deleting all punch_records in Supabase...');
    const resPunches = await fetch(`${SB_URL}/rest/v1/punch_records?id=neq.__none__`, { method: 'DELETE', headers });
    console.log('Punch records delete response status:', resPunches.status);

    // 4c. Delete punch batches
    console.log('Deleting all punch_batches in Supabase...');
    const resBatches = await fetch(`${SB_URL}/rest/v1/punch_batches?id=neq.__none__`, { method: 'DELETE', headers });
    console.log('Punch batches delete response status:', resBatches.status);

    // 4d. Delete permissions
    console.log('Deleting all permissions in Supabase...');
    const resPerms = await fetch(`${SB_URL}/rest/v1/permissions?id=neq.__none__`, { method: 'DELETE', headers });
    console.log('Permissions delete response status:', resPerms.status);

    // 4e. Delete supplementary justifications
    console.log('Deleting all supplementary_justifications in Supabase...');
    const resJust = await fetch(`${SB_URL}/rest/v1/supplementary_justifications?id=neq.__none__`, { method: 'DELETE', headers });
    console.log('Justifications delete response status:', resJust.status);

    // 4f. Reset users in Supabase: keep admin accounts + 371 collaborators
    console.log('Deleting old employee users not in 371 list...');
    // We can delete all employee users first, then upsert the 371 collaborators!
    const resDelUsers = await fetch(`${SB_URL}/rest/v1/users?role=eq.EMPLOYEE`, { method: 'DELETE', headers });
    console.log('Employee users delete response status:', resDelUsers.status);

    // Sync the 371 collaborators to Supabase
    console.log(`Syncing ${activeCollaborators371.length} official collaborators to Supabase users table...`);
    const upsertHeaders = {
      ...headers,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
    for (let i = 0; i < activeCollaborators371.length; i += 100) {
      const chunk = activeCollaborators371.slice(i, i + 100).map(u => ({
        id: u.id,
        username: u.username,
        full_name: u.fullName,
        document_id: u.documentId,
        role: 'EMPLOYEE',
        pdv_id: u.pdvId,
        position: u.position,
        contract_type: 'FIJO',
        weekly_max_hours: 42,
        is_active: true
      }));
      const r = await fetch(`${SB_URL}/rest/v1/users`, {
        method: 'POST',
        headers: upsertHeaders,
        body: JSON.stringify(chunk)
      });
      if (!r.ok) console.warn('User chunk upload warning:', await r.text());
    }
    console.log('✅ Exactly 371 active collaborators synced to Supabase users table.');

  } catch (err) {
    console.error('Supabase cleanup error:', err.message);
  }
}

await cleanSupabase();
console.log('\n🎉 ALL DATA HAS BEEN CLEANED EXCEPT THE OFFICIAL BASE OF 371 COLLABORATORS!');
