import fs from 'fs';
import { initialSupervisors, initialPDVs, initialUsers } from '../server/seedData.js';

let sql = `-- ====================================================================
-- CONTROL DE TURNOS Y CONCILIACIÓN BIOMÉTRICA (PDV)
-- ESQUEMA DE BASE DE DATOS Y DATOS MAESTROS PARA SUPABASE (POSTGRESQL)
-- ====================================================================

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Eliminar tablas previas si existen (limpieza controlada)
DROP TABLE IF EXISTS supplementary_justifications CASCADE;
DROP TABLE IF EXISTS punch_records CASCADE;
DROP TABLE IF EXISTS punch_batches CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS pdvs CASCADE;
DROP TABLE IF EXISTS supervisors CASCADE;
DROP TABLE IF EXISTS app_config CASCADE;

-- ====================================================================
-- 3. CREACIÓN DE TABLAS
-- ====================================================================

-- Tabla: app_config (Reglas de negocio y parámetros CST)
CREATE TABLE app_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    lunch_duration_hours NUMERIC(4,2) DEFAULT 1.5,
    lunch_cutoff_time TEXT DEFAULT '12:30',
    lunch_min_shift_duration NUMERIC(4,2) DEFAULT 6.0,
    day_start_time TEXT DEFAULT '06:00',
    night_start_time TEXT DEFAULT '21:00',
    weekly_max_standard_hours INTEGER DEFAULT 42,
    max_sundays_per_month INTEGER DEFAULT 2,
    late_tolerance_minutes INTEGER DEFAULT 10,
    early_exit_tolerance_minutes INTEGER DEFAULT 10,
    maintenance_approval_email TEXT DEFAULT 'mantenimiento.obras@quest.com.co',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: supervisors (Zonas y Supervisores Regionales)
CREATE TABLE supervisors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    zone_code TEXT,
    zone_name TEXT,
    document_id TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: pdvs (Maestro de Puntos de Venta)
CREATE TABLE pdvs (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    city TEXT,
    zone_id TEXT,
    zone_name TEXT,
    supervisor_id TEXT REFERENCES supervisors(id) ON DELETE SET NULL,
    opening_hour TEXT DEFAULT '10:00',
    closing_hour TEXT DEFAULT '20:30',
    allowed_shifts JSONB DEFAULT '["10:00-20:30", "10:00-18:00", "11:00-19:00", "12:00-20:30", "13:00-20:30"]'::jsonb,
    habitual_schedule JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: users (Usuarios del Sistema, Colaboradores y Perfiles)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    document_id TEXT,
    code TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    position TEXT,
    area TEXT,
    contract_type TEXT DEFAULT 'FIJO',
    pdv_id TEXT REFERENCES pdvs(id) ON DELETE SET NULL,
    supervisor_id TEXT REFERENCES supervisors(id) ON DELETE SET NULL,
    weekly_max_hours INTEGER DEFAULT 42,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: schedules (Programaciones Semanales de Horarios)
CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    pdv_id TEXT REFERENCES pdvs(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    is_submitted BOOLEAN DEFAULT TRUE,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_net_hours NUMERIC(6,2) DEFAULT 0,
    total_lunch_hours NUMERIC(6,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_week UNIQUE (user_id, week_start)
);

-- Tabla: permissions (Permisos, Novedades y Justificaciones)
CREATE TABLE permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    document_id TEXT,
    position TEXT,
    pdv_id TEXT REFERENCES pdvs(id) ON DELETE SET NULL,
    supervisor_id TEXT REFERENCES supervisors(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    shift_type TEXT NOT NULL,
    is_day_off_change BOOLEAN DEFAULT FALSE,
    requested_start_time TEXT,
    requested_end_time TEXT,
    reason TEXT NOT NULL,
    assigned_area TEXT DEFAULT 'Líder de Zona',
    recipient_role TEXT DEFAULT 'SUPERVISOR',
    notification_email TEXT,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'PENDING',
    supervisor_notes TEXT,
    reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- Tabla: punch_batches (Lotes de Carga Biométricos)
CREATE TABLE punch_batches (
    id TEXT PRIMARY KEY,
    file_name TEXT,
    file_size NUMERIC,
    period TEXT,
    store TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    record_count INTEGER DEFAULT 0
);

-- Tabla: punch_records (Registros Biométricos / Marcaciones Reales)
CREATE TABLE punch_records (
    id TEXT PRIMARY KEY,
    batch_id TEXT REFERENCES punch_batches(id) ON DELETE CASCADE,
    document_id TEXT,
    code TEXT,
    full_name TEXT,
    position TEXT,
    pdv_name TEXT,
    supervisor_name TEXT,
    entry_date TEXT,
    entry_time TEXT,
    exit_date TEXT,
    exit_time TEXT,
    real_calculations JSONB DEFAULT '{}'::jsonb,
    raw_row JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: supplementary_justifications (Justificaciones de Tiempos Suplementarios)
CREATE TABLE supplementary_justifications (
    id TEXT PRIMARY KEY,
    pdv_id TEXT REFERENCES pdvs(id) ON DELETE CASCADE,
    pdv_name TEXT,
    supervisor_id TEXT REFERENCES supervisors(id) ON DELETE SET NULL,
    week_start TEXT NOT NULL,
    reason TEXT NOT NULL,
    hours_increase NUMERIC(6,2) DEFAULT 0,
    submitted_by TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'SUBMITTED'
);

-- ====================================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_schedules_week ON schedules (week_start);
CREATE INDEX IF NOT EXISTS idx_schedules_pdv ON schedules (pdv_id);
CREATE INDEX IF NOT EXISTS idx_permissions_status ON permissions (status);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_punch_records_doc ON punch_records (document_id);
CREATE INDEX IF NOT EXISTS idx_punch_records_date ON punch_records (entry_date);

-- ====================================================================
-- 5. POLÍTICAS DE ACCESO (ROW LEVEL SECURITY - RLS)
-- Permite acceso completo para la API del Frontend (Vercel / Anon Key)
-- ====================================================================
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplementary_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access app_config" ON app_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access supervisors" ON supervisors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access pdvs" ON pdvs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access schedules" ON schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access permissions" ON permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access punch_batches" ON punch_batches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access punch_records" ON punch_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access supplementary_justifications" ON supplementary_justifications FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- 6. CARGA DE DATOS MAESTROS (SEED DATA)
-- ====================================================================

-- 6.1 Configuración CST
INSERT INTO app_config (id, lunch_duration_hours, lunch_cutoff_time, lunch_min_shift_duration, day_start_time, night_start_time, weekly_max_standard_hours, max_sundays_per_month, late_tolerance_minutes, early_exit_tolerance_minutes, maintenance_approval_email)
VALUES ('default', 1.5, '12:30', 6.0, '06:00', '21:00', 42, 2, 10, 10, 'mantenimiento.obras@quest.com.co')
ON CONFLICT (id) DO UPDATE SET 
  weekly_max_standard_hours = EXCLUDED.weekly_max_standard_hours,
  maintenance_approval_email = EXCLUDED.maintenance_approval_email;

-- 6.2 Zonas y Supervisores
`;

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

