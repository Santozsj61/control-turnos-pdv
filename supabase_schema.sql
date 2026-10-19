-- ====================================================================
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
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-antioquia-1', 'Líder Antioquia 1', 'COD-ANT-1', 'ZONA ANTIOQUIA (LIDER 1)', '1018010', 'lider.antioquia1@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-antioquia-casanare-2', 'Líder Antioquia / Casanare 2', 'COD-ANT-CAS-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', '1018012', 'lider.antioquia2@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-cali-1', 'Anyela Gonzalez', 'COD-CALI-1', 'ZONA CALI 1', '1018004', 'anyela.gonzalez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-cali-2-cauca', 'Líder Cali 2 y Cauca', 'COD-CALI-2-CAUCA', 'ZONA CALI 2 Y CAUCA', '1018013', 'lider.cali2@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-valle-sur-cauca', 'Yoryani Valderrama', 'COD-VALLE-SUR-CAUCA', 'ZONA VALLE SUR Y CAUCA', '1018009', 'yoryani.valderrama@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-valle-centro', 'Alexander Lopez', 'COD-VALLE-CENTRO', 'ZONA VALLE CENTRO', '1018001', 'alexander.lopez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-centro-1', 'Andrea Pérez (Líder 1)', 'COD-CENTRO-1', 'ZONA CENTRO (LIDER 1)', '1018002', 'andrea.perez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-centro-2', 'Líder Centro Bogotá 2', 'COD-CENTRO-2', 'ZONA CENTRO (LIDER 2)', '1018014', 'lider.centro2@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-costa-norte', 'Carlos Correa', 'COD-COSTA-NORTE', 'ZONA COSTA NORTE', '1018005', 'carlos.correa@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-costa-sur', 'Líder Costa Sur', 'COD-COSTA-SUR', 'ZONA COSTA SUR', '1018015', 'lider.costasur@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-eje-cafetero-1', 'Andres Osorio', 'COD-EJE-1', 'ZONA EJE CAFETERO 1', '1018003', 'andres.osorio@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-eje-cafetero-2', 'Líder Eje Cafetero 2', 'COD-EJE-2', 'ZONA EJE CAFETERO 2', '1018016', 'lider.eje2@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-narino', 'Jose Salazar', 'COD-NARINO', 'ZONA NARIÑO', '1018007', 'jose.salazar@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-santanderes', 'Fabian Sanchez', 'COD-SANTANDERES', 'ZONA SANTANDERES', '1018006', 'fabian.sanchez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-tolhuca', 'Líder Tolhuca (Neiva / Caquetá)', 'COD-TOLHUCA', 'ZONA TOLHUCA', '1018011', 'lider.neiva@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;

-- 6.3 Maestro de 101 Puntos de Venta (PDVs)
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-1', 'N10', 'N10-Carpa Quest Medellin-CC DEMODA Outle', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-2', 'Q003', 'Q003 - Cali - Calle 23', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-3', 'Q007', 'Q007 - Tulua - Centro', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-4', 'Q008', 'Q008 - Cali - Alameda', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-5', 'Q014', 'Q014 - Tulua - Cc Herradura', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-6', 'Q016', 'Q016 - Cali - Cc Palmetto', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-7', 'Q018', 'Q018 - Cali - Cc Jardin Plaza', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-8', 'Q021', 'Q021 - Cali - Cc Chipichape', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-9', 'Q023', 'Q023 - Barranquilla - Cc Portal', 'Barranquilla', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-10', 'Q027', 'Q027 - Cucuta - Cc Ventura Plaza', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-11', 'Q028', 'Q028 - Cali - Centro Calle 13', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-12', 'Q029', 'Q029 - Cali - Cc Unico 1', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-13', 'Q030', 'Q030 - Popayan - Cc Campanario', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-14', 'Q031', 'Q031 - Cali - Centro 1', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-15', 'Q033', 'Q033 - Cartagena - Cc Caribe Plaza', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-16', 'Q035', 'Q035 - Barranquilla - Cc Unico', 'Barranquilla', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-17', 'Q038', 'Q038 - Pereira - Cc Unicentro', 'Pereira', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-18', 'Q039', 'Q039 - Cali - Cc Unico 2', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-19', 'Q040', 'Q040 - Cali - Cc Unicentro 2', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-20', 'Q041', 'Q041 - Cali - Cc Calima', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-21', 'Q044', 'Q044 - Popayan - Centro', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-22', 'Q045', 'Q045 - Pasto - Cc Unicentro', 'Pasto', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-23', 'Q046', 'Q046 - Cucuta - Centro 2', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-24', 'Q049', 'Q049 - Dosquebradas - Cc Unico', 'Dosquebradas', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-25', 'Q053', 'Q053 - Neiva - Cc San Pedro Plaza', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-26', 'Q054', 'Q054 - Sincelejo - Centro', 'Sincelejo', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-27', 'Q056', 'Q056 - Pitalito - Cc San Antonio', 'Pitalito', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-28', 'Q057', 'Q057 - Pasto - Cc Unico', 'Pasto', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-29', 'Q058', 'Q058 - Pereira - Cc Victoria Plaza', 'Pereira', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-30', 'Q061', 'Q061 - Armenia - Cc Unicentro', 'Armenia', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-31', 'Q062', 'Q062 - Monteria - Cc Alamedas', 'Montería', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-32', 'Q068', 'Q068 - Cartagena - Cc Outlet del Bosque', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-33', 'Q069', 'Q069 - Ibague - Centro', 'Ibagué', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-34', 'Q071', 'Q071 - Neiva - Centro', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-35', 'Q073', 'Q073 - Yumbo - Cc Unico', 'Yumbo', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-36', 'Q074', 'Q074 - Villavicencio - Cc Unico', 'Villavicencio', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-37', 'Q076', 'Q076 - Medellin - Cc Florida', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-38', 'Q077', 'Q077 - Florencia - Cc Gran Plaza', 'Florencia', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-39', 'Q078', 'Q078 - Soledad - Cc Gran Plaza', 'Soledad', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-40', 'Q080', 'Q080 - Valledupar - Cc Mayales', 'Valledupar', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-41', 'Q083', 'Q083 - Yopal - Cc Unicentro', 'Yopal', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-42', 'Q084', 'Q084 - Santa Marta - Centro', 'Santa Marta', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-43', 'Q085', 'Q085 - Ibague - Cc La Estacion', 'Ibagué', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-44', 'Q086', 'Q086 - Villavicencio - Cc Viva', 'Villavicencio', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-45', 'Q087', 'Q087 - Palmira - Centro', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-46', 'Q088', 'Q088 - Palmira - Cc Llanogrande', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-47', 'Q089', 'Q089 - Palmira - Cc Unicentro', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-48', 'Q090', 'Q090 - Ipiales - Cc Gran Plaza', 'Ipiales', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-49', 'Q091', 'Q091 - Armenia - Centro', 'Armenia', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-50', 'Q092', 'Q092 - Cartagena - Cc San Fernando', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-51', 'Q094', 'Q094 - Medellin - Cc Aventura', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-52', 'Q097', 'Q097 - Cartago - Centro', 'Cartago', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-53', 'Q102', 'Q102 - Valledupar - Cc Guatapuri', 'Valledupar', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-54', 'Q105', 'Q105 - Pereira - Centro', 'Pereira', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-55', 'Q106', 'Q106 - Soledad - Cc Nuestro Atlantico', 'Soledad', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-56', 'Q107', 'Q107 - Monteria - Cc Nuestro Monteria', 'Montería', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-57', 'Q109', 'Q109 - Cartagena - Cc La Castellana', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-58', 'Q112', 'Q112 - Medellin - Cc Molinos Medellin', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-59', 'Q113', 'Q113 - Envigado - Cc Viva Local-221', 'Envigado', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-60', 'Q115', 'Q115 - Cucuta - Centro', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-61', 'Q116', 'Q116 - Cartago - Cc Nuestro Cartago', 'Cartago', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-62', 'Q117', 'Q117 - Neiva - Cc Unico', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-63', 'Q118', 'Q118 - Sincelejo - Cc Guacari', 'Sincelejo', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-64', 'Q120', 'Q120 - Cali - Plaza Q', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-65', 'Q122', 'Q122 - Tulua - Centro Calle 27', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-66', 'Q124', 'Q124 - Bogotáá - Cc Nuestro Bogotáá', 'Bogotá', 'sup-centro-2', 'ZONA CENTRO (LIDER 2)', 'sup-centro-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-67', 'Q125', 'Q125 - Bello - Cc Plaza Fabricato', 'Bello', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-68', 'Q126', 'Q126 - Ipiales - Centro', 'Ipiales', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-69', 'Q127', 'Q127 - Sabaneta - CC Mayorca', 'Sabaneta', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-70', 'Q128', 'Q128 - Barranquilla - CC Parque Alegra', 'Barranquilla', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-71', 'Q129', 'Q129 - Bogotáá - CC Plaza de las Américas', 'Bogotá', 'sup-centro-2', 'ZONA CENTRO (LIDER 2)', 'sup-centro-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-72', 'Q131', 'Q131 - Cúcuta - CC Jardin Plaza', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-73', 'Q133', 'Q133 - Popayán - CC Terra Plaza', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-74', 'Q134', 'Q134 - Cali - CC Cosmocentro', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-75', 'Q135', 'Q135 - Pasto - Centro', 'Pasto', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-76', 'Q136', 'Q136 - Yopal - Centro', 'Yopal', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-77', 'Q138', 'Q138 - Manizales - CC Fundadores', 'Manizales', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-78', 'Q139', 'Q139 - Armenia - Centro 2', 'Armenia', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-79', 'Q140', 'Q140 - Cartagena - CC Mall Plaza', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-80', 'Q143', 'Q143 - Sabaneta - CC Mayorca Etapa 1', 'Sabaneta', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-81', 'Q144', 'Q144 - Popayán - Centro 2', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-82', 'Q145', 'Q145 - Neiva - CC Unicentro', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-83', 'Q146', 'Q146 - Palmira - Centro 2', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-84', 'Q147', 'Q147 - Cali - Mall Plaza', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-85', 'Q148', 'Q148 - Medellín - Carabobo Centro', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-86', 'Q149', 'Q149 - Medellín - Centro', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-87', 'Q152', 'Q152 - Rionegro - CC San Nicolás', 'Rionegro', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-88', 'Q153', 'Q153 - Palmira - CC Llanogrande 2', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-89', 'Q154', 'Q154 - Santa Marta - CC Buenavista', 'Santa Marta', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-90', 'Q155', 'Q155 - Bogotáá - CC Outlet las Américas', 'Bogotá', 'sup-centro-2', 'ZONA CENTRO (LIDER 2)', 'sup-centro-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-91', 'Q156', 'Q156 - Medellín - CC Santa Fe', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-92', 'Q157', 'Q157 - Riohacha - CC Viva Wajira', 'Riohacha', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-93', 'QST501', 'QST501 - Cali - Plaza Q', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-94', 'QST502', 'QST502 - Cali - CC Único 2', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-95', 'QST503', 'QST503 - Medellín - CC Florida', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-96', 'QST504', 'QST504 - Cali - CC Jardín Plaza', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-97', 'QST505', 'QST505 - Tuluá - CC La Herradura', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-98', 'QST506', 'QST506 - Palmira - CC Llanogrande', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-99', 'QST508', 'QST508 - Medellín - CC Mayorca', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-100', 'QST509', 'QST509 - Cúcuta - CC Jardín Plaza', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-101', 'QST510', 'QST510 - YUMBO - CC UNICO', 'YUMBO', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, allowed_shifts = EXCLUDED.allowed_shifts;

