-- ====================================================================
-- CONTROL DE TURNOS Y CONCILIACIÓN BIOMÉTRICA (PDV)
-- ESQUEMA DE BASE DE DATOS Y DATOS MAESTROS PARA SUPABASE (POSTGRESQL)
-- 101 PUNTOS DE VENTA Y 12 LÍDERES REGIONALES CARGADOS
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

CREATE TABLE punch_batches (
    id TEXT PRIMARY KEY,
    file_name TEXT,
    file_size NUMERIC,
    period TEXT,
    store TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    record_count INTEGER DEFAULT 0
);

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

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_schedules_week ON schedules (week_start);
CREATE INDEX IF NOT EXISTS idx_schedules_pdv ON schedules (pdv_id);
CREATE INDEX IF NOT EXISTS idx_permissions_status ON permissions (status);
CREATE INDEX IF NOT EXISTS idx_punch_records_doc ON punch_records (document_id);
CREATE INDEX IF NOT EXISTS idx_punch_records_date ON punch_records (entry_date);

-- Políticas de Seguridad RLS
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

-- 6.2 Los 12 Líderes Regionales Reales
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-alexander-lopez', 'Alexander Lopez', 'COD-VALLE-CENTRO', 'ZONA VALLE CENTRO & TULUÁ', '1018001', 'alexander.lopez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-andrea-perez', 'Andrea Pérez', 'COD-CENTRO-ORIENTE', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', '1018002', 'andrea.perez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-andres-osorio', 'Andres Osorio', 'COD-EJE-CAFETERO', 'ZONA EJE CAFETERO', '1018003', 'andres.osorio@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-anyela-gonzalez', 'Anyela Gonzalez', 'COD-CALI-1', 'ZONA CALI 1 & CENTRO', '1018004', 'anyela.gonzalez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-carlos-correa', 'Carlos Correa', 'COD-COSTA-NORTE', 'ZONA COSTA & CARIBE', '1018005', 'carlos.correa@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-fabian-sanchez', 'Fabian Sanchez', 'COD-SANTANDERES', 'ZONA SANTANDERES & CESAR', '1018006', 'fabian.sanchez@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-jose-salazar', 'Jose Salazar', 'COD-NARINO', 'ZONA NARIÑO', '1018007', 'jose.salazar@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-julian-marin', 'Julian Marin', 'COD-QST', 'ZONA FORMATO QST', '1018008', 'julian.marin@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-yoryani-valderrama', 'Yoryani Valderrama', 'COD-CALI-SUR-CAUCA', 'ZONA CALI SUR, VALLE & CAUCA', '1018009', 'yoryani.valderrama@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-zona-medellin', 'Zona Medellin', 'COD-ANTIOQUIA', 'ZONA ANTIOQUIA & MEDELLÍN', '1018010', 'lider.medellin@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-zona-neiva', 'Zona Neiva', 'COD-TOLHUCA', 'ZONA HUILA & CAQUETÁ', '1018011', 'lider.neiva@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES ('sup-zona-yopal', 'Zona Yopal', 'COD-CASANARE', 'ZONA CASANARE & YOPAL', '1018012', 'lider.yopal@quest.com.co')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;

