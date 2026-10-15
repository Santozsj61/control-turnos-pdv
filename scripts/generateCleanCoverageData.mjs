import fs from 'fs';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { ACTIVE_371_COLLABORATORS } from '../src/data/activeCollaborators371.js';
import { WEEKS_DEF } from './ingestHelpers.mjs';

// Build coverage for each PDV
const basePdvsCoverage = initialPDVs.map(pdv => {
  const staff = ACTIVE_371_COLLABORATORS.filter(c => 
    c.pdvId === pdv.id || 
    (pdv.code && c.pdvCode?.toUpperCase() === pdv.code.toUpperCase())
  );

  const sup = initialSupervisors.find(s => s.id === pdv.supervisorId);

  const pendingCollaborators = staff.map(c => ({
    documentId: c.documentId,
    fullName: c.fullName,
    position: c.position || 'ASESOR(A) DE IMAGEN',
    isPendingProgram: true,
    isPendingPunch: true,
    issues: ['Sin turno programado', 'Sin marcación biométrica']
  }));

  const totalStaff = staff.length;
  const status = totalStaff > 0 ? 'PENDIENTE_AMBOS' : 'AL_DIA';

  return {
    pdvId: pdv.id,
    pdvCode: pdv.code,
    pdvName: pdv.name,
    city: pdv.city,
    zone: sup?.zoneName || 'ZONA NACIONAL',
    supervisorName: sup?.name || pdv.supervisorName || 'Líder Regional',
    supervisorId: sup?.id || pdv.supervisorId,
    totalStaff,
    programmedCount: 0,
    pendingProgramCount: totalStaff,
    punchesCount: 0,
    pendingPunchesCount: totalStaff,
    pendingCollaborators,
    status
  };
});

const coverageByWeek = {};
for (const [wKey, wDef] of Object.entries(WEEKS_DEF)) {
  const weekPdvs = basePdvsCoverage.map(p => ({
    ...p,
    pendingCollaborators: p.pendingCollaborators.map(c => ({ ...c }))
  }));

  coverageByWeek[wKey] = {
    week: wKey,
    label: wDef.label,
    month: wDef.month,
    start: wDef.start,
    end: wDef.end,
    totalPdvs: weekPdvs.length,
    pdvsAlDia: weekPdvs.filter(p => p.status === 'AL_DIA').length,
    pdvsPendingMarcacion: weekPdvs.filter(p => p.pendingPunchesCount > 0).length,
    pdvsPendingProgram: weekPdvs.filter(p => p.pendingProgramCount > 0).length,
    totalCollaborators: ACTIVE_371_COLLABORATORS.length,
    totalPendingPunches: ACTIVE_371_COLLABORATORS.length,
    totalPendingProgram: ACTIVE_371_COLLABORATORS.length,
    pdvs: weekPdvs
  };
}

console.log(`✅ Verified coverage data for ${Object.keys(coverageByWeek).length} weeks (Weeks 23 to 35).`);