initialSupervisors.forEach(s => {
  sql += `INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES (${esc(s.id)}, ${esc(s.name)}, ${esc(s.code)}, ${esc(s.zoneName)}, ${esc(s.documentId)}, ${esc(s.email)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
`;
});

sql += `
-- 6.3 Maestro de 101 Puntos de Venta (PDVs)
`;

initialPDVs.forEach(p => {
  const allowedShiftsJson = JSON.stringify(p.allowedShifts || []);
  const habitualJson = JSON.stringify(p.habitualSchedule || {});
  sql += `INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES (${esc(p.id)}, ${esc(p.code)}, ${esc(p.name)}, ${esc(p.city)}, ${esc(p.zoneId || p.supervisorId)}, ${esc(p.zoneName)}, ${esc(p.supervisorId)}, ${esc(p.openingHour || '10:00')}, ${esc(p.closingHour || '20:30')}, '${allowedShiftsJson.replace(/'/g, "''")}'::jsonb, '${habitualJson.replace(/'/g, "''")}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
`;
});

sql += `
-- 6.4 Usuarios y Perfiles del Sistema
`;

initialUsers.forEach(u => {
  sql += `INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES (${esc(u.id)}, ${esc(u.username)}, ${esc(u.password)}, ${esc(u.documentId)}, ${esc(u.code)}, ${esc(u.fullName)}, ${esc(u.role)}, ${esc(u.position)}, ${esc(u.area)}, ${esc(u.contractType || 'FIJO')}, ${esc(u.pdvId)}, ${esc(u.supervisorId)}, ${u.weeklyMaxHours || 42}, ${u.isActive !== false})
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id;
`;
});

fs.writeFileSync('supabase_schema.sql', sql, 'utf-8');
console.log('supabase_schema.sql generated successfully! Bytes:', sql.length);