-- 6.3 Maestro Oficial de los 101 Puntos de Venta (PDVs)
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-1', 'N10', 'N10-Carpa Quest Medellin-CC DEMODA Outle', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-2', 'Q003', 'Q003 - Cali - Calle 23', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-3', 'Q007', 'Q007 - Tulua - Centro', 'Tuluá', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-4', 'Q008', 'Q008 - Cali - Alameda', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-5', 'Q014', 'Q014 - Tulua - Cc Herradura', 'Tuluá', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-6', 'Q016', 'Q016 - Cali - Cc Palmetto', 'Cali', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-7', 'Q018', 'Q018 - Cali - Cc Jardin Plaza', 'Cali', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-8', 'Q021', 'Q021 - Cali - Cc Chipichape', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-9', 'Q023', 'Q023 - Barranquilla - Cc Portal', 'Barranquilla', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-10', 'Q027', 'Q027 - Cucuta - Cc Ventura Plaza', 'Cúcuta', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-11', 'Q028', 'Q028 - Cali - Centro Calle 13', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-12', 'Q029', 'Q029 - Cali - Cc Unico 1', 'Cali', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-13', 'Q030', 'Q030 - Popayan - Cc Campanario', 'Popayán', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-14', 'Q031', 'Q031 - Cali - Centro 1', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-15', 'Q033', 'Q033 - Cartagena - Cc Caribe Plaza', 'Cartagena', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-16', 'Q035', 'Q035 - Barranquilla - Cc Unico', 'Barranquilla', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-17', 'Q038', 'Q038 - Pereira - Cc Unicentro', 'Pereira', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-18', 'Q039', 'Q039 - Cali - Cc Unico 2', 'Cali', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-19', 'Q040', 'Q040 - Cali - Cc Unicentro 2', 'Cali', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-20', 'Q041', 'Q041 - Cali - Cc Calima', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-21', 'Q044', 'Q044 - Popayan - Centro', 'Popayán', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-22', 'Q045', 'Q045 - Pasto - Cc Unicentro', 'Pasto', 'sup-jose-salazar', 'ZONA NARIÑO', 'sup-jose-salazar', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-23', 'Q046', 'Q046 - Cucuta - Centro 2', 'Cúcuta', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-24', 'Q049', 'Q049 - Dosquebradas - Cc Unico', 'Dosquebradas', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-25', 'Q053', 'Q053 - Neiva - Cc San Pedro Plaza', 'Neiva', 'sup-zona-neiva', 'ZONA HUILA & CAQUETÁ', 'sup-zona-neiva', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-26', 'Q054', 'Q054 - Sincelejo - Centro', 'Sincelejo', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-27', 'Q056', 'Q056 - Pitalito - Cc San Antonio', 'Pitalito', 'sup-zona-neiva', 'ZONA HUILA & CAQUETÁ', 'sup-zona-neiva', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-28', 'Q057', 'Q057 - Pasto - Cc Unico', 'Pasto', 'sup-jose-salazar', 'ZONA NARIÑO', 'sup-jose-salazar', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-29', 'Q058', 'Q058 - Pereira - Cc Victoria Plaza', 'Pereira', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-30', 'Q061', 'Q061 - Armenia - Cc Unicentro', 'Armenia', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-31', 'Q062', 'Q062 - Monteria - Cc Alamedas', 'Montería', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-32', 'Q068', 'Q068 - Cartagena - Cc Outlet del Bosque', 'Cartagena', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-33', 'Q069', 'Q069 - Ibague - Centro', 'Ibagué', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-34', 'Q071', 'Q071 - Neiva - Centro', 'Neiva', 'sup-zona-neiva', 'ZONA HUILA & CAQUETÁ', 'sup-zona-neiva', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-35', 'Q073', 'Q073 - Yumbo - Cc Unico', 'Yumbo', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-36', 'Q074', 'Q074 - Villavicencio - Cc Unico', 'Villavicencio', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-37', 'Q076', 'Q076 - Medellin - Cc Florida', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-38', 'Q077', 'Q077 - Florencia - Cc Gran Plaza', 'Florencia', 'sup-zona-neiva', 'ZONA HUILA & CAQUETÁ', 'sup-zona-neiva', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-39', 'Q078', 'Q078 - Soledad - Cc Gran Plaza', 'Soledad', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-40', 'Q080', 'Q080 - Valledupar - Cc Mayales', 'Valledupar', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-41', 'Q083', 'Q083 - Yopal - Cc Unicentro', 'Yopal', 'sup-zona-yopal', 'ZONA CASANARE & YOPAL', 'sup-zona-yopal', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-42', 'Q084', 'Q084 - Santa Marta - Centro', 'Santa Marta', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-43', 'Q085', 'Q085 - Ibague - Cc La Estacion', 'Ibagué', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-44', 'Q086', 'Q086 - Villavicencio - Cc Viva', 'Villavicencio', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-45', 'Q087', 'Q087 - Palmira - Centro', 'Palmira', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-46', 'Q088', 'Q088 - Palmira - Cc Llanogrande', 'Palmira', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-47', 'Q089', 'Q089 - Palmira - Cc Unicentro', 'Palmira', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-48', 'Q090', 'Q090 - Ipiales - Cc Gran Plaza', 'Ipiales', 'sup-jose-salazar', 'ZONA NARIÑO', 'sup-jose-salazar', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-49', 'Q091', 'Q091 - Armenia - Centro', 'Armenia', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-50', 'Q092', 'Q092 - Cartagena - Cc San Fernando', 'Cartagena', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-51', 'Q094', 'Q094 - Medellin - Cc Aventura', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-52', 'Q097', 'Q097 - Cartago - Centro', 'Cartago', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-53', 'Q102', 'Q102 - Valledupar - Cc Guatapuri', 'Valledupar', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-54', 'Q105', 'Q105 - Pereira - Centro', 'Pereira', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-55', 'Q106', 'Q106 - Soledad - Cc Nuestro Atlantico', 'Soledad', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-56', 'Q107', 'Q107 - Monteria - Cc Nuestro Monteria', 'Montería', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-57', 'Q109', 'Q109 - Cartagena - Cc La Castellana', 'Cartagena', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-58', 'Q112', 'Q112 - Medellin - Cc Molinos Medellin', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-59', 'Q113', 'Q113 - Envigado - Cc Viva Local-221', 'Envigado', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-60', 'Q115', 'Q115 - Cucuta - Centro', 'Cúcuta', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-61', 'Q116', 'Q116 - Cartago - Cc Nuestro Cartago', 'Cartago', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-62', 'Q117', 'Q117 - Neiva - Cc Unico', 'Neiva', 'sup-zona-neiva', 'ZONA HUILA & CAQUETÁ', 'sup-zona-neiva', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-63', 'Q118', 'Q118 - Sincelejo - Cc Guacari', 'Sincelejo', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-64', 'Q120', 'Q120 - Cali - Plaza Q', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-65', 'Q122', 'Q122 - Tulua - Centro Calle 27', 'Tuluá', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-66', 'Q124', 'Q124 - Bogotáá - Cc Nuestro Bogotáá', 'Bogotá', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-67', 'Q125', 'Q125 - Bello - Cc Plaza Fabricato', 'Bello', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-68', 'Q126', 'Q126 - Ipiales - Centro', 'Ipiales', 'sup-jose-salazar', 'ZONA NARIÑO', 'sup-jose-salazar', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-69', 'Q127', 'Q127 - Sabaneta - CC Mayorca', 'Sabaneta', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-70', 'Q128', 'Q128 - Barranquilla - CC Parque Alegra', 'Barranquilla', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-71', 'Q129', 'Q129 - Bogotáá - CC Plaza de las Américas', 'Bogotá', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-72', 'Q131', 'Q131 - Cúcuta - CC Jardin Plaza', 'Cúcuta', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-73', 'Q132', 'Q132 - Valledupar - Centro', 'Valledupar', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-74', 'Q133', 'Q133 - Popayán - CC Terra Plaza', 'Popayán', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-75', 'Q134', 'Q134 - Cali - CC Cosmocentro', 'Cali', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-76', 'Q135', 'Q135 - Pasto - Centro', 'Pasto', 'sup-jose-salazar', 'ZONA NARIÑO', 'sup-jose-salazar', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-77', 'Q136', 'Q136 - Yopal - Centro', 'Yopal', 'sup-zona-yopal', 'ZONA CASANARE & YOPAL', 'sup-zona-yopal', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-78', 'Q138', 'Q138 - Manizales - CC Fundadores', 'Manizales', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-79', 'Q139', 'Q139 - Armenia - Centro 2', 'Armenia', 'sup-andres-osorio', 'ZONA EJE CAFETERO', 'sup-andres-osorio', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-80', 'Q140', 'Q140 - Cartagena - CC Mall Plaza', 'Cartagena', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-81', 'Q143', 'Q143 - Sabaneta - CC Mayorca Etapa 1', 'Sabaneta', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-82', 'Q144', 'Q144 - Popayán - Centro 2', 'Popayán', 'sup-yoryani-valderrama', 'ZONA CALI SUR, VALLE & CAUCA', 'sup-yoryani-valderrama', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-83', 'Q145', 'Q145 - Neiva - CC Unicentro', 'Neiva', 'sup-zona-neiva', 'ZONA HUILA & CAQUETÁ', 'sup-zona-neiva', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-84', 'Q146', 'Q146 - Palmira - Centro 2', 'Palmira', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-85', 'Q147', 'Q147 - Cali - Mall Plaza', 'Cali', 'sup-anyela-gonzalez', 'ZONA CALI 1 & CENTRO', 'sup-anyela-gonzalez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-86', 'Q148', 'Q148 - Medellín - Carabobo Centro', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-87', 'Q149', 'Q149 - Medellín - Centro', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-88', 'Q152', 'Q152 - Rionegro - CC San Nicolás', 'Rionegro', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-89', 'Q153', 'Q153 - Palmira - CC Llanogrande 2', 'Palmira', 'sup-alexander-lopez', 'ZONA VALLE CENTRO & TULUÁ', 'sup-alexander-lopez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-90', 'Q154', 'Q154 - Santa Marta - CC Buenavista', 'Santa Marta', 'sup-carlos-correa', 'ZONA COSTA & CARIBE', 'sup-carlos-correa', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-91', 'Q155', 'Q155 - Bogotáá - CC Outlet las Américas', 'Bogotá', 'sup-andrea-perez', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'sup-andrea-perez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-92', 'Q156', 'Q156 - Medellín - CC Santa Fe', 'Medellín', 'sup-zona-medellin', 'ZONA ANTIOQUIA & MEDELLÍN', 'sup-zona-medellin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-93', 'Q157', 'Q157 - Riohacha - CC Viva Wajira', 'Riohacha', 'sup-fabian-sanchez', 'ZONA SANTANDERES & CESAR', 'sup-fabian-sanchez', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-94', 'QST501', 'QST501 - Cali - Plaza Q', 'Cali', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-95', 'QST502', 'QST502 - Cali - CC Único 2', 'Cali', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-96', 'QST503', 'QST503 - Medellín - CC Florida', 'Medellín', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-97', 'QST504', 'QST504 - Cali - CC Jardín Plaza', 'Cali', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-98', 'QST505', 'QST505 - Tuluá - CC La Herradura', 'Tuluá', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-99', 'QST506', 'QST506 - Palmira - CC Llanogrande', 'Palmira', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-100', 'QST508', 'QST508 - Medellín - CC Mayorca', 'Medellín', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES ('pdv-101', 'QST509', 'QST509 - Cúcuta - CC Jardín Plaza', 'Cúcuta', 'sup-julian-marin', 'ZONA FORMATO QST', 'sup-julian-marin', '10:00', '20:30', '["10:00-20:30","10:00-18:00","11:00-19:00","12:00-20:30","13:00-20:30"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;

-- 6.4 Usuarios y Perfiles del Sistema
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-admin', 'admin', NULL, NULL, NULL, 'ADMINISTRADOR GENERAL', 'ADMIN', 'SUPERUSUARIO / ADMIN GENERAL', 'OPERACIONES & AUDITORÍA GLOBAL', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-th', 'th', NULL, NULL, NULL, 'DIRECCIÓN DE TALENTO HUMANO', 'HR', 'ANALISTA DE NÓMINA Y ASISTENCIA', 'GESTIÓN HUMANA', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-vrx', 'vrx', NULL, NULL, NULL, 'AUDITORÍA DE ASISTENCIA VRX', 'AUDITOR_VRX', 'AUDITOR NACIONAL DE CONTROL HORARIO', 'AUDITORÍA Y CONTROL INTERNO', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-mant', 'mant', NULL, NULL, NULL, 'APROBADOR MANTENIMIENTO Y OBRAS', 'MAINTENANCE_APPROVER', 'COORDINADOR DE MANTENIMIENTO', 'MANTENIMIENTO Y OBRAS', 'FIJO', NULL, NULL, 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-alexander-lopez', 'alexander.lopez', NULL, NULL, NULL, 'ALEXANDER LOPEZ', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA VALLE CENTRO & TULUÁ', 'FIJO', NULL, 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-andrea-perez', 'andrea.pérez', NULL, NULL, NULL, 'ANDREA PÉREZ', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA BOGOTÁ, IBAGUÉ & LLANOS', 'FIJO', NULL, 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-andres-osorio', 'andres.osorio', NULL, NULL, NULL, 'ANDRES OSORIO', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA EJE CAFETERO', 'FIJO', NULL, 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-anyela-gonzalez', 'anyela.gonzalez', NULL, NULL, NULL, 'ANYELA GONZALEZ', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA CALI 1 & CENTRO', 'FIJO', NULL, 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-carlos-correa', 'carlos.correa', NULL, NULL, NULL, 'CARLOS CORREA', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA COSTA & CARIBE', 'FIJO', NULL, 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-fabian-sanchez', 'fabian.sanchez', NULL, NULL, NULL, 'FABIAN SANCHEZ', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA SANTANDERES & CESAR', 'FIJO', NULL, 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-jose-salazar', 'jose.salazar', NULL, NULL, NULL, 'JOSE SALAZAR', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA NARIÑO', 'FIJO', NULL, 'sup-jose-salazar', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-julian-marin', 'julian.marin', NULL, NULL, NULL, 'JULIAN MARIN', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA FORMATO QST', 'FIJO', NULL, 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-yoryani-valderrama', 'yoryani.valderrama', NULL, NULL, NULL, 'YORYANI VALDERRAMA', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA CALI SUR, VALLE & CAUCA', 'FIJO', NULL, 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-zona-medellin', 'zona.medellin', NULL, NULL, NULL, 'ZONA MEDELLIN', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA ANTIOQUIA & MEDELLÍN', 'FIJO', NULL, 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-zona-neiva', 'zona.neiva', NULL, NULL, NULL, 'ZONA NEIVA', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA HUILA & CAQUETÁ', 'FIJO', NULL, 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-sup-zona-yopal', 'zona.yopal', NULL, NULL, NULL, 'ZONA YOPAL', 'SUPERVISOR', 'LÍDER REGIONAL DE OPERACIONES', 'ZONA CASANARE & YOPAL', 'FIJO', NULL, 'sup-zona-yopal', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-1', 'n10', NULL, NULL, 'N10', 'N10-Carpa Quest Medellin-CC DEMODA Outle', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-1', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-2', 'q003', NULL, NULL, 'Q003', 'Q003 - Cali - Calle 23', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-2', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-3', 'q007', NULL, NULL, 'Q007', 'Q007 - Tulua - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-3', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-4', 'q008', NULL, NULL, 'Q008', 'Q008 - Cali - Alameda', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-4', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-5', 'q014', NULL, NULL, 'Q014', 'Q014 - Tulua - Cc Herradura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-5', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-6', 'q016', NULL, NULL, 'Q016', 'Q016 - Cali - Cc Palmetto', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-6', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-7', 'q018', NULL, NULL, 'Q018', 'Q018 - Cali - Cc Jardin Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-7', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-8', 'q021', NULL, NULL, 'Q021', 'Q021 - Cali - Cc Chipichape', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-8', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-9', 'q023', NULL, NULL, 'Q023', 'Q023 - Barranquilla - Cc Portal', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-9', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-10', 'q027', NULL, NULL, 'Q027', 'Q027 - Cucuta - Cc Ventura Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-10', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-11', 'q028', NULL, NULL, 'Q028', 'Q028 - Cali - Centro Calle 13', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-11', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-12', 'q029', NULL, NULL, 'Q029', 'Q029 - Cali - Cc Unico 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-12', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-13', 'q030', NULL, NULL, 'Q030', 'Q030 - Popayan - Cc Campanario', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-13', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-14', 'q031', NULL, NULL, 'Q031', 'Q031 - Cali - Centro 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-14', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-15', 'q033', NULL, NULL, 'Q033', 'Q033 - Cartagena - Cc Caribe Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-15', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-16', 'q035', NULL, NULL, 'Q035', 'Q035 - Barranquilla - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-16', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-17', 'q038', NULL, NULL, 'Q038', 'Q038 - Pereira - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-17', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-18', 'q039', NULL, NULL, 'Q039', 'Q039 - Cali - Cc Unico 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-18', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-19', 'q040', NULL, NULL, 'Q040', 'Q040 - Cali - Cc Unicentro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-19', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-20', 'q041', NULL, NULL, 'Q041', 'Q041 - Cali - Cc Calima', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-20', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-21', 'q044', NULL, NULL, 'Q044', 'Q044 - Popayan - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-21', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-22', 'q045', NULL, NULL, 'Q045', 'Q045 - Pasto - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-22', 'sup-jose-salazar', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-23', 'q046', NULL, NULL, 'Q046', 'Q046 - Cucuta - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-23', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-24', 'q049', NULL, NULL, 'Q049', 'Q049 - Dosquebradas - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-24', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-25', 'q053', NULL, NULL, 'Q053', 'Q053 - Neiva - Cc San Pedro Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-25', 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-26', 'q054', NULL, NULL, 'Q054', 'Q054 - Sincelejo - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-26', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-27', 'q056', NULL, NULL, 'Q056', 'Q056 - Pitalito - Cc San Antonio', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-27', 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-28', 'q057', NULL, NULL, 'Q057', 'Q057 - Pasto - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-28', 'sup-jose-salazar', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-29', 'q058', NULL, NULL, 'Q058', 'Q058 - Pereira - Cc Victoria Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-29', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-30', 'q061', NULL, NULL, 'Q061', 'Q061 - Armenia - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-30', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-31', 'q062', NULL, NULL, 'Q062', 'Q062 - Monteria - Cc Alamedas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-31', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-32', 'q068', NULL, NULL, 'Q068', 'Q068 - Cartagena - Cc Outlet del Bosque', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-32', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-33', 'q069', NULL, NULL, 'Q069', 'Q069 - Ibague - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-33', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-34', 'q071', NULL, NULL, 'Q071', 'Q071 - Neiva - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-34', 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-35', 'q073', NULL, NULL, 'Q073', 'Q073 - Yumbo - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-35', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-36', 'q074', NULL, NULL, 'Q074', 'Q074 - Villavicencio - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-36', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-37', 'q076', NULL, NULL, 'Q076', 'Q076 - Medellin - Cc Florida', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-37', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-38', 'q077', NULL, NULL, 'Q077', 'Q077 - Florencia - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-38', 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-39', 'q078', NULL, NULL, 'Q078', 'Q078 - Soledad - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-39', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-40', 'q080', NULL, NULL, 'Q080', 'Q080 - Valledupar - Cc Mayales', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-40', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-41', 'q083', NULL, NULL, 'Q083', 'Q083 - Yopal - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-41', 'sup-zona-yopal', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-42', 'q084', NULL, NULL, 'Q084', 'Q084 - Santa Marta - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-42', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-43', 'q085', NULL, NULL, 'Q085', 'Q085 - Ibague - Cc La Estacion', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-43', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-44', 'q086', NULL, NULL, 'Q086', 'Q086 - Villavicencio - Cc Viva', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-44', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-45', 'q087', NULL, NULL, 'Q087', 'Q087 - Palmira - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-45', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-46', 'q088', NULL, NULL, 'Q088', 'Q088 - Palmira - Cc Llanogrande', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-46', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-47', 'q089', NULL, NULL, 'Q089', 'Q089 - Palmira - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-47', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-48', 'q090', NULL, NULL, 'Q090', 'Q090 - Ipiales - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-48', 'sup-jose-salazar', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-49', 'q091', NULL, NULL, 'Q091', 'Q091 - Armenia - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-49', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-50', 'q092', NULL, NULL, 'Q092', 'Q092 - Cartagena - Cc San Fernando', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-50', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-51', 'q094', NULL, NULL, 'Q094', 'Q094 - Medellin - Cc Aventura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-51', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-52', 'q097', NULL, NULL, 'Q097', 'Q097 - Cartago - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-52', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-53', 'q102', NULL, NULL, 'Q102', 'Q102 - Valledupar - Cc Guatapuri', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-53', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-54', 'q105', NULL, NULL, 'Q105', 'Q105 - Pereira - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-54', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-55', 'q106', NULL, NULL, 'Q106', 'Q106 - Soledad - Cc Nuestro Atlantico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-55', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-56', 'q107', NULL, NULL, 'Q107', 'Q107 - Monteria - Cc Nuestro Monteria', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-56', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-57', 'q109', NULL, NULL, 'Q109', 'Q109 - Cartagena - Cc La Castellana', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-57', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-58', 'q112', NULL, NULL, 'Q112', 'Q112 - Medellin - Cc Molinos Medellin', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-58', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-59', 'q113', NULL, NULL, 'Q113', 'Q113 - Envigado - Cc Viva Local-221', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-59', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-60', 'q115', NULL, NULL, 'Q115', 'Q115 - Cucuta - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-60', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-61', 'q116', NULL, NULL, 'Q116', 'Q116 - Cartago - Cc Nuestro Cartago', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-61', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-62', 'q117', NULL, NULL, 'Q117', 'Q117 - Neiva - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-62', 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-63', 'q118', NULL, NULL, 'Q118', 'Q118 - Sincelejo - Cc Guacari', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-63', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-64', 'q120', NULL, NULL, 'Q120', 'Q120 - Cali - Plaza Q', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-64', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-65', 'q122', NULL, NULL, 'Q122', 'Q122 - Tulua - Centro Calle 27', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-65', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-66', 'q124', NULL, NULL, 'Q124', 'Q124 - Bogotáá - Cc Nuestro Bogotáá', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-66', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-67', 'q125', NULL, NULL, 'Q125', 'Q125 - Bello - Cc Plaza Fabricato', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-67', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-68', 'q126', NULL, NULL, 'Q126', 'Q126 - Ipiales - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-68', 'sup-jose-salazar', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-69', 'q127', NULL, NULL, 'Q127', 'Q127 - Sabaneta - CC Mayorca', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-69', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-70', 'q128', NULL, NULL, 'Q128', 'Q128 - Barranquilla - CC Parque Alegra', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-70', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-71', 'q129', NULL, NULL, 'Q129', 'Q129 - Bogotáá - CC Plaza de las Américas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-71', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-72', 'q131', NULL, NULL, 'Q131', 'Q131 - Cúcuta - CC Jardin Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-72', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-73', 'q132', NULL, NULL, 'Q132', 'Q132 - Valledupar - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-73', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-74', 'q133', NULL, NULL, 'Q133', 'Q133 - Popayán - CC Terra Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-74', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-75', 'q134', NULL, NULL, 'Q134', 'Q134 - Cali - CC Cosmocentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-75', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-76', 'q135', NULL, NULL, 'Q135', 'Q135 - Pasto - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-76', 'sup-jose-salazar', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-77', 'q136', NULL, NULL, 'Q136', 'Q136 - Yopal - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-77', 'sup-zona-yopal', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-78', 'q138', NULL, NULL, 'Q138', 'Q138 - Manizales - CC Fundadores', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-78', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-79', 'q139', NULL, NULL, 'Q139', 'Q139 - Armenia - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-79', 'sup-andres-osorio', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-80', 'q140', NULL, NULL, 'Q140', 'Q140 - Cartagena - CC Mall Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-80', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-81', 'q143', NULL, NULL, 'Q143', 'Q143 - Sabaneta - CC Mayorca Etapa 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-81', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-82', 'q144', NULL, NULL, 'Q144', 'Q144 - Popayán - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-82', 'sup-yoryani-valderrama', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-83', 'q145', NULL, NULL, 'Q145', 'Q145 - Neiva - CC Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-83', 'sup-zona-neiva', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-84', 'q146', NULL, NULL, 'Q146', 'Q146 - Palmira - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-84', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-85', 'q147', NULL, NULL, 'Q147', 'Q147 - Cali - Mall Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-85', 'sup-anyela-gonzalez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-86', 'q148', NULL, NULL, 'Q148', 'Q148 - Medellín - Carabobo Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-86', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-87', 'q149', NULL, NULL, 'Q149', 'Q149 - Medellín - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-87', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-88', 'q152', NULL, NULL, 'Q152', 'Q152 - Rionegro - CC San Nicolás', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-88', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-89', 'q153', NULL, NULL, 'Q153', 'Q153 - Palmira - CC Llanogrande 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-89', 'sup-alexander-lopez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-90', 'q154', NULL, NULL, 'Q154', 'Q154 - Santa Marta - CC Buenavista', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-90', 'sup-carlos-correa', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-91', 'q155', NULL, NULL, 'Q155', 'Q155 - Bogotáá - CC Outlet las Américas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-91', 'sup-andrea-perez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-92', 'q156', NULL, NULL, 'Q156', 'Q156 - Medellín - CC Santa Fe', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-92', 'sup-zona-medellin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-93', 'q157', NULL, NULL, 'Q157', 'Q157 - Riohacha - CC Viva Wajira', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-93', 'sup-fabian-sanchez', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-94', 'qst501', NULL, NULL, 'QST501', 'QST501 - Cali - Plaza Q', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-94', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-95', 'qst502', NULL, NULL, 'QST502', 'QST502 - Cali - CC Único 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-95', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-96', 'qst503', NULL, NULL, 'QST503', 'QST503 - Medellín - CC Florida', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-96', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-97', 'qst504', NULL, NULL, 'QST504', 'QST504 - Cali - CC Jardín Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-97', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-98', 'qst505', NULL, NULL, 'QST505', 'QST505 - Tuluá - CC La Herradura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-98', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-99', 'qst506', NULL, NULL, 'QST506', 'QST506 - Palmira - CC Llanogrande', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-99', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-100', 'qst508', NULL, NULL, 'QST508', 'QST508 - Medellín - CC Mayorca', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-100', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-101', 'qst509', NULL, NULL, 'QST509', 'QST509 - Cúcuta - CC Jardín Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-101', 'sup-julian-marin', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
