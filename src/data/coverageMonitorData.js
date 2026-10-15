import { initialPDVs, initialSupervisors } from './seedData.js';
import { ACTIVE_371_COLLABORATORS } from './activeCollaborators371.js';

export const WEEKS_DEF = {
  '23': {
    start: '2026-06-01',
    end: '2026-06-07',
    label: 'Semana 23 (01 Jun - 07 Jun 2026)',
    month: 'Junio'
  },
  '24': {
    start: '2026-06-08',
    end: '2026-06-14',
    label: 'Semana 24 (08 Jun - 14 Jun 2026)',
    month: 'Junio'
  },
  '25': {
    start: '2026-06-15',
    end: '2026-06-21',
    label: 'Semana 25 (15 Jun - 21 Jun 2026)',
    month: 'Junio'
  },
  '26': {
    start: '2026-06-22',
    end: '2026-06-28',
    label: 'Semana 26 (22 Jun - 28 Jun 2026)',
    month: 'Junio'
  },
  '27': {
    start: '2026-06-29',
    end: '2026-07-05',
    label: 'Semana 27 (29 Jun - 05 Jul 2026)',
    month: 'Julio'
  },
  '28': {
    start: '2026-07-06',
    end: '2026-07-12',
    label: 'Semana 28 (06 Jul - 12 Jul 2026 - Oficial)',
    month: 'Julio'
  },
  '29': {
    start: '2026-07-13',
    end: '2026-07-19',
    label: 'Semana 29 (13 Jul - 19 Jul 2026)',
    month: 'Julio'
  },
  '30': {
    start: '2026-07-20',
    end: '2026-07-26',
    label: 'Semana 30 (20 Jul - 26 Jul 2026)',
    month: 'Julio'
  },
  '31': {
    start: '2026-07-27',
    end: '2026-08-02',
    label: 'Semana 31 (27 Jul - 02 Ago 2026)',
    month: 'Julio / Agosto'
  },
  '32': {
    start: '2026-08-03',
    end: '2026-08-09',
    label: 'Semana 32 (03 Ago - 09 Ago 2026)',
    month: 'Agosto'
  },
  '33': {
    start: '2026-08-10',
    end: '2026-08-16',
    label: 'Semana 33 (10 Ago - 16 Ago 2026)',
    month: 'Agosto'
  },
  '34': {
    start: '2026-08-17',
    end: '2026-08-23',
    label: 'Semana 34 (17 Ago - 23 Ago 2026)',
    month: 'Agosto'
  },
  '35': {
    start: '2026-08-24',
    end: '2026-08-30',
    label: 'Semana 35 (24 Ago - 30 Ago 2026)',
    month: 'Agosto'
  },
  '36': {
    start: '2026-08-31',
    end: '2026-09-06',
    label: 'Semana 36 (31 Ago - 06 Sep 2026)',
    month: 'Septiembre'
  },
  '37': {
    start: '2026-09-07',
    end: '2026-09-13',
    label: 'Semana 37 (07 Sep - 13 Sep 2026)',
    month: 'Septiembre'
  },
  '38': {
    start: '2026-09-14',
    end: '2026-09-20',
    label: 'Semana 38 (14 Sep - 20 Sep 2026)',
    month: 'Septiembre'
  },
  '39': {
    start: '2026-09-21',
    end: '2026-09-27',
    label: 'Semana 39 (21 Sep - 27 Sep 2026)',
    month: 'Septiembre'
  },
  '40': {
    start: '2026-09-28',
    end: '2026-10-04',
    label: 'Semana 40 (28 Sep - 04 Oct 2026)',
    month: 'Septiembre / Octubre'
  },
  '41': {
    start: '2026-10-05',
    end: '2026-10-11',
    label: 'Semana 41 (05 Oct - 11 Oct 2026)',
    month: 'Octubre'
  },
  '42': {
    start: '2026-10-12',
    end: '2026-10-18',
    label: 'Semana 42 (12 Oct - 18 Oct 2026 - Semana Actual ⭐)',
    month: 'Octubre'
  },
  '43': {
    start: '2026-10-19',
    end: '2026-10-25',
    label: 'Semana 43 (19 Oct - 25 Oct 2026)',
    month: 'Octubre'
  }
};

/**
 * Builds coverage structure for all 13 official weeks (Semana 23 a 35)
 * accurately mapped to 101 PDVs and 371 Active Collaborators.
 */
function generateCoverageData() {
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

  const coverage = {};

  for (const [wKey, wDef] of Object.entries(WEEKS_DEF)) {
    const weekPdvs = basePdvsCoverage.map(p => ({
      ...p,
      pendingCollaborators: p.pendingCollaborators.map(c => ({ ...c }))
    }));

    coverage[wKey] = {
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

  return coverage;
}

export const COVERAGE_MONITOR_BY_WEEK = generateCoverageData();
