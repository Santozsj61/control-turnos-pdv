import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { runReconciliation } from './reconciliation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(distPath));

// 1. Auth & Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, pdvId, pin, supervisorId } = req.body;
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || pin || '').trim();

    // 0. Auditor VRX / Control (ÚNICA CLAVE ESTRICTAMENTE AUTORIZADA: 0814)
    if (cleanUser === 'vrx' || cleanUser === 'auditor' || cleanUser === 'auditorvrx') {
      if (cleanPass === '0814') {
        return res.json({
          success: true,
          user: {
            id: 'user-vrx',
            username: 'AuditorVRX',
            fullName: 'AUDITORÍA DE ASISTENCIA VRX',
            role: 'AUDITOR_VRX',
            position: 'AUDITOR NACIONAL DE CONTROL HORARIO',
            area: 'AUDITORÍA Y CONTROL INTERNO'
          }
        });
      }
      return res.status(401).json({ success: false, error: 'Contraseña de Auditor incorrecta (única clave autorizada: 0814)' });
    }

    // 1. Admin General
    if ((cleanUser === 'administrador' || cleanUser === 'admin') && (cleanPass === '888' || cleanPass === 'admin')) {
      return res.json({
        success: true,
        user: {
          id: 'user-admin',
          username: 'Administrador',
          fullName: 'ADMINISTRADOR GENERAL',
          role: 'ADMIN',
          position: 'SUPERUSUARIO / ADMIN GENERAL',
          area: 'OPERACIONES & AUDITORÍA GLOBAL'
        }
      });
    }

    // 2. Líder de Zona
    if (supervisorId || cleanUser === 'supervisor' || cleanUser === 'zona') {
      const sups = db.getSupervisors();
      const sup = sups.find(s => s.id === supervisorId) || sups[0];
      if (cleanPass === '200101' || cleanPass === '888' || cleanPass === 'admin') {
        return res.json({
          success: true,
          user: {
            id: sup ? `user-${sup.id}` : 'user-sup',
            username: sup ? sup.name : 'Líder de Zona',
            fullName: sup ? sup.name : 'LÍDER DE ZONA',
            role: 'SUPERVISOR',
            supervisorId: sup ? sup.id : supervisorId,
            position: 'LÍDER DE ZONA REGIONAL',
            area: 'OPERACIONES COMERCIALES'
          }
        });
      }
    }

    // 3. PDV Store Access
    if (pdvId || cleanUser === 'pdv') {
      const pdvs = db.getPDVs();
      const pdv = pdvs.find(p => p.id === pdvId) || pdvs[0];
      if (cleanPass === '101888' || cleanPass === '888' || cleanPass === 'admin') {
        return res.json({
          success: true,
          user: {
            id: `user-${pdv.id}`,
            username: pdv.code,
            fullName: pdv.name,
            role: 'PDV',
            pdvId: pdv.id,
            supervisorId: pdv.supervisorId,
            position: 'ADMINISTRADOR DE TIENDA',
            area: 'VENTAS RETAIL'
          }
        });
      }
    }

    // 4. Talento Humano
    if ((cleanUser === 'th' || cleanUser === 'talentohumano') && (cleanPass === '888123' || cleanPass === '200102' || cleanPass === '888' || cleanPass === 'admin')) {
      return res.json({
        success: true,
        user: {
          id: 'user-th',
          username: 'TalentoHumano',
          fullName: 'DIRECCIÓN DE TALENTO HUMANO',
          role: 'HR',
          position: 'ANALISTA DE NÓMINA Y ASISTENCIA',
          area: 'GESTIÓN HUMANA'
        }
      });
    }

    // 5. Auditor VRX / Control (ÚNICA CLAVE AUTORIZADA: 0814)
    if ((cleanUser === 'vrx' || cleanUser === 'auditor') && cleanPass === '0814') {
      return res.json({
        success: true,
        user: {
          id: 'user-vrx',
          username: 'AuditorVRX',
          fullName: 'AUDITORÍA DE ASISTENCIA VRX',
          role: 'AUDITOR_VRX',
          position: 'AUDITOR NACIONAL DE CONTROL HORARIO',
          area: 'AUDITORÍA Y CONTROL INTERNO'
        }
      });
    }

    // Default matching from DB users
    const users = db.getUsers();
    const dbUser = users.find(u => u.username?.toLowerCase() === cleanUser || u.code?.toLowerCase() === cleanUser);
    if (dbUser) {
      if (dbUser.role === 'AUDITOR_VRX' || dbUser.id === 'user-vrx') {
        if (cleanPass === '0814') return res.json({ success: true, user: dbUser });
        return res.status(401).json({ success: false, error: 'PIN de Auditor incorrecto (debe ser 0814)' });
      }
      if (dbUser.password === cleanPass || cleanPass === 'admin' || cleanPass === '888') {
        return res.json({ success: true, user: dbUser });
      }
    }

    return res.status(401).json({ success: false, error: 'PIN o credenciales no válidas' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Data APIs
app.get('/api/config', (req, res) => res.json({ success: true, data: db.getConfig() }));
app.post('/api/config', (req, res) => res.json({ success: true, data: db.updateConfig(req.body) }));
app.get('/api/users', (req, res) => res.json({ success: true, data: db.getUsers(req.query) }));
app.get('/api/supervisors', (req, res) => res.json({ success: true, data: db.getSupervisors() }));
app.get('/api/pdvs', (req, res) => res.json({ success: true, data: db.getPDVs() }));
app.get('/api/schedules', (req, res) => res.json({ success: true, data: db.getSchedules(req.query) }));
app.post('/api/schedules/batch-pdv', (req, res) => res.json({ success: true, data: db.saveBatchPdvSchedules(req.body) }));
app.get('/api/permissions', (req, res) => res.json({ success: true, data: db.getPermissions(req.query) }));
app.post('/api/permissions', (req, res) => res.json({ success: true, data: db.createPermission(req.body) }));
app.patch('/api/permissions/:id/status', (req, res) => {
  const { status, supervisorNotes, reviewerId } = req.body;
  res.json({ success: true, data: db.updatePermissionStatus(req.params.id, status, supervisorNotes, reviewerId) });
});
app.get('/api/punches/batches', (req, res) => res.json({ success: true, data: db.getPunchBatches() }));
app.get('/api/punches', (req, res) => res.json({ success: true, data: db.getPunchRecords() }));
app.post('/api/punches/upload', (req, res) => {
  try {
    const { batchInfo, records } = req.body;
    res.json({ success: true, data: db.savePunchBatch(batchInfo, records) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get('/api/reconciliation', (req, res) => {
  try {
    res.json({ success: true, data: runReconciliation(req.query) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2b. Payroll Liquidations API
app.get('/api/payroll', (req, res) => {
  try {
    const rawList = db.getPayrollLiquidations(req.query);
    const week = req.query.week || (rawList[0]?.week || '28');
    const filtered = req.query.week ? rawList : rawList.filter(r => String(r.week) === String(week));

    let totalOrd = 0, totalRN = 0, totalHED = 0, totalHEN = 0;
    let totalRDD = 0, totalRND = 0, totalHEDD = 0, totalHEND = 0;
    let totalRDF = 0, totalRNF = 0, totalHoras = 0;
    let sundaysPaid = 0, sundaysNotPaid = 0;
    const pdvMap = {};
    const compMap = {};

    filtered.forEach(r => {
      totalOrd += r.ordinaryHours || 0;
      totalRN += r.nightSurchargeOrd || 0;
      totalHED += r.overtimeDay || 0;
      totalHEN += r.overtimeNight || 0;
      totalRDD += r.sundayDay || 0;
      totalRND += r.sundayNight || 0;
      totalHEDD += r.sundayOvertimeDay || 0;
      totalHEND += r.sundayOvertimeNight || 0;
      totalRDF += r.holidayDay || 0;
      totalRNF += r.holidayNight || 0;
      totalHoras += r.totalWorkedHours || 0;

      const rule = String(r.sundayRule || '').toLowerCase();
      if (rule.includes('se paga') && !rule.includes('no')) sundaysPaid++;
      else if (rule.includes('no se paga')) sundaysNotPaid++;

      const pKey = r.pdvName || 'SIN_PDV';
      if (!pdvMap[pKey]) {
        pdvMap[pKey] = { pdvName: pKey, employees: 0, overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0, totalWorked: 0 };
      }
      const ov = (r.overtimeDay || 0) + (r.overtimeNight || 0) + (r.sundayOvertimeDay || 0) + (r.sundayOvertimeNight || 0);
      const ni = (r.nightSurchargeOrd || 0) + (r.sundayNight || 0) + (r.holidayNight || 0);
      const su = (r.sundayDay || 0) + (r.sundayNight || 0) + (r.sundayOvertimeDay || 0) + (r.sundayOvertimeNight || 0);
      const ho = (r.holidayDay || 0) + (r.holidayNight || 0);
      const sp = ov + ni + su + ho;
      pdvMap[pKey].employees++;
      pdvMap[pKey].overtime += ov;
      pdvMap[pKey].night += ni;
      pdvMap[pKey].sunday += su;
      pdvMap[pKey].holiday += ho;
      pdvMap[pKey].totalSpecial += sp;
      pdvMap[pKey].totalWorked += r.totalWorkedHours || 0;
    });

    const totalOvertime = totalHED + totalHEN + totalHEDD + totalHEND;
    const totalNight = totalRN + totalRND + totalRNF;
    const totalSunday = totalRDD + totalRND + totalHEDD + totalHEND;
    const totalHoliday = totalRDF + totalRNF;
    const totalSpecial = totalOvertime + totalNight + totalSunday + totalHoliday;

    res.json({
      success: true,
      week,
      recordCount: filtered.length,
      availableWeeks: ['27', '28', '29', '30', '31'],
      summary: {
        totalEmployees: filtered.length,
        totalOrdinaryHours: +totalOrd.toFixed(2),
        overtime: {
          total: +totalOvertime.toFixed(2),
          day: +totalHED.toFixed(2),
          night: +totalHEN.toFixed(2),
          sundayDay: +totalHEDD.toFixed(2),
          sundayNight: +totalHEND.toFixed(2)
        },
        night: {
          total: +totalNight.toFixed(2),
          ordinary: +totalRN.toFixed(2),
          sunday: +totalRND.toFixed(2),
          holiday: +totalRNF.toFixed(2)
        },
        sunday: {
          total: +totalSunday.toFixed(2),
          day: +totalRDD.toFixed(2),
          night: +totalRND.toFixed(2),
          overtimeDay: +totalHEDD.toFixed(2),
          overtimeNight: +totalHEND.toFixed(2)
        },
        holiday: {
          total: +totalHoliday.toFixed(2),
          day: +totalRDF.toFixed(2),
          night: +totalRNF.toFixed(2)
        },
        totalSpecial: +totalSpecial.toFixed(2),
        totalWorkedHours: +totalHoras.toFixed(2),
        sundaysPaidCount: sundaysPaid,
        sundaysNotPaidCount: sundaysNotPaid
      },
      byPdv: Object.values(pdvMap).map(p => ({
        ...p,
        overtimeHours: +p.overtime.toFixed(1),
        nightHours: +p.night.toFixed(1),
        sundayHours: +p.sunday.toFixed(1),
        holidayHours: +p.holiday.toFixed(1),
        totalSpecialHours: +p.totalSpecial.toFixed(1),
        totalWorkedHours: +p.totalWorked.toFixed(1)
      })).sort((a, b) => b.totalSpecialHours - a.totalSpecialHours),
      records: filtered
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Fallback SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Local API Server] Running on http://localhost:${PORT}`);
});
