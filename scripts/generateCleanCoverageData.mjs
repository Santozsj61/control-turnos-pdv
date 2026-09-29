import fs from 'fs';
import { initialPDVs, initialSupervisors } from '../src/data/seedData.js';
import { ACTIVE_371_COLLABORATORS } from '../src/data/activeCollaborators371.js';

// Build coverage for each PDV
const pdvsCoverage = initialPDVs.map(pdv => {
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
    totalStaff,
    programmedCount: 0,
    pendingProgramCount: totalStaff,
    punchesCount: 0,
    pendingPunchesCount: totalStaff,
    pendingCollaborators,
    status
  };
});

const coverageByWeek = {
  "28": {
    week: "28",
    label: "Semana 28 (06 Jul - 12 Jul 2026 - Oficial)",
    month: "Julio",
    totalPdvs: pdvsCoverage.length,
    pdvsAlDia: pdvsCoverage.filter(p => p.status === 'AL_DIA').length,
    pdvsPendingMarcacion: pdvsCoverage.filter(p => p.pendingPunchesCount > 0).length,
    pdvsPendingProgram: pdvsCoverage.filter(p => p.pendingProgramCount > 0).length,
    totalCollaborators: ACTIVE_371_COLLABORATORS.length,
    totalPendingPunches: ACTIVE_371_COLLABORATORS.length,
    totalPendingProgram: ACTIVE_371_COLLABORATORS.length,
    pdvs: pdvsCoverage
  }
};

const fileContent = `// Base Oficial Limpia de Cobertura PDV basada en los 371 Colaboradores Activos
export const COVERAGE_MONITOR_BY_WEEK = ${JSON.stringify(coverageByWeek, null, 2)};
`;

fs.writeFileSync('src/data/coverageMonitorData.js', fileContent);
console.log('✅ Generated clean coverageMonitorData.js with 102 PDVs and 371 active collaborators.');
