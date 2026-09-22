import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

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

// 3. Fallback SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Local API Server] Running on http://localhost:${PORT}`);
});