-- 6.4 Usuarios y Perfiles del Sistema
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-admin', 'admin', '888', NULL, NULL, 'ADMINISTRADOR GENERAL', 'ADMIN', 'SUPERUSUARIO / ADMIN GENERAL', 'OPERACIONES & AUDITORÍA GLOBAL', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-th', 'th', '200102', NULL, NULL, 'DIRECCIÓN DE TALENTO HUMANO', 'HR', 'ANALISTA DE NÓMINA Y ASISTENCIA', 'GESTIÓN HUMANA', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-vrx', 'vrx', '0814', NULL, NULL, 'AUDITORÍA DE ASISTENCIA VRX', 'AUDITOR_VRX', 'AUDITOR NACIONAL DE CONTROL HORARIO', 'AUDITORÍA Y CONTROL INTERNO', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-mant', 'mant', NULL, NULL, NULL, 'APROBADOR MANTENIMIENTO Y OBRAS', 'MAINTENANCE_APPROVER', 'COORDINADOR DE MANTENIMIENTO', 'MANTENIMIENTO Y OBRAS', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-antioquia-1', 'cod.ant.1', '200101', NULL, NULL, 'Líder Antioquia 1', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA ANTIOQUIA (LIDER 1)', 'ZONA ANTIOQUIA (LIDER 1)', 'FIJO', NULL, 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-antioquia-casanare-2', 'cod.ant.cas.2', '200101', NULL, NULL, 'Líder Antioquia / Casanare 2', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'FIJO', NULL, 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-cali-1', 'cod.cali.1', '200101', NULL, NULL, 'Anyela Gonzalez', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA CALI 1', 'ZONA CALI 1', 'FIJO', NULL, 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-cali-2-cauca', 'cod.cali.2.cauca', '200101', NULL, NULL, 'Líder Cali 2 y Cauca', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA CALI 2 Y CAUCA', 'ZONA CALI 2 Y CAUCA', 'FIJO', NULL, 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-valle-sur-cauca', 'cod.valle.sur.cauca', '200101', NULL, NULL, 'Yoryani Valderrama', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA VALLE SUR Y CAUCA', 'ZONA VALLE SUR Y CAUCA', 'FIJO', NULL, 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-valle-centro', 'cod.valle.centro', '200101', NULL, NULL, 'Alexander Lopez', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA VALLE CENTRO', 'ZONA VALLE CENTRO', 'FIJO', NULL, 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-centro-1', 'cod.centro.1', '200101', NULL, NULL, 'Andrea Pérez (Líder 1)', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA CENTRO (LIDER 1)', 'ZONA CENTRO (LIDER 1)', 'FIJO', NULL, 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-centro-2', 'cod.centro.2', '200101', NULL, NULL, 'Líder Centro Bogotá 2', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA CENTRO (LIDER 2)', 'ZONA CENTRO (LIDER 2)', 'FIJO', NULL, 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-costa-norte', 'cod.costa.norte', '200101', NULL, NULL, 'Carlos Correa', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA COSTA NORTE', 'ZONA COSTA NORTE', 'FIJO', NULL, 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-costa-sur', 'cod.costa.sur', '200101', NULL, NULL, 'Líder Costa Sur', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA COSTA SUR', 'ZONA COSTA SUR', 'FIJO', NULL, 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-eje-cafetero-1', 'cod.eje.1', '200101', NULL, NULL, 'Andres Osorio', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA EJE CAFETERO 1', 'ZONA EJE CAFETERO 1', 'FIJO', NULL, 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-eje-cafetero-2', 'cod.eje.2', '200101', NULL, NULL, 'Líder Eje Cafetero 2', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA EJE CAFETERO 2', 'ZONA EJE CAFETERO 2', 'FIJO', NULL, 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-narino', 'cod.narino', '200101', NULL, NULL, 'Jose Salazar', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA NARIÑO', 'ZONA NARIÑO', 'FIJO', NULL, 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-santanderes', 'cod.santanderes', '200101', NULL, NULL, 'Fabian Sanchez', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA SANTANDERES', 'ZONA SANTANDERES', 'FIJO', NULL, 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-tolhuca', 'cod.tolhuca', '200101', NULL, NULL, 'Líder Tolhuca (Neiva / Caquetá)', 'SUPERVISOR', 'LÍDER DE ZONA - ZONA TOLHUCA', 'ZONA TOLHUCA', 'FIJO', NULL, 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-1', 'n10', 'N10', NULL, 'N10', 'N10-Carpa Quest Medellin-CC DEMODA Outle', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-1', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-2', 'q003', 'Q003', NULL, 'Q003', 'Q003 - Cali - Calle 23', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-2', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-3', 'q007', 'Q007', NULL, 'Q007', 'Q007 - Tulua - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-3', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-4', 'q008', 'Q008', NULL, 'Q008', 'Q008 - Cali - Alameda', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-4', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-5', 'q014', 'Q014', NULL, 'Q014', 'Q014 - Tulua - Cc Herradura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-5', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-6', 'q016', 'Q016', NULL, 'Q016', 'Q016 - Cali - Cc Palmetto', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-7', 'q018', 'Q018', NULL, 'Q018', 'Q018 - Cali - Cc Jardin Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-7', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-8', 'q021', 'Q021', NULL, 'Q021', 'Q021 - Cali - Cc Chipichape', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-9', 'q023', 'Q023', NULL, 'Q023', 'Q023 - Barranquilla - Cc Portal', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-9', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-10', 'q027', 'Q027', NULL, 'Q027', 'Q027 - Cucuta - Cc Ventura Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-11', 'q028', 'Q028', NULL, 'Q028', 'Q028 - Cali - Centro Calle 13', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-11', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-12', 'q029', 'Q029', NULL, 'Q029', 'Q029 - Cali - Cc Unico 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-13', 'q030', 'Q030', NULL, 'Q030', 'Q030 - Popayan - Cc Campanario', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-13', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-14', 'q031', 'Q031', NULL, 'Q031', 'Q031 - Cali - Centro 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-15', 'q033', 'Q033', NULL, 'Q033', 'Q033 - Cartagena - Cc Caribe Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-16', 'q035', 'Q035', NULL, 'Q035', 'Q035 - Barranquilla - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-17', 'q038', 'Q038', NULL, 'Q038', 'Q038 - Pereira - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-17', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-18', 'q039', 'Q039', NULL, 'Q039', 'Q039 - Cali - Cc Unico 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-19', 'q040', 'Q040', NULL, 'Q040', 'Q040 - Cali - Cc Unicentro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-20', 'q041', 'Q041', NULL, 'Q041', 'Q041 - Cali - Cc Calima', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-20', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-21', 'q044', 'Q044', NULL, 'Q044', 'Q044 - Popayan - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-21', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-22', 'q045', 'Q045', NULL, 'Q045', 'Q045 - Pasto - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-22', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-23', 'q046', 'Q046', NULL, 'Q046', 'Q046 - Cucuta - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-23', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-24', 'q049', 'Q049', NULL, 'Q049', 'Q049 - Dosquebradas - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-25', 'q053', 'Q053', NULL, 'Q053', 'Q053 - Neiva - Cc San Pedro Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-25', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-26', 'q054', 'Q054', NULL, 'Q054', 'Q054 - Sincelejo - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-26', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-27', 'q056', 'Q056', NULL, 'Q056', 'Q056 - Pitalito - Cc San Antonio', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-27', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-28', 'q057', 'Q057', NULL, 'Q057', 'Q057 - Pasto - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-29', 'q058', 'Q058', NULL, 'Q058', 'Q058 - Pereira - Cc Victoria Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-29', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-30', 'q061', 'Q061', NULL, 'Q061', 'Q061 - Armenia - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-30', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-31', 'q062', 'Q062', NULL, 'Q062', 'Q062 - Monteria - Cc Alamedas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-31', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-32', 'q068', 'Q068', NULL, 'Q068', 'Q068 - Cartagena - Cc Outlet del Bosque', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-32', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-33', 'q069', 'Q069', NULL, 'Q069', 'Q069 - Ibague - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-33', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-34', 'q071', 'Q071', NULL, 'Q071', 'Q071 - Neiva - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-34', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-35', 'q073', 'Q073', NULL, 'Q073', 'Q073 - Yumbo - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-35', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-36', 'q074', 'Q074', NULL, 'Q074', 'Q074 - Villavicencio - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-37', 'q076', 'Q076', NULL, 'Q076', 'Q076 - Medellin - Cc Florida', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-37', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-38', 'q077', 'Q077', NULL, 'Q077', 'Q077 - Florencia - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-38', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-39', 'q078', 'Q078', NULL, 'Q078', 'Q078 - Soledad - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-39', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-40', 'q080', 'Q080', NULL, 'Q080', 'Q080 - Valledupar - Cc Mayales', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-40', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-41', 'q083', 'Q083', NULL, 'Q083', 'Q083 - Yopal - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-41', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-42', 'q084', 'Q084', NULL, 'Q084', 'Q084 - Santa Marta - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-42', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-43', 'q085', 'Q085', NULL, 'Q085', 'Q085 - Ibague - Cc La Estacion', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-43', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-44', 'q086', 'Q086', NULL, 'Q086', 'Q086 - Villavicencio - Cc Viva', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-44', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-45', 'q087', 'Q087', NULL, 'Q087', 'Q087 - Palmira - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-45', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-46', 'q088', 'Q088', NULL, 'Q088', 'Q088 - Palmira - Cc Llanogrande', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-46', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-47', 'q089', 'Q089', NULL, 'Q089', 'Q089 - Palmira - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-47', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-48', 'q090', 'Q090', NULL, 'Q090', 'Q090 - Ipiales - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-48', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-49', 'q091', 'Q091', NULL, 'Q091', 'Q091 - Armenia - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-49', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-50', 'q092', 'Q092', NULL, 'Q092', 'Q092 - Cartagena - Cc San Fernando', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-50', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-51', 'q094', 'Q094', NULL, 'Q094', 'Q094 - Medellin - Cc Aventura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-51', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-52', 'q097', 'Q097', NULL, 'Q097', 'Q097 - Cartago - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-52', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-53', 'q102', 'Q102', NULL, 'Q102', 'Q102 - Valledupar - Cc Guatapuri', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-53', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-54', 'q105', 'Q105', NULL, 'Q105', 'Q105 - Pereira - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-55', 'q106', 'Q106', NULL, 'Q106', 'Q106 - Soledad - Cc Nuestro Atlantico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-55', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-56', 'q107', 'Q107', NULL, 'Q107', 'Q107 - Monteria - Cc Nuestro Monteria', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-56', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-57', 'q109', 'Q109', NULL, 'Q109', 'Q109 - Cartagena - Cc La Castellana', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-58', 'q112', 'Q112', NULL, 'Q112', 'Q112 - Medellin - Cc Molinos Medellin', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-58', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-59', 'q113', 'Q113', NULL, 'Q113', 'Q113 - Envigado - Cc Viva Local-221', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-59', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-60', 'q115', 'Q115', NULL, 'Q115', 'Q115 - Cucuta - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-60', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-61', 'q116', 'Q116', NULL, 'Q116', 'Q116 - Cartago - Cc Nuestro Cartago', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-61', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-62', 'q117', 'Q117', NULL, 'Q117', 'Q117 - Neiva - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-62', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-63', 'q118', 'Q118', NULL, 'Q118', 'Q118 - Sincelejo - Cc Guacari', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-63', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-64', 'q120', 'Q120', NULL, 'Q120', 'Q120 - Cali - Plaza Q', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-65', 'q122', 'Q122', NULL, 'Q122', 'Q122 - Tulua - Centro Calle 27', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-65', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-66', 'q124', 'Q124', NULL, 'Q124', 'Q124 - Bogotáá - Cc Nuestro Bogotáá', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-66', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-67', 'q125', 'Q125', NULL, 'Q125', 'Q125 - Bello - Cc Plaza Fabricato', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-67', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-68', 'q126', 'Q126', NULL, 'Q126', 'Q126 - Ipiales - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-68', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-69', 'q127', 'Q127', NULL, 'Q127', 'Q127 - Sabaneta - CC Mayorca', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-69', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-70', 'q128', 'Q128', NULL, 'Q128', 'Q128 - Barranquilla - CC Parque Alegra', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-70', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-71', 'q129', 'Q129', NULL, 'Q129', 'Q129 - Bogotáá - CC Plaza de las Américas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-71', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-72', 'q131', 'Q131', NULL, 'Q131', 'Q131 - Cúcuta - CC Jardin Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-72', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-73', 'q133', 'Q133', NULL, 'Q133', 'Q133 - Popayán - CC Terra Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-73', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-74', 'q134', 'Q134', NULL, 'Q134', 'Q134 - Cali - CC Cosmocentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-74', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-75', 'q135', 'Q135', NULL, 'Q135', 'Q135 - Pasto - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-76', 'q136', 'Q136', NULL, 'Q136', 'Q136 - Yopal - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-77', 'q138', 'Q138', NULL, 'Q138', 'Q138 - Manizales - CC Fundadores', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-77', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-78', 'q139', 'Q139', NULL, 'Q139', 'Q139 - Armenia - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-78', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-79', 'q140', 'Q140', NULL, 'Q140', 'Q140 - Cartagena - CC Mall Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-79', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-80', 'q143', 'Q143', NULL, 'Q143', 'Q143 - Sabaneta - CC Mayorca Etapa 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-80', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-81', 'q144', 'Q144', NULL, 'Q144', 'Q144 - Popayán - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-81', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-82', 'q145', 'Q145', NULL, 'Q145', 'Q145 - Neiva - CC Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-82', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-83', 'q146', 'Q146', NULL, 'Q146', 'Q146 - Palmira - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-83', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-84', 'q147', 'Q147', NULL, 'Q147', 'Q147 - Cali - Mall Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-84', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-85', 'q148', 'Q148', NULL, 'Q148', 'Q148 - Medellín - Carabobo Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-85', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-86', 'q149', 'Q149', NULL, 'Q149', 'Q149 - Medellín - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-86', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-87', 'q152', 'Q152', NULL, 'Q152', 'Q152 - Rionegro - CC San Nicolás', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-87', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-88', 'q153', 'Q153', NULL, 'Q153', 'Q153 - Palmira - CC Llanogrande 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-88', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-89', 'q154', 'Q154', NULL, 'Q154', 'Q154 - Santa Marta - CC Buenavista', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-89', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-90', 'q155', 'Q155', NULL, 'Q155', 'Q155 - Bogotáá - CC Outlet las Américas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-90', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-91', 'q156', 'Q156', NULL, 'Q156', 'Q156 - Medellín - CC Santa Fe', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-91', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-92', 'q157', 'Q157', NULL, 'Q157', 'Q157 - Riohacha - CC Viva Wajira', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-92', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-93', 'qst501', 'QST501', NULL, 'QST501', 'QST501 - Cali - Plaza Q', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-93', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-94', 'qst502', 'QST502', NULL, 'QST502', 'QST502 - Cali - CC Único 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-94', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-95', 'qst503', 'QST503', NULL, 'QST503', 'QST503 - Medellín - CC Florida', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-95', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-96', 'qst504', 'QST504', NULL, 'QST504', 'QST504 - Cali - CC Jardín Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-96', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-97', 'qst505', 'QST505', NULL, 'QST505', 'QST505 - Tuluá - CC La Herradura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-97', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-98', 'qst506', 'QST506', NULL, 'QST506', 'QST506 - Palmira - CC Llanogrande', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-98', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-99', 'qst508', 'QST508', NULL, 'QST508', 'QST508 - Medellín - CC Mayorca', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-99', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-100', 'qst509', 'QST509', NULL, 'QST509', 'QST509 - Cúcuta - CC Jardín Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-100', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-101', 'qst510', 'QST510', NULL, 'QST510', 'QST510 - YUMBO - CC UNICO', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-101', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144163678', 'emp_1144163678', NULL, '1144163678', 'COD-3678', 'IVAN DANIEL SARRIA VIDLA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-35', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1118312125', 'emp_1118312125', NULL, '1118312125', 'COD-2125', 'ANGIE LIZETH CORREDOR  BUITRAGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-35', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1109115019', 'emp_1109115019', NULL, '1109115019', 'COD-5019', 'SANTIAGO PRADO MURIEL', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-35', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-16376762', 'emp_16376762', NULL, '16376762', 'COD-6762', 'IVAN ALONSO DIAZ GARCIAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-35', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144028555', 'emp_1144028555', NULL, '1144028555', 'COD-8555', 'CESAR MAZUERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-94', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006099498', 'emp_1006099498', NULL, '1006099498', 'COD-9498', 'DANIELA MATERON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-94', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005979278', 'emp_1005979278', NULL, '1005979278', 'COD-9278', 'LEIDY ORTEGA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-94', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143122521', 'emp_1143122521', NULL, '1143122521', 'COD-2521', 'LUIS CARLOS MENDOZA ALVEAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1042441086', 'emp_1042441086', NULL, '1042441086', 'COD-1086', 'JHON JOSE MERCADO PACHECO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1001878009', 'emp_1001878009', NULL, '1001878009', 'COD-8009', 'YESID ARTURO SANDOVAL JIMENEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143148766', 'emp_1143148766', NULL, '1143148766', 'COD-8766', 'JOHNNY MATTOS CERVANTES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1048292768', 'emp_1048292768', NULL, '1048292768', 'COD-2768', 'ANA MERCEDES MARTINEZ TORNÉ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112458871', 'emp_1112458871', NULL, '1112458871', 'COD-8871', 'JONAS MINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113689444', 'emp_1113689444', NULL, '1113689444', 'COD-9444', 'JUAN CAMILO GONZALEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1151968665', 'emp_1151968665', NULL, '1151968665', 'COD-8665', 'VALERIA LARA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143851967', 'emp_1143851967', NULL, '1143851967', 'COD-1967', 'SEBASTIAN CASTILLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007132542', 'emp_1007132542', NULL, '1007132542', 'COD-2542', 'FRACHED SALCEDO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1010088636', 'emp_1010088636', NULL, '1010088636', 'COD-8636', 'ESTEBAN SALAZAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1111666778', 'emp_1111666778', NULL, '1111666778', 'COD-6778', 'MIGUEL REYES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-91535802', 'emp_91535802', NULL, '91535802', 'COD-5802', 'ANDERSON FABIAN GELVEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1121880681', 'emp_1121880681', NULL, '1121880681', 'COD-0681', 'MARIBEL FUENTES TUNARROSA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-13069848', 'emp_13069848', NULL, '13069848', 'COD-9848', 'YUNIOR MARCEL CASTRO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1032423284', 'emp_1032423284', NULL, '1032423284', 'COD-3284', 'LUZ STELLA LONDOÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1122131201', 'emp_1122131201', NULL, '1122131201', 'COD-1201', 'DIANA CAROLINA DELGADO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005584151', 'emp_1005584151', NULL, '1005584151', 'COD-4151', 'JUAN PABLO RIVERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088283413', 'emp_1088283413', NULL, '1088283413', 'COD-3413', 'YESICA MARIA RAMIREZ DUQUE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-4704176', 'emp_4704176', NULL, '4704176', 'COD-4176', 'VERONICA  HERNANDEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088017991', 'emp_1088017991', NULL, '1088017991', 'COD-7991', 'EISENHAUWER DUQUE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006535971', 'emp_1006535971', NULL, '1006535971', 'COD-5971', 'VERONICA MOLINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1089598192', 'emp_1089598192', NULL, '1089598192', 'COD-8192', 'JHONATAN CASTAÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088356434', 'emp_1088356434', NULL, '1088356434', 'COD-6434', 'JUAN DE LA PAVA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-26422253', 'emp_26422253', NULL, '26422253', 'COD-2253', 'GISELA ANDREA RODRIGUEZ LUGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-62', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075252840', 'emp_1075252840', NULL, '1075252840', 'COD-2840', 'SOLANLLY GRACIA GRISALES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-62', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075321714', 'emp_1075321714', NULL, '1075321714', 'COD-1714', 'LILLIAN MICHELL GORDILLO TRONCOSO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-62', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007465504', 'emp_1007465504', NULL, '1007465504', 'COD-5504', 'YOINER QUINTANA RAMIREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-62', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144146047', 'emp_1144146047', NULL, '1144146047', 'COD-6047', 'ANDER FABIAN JOYA ORTIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107522573', 'emp_1107522573', NULL, '1107522573', 'COD-2573', 'CLAUDIA CAROLINA GALVIS BUESAQUILLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1060594324', 'emp_1060594324', NULL, '1060594324', 'COD-4324', 'RANGEL BLANDON YEIDY VANESA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-6469923', 'emp_6469923', NULL, '6469923', 'COD-9923', 'RODRIGUEZ MELENDEZ  ERWIN JOSE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107047599', 'emp_1107047599', NULL, '1107047599', 'COD-7599', 'HURTADO PAREDES CRISTIAN ANDRES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1111665228', 'emp_1111665228', NULL, '1111665228', 'COD-5228', 'RIVERA ZUÑIGA JUAN DIEGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005707524', 'emp_1005707524', NULL, '1005707524', 'COD-7524', 'MOSQUERA MOLINA JHOAN SEBASTIAN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113527219', 'emp_1113527219', NULL, '1113527219', 'COD-7219', 'CARABALI   BETANCUR  YESSICA MARCELA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085318889', 'emp_1085318889', NULL, '1085318889', 'COD-8889', 'MICHAEL STEVE SOLANO NARVAEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085283938', 'emp_1085283938', NULL, '1085283938', 'COD-3938', 'CLAUDIA ANDREA SALAMACA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004136561', 'emp_1004136561', NULL, '1004136561', 'COD-6561', 'BRAYAN ANDRES DORADO SUAREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085305292', 'emp_1085305292', NULL, '1085305292', 'COD-5292', 'MARIA ALEJANDRA OBANDO MERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004236196', 'emp_1004236196', NULL, '1004236196', 'COD-6196', 'DIEGO JULIAN SERRANO CALVACHE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113675459', 'emp_1113675459', NULL, '1113675459', 'COD-5459', 'JACKELINE ISAZA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-83', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-5097481', 'emp_5097481', NULL, '5097481', 'COD-7481', 'ISRAEL BAIK', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-83', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113675600', 'emp_1113675600', NULL, '1113675600', 'COD-5600', 'YULEIDY OPANCE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-83', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1192911212', 'emp_1192911212', NULL, '1192911212', 'COD-1212', 'ANGIE ZAPATA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-83', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112759115', 'emp_1112759115', NULL, '1112759115', 'COD-9115', 'PATRICIA SIERRA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-52', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1114148923', 'emp_1114148923', NULL, '1114148923', 'COD-8923', 'JOFI ESTEBAN CANO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-52', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1114149755', 'emp_1114149755', NULL, '1114149755', 'COD-9755', 'ALEJANDRO ROMAN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-52', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113664170', 'emp_1113664170', NULL, '1113664170', 'COD-4170', 'BRIAN MOLINEROS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-45', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1080040843', 'emp_1080040843', NULL, '1080040843', 'COD-0843', 'VALERIA MONTOYA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-45', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113656874', 'emp_1113656874', NULL, '1113656874', 'COD-6874', 'ISABEL GONZALES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-45', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1192813746', 'emp_1192813746', NULL, '1192813746', 'COD-3746', 'ANDRES ORBES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-45', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-40993989', 'emp_40993989', NULL, '40993989', 'COD-3989', 'ANGELA BURGOS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143995990', 'emp_1143995990', NULL, '1143995990', 'COD-5990', 'WILLIAM BURBANO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006073270', 'emp_1006073270', NULL, '1006073270', 'COD-3270', 'CRSTIAN BONILLA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1109541659', 'emp_1109541659', NULL, '1109541659', 'COD-1659', 'SANTIAGO MINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-98456222', 'emp_98456222', NULL, '98456222', 'COD-6222', 'EFRAIN AGUIRRE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143991616', 'emp_1143991616', NULL, '1143991616', 'COD-1616', 'FABIAN ANDRES ENCISO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-2', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007729215', 'emp_1007729215', NULL, '1007729215', 'COD-9215', 'MARLON ESCOBAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-2', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1110040133', 'emp_1110040133', NULL, '1110040133', 'COD-0133', 'SAMUEL FLOREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-2', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1130621645', 'emp_1130621645', NULL, '1130621645', 'COD-1645', 'FREDDY ALEXANDER PATIÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-7018349', 'emp_7018349', NULL, '7018349', 'COD-8349', 'ANGEL BENJAMIN ALAÑA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007666988', 'emp_1007666988', NULL, '1007666988', 'COD-6988', 'ALEX ALBERTO GARCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1104804320', 'emp_1104804320', NULL, '1104804320', 'COD-4320', 'NICOLAS RIOFRIO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1111662486', 'emp_1111662486', NULL, '1111662486', 'COD-2486', 'JUAN MANUEL GRAJALES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144208346', 'emp_1144208346', NULL, '1144208346', 'COD-8346', 'KEVIN ANDRES MUÑOZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144188312', 'emp_1144188312', NULL, '1144188312', 'COD-8312', 'JUAN DAVID FLORES MAZO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-37014670', 'emp_37014670', NULL, '37014670', 'COD-4670', 'MIRIAM VERDUGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-68', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004673313', 'emp_1004673313', NULL, '1004673313', 'COD-3313', 'JOHANNA LAGOS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-68', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004549931', 'emp_1004549931', NULL, '1004549931', 'COD-9931', 'JESSIKA ERAZO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-68', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1115918711', 'emp_1115918711', NULL, '1115918711', 'COD-8711', 'LISETH LORENA RODRIGUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1118556891', 'emp_1118556891', NULL, '1118556891', 'COD-6891', 'SANDRA MILENA MARTINEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006558685', 'emp_1006558685', NULL, '1006558685', 'COD-8685', 'YEFERSON FELIPE SANCHEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1020794973', 'emp_1020794973', NULL, '1020794973', 'COD-4973', 'PEDRO ANTONIO CABRA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-44002676', 'emp_44002676', NULL, '44002676', 'COD-2676', 'ERIKA NATALIA RODRIGUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-85', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1017264739', 'emp_1017264739', NULL, '1017264739', 'COD-4739', 'MATEO OCHOA GALLEGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-85', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1015402645', 'emp_1015402645', NULL, '1015402645', 'COD-2645', 'YEISON STIVEN GUERRERO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-85', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007107486', 'emp_1007107486', NULL, '1007107486', 'COD-7486', 'JULIAN SILVA PAEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-85', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007509592', 'emp_1007509592', NULL, '1007509592', 'COD-9592', 'MIGUEL ANGEL TAMAYO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-93', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1108638258', 'emp_1108638258', NULL, '1108638258', 'COD-8258', 'ERIK SANTIAGO LUGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-93', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1193320953', 'emp_1193320953', NULL, '1193320953', 'COD-0953', 'MARLON YANTEN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-93', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1121906154', 'emp_1121906154', NULL, '1121906154', 'COD-6154', 'YISSETH OTALVARO GOMEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-3', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-29314714', 'emp_29314714', NULL, '29314714', 'COD-4714', 'VIVIANA MORENO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-3', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006321986', 'emp_1006321986', NULL, '1006321986', 'COD-1986', 'MELISSA OCAMPO ANGRINO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-3', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1082749357', 'emp_1082749357', NULL, '1082749357', 'COD-9357', 'BRIGYTH YURANY PORTILLA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085290212', 'emp_1085290212', NULL, '1085290212', 'COD-0212', 'LEIDY VANESA CHILES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004223758', 'emp_1004223758', NULL, '1004223758', 'COD-3758', 'JUAN CARLOS ERAZO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1126449763', 'emp_1126449763', NULL, '1126449763', 'COD-9763', 'LAURA BETANCOURTH', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-87065911', 'emp_87065911', NULL, '87065911', 'COD-5911', 'ALVARO FERNANDO CORDOBA ZAPATA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-10496325', 'emp_10496325', NULL, '10496325', 'COD-6325', 'CARLOS LEON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-65', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1116284273', 'emp_1116284273', NULL, '1116284273', 'COD-4273', 'NICOLE LONDOÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-65', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113038720', 'emp_1113038720', NULL, '1113038720', 'COD-8720', 'SANDRA GONZALEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-65', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1102844984', 'emp_1102844984', NULL, '1102844984', 'COD-4984', 'JESUS DAVID ALVAREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-26', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1102805580', 'emp_1102805580', NULL, '1102805580', 'COD-5580', 'JORGE ALBERTO PATERNINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-26', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1102809500', 'emp_1102809500', NULL, '1102809500', 'COD-9500', 'OLGA LUCIA VASQUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-26', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1103109383', 'emp_1103109383', NULL, '1103109383', 'COD-9383', 'YESICA PEÑA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-26', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143976927', 'emp_1143976927', NULL, '1143976927', 'COD-6927', 'MARGIE VIAFARA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-11', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144190117', 'emp_1144190117', NULL, '1144190117', 'COD-0117', 'JESSICA LOPEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-11', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1044101083', 'emp_1044101083', NULL, '1044101083', 'COD-1083', 'EDWIM GAMBOA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-11', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1059904409', 'emp_1059904409', NULL, '1059904409', 'COD-4409', 'YESELI GOMEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-11', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107049606', 'emp_1107049606', NULL, '1107049606', 'COD-9606', 'LIZETH TAMAYO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-4', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1108558949', 'emp_1108558949', NULL, '1108558949', 'COD-8949', 'JANNY CORDOBA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-4', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1102868881', 'emp_1102868881', NULL, '1102868881', 'COD-8881', 'SEBASTIAN ESCOBAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-4', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-389361', 'emp_389361', NULL, '389361', 'COD-9361', 'YULIET HERNANDEZ MONDEJAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-81', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061773714', 'emp_1061773714', NULL, '1061773714', 'COD-3714', 'YOLILYN ANDREA PELECHOR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-81', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061816802', 'emp_1061816802', NULL, '1061816802', 'COD-6802', 'JHOINNER EFREN NARVAEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-81', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061770250', 'emp_1061770250', NULL, '1061770250', 'COD-0250', 'BAYRON LOPEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-81', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061733679', 'emp_1061733679', NULL, '1061733679', 'COD-3679', 'NICK GAVIRIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-21', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1063816927', 'emp_1063816927', NULL, '1063816927', 'COD-6927', 'LUIS NAVIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-21', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061799953', 'emp_1061799953', NULL, '1061799953', 'COD-9953', 'MELISSA BURBANO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-21', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1002955532', 'emp_1002955532', NULL, '1002955532', 'COD-5532', 'MARCELA BOJORGE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-21', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1083020053', 'emp_1083020053', NULL, '1083020053', 'COD-0053', 'JORGE ENRIQUE JIMENEZ RENDON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-42', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1083017921', 'emp_1083017921', NULL, '1083017921', 'COD-7921', 'YURAINI PATRICIA ARIZA DAZA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-42', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1083011955', 'emp_1083011955', NULL, '1083011955', 'COD-1955', 'HASBLEIDY GUITIERREZ ARIAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-42', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004274455', 'emp_1004274455', NULL, '1004274455', 'COD-4455', 'GERALDINE PEREZ BARRAZA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-42', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1094975643', 'emp_1094975643', NULL, '1094975643', 'COD-5643', 'VICTOR MANUEL GOMEZ MARIN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-49', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004803494', 'emp_1004803494', NULL, '1004803494', 'COD-3494', 'DANIELA ANGELY ORTEGA JARAMILLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-49', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1097391531', 'emp_1097391531', NULL, '1097391531', 'COD-1531', 'NATALY RODRIGUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-49', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1093792500', 'emp_1093792500', NULL, '1093792500', 'COD-2500', 'DIEGO ANDRES DUQUE MONCADA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-23', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-37506130', 'emp_37506130', NULL, '37506130', 'COD-6130', 'DEISY TORCOROMA CARRASCAL RIOS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-23', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1092526171', 'emp_1092526171', NULL, '1092526171', 'COD-6171', 'SEBASTIAN ALEXANDER ROJAS PATIÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-23', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004925792', 'emp_1004925792', NULL, '1004925792', 'COD-5792', 'DOMINICK SUAREZ MUNEVAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-23', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-13276365', 'emp_13276365', NULL, '13276365', 'COD-6365', 'WILLIAM MOLINA GELVEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-60', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-63510426', 'emp_63510426', NULL, '63510426', 'COD-0426', 'OSMANY RAVELO CARDENAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-60', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1148965693', 'emp_1148965693', NULL, '1148965693', 'COD-5693', 'JHONAIDER CAMARGO DELGADO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-60', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1090498655', 'emp_1090498655', NULL, '1090498655', 'COD-8655', 'JOHAN CASTILLO OBANDO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-60', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1013652451', 'emp_1013652451', NULL, '1013652451', 'COD-2451', 'JUAN FELIPE VANEGAS VANEGAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-34', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075286793', 'emp_1075286793', NULL, '1075286793', 'COD-6793', 'ANA MARIA PEREZ SOTO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-34', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075218260', 'emp_1075218260', NULL, '1075218260', 'COD-8260', 'CATALINA MOSQUERA SANCHEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-34', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006125370', 'emp_1006125370', NULL, '1006125370', 'COD-5370', 'MAYCOL RODRIGUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-33', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1110570386', 'emp_1110570386', NULL, '1110570386', 'COD-0386', 'LINDA CASTRO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-33', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1110485736', 'emp_1110485736', NULL, '1110485736', 'COD-5736', 'JHON MORERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-33', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007371954', 'emp_1007371954', NULL, '1007371954', 'COD-1954', 'DANNA REINOSO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-33', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-41947772', 'emp_41947772', NULL, '41947772', 'COD-7772', 'ALBA LUCIA RIAÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-78', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-33355697', 'emp_33355697', NULL, '33355697', 'COD-5697', 'DENIS SELENIA NERYS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-78', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-24606628', 'emp_24606628', NULL, '24606628', 'COD-6628', 'SANDRA MILENA JIMENEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-78', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1036637661', 'emp_1036637661', NULL, '1036637661', 'COD-7661', 'NATHALY CASTAÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-86', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000920217', 'emp_1000920217', NULL, '1000920217', 'COD-0217', 'ISABEL OSORIO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-86', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007674095', 'emp_1007674095', NULL, '1007674095', 'COD-4095', 'PEDRO LEON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-86', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088236500', 'emp_1088236500', NULL, '1088236500', 'COD-6500', 'WILSON LOAIZA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088333564', 'emp_1088333564', NULL, '1088333564', 'COD-3564', 'CESAR LOPEZ AG', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088303391', 'emp_1088303391', NULL, '1088303391', 'COD-3391', 'PAOLA ARIAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088286603', 'emp_1088286603', NULL, '1088286603', 'COD-6603', 'ANDERSON PINEDA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113647023', 'emp_1113647023', NULL, '1113647023', 'COD-7023', 'ANDRES FELIPE REINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1002743905', 'emp_1002743905', NULL, '1002743905', 'COD-3905', 'JACKELINE FRANCO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061710711', 'emp_1061710711', NULL, '1061710711', 'COD-0711', 'OSCAR DANIEL PALECHOR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-13', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061814088', 'emp_1061814088', NULL, '1061814088', 'COD-4088', 'MAILE CAMILA HERNANDEZ ANACONA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-13', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1002957897', 'emp_1002957897', NULL, '1002957897', 'COD-7897', 'VALERIA CACHIMBO SANCHEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-13', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1058968650', 'emp_1058968650', NULL, '1058968650', 'COD-8650', 'WILLIAM GAVIRIA CALVACHE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-13', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1102799771', 'emp_1102799771', NULL, '1102799771', 'COD-9771', 'JULIETH VILLAMIZAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-51', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1037669910', 'emp_1037669910', NULL, '1037669910', 'COD-9910', 'ENMANUEL DIAZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-51', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007102865', 'emp_1007102865', NULL, '1007102865', 'COD-2865', 'CAMILA BEDOYA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-51', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1028002893', 'emp_1028002893', NULL, '1028002893', 'COD-2893', 'LISETH ELIANA MENA MEJIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-1', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007053771', 'emp_1007053771', NULL, '1007053771', 'COD-3771', 'BRAYAN ALEXIS MARIN SALAZAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-1', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1024484377', 'emp_1024484377', NULL, '1024484377', 'COD-4377', 'FERNEY OSUNA RAMIREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-71', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1073504984', 'emp_1073504984', NULL, '1073504984', 'COD-4984', 'ESTHER RODRIGUEZ SALGADO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-71', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1121960419', 'emp_1121960419', NULL, '1121960419', 'COD-0419', 'WUILLESTHER ALEJANDRO PALACIOS LADERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-71', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1093921424', 'emp_1093921424', NULL, '1093921424', 'COD-1424', 'ANDERSON ORTEGA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-37', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1037624616', 'emp_1037624616', NULL, '1037624616', 'COD-4616', 'LUISA FERNANDA AGUDELO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-37', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1070607146', 'emp_1070607146', NULL, '1070607146', 'COD-7146', 'CRISTIAN SUAREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-37', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1096227090', 'emp_1096227090', NULL, '1096227090', 'COD-7090', 'XIOMARA TAMARA ARRIETA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-69', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1036643820', 'emp_1036643820', NULL, '1036643820', 'COD-3820', 'TATIANA VANESSA MUÑOZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-69', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1128440948', 'emp_1128440948', NULL, '1128440948', 'COD-0948', 'ANDERSON JARAMILLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-69', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-38468005', 'emp_38468005', NULL, '38468005', 'COD-8005', 'MARTINEZ DEVIA MARLY', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-98', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113661882', 'emp_1113661882', NULL, '1113661882', 'COD-1882', 'BERNAL GOMEZ LADY LORENA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-98', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1031175776', 'emp_1031175776', NULL, '1031175776', 'COD-5776', 'LOPEZ ALZATE NIKOLE ANDREA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-98', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061722782', 'emp_1061722782', NULL, '1061722782', 'COD-2782', 'ANDRES CASTRILLON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-73', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-34319130', 'emp_34319130', NULL, '34319130', 'COD-9130', 'MAGALY RUIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-73', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1002607819', 'emp_1002607819', NULL, '1002607819', 'COD-7819', 'INGRITHRAMIREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-73', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1010023111', 'emp_1010023111', NULL, '1010023111', 'COD-3111', 'JOSE ANTONIO OCHOA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-100', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1090523859', 'emp_1090523859', NULL, '1090523859', 'COD-3859', 'EMELY ALEXANDRA VILLAMIZAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-100', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1093788137', 'emp_1093788137', NULL, '1093788137', 'COD-8137', 'NELSON ADRIAN VIVAS PINZON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-100', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005754663', 'emp_1005754663', NULL, '1005754663', 'COD-4663', 'HAROLD AVILA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-43', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1102873315', 'emp_1102873315', NULL, '1102873315', 'COD-3315', 'JOSE LUIS FLOREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-63', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1148946437', 'emp_1148946437', NULL, '1148946437', 'COD-6437', 'ANGELICA GARCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-63', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-23178785', 'emp_23178785', NULL, '23178785', 'COD-8785', 'KAREN RUIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-63', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1083012814', 'emp_1083012814', NULL, '1083012814', 'COD-2814', 'YAINE CARO DURAN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-89', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004347266', 'emp_1004347266', NULL, '1004347266', 'COD-7266', 'MARIA SANCHEZ MEDINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-89', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143452487', 'emp_1143452487', NULL, '1143452487', 'COD-2487', 'ERIKA FONTALVO ALMENDRALES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-89', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143246137', 'emp_1143246137', NULL, '1143246137', 'COD-6137', 'JEFFREY OSPINA DEL CASTIL', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-55', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1045756535', 'emp_1045756535', NULL, '1045756535', 'COD-6535', 'JUSLEIDYS BENAVIDES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-55', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1234093311', 'emp_1234093311', NULL, '1234093311', 'COD-3311', 'SHIRLEY BOLAÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-55', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113680607', 'emp_1113680607', NULL, '1113680607', 'COD-0607', 'DANEIVIS RODRIGUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-46', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006427577', 'emp_1006427577', NULL, '1006427577', 'COD-7577', 'VALERIA MAHECHA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-46', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112231286', 'emp_1112231286', NULL, '1112231286', 'COD-1286', 'DANIELA RUIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-46', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007700430', 'emp_1007700430', NULL, '1007700430', 'COD-0430', 'JUANDAVID FIGUEROA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-46', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1117494016', 'emp_1117494016', NULL, '1117494016', 'COD-4016', 'PAOLA SUAREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-38', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1073701531', 'emp_1073701531', NULL, '1073701531', 'COD-1531', 'DUBERNEY LOZADA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-38', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006507172', 'emp_1006507172', NULL, '1006507172', 'COD-7172', 'DAYANA MOTTA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-38', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000761148', 'emp_1000761148', NULL, '1000761148', 'COD-1148', 'LAURA ANDREA CASTRILLON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-99', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1128439053', 'emp_1128439053', NULL, '1128439053', 'COD-9053', 'FABER ANDRES QUIRAMA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-99', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1033257847', 'emp_1033257847', NULL, '1033257847', 'COD-7847', 'JUAN DAVID GALEANO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-99', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1092364150', 'emp_1092364150', NULL, '1092364150', 'COD-4150', 'JOHAN MANUEL BONILLA FIGUEROA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-80', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-5896465', 'emp_5896465', NULL, '5896465', 'COD-6465', 'JOSE JAVIER LEAL PEROZO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-80', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1013339264', 'emp_1013339264', NULL, '1013339264', 'COD-9264', 'JUAN CARLOS SALCEDO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-80', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-43595446', 'emp_43595446', NULL, '43595446', 'COD-5446', 'MARIA ALEIDA ZEA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-80', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1151950812', 'emp_1151950812', NULL, '1151950812', 'COD-0812', 'GIOVANY VALENCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-84', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107509775', 'emp_1107509775', NULL, '1107509775', 'COD-9775', 'MARIA JOSE VALENCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-84', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1087185324', 'emp_1087185324', NULL, '1087185324', 'COD-5324', 'PAOLA GAVIRIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-84', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006048956', 'emp_1006048956', NULL, '1006048956', 'COD-8956', 'SEBATIAN MENESES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-84', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1067932945', 'emp_1067932945', NULL, '1067932945', 'COD-2945', 'XILENA TUIRAN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-56', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005676304', 'emp_1005676304', NULL, '1005676304', 'COD-6304', 'LEXY SIMANCA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-56', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1065002238', 'emp_1065002238', NULL, '1065002238', 'COD-2238', 'JEFERSON SUAREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-56', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000645951', 'emp_1000645951', NULL, '1000645951', 'COD-5951', 'VANESSA MONTOYA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-95', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1020496640', 'emp_1020496640', NULL, '1020496640', 'COD-6640', 'SEBASTIAN LOPEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-95', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1041532228', 'emp_1041532228', NULL, '1041532228', 'COD-2228', 'YULISA IBARRA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-95', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1110456090', 'emp_1110456090', NULL, '1110456090', 'COD-6090', 'MAYRA ALEJANDRA GUZMAN GIL', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-87', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1036962760', 'emp_1036962760', NULL, '1036962760', 'COD-2760', 'VALENTINA SERNA TABARES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-87', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004347439', 'emp_1004347439', NULL, '1004347439', 'COD-7439', 'ALEX ANDRES JIMENEZ MARTINEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-87', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1109185235', 'emp_1109185235', NULL, '1109185235', 'COD-5235', 'RANDY STEVEN VALENCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-88', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113702327', 'emp_1113702327', NULL, '1113702327', 'COD-2327', 'ISRAEL URBANO CASANOBA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-88', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1114838751', 'emp_1114838751', NULL, '1114838751', 'COD-8751', 'MANUELA ALZATE YERLI', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-88', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088267745', 'emp_1088267745', NULL, '1088267745', 'COD-7745', 'PAOLA TANGARIFE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-17', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112760066', 'emp_1112760066', NULL, '1112760066', 'COD-0066', 'ANGELLY RIVERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-17', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005654398', 'emp_1005654398', NULL, '1005654398', 'COD-4398', 'CAMILA ANDREA RICO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-17', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107091497', 'emp_1107091497', NULL, '1107091497', 'COD-1497', 'KELLY SÁNCHEZ FIGUEROA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1109667614', 'emp_1109667614', NULL, '1109667614', 'COD-7614', 'SEBASTIAN GALLEGO CAMPO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1038822751', 'emp_1038822751', NULL, '1038822751', 'COD-2751', 'WENDY VANESSA HOYOS LEON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1105365134', 'emp_1105365134', NULL, '1105365134', 'COD-5134', 'JUAN DAVID POLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1105371506', 'emp_1105371506', NULL, '1105371506', 'COD-1506', 'MARIANA FRANCO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112219355', 'emp_1112219355', NULL, '1112219355', 'COD-9355', 'MARIA ELENA CORREA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-29', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004789966', 'emp_1004789966', NULL, '1004789966', 'COD-9966', 'MARIA ALEJANDRA DE LA CRUZ BUSTAMANTE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-29', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1088017254', 'emp_1088017254', NULL, '1088017254', 'COD-7254', 'SERGIO ANDRES DUQUE CUERVO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-29', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005206848', 'emp_1005206848', NULL, '1005206848', 'COD-6848', 'DANIELA AGUIRRE URREA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-29', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1094882614', 'emp_1094882614', NULL, '1094882614', 'COD-2614', 'RUIZ ESCOBAR FABIO ANDRÉS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-30', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1092850523', 'emp_1092850523', NULL, '1092850523', 'COD-0523', 'OSPINA BETANCUR LAURA SOFÍA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-30', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1094971574', 'emp_1094971574', NULL, '1094971574', 'COD-1574', 'RAMÍREZ FLÓREZ CAROLINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-30', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1047460782', 'emp_1047460782', NULL, '1047460782', 'COD-0782', 'JULIAN REYES FLOREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-79', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1002249169', 'emp_1002249169', NULL, '1002249169', 'COD-9169', 'KAREN PAMELA PAJARO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-79', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-45548590', 'emp_45548590', NULL, '45548590', 'COD-8590', 'DINA PACHECO CANDY', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-79', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-32935519', 'emp_32935519', NULL, '32935519', 'COD-5519', 'CRISTEL SOFIA GAVALO CASTILLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-32', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1001937309', 'emp_1001937309', NULL, '1001937309', 'COD-7309', 'ESTEBAN ROMERO VELEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-32', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143389382', 'emp_1143389382', NULL, '1143389382', 'COD-9382', 'NORAINE COHEN PEREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-32', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143359311', 'emp_1143359311', NULL, '1143359311', 'COD-9311', 'ERIKA PATRICIA BELLIDO MARIN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1047395399', 'emp_1047395399', NULL, '1047395399', 'COD-5399', 'OLGA ISABEL PESTAÑA RODRIGUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1067882225', 'emp_1067882225', NULL, '1067882225', 'COD-2225', 'MARIA ANGELICA PEÑA PATERNINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1047480286', 'emp_1047480286', NULL, '1047480286', 'COD-0286', 'YONAICER MARIMON POMBO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-3811627', 'emp_3811627', NULL, '3811627', 'COD-1627', 'OSCAR JAVIER TORRES  DIAZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1001443687', 'emp_1001443687', NULL, '1001443687', 'COD-3687', 'IRI GIOVANA VILLADIEGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-67', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1067865055', 'emp_1067865055', NULL, '1067865055', 'COD-5055', 'DIEGO ANDRES SANCHEZ BENITEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-67', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-7097405', 'emp_7097405', NULL, '7097405', 'COD-7405', 'YARELIS MARIA BONILLA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-67', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-45706191', 'emp_45706191', NULL, '45706191', 'COD-6191', 'GLORIA VALENCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1052981421', 'emp_1052981421', NULL, '1052981421', 'COD-1421', 'KARINA DIAZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-45691762', 'emp_45691762', NULL, '45691762', 'COD-1762', 'ELVIA MACOTT', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-3811650', 'emp_3811650', NULL, '3811650', 'COD-1650', 'WILSON PEREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1047425678', 'emp_1047425678', NULL, '1047425678', 'COD-5678', 'CRISTINA SERNA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1096223273', 'emp_1096223273', NULL, '1096223273', 'COD-3273', 'ERICA PEREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-50', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1047439766', 'emp_1047439766', NULL, '1047439766', 'COD-9766', 'LUISA SALAZAR', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-50', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-73578286', 'emp_73578286', NULL, '73578286', 'COD-8286', 'AMAURY SALCEDO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-50', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006457154', 'emp_1006457154', NULL, '1006457154', 'COD-7154', 'KATHERINE PINZON DE DIO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-41', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1115917177', 'emp_1115917177', NULL, '1115917177', 'COD-7177', 'CARLOS ALBERTO SALAS GRANADOS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-41', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1118567232', 'emp_1118567232', NULL, '1118567232', 'COD-7232', 'BRIYITH PAOLA  ROJAS LANCHEROS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-41', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1057436460', 'emp_1057436460', NULL, '1057436460', 'COD-6460', 'ANA VICTORIA GARZON LOPEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-41', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-6499497', 'emp_6499497', NULL, '6499497', 'COD-9497', 'JUAN CARLOS LONDOÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-47', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113698946', 'emp_1113698946', NULL, '1113698946', 'COD-8946', 'NATALIA IRIARTE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-47', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113623464', 'emp_1113623464', NULL, '1113623464', 'COD-3464', 'HEIDY BELLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-47', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112775615', 'emp_1112775615', NULL, '1112775615', 'COD-5615', 'JOHN FAVER CORREA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1005871809', 'emp_1005871809', NULL, '1005871809', 'COD-1809', 'DANIEL ECHEVERRY', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143413580', 'emp_1143413580', NULL, '1143413580', 'COD-3580', 'JHON OCAMPO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143872360', 'emp_1143872360', NULL, '1143872360', 'COD-2360', 'JUAN DAVID TORRES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143988839', 'emp_1143988839', NULL, '1143988839', 'COD-8839', 'ROANALD DELGADO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1121955666', 'emp_1121955666', NULL, '1121955666', 'COD-5666', 'ELCY ROJAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-44', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1072394323', 'emp_1072394323', NULL, '1072394323', 'COD-4323', 'ESNEIDER LADINO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-44', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1123059086', 'emp_1123059086', NULL, '1123059086', 'COD-9086', 'ANDREA SIERRA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-44', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000018111', 'emp_1000018111', NULL, '1000018111', 'COD-8111', 'CRISTIAN REY', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-66', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1023005185', 'emp_1023005185', NULL, '1023005185', 'COD-5185', 'NATALIA TRUJILLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-66', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1058968780', 'emp_1058968780', NULL, '1058968780', 'COD-8780', 'JULIO MARTINEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-66', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1042451413', 'emp_1042451413', NULL, '1042451413', 'COD-1413', 'TANIA ISABEL CASTILLO BRAVO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-39', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1002431274', 'emp_1002431274', NULL, '1002431274', 'COD-1274', 'MARIA ALEXANDRA FONTALVO FRANCO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-39', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1003173576', 'emp_1003173576', NULL, '1003173576', 'COD-3576', 'KEVIN CAMILO BONETH GALINDO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-39', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004879853', 'emp_1004879853', NULL, '1004879853', 'COD-9853', 'ANGIE KATHERINE MUÑOZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1090387240', 'emp_1090387240', NULL, '1090387240', 'COD-7240', 'YEIMES SHIRLEY PEREIRA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1091966507', 'emp_1091966507', NULL, '1091966507', 'COD-6507', 'DIEGO ERNESTO DUARTE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1092524109', 'emp_1092524109', NULL, '1092524109', 'COD-4109', 'FREDDY ANTONIO VERGEL', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1093142132', 'emp_1093142132', NULL, '1093142132', 'COD-2132', 'ANGIE MELISSA CADENA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1091678220', 'emp_1091678220', NULL, '1091678220', 'COD-8220', 'DAYANA ANDREA MORENO SÁNCHEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-72', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1090531186', 'emp_1090531186', NULL, '1090531186', 'COD-1186', 'WILMER ANDRES PINEDA MEDINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-72', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-103040455', 'emp_103040455', NULL, '103040455', 'COD-0455', 'DIEGO ALBERTO NERCI ROJAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-72', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1193438645', 'emp_1193438645', NULL, '1193438645', 'COD-8645', 'KEVIN JORSEPH CORREA BARBOSA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-72', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1121336147', 'emp_1121336147', NULL, '1121336147', 'COD-6147', 'YAMILETH ARAUJO USTARIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-92', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1118836017', 'emp_1118836017', NULL, '1118836017', 'COD-6017', 'LUZ STELLA PELAEZ BOHORQUEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-92', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-5704226', 'emp_5704226', NULL, '5704226', 'COD-4226', 'MAIKOL RODRIGUEZ MOLINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-92', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1193246158', 'emp_1193246158', NULL, '1193246158', 'COD-6158', 'AIDA LUZ MARTINEZ BALZA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-53', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004306662', 'emp_1004306662', NULL, '1004306662', 'COD-6662', 'CESAR DANIEL ROMERO CUELLO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-53', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1066270050', 'emp_1066270050', NULL, '1066270050', 'COD-0050', 'CAMILO ANDRES DIAZ RHENALS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-53', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-106586951', 'emp_106586951', NULL, '106586951', 'COD-6951', 'LEONARDO JOSE OLMEDO BARROS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-40', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1003231065', 'emp_1003231065', NULL, '1003231065', 'COD-1065', 'NAYIBE SOFIA QUINTERO MENDEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-40', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1065614711', 'emp_1065614711', NULL, '1065614711', 'COD-4711', 'CARLOS ANDRES CASTRO DAZA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-40', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1067594141', 'emp_1067594141', NULL, '1067594141', 'COD-4141', 'DANIEL EDUARDO MUNIBE SOLIS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-40', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1079409500', 'emp_1079409500', NULL, '1079409500', 'COD-9500', 'LINA MERCEDES PERDOMO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-82', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075295484', 'emp_1075295484', NULL, '1075295484', 'COD-5484', 'LEYDI ALDANA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-82', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075240964', 'emp_1075240964', NULL, '1075240964', 'COD-0964', 'CRISTINA CASTAÑEDA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-82', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075259885', 'emp_1075259885', NULL, '1075259885', 'COD-9885', 'MONICA ORTIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-82', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007045361', 'emp_1007045361', NULL, '1007045361', 'COD-5361', 'LISSY TOVAR TORREALBA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-25', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075270226', 'emp_1075270226', NULL, '1075270226', 'COD-0226', 'AIDA INES CHARRY', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-25', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1106779896', 'emp_1106779896', NULL, '1106779896', 'COD-9896', 'ANGIE SABOGAL', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-43', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1110506146', 'emp_1110506146', NULL, '1110506146', 'COD-6146', 'JHON GUZMAN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-43', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1083925853', 'emp_1083925853', NULL, '1083925853', 'COD-5853', 'KEVIN CAMILO ORTEGA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-27', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1083897961', 'emp_1083897961', NULL, '1083897961', 'COD-7961', 'PAULA STELLA GARCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-27', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1079534051', 'emp_1079534051', NULL, '1079534051', 'COD-4051', 'LUISA FERNANDA ARIAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-27', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-10838794561', 'emp_10838794561', NULL, '10838794561', 'COD-4561', 'ANYELA RUIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-27', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144199989', 'emp_1144199989', NULL, '1144199989', 'COD-9989', 'JUAN SEBASTIAN CRUZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-20', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006048486', 'emp_1006048486', NULL, '1006048486', 'COD-8486', 'LUISA FERNANDA RESTREPO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-20', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1109920243', 'emp_1109920243', NULL, '1109920243', 'COD-0243', 'NATHALI MUTIZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-20', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1010092142', 'emp_1010092142', NULL, '1010092142', 'COD-2142', 'DANIELA MUÑOZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-48', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085902274', 'emp_1085902274', NULL, '1085902274', 'COD-2274', 'ANDREA CHACON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-48', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085948134', 'emp_1085948134', NULL, '1085948134', 'COD-8134', 'RICHAR QUENGUAN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-48', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000047660', 'emp_1000047660', NULL, '1000047660', 'COD-7660', 'JOSE ORBES', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-48', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1067904708', 'emp_1067904708', NULL, '1067904708', 'COD-4708', 'JOSE RICARDO PEREZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-31', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1067921548', 'emp_1067921548', NULL, '1067921548', 'COD-1548', 'ENA MARIMON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-31', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1065006748', 'emp_1065006748', NULL, '1065006748', 'COD-6748', 'OSCAR ANDRADE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-31', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1024528492', 'emp_1024528492', NULL, '1024528492', 'COD-8492', 'WILMER FARIETA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-90', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-52805111', 'emp_52805111', NULL, '52805111', 'COD-5111', 'LILIANA RINCON', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-90', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-52324929', 'emp_52324929', NULL, '52324929', 'COD-4929', 'YANNETH FONSECA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-90', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1216727139', 'emp_1216727139', NULL, '1216727139', 'COD-7139', 'ESTRELLA TAPIAS BENJUMEA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-59', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000535103', 'emp_1000535103', NULL, '1000535103', 'COD-5103', 'SEBASTIAN BETANCUR ARANGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-59', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1193155892', 'emp_1193155892', NULL, '1193155892', 'COD-5892', 'MARIA CLARA DAVID DAVID', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-59', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1038338982', 'emp_1038338982', NULL, '1038338982', 'COD-8982', 'KEVIN CANO ALAPE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-59', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112777588', 'emp_1112777588', NULL, '1112777588', 'COD-7588', 'DANIELA GOMEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-61', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1004754146', 'emp_1004754146', NULL, '1004754146', 'COD-4146', 'MARIA CAMILA MARIN', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-61', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006287617', 'emp_1006287617', NULL, '1006287617', 'COD-7617', 'KEVIN CASTAÑEDA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-61', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1113699149', 'emp_1113699149', NULL, '1113699149', 'COD-9149', 'MONICA ANDREA ORTEGA CABRERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1015481891', 'emp_1015481891', NULL, '1015481891', 'COD-1891', 'BRAYAN STIVEN MUÑOZ PINEDA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1108332060', 'emp_1108332060', NULL, '1108332060', 'COD-2060', 'DLESSANDRO MORENO MINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112046407', 'emp_1112046407', NULL, '1112046407', 'COD-6407', 'JUAN SEBASTIAN GIRALDO SERNA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1108562666', 'emp_1108562666', NULL, '1108562666', 'COD-2666', 'CESAR ANDRES SINISTERRA CARMONA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007247140', 'emp_1007247140', NULL, '1007247140', 'COD-7140', 'JOSE ROJAS SOTO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-70', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1098200569', 'emp_1098200569', NULL, '1098200569', 'COD-0569', 'DIANA VESGA CALA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-70', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-22533177', 'emp_22533177', NULL, '22533177', 'COD-3177', 'CINTHIA ARRIETA HAMBURGER', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-70', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1010054140', 'emp_1010054140', NULL, '1010054140', 'COD-4140', 'JUAN FORERO LOPEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-70', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1193567871', 'emp_1193567871', NULL, '1193567871', 'COD-7871', 'DAYANA GONZALEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-9', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1048276574', 'emp_1048276574', NULL, '1048276574', 'COD-6574', 'GISELLA CASTRO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-9', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-55300073', 'emp_55300073', NULL, '55300073', 'COD-0073', 'ZULEHIMA SARMIENTO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-9', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007128596', 'emp_1007128596', NULL, '1007128596', 'COD-8596', 'TOMAS BALLESTAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-9', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006426992', 'emp_1006426992', NULL, '1006426992', 'COD-6992', 'JARAMILLO VILLA ELIANA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-97', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1116271930', 'emp_1116271930', NULL, '1116271930', 'COD-1930', 'AGUIRRE ZAPATA LUIS ALEJANDRO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-97', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1193568633', 'emp_1193568633', NULL, '1193568633', 'COD-8633', 'BARÓN ORTIZ SANTIAGO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-97', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107059395', 'emp_1107059395', NULL, '1107059395', 'COD-9395', 'ESAMIR MINA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-74', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-16919109', 'emp_16919109', NULL, '16919109', 'COD-9109', 'EDUARD GOONZALEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-74', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144159588', 'emp_1144159588', NULL, '1144159588', 'COD-9588', 'CRISTIAN ARCE', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-74', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1116256340', 'emp_1116256340', NULL, '1116256340', 'COD-6340', 'ROBINSON CORDERO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-5', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1116280441', 'emp_1116280441', NULL, '1116280441', 'COD-0441', 'ESTEBAN LOPEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-5', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1006491147', 'emp_1006491147', NULL, '1006491147', 'COD-1147', 'STEVEN SALINAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-5', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1140421188', 'emp_1140421188', NULL, '1140421188', 'COD-1188', 'LORENA PARRA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-5', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1035440389', 'emp_1035440389', NULL, '1035440389', 'COD-0389', 'FARLEY STIVEN FRANCO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-58', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1000637944', 'emp_1000637944', NULL, '1000637944', 'COD-7944', 'ANGIE ANDUQUIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-58', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1075263743', 'emp_1075263743', NULL, '1075263743', 'COD-3743', 'ANDRES GOMEZ PEÑA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-58', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085290324', 'emp_1085290324', NULL, '1085290324', 'COD-0324', 'JOANA RUANO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-22', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1233193345', 'emp_1233193345', NULL, '1233193345', 'COD-3345', 'YULIETH PILPUD', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-22', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1085274203', 'emp_1085274203', NULL, '1085274203', 'COD-4203', 'VIVIANA VALENCIA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-22', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1074810079', 'emp_1074810079', NULL, '1074810079', 'COD-0079', 'LUIS CARLOS AVILEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-77', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007235170', 'emp_1007235170', NULL, '1007235170', 'COD-5170', 'ADRIAN DIAZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-77', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1053836534', 'emp_1053836534', NULL, '1053836534', 'COD-6534', 'CRISTIAN CAMILO BALLESTEROS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-77', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1143961080', 'emp_1143961080', NULL, '1143961080', 'COD-1080', 'YESID VELASCO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-96', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1110289491', 'emp_1110289491', NULL, '1110289491', 'COD-9491', 'CRISTIAN CARDONA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-96', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1109665565', 'emp_1109665565', NULL, '1109665565', 'COD-5565', 'NICOLLE BERMUDEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-96', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1112477800', 'emp_1112477800', NULL, '1112477800', 'COD-7800', 'AURA MARIA HURTADO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-7', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1144085357', 'emp_1144085357', NULL, '1144085357', 'COD-5357', 'JUAN CAMILO ZAPATA GIRALDO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-7', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1061716853', 'emp_1061716853', NULL, '1061716853', 'COD-6853', 'LEIDY JHOANA BARRERA TOLA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-7', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1107840490', 'emp_1107840490', NULL, '1107840490', 'COD-0490', 'NIKOL ANDREA LONDOÑO', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-7', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1042769325', 'emp_1042769325', NULL, '1042769325', 'COD-9325', 'MONICA LEAL', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-91', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1023522382', 'emp_1023522382', NULL, '1023522382', 'COD-2382', 'MARIA JOSE HERRERA', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-91', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1007222843', 'emp_1007222843', NULL, '1007222843', 'COD-2843', 'YESENIA HERNANDEZ', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-91', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('emp-1070780309', 'emp_1070780309', NULL, '1070780309', 'COD-0309', 'ANDRES FELIPE ARIAS', 'EMPLOYEE', 'ASESOR(A) DE IMAGEN', 'RETAIL', 'FIJO', 'pdv-91', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;

-- ====================================================================
-- 5. TABLA DE AUDITORÍA Y TRAZABILIDAD (Módulo Exclusivo Maestro VRX)
-- ====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    action_label TEXT NOT NULL,
    pdv_name TEXT,
    detail TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura y escritura publica de audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_name ON audit_logs(user_name);
