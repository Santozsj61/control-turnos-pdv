import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initialSupervisors, initialPDVs, initialUsers } from './seedData.js';
import { calculateShiftHours, calculateMonSatHours, countMonthlySundays } from './calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'database.json');

const WEEKS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'];
const DAYS_SPANISH = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function getDatesForWeek(weekStartStr) {
  const start = new Date(weekStartStr + 'T12:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    return {
      dayOfWeek: DAYS_SPANISH[i],
      date: dateStr,
      isSunday: i === 6
    };
  });
}

function generateMockData() {
  const users = [...initialUsers];
  const supervisors = [...initialSupervisors];
  const pdvs = [...initialPDVs];

  const schedules = [];
  const punchRecords = [];
  const punchBatches = [];
  const permissions = [];
  const supplementaryJustifications = [];

  const employees = users.filter(u => u.role === 'EMPLOYEE');

  // Generate punch batches per week
  WEEKS.forEach((weekStart, wIdx) => {
    const batchId = `batch-w${wIdx + 1}`;
    punchBatches.push({
      id: batchId,
      filename: `Marcaciones_Biometrico_Semana_${weekStart}.xlsx`,
      uploadedAt: new Date(new Date(weekStart).getTime() + 7 * 86400000).toISOString(),
      uploadedBy: 'user-vrx',
      recordCount: 0
    });
  });

  // Generate schedules & punches for all employees
  employees.forEach((emp, empIdx) => {
    const empPdv = pdvs.find(p => p.id === emp.pdvId) || pdvs[0];
    const empSup = supervisors.find(s => s.id === (emp.supervisorId || empPdv.supervisorId)) || supervisors[0];

    WEEKS.forEach((weekStart, wIdx) => {
      const weekDates = getDatesForWeek(weekStart);
      const weekEnd = weekDates[6].date;
      const batch = punchBatches[wIdx];

      // Schedule shifts
      // Give each employee a day off (e.g. Wednesday or Thursday or Sunday)
      const dayOffIdx = (empIdx + wIdx) % 7;

      const shifts = weekDates.map((wd, dayIdx) => {
        const isDayOff = dayIdx === dayOffIdx;
        let startTime = '10:00';
        let endTime = '20:30';

        if (isDayOff) {
          startTime = '';
          endTime = '';
        } else if (wd.isSunday) {
          startTime = '11:00';
          endTime = '19:00';
        } else if (dayIdx === 5) {
          // Saturday
          startTime = '09:30';
          endTime = '21:00';
        }

        const calc = isDayOff
          ? {
              grossHours: 0,
              lunchHours: 0,
              netHours: 0,
              dayHours: 0,
              nightHours: 0,
              isSunday: false,
              isHoliday: false,
              sundayDayHours: 0,
              sundayNightHours: 0,
              holidayDayHours: 0,
              holidayNightHours: 0,
              lunchApplied: false,
              lunchReason: 'Día de descanso programado'
            }
          : calculateShiftHours(startTime, endTime, wd.date, {}, 'ORDINARIO');

        return {
          date: wd.date,
          dayOfWeek: wd.dayOfWeek,
          isSunday: wd.isSunday,
          isHoliday: calc.isHoliday,
          isDayOff,
          shiftType: isDayOff ? 'DESCANSO' : 'ORDINARIO',
          startTime,
          endTime,
          ...calc
        };
      });

      const totalNet = +shifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
      const totalLunch = +shifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);

      const schedId = `sched-${emp.id}-${weekStart}`;
      schedules.push({
        id: schedId,
        userId: emp.id,
        pdvId: empPdv.id,
        supervisorId: empSup.id,
        weekStart,
        weekEnd,
        isSubmitted: true,
        submittedAt: new Date(weekStart + 'T08:00:00Z').toISOString(),
        totalNetHours: totalNet,
        totalLunchHours: totalLunch,
        shifts,
        createdAt: new Date(weekStart + 'T08:00:00Z').toISOString()
      });

      // Generate Biometric Punches
      shifts.forEach((sh, dayIdx) => {
        if (sh.isDayOff) return; // Normally no punch on day off

        // Add slight realistic variance (± 5-15 mins)
        let punchIn = sh.startTime;
        let punchOut = sh.endTime;

        // Introduce variance for some days
        if (dayIdx === 0 && empIdx % 3 === 0) {
          punchIn = '10:15'; // 15 min late
        } else if (dayIdx === 4 && empIdx % 4 === 0) {
          punchOut = '21:15'; // 45 min extra
        } else if (dayIdx === 1 && empIdx % 5 === 0) {
          punchIn = '09:45'; // 15 min early
        }

        const punchCalc = calculateShiftHours(punchIn, punchOut, sh.date, {}, 'ORDINARIO');

        const punchRecord = {
          id: `punch-${batch.id}-${emp.id}-${sh.date}`,
          batchId: batch.id,
          userId: emp.id,
          documentId: emp.documentId,
          code: emp.code,
          fullName: emp.fullName,
          position: emp.position,
          pdvId: empPdv.id,
          pdvName: empPdv.name,
          supervisorName: empSup.name,
          entryDate: sh.date,
          entryTime: `${punchIn}:00`,
          exitDate: sh.date,
          exitTime: `${punchOut}:00`,
          realCalculations: {
            grossHours: punchCalc.grossHours,
            lunchHours: punchCalc.lunchHours,
            netHours: punchCalc.netHours,
            dayHours: punchCalc.dayHours,
            nightHours: punchCalc.nightHours,
            isSunday: punchCalc.isSunday,
            isHoliday: punchCalc.isHoliday,
            sundayDayHours: punchCalc.sundayDayHours,
            sundayNightHours: punchCalc.sundayNightHours,
            holidayDayHours: punchCalc.holidayDayHours,
            holidayNightHours: punchCalc.holidayNightHours,
            lunchApplied: punchCalc.lunchApplied,
            lunchReason: punchCalc.lunchReason
          }
        };

        punchRecords.push(punchRecord);
        batch.recordCount++;
      });
    });
  });

  // Sample Permissions
  permissions.push(
    {
      id: 'perm-1',
      userId: 'emp-1',
      userDocument: '1091678220',
      userName: 'DAYANA ANDREA MORENO SANCHEZ',
      pdvId: 'pdv-1',
      pdvName: 'N10 - MEDELLÍN - C.C. DEMODA OUTLET',
      supervisorId: 'zone-1',
      supervisorName: 'LÍDER ZONA 2',
      recipientRole: 'SUPERVISOR',
      assignedArea: 'Líder de Zona',
      date: '2026-09-02',
      originalStartTime: '10:00',
      originalEndTime: '20:30',
      requestedStartTime: '12:00',
      requestedEndTime: '20:30',
      isDayOffChange: false,
      reason: 'Cita médica prioritaria EPS en horas de la mañana.',
      status: 'APPROVED',
      supervisorNotes: 'Aprobado. Cobertura acordada con asesor de apoyo.',
      createdAt: '2026-09-01T14:30:00Z',
      reviewedAt: '2026-09-01T16:00:00Z',
      reviewerId: 'user-zone-1'
    },
    {
      id: 'perm-2',
      userId: 'emp-2',
      userDocument: '1118816729',
      userName: 'RORAIMA QUINTERO OBREDOR',
      pdvId: 'pdv-1',
      pdvName: 'N10 - MEDELLÍN - C.C. DEMODA OUTLET',
      supervisorId: 'zone-1',
      supervisorName: 'LÍDER ZONA 2',
      recipientRole: 'MAINTENANCE_APPROVER',
      assignedArea: 'Mantenimiento y Obras',
      date: '2026-09-10',
      originalStartTime: '10:00',
      originalEndTime: '20:30',
      requestedStartTime: '08:00',
      requestedEndTime: '17:00',
      isDayOffChange: false,
      reason: 'Acompañamiento a cuadrilla técnica por adecuación eléctrica del PDV.',
      status: 'PENDING',
      supervisorNotes: '',
      createdAt: '2026-09-08T10:00:00Z'
    },
    {
      id: 'perm-3',
      userId: 'emp-4',
      userDocument: '1004215413',
      userName: 'SANTIAGO CISNEROS DE LA CRUZ',
      pdvId: 'pdv-2',
      pdvName: 'Q003 - Cali - Calle 23',
      supervisorId: 'zone-2',
      supervisorName: 'LÍDER CALI 1',
      recipientRole: 'SUPERVISOR',
      assignedArea: 'Capacitación y Reuniones',
      date: '2026-09-15',
      originalStartTime: '10:00',
      originalEndTime: '20:30',
      requestedStartTime: '',
      requestedEndTime: '',
      isDayOffChange: true,
      reason: 'Seminario de liderazgo comercial retail.',
      status: 'APPROVED',
      supervisorNotes: 'Aprobado para asistencia a capacitación corporativa.',
      createdAt: '2026-09-12T09:00:00Z',
      reviewedAt: '2026-09-12T11:00:00Z',
      reviewerId: 'user-zone-2'
    }
  );

  // Sample Supplementary Justifications
  supplementaryJustifications.push({
    id: 'just-1',
    pdvId: 'pdv-1',
    pdvName: 'N10 - MEDELLÍN - C.C. DEMODA OUTLET',
    weekStart: '2026-08-31',
    submittedBy: 'usr-pdv-1-admin',
    submitterName: 'ADMINISTRADOR N10 - MEDELLÍN',
    supervisorId: 'zone-1',
    supervisorName: 'LÍDER ZONA 2',
    totalSupplementaryHours: 14.5,
    reasonCategory: 'EVENTO_COMERCIAL',
    justificationText: 'Incremento de tiempos suplementarios generado por el cierre de campaña de fin de mes y atención de alto tráfico en centro comercial.',
    status: 'ENVIADO_A_LIDER',
    submittedAt: '2026-09-06T21:30:00Z'
  });

  const fullDB = {
    users,
    supervisors,
    pdvs,
    schedules,
    permissions,
    punchBatches,
    punchRecords,
    supplementaryJustifications,
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

  fs.writeFileSync(DB_FILE, JSON.stringify(fullDB, null, 2), 'utf-8');
  console.log(`Database seeded successfully!`);
  console.log(`- Users: ${fullDB.users.length}`);
  console.log(`- Supervisors: ${fullDB.supervisors.length}`);
  console.log(`- PDVs: ${fullDB.pdvs.length}`);
  console.log(`- Schedules: ${fullDB.schedules.length}`);
  console.log(`- Punch Batches: ${fullDB.punchBatches.length}`);
  console.log(`- Punch Records: ${fullDB.punchRecords.length}`);
  console.log(`- Permissions: ${fullDB.permissions.length}`);
  console.log(`- Justifications: ${fullDB.supplementaryJustifications.length}`);
}

generateMockData();
