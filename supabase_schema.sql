-- ====================================================================
-- CONTROL DE TURNOS Y CONCILIACIÓN BIOMÉTRICA (PDV)
-- ESQUEMA DE BASE DE DATOS Y DATOS MAESTROS PARA SUPABASE (POSTGRESQL)
-- 15 ZONAS REDISTRIBUIDAS Y TIENDAS ASIGNADAS (CLAVE AUDITOR: 0814)
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS supplementary_justifications CASCADE;
DROP TABLE IF EXISTS punch_records CASCADE;
DROP TABLE IF EXISTS punch_batches CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS pdvs CASCADE;
DROP TABLE IF EXISTS supervisors CASCADE;
DROP TABLE IF EXISTS app_config CASCADE;

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
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    document_id TEXT,
    code TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'EMPLOYEE',
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

CREATE INDEX IF NOT EXISTS idx_schedules_week ON schedules (week_start);
CREATE INDEX IF NOT EXISTS idx_schedules_pdv ON schedules (pdv_id);
CREATE INDEX IF NOT EXISTS idx_permissions_status ON permissions (status);
CREATE INDEX IF NOT EXISTS idx_punch_records_doc ON punch_records (document_id);
CREATE INDEX IF NOT EXISTS idx_punch_records_date ON punch_records (entry_date);

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

-- Config
INSERT INTO app_config (id, lunch_duration_hours, lunch_cutoff_time, lunch_min_shift_duration, day_start_time, night_start_time, weekly_max_standard_hours, max_sundays_per_month, late_tolerance_minutes, early_exit_tolerance_minutes, maintenance_approval_email)
VALUES ('default', 1.5, '12:30', 6.0, '06:00', '21:00', 42, 2, 10, 10, 'mantenimiento.obras@quest.com.co')
ON CONFLICT (id) DO UPDATE SET 
  weekly_max_standard_hours = EXCLUDED.weekly_max_standard_hours,
  maintenance_approval_email = EXCLUDED.maintenance_approval_email;

-- 15 Supervisores
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

-- PDVs
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-1', 'N10', 'N10-Carpa Quest Medellin-CC DEMODA Outle', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-2', 'Q003', 'Q003 - Cali - Calle 23', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-3', 'Q007', 'Q007 - Tulua - Centro', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-4', 'Q008', 'Q008 - Cali - Alameda', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-5', 'Q014', 'Q014 - Tulua - Cc Herradura', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-6', 'Q016', 'Q016 - Cali - Cc Palmetto', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-7', 'Q018', 'Q018 - Cali - Cc Jardin Plaza', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-8', 'Q021', 'Q021 - Cali - Cc Chipichape', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-9', 'Q023', 'Q023 - Barranquilla - Cc Portal', 'Barranquilla', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-10', 'Q027', 'Q027 - Cucuta - Cc Ventura Plaza', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-11', 'Q028', 'Q028 - Cali - Centro Calle 13', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-12', 'Q029', 'Q029 - Cali - Cc Unico 1', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-13', 'Q030', 'Q030 - Popayan - Cc Campanario', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-14', 'Q031', 'Q031 - Cali - Centro 1', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-15', 'Q033', 'Q033 - Cartagena - Cc Caribe Plaza', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-16', 'Q035', 'Q035 - Barranquilla - Cc Unico', 'Barranquilla', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-17', 'Q038', 'Q038 - Pereira - Cc Unicentro', 'Pereira', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-18', 'Q039', 'Q039 - Cali - Cc Unico 2', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-19', 'Q040', 'Q040 - Cali - Cc Unicentro 2', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-20', 'Q041', 'Q041 - Cali - Cc Calima', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-21', 'Q044', 'Q044 - Popayan - Centro', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-22', 'Q045', 'Q045 - Pasto - Cc Unicentro', 'Pasto', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-23', 'Q046', 'Q046 - Cucuta - Centro 2', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-24', 'Q049', 'Q049 - Dosquebradas - Cc Unico', 'Dosquebradas', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-25', 'Q053', 'Q053 - Neiva - Cc San Pedro Plaza', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-26', 'Q054', 'Q054 - Sincelejo - Centro', 'Sincelejo', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-27', 'Q056', 'Q056 - Pitalito - Cc San Antonio', 'Pitalito', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-28', 'Q057', 'Q057 - Pasto - Cc Unico', 'Pasto', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-29', 'Q058', 'Q058 - Pereira - Cc Victoria Plaza', 'Pereira', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-30', 'Q061', 'Q061 - Armenia - Cc Unicentro', 'Armenia', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-31', 'Q062', 'Q062 - Monteria - Cc Alamedas', 'Montería', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-32', 'Q068', 'Q068 - Cartagena - Cc Outlet del Bosque', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-33', 'Q069', 'Q069 - Ibague - Centro', 'Ibagué', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-34', 'Q071', 'Q071 - Neiva - Centro', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-35', 'Q073', 'Q073 - Yumbo - Cc Unico', 'Yumbo', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-36', 'Q074', 'Q074 - Villavicencio - Cc Unico', 'Villavicencio', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-37', 'Q076', 'Q076 - Medellin - Cc Florida', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-38', 'Q077', 'Q077 - Florencia - Cc Gran Plaza', 'Florencia', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-39', 'Q078', 'Q078 - Soledad - Cc Gran Plaza', 'Soledad', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-40', 'Q080', 'Q080 - Valledupar - Cc Mayales', 'Valledupar', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-41', 'Q083', 'Q083 - Yopal - Cc Unicentro', 'Yopal', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-42', 'Q084', 'Q084 - Santa Marta - Centro', 'Santa Marta', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-43', 'Q085', 'Q085 - Ibague - Cc La Estacion', 'Ibagué', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-44', 'Q086', 'Q086 - Villavicencio - Cc Viva', 'Villavicencio', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-45', 'Q087', 'Q087 - Palmira - Centro', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-46', 'Q088', 'Q088 - Palmira - Cc Llanogrande', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-47', 'Q089', 'Q089 - Palmira - Cc Unicentro', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-48', 'Q090', 'Q090 - Ipiales - Cc Gran Plaza', 'Ipiales', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-49', 'Q091', 'Q091 - Armenia - Centro', 'Armenia', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-50', 'Q092', 'Q092 - Cartagena - Cc San Fernando', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-51', 'Q094', 'Q094 - Medellin - Cc Aventura', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-52', 'Q097', 'Q097 - Cartago - Centro', 'Cartago', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-53', 'Q102', 'Q102 - Valledupar - Cc Guatapuri', 'Valledupar', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-54', 'Q105', 'Q105 - Pereira - Centro', 'Pereira', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-55', 'Q106', 'Q106 - Soledad - Cc Nuestro Atlantico', 'Soledad', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-56', 'Q107', 'Q107 - Monteria - Cc Nuestro Monteria', 'Montería', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-57', 'Q109', 'Q109 - Cartagena - Cc La Castellana', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-58', 'Q112', 'Q112 - Medellin - Cc Molinos Medellin', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-59', 'Q113', 'Q113 - Envigado - Cc Viva Local-221', 'Envigado', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-60', 'Q115', 'Q115 - Cucuta - Centro', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-61', 'Q116', 'Q116 - Cartago - Cc Nuestro Cartago', 'Cartago', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-62', 'Q117', 'Q117 - Neiva - Cc Unico', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-63', 'Q118', 'Q118 - Sincelejo - Cc Guacari', 'Sincelejo', 'sup-costa-sur', 'ZONA COSTA SUR', 'sup-costa-sur', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-64', 'Q120', 'Q120 - Cali - Plaza Q', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-65', 'Q122', 'Q122 - Tulua - Centro Calle 27', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-66', 'Q124', 'Q124 - Bogotáá - Cc Nuestro Bogotáá', 'Bogotá', 'sup-centro-2', 'ZONA CENTRO (LIDER 2)', 'sup-centro-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-67', 'Q125', 'Q125 - Bello - Cc Plaza Fabricato', 'Bello', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-68', 'Q126', 'Q126 - Ipiales - Centro', 'Ipiales', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-69', 'Q127', 'Q127 - Sabaneta - CC Mayorca', 'Sabaneta', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-70', 'Q128', 'Q128 - Barranquilla - CC Parque Alegra', 'Barranquilla', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-71', 'Q129', 'Q129 - Bogotáá - CC Plaza de las Américas', 'Bogotá', 'sup-centro-2', 'ZONA CENTRO (LIDER 2)', 'sup-centro-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-72', 'Q131', 'Q131 - Cúcuta - CC Jardin Plaza', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-73', 'Q133', 'Q133 - Popayán - CC Terra Plaza', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-74', 'Q134', 'Q134 - Cali - CC Cosmocentro', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-75', 'Q135', 'Q135 - Pasto - Centro', 'Pasto', 'sup-narino', 'ZONA NARIÑO', 'sup-narino', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-76', 'Q136', 'Q136 - Yopal - Centro', 'Yopal', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-77', 'Q138', 'Q138 - Manizales - CC Fundadores', 'Manizales', 'sup-eje-cafetero-1', 'ZONA EJE CAFETERO 1', 'sup-eje-cafetero-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-78', 'Q139', 'Q139 - Armenia - Centro 2', 'Armenia', 'sup-eje-cafetero-2', 'ZONA EJE CAFETERO 2', 'sup-eje-cafetero-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-79', 'Q140', 'Q140 - Cartagena - CC Mall Plaza', 'Cartagena', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-80', 'Q143', 'Q143 - Sabaneta - CC Mayorca Etapa 1', 'Sabaneta', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-81', 'Q144', 'Q144 - Popayán - Centro 2', 'Popayán', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-82', 'Q145', 'Q145 - Neiva - CC Unicentro', 'Neiva', 'sup-tolhuca', 'ZONA TOLHUCA', 'sup-tolhuca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-83', 'Q146', 'Q146 - Palmira - Centro 2', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-84', 'Q147', 'Q147 - Cali - Mall Plaza', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-85', 'Q148', 'Q148 - Medellín - Carabobo Centro', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-86', 'Q149', 'Q149 - Medellín - Centro', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-87', 'Q152', 'Q152 - Rionegro - CC San Nicolás', 'Rionegro', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-88', 'Q153', 'Q153 - Palmira - CC Llanogrande 2', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-89', 'Q154', 'Q154 - Santa Marta - CC Buenavista', 'Santa Marta', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-90', 'Q155', 'Q155 - Bogotáá - CC Outlet las Américas', 'Bogotá', 'sup-centro-2', 'ZONA CENTRO (LIDER 2)', 'sup-centro-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-91', 'Q156', 'Q156 - Medellín - CC Santa Fe', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-92', 'Q157', 'Q157 - Riohacha - CC Viva Wajira', 'Riohacha', 'sup-costa-norte', 'ZONA COSTA NORTE', 'sup-costa-norte', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-93', 'QST501', 'QST501 - Cali - Plaza Q', 'Cali', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-94', 'QST502', 'QST502 - Cali - CC Único 2', 'Cali', 'sup-valle-sur-cauca', 'ZONA VALLE SUR Y CAUCA', 'sup-valle-sur-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-95', 'QST503', 'QST503 - Medellín - CC Florida', 'Medellín', 'sup-antioquia-casanare-2', 'ZONA ANTIOQUIA Y CASANARE (LIDER 2)', 'sup-antioquia-casanare-2', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-96', 'QST504', 'QST504 - Cali - CC Jardín Plaza', 'Cali', 'sup-cali-2-cauca', 'ZONA CALI 2 Y CAUCA', 'sup-cali-2-cauca', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-97', 'QST505', 'QST505 - Tuluá - CC La Herradura', 'Tuluá', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-98', 'QST506', 'QST506 - Palmira - CC Llanogrande', 'Palmira', 'sup-valle-centro', 'ZONA VALLE CENTRO', 'sup-valle-centro', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-99', 'QST508', 'QST508 - Medellín - CC Mayorca', 'Medellín', 'sup-antioquia-1', 'ZONA ANTIOQUIA (LIDER 1)', 'sup-antioquia-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-100', 'QST509', 'QST509 - Cúcuta - CC Jardín Plaza', 'Cúcuta', 'sup-santanderes', 'ZONA SANTANDERES', 'sup-santanderes', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-101', 'QST510', 'QST510 - YUMBO - CC UNICO', 'YUMBO', 'sup-cali-1', 'ZONA CALI 1', 'sup-cali-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;
INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour)
VALUES ('pdv-102', 'Q132', 'Q132 - Valledupar - Centro', 'Valledupar', 'sup-centro-1', 'ZONA CENTRO (LIDER 1)', 'sup-centro-1', '10:00', '20:30')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id, zone_name = EXCLUDED.zone_name, supervisor_id = EXCLUDED.supervisor_id;

-- Usuarios Principales y Administradores de PDV
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
VALUES ('user-pdv-1', 'n10', '101888', NULL, 'N10', 'N10-Carpa Quest Medellin-CC DEMODA Outle', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-1', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-2', 'q003', '101888', NULL, 'Q003', 'Q003 - Cali - Calle 23', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-2', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-3', 'q007', '101888', NULL, 'Q007', 'Q007 - Tulua - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-3', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-4', 'q008', '101888', NULL, 'Q008', 'Q008 - Cali - Alameda', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-4', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-5', 'q014', '101888', NULL, 'Q014', 'Q014 - Tulua - Cc Herradura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-5', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-6', 'q016', '101888', NULL, 'Q016', 'Q016 - Cali - Cc Palmetto', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-6', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-7', 'q018', '101888', NULL, 'Q018', 'Q018 - Cali - Cc Jardin Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-7', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-8', 'q021', '101888', NULL, 'Q021', 'Q021 - Cali - Cc Chipichape', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-8', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-9', 'q023', '101888', NULL, 'Q023', 'Q023 - Barranquilla - Cc Portal', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-9', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-10', 'q027', '101888', NULL, 'Q027', 'Q027 - Cucuta - Cc Ventura Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-10', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-11', 'q028', '101888', NULL, 'Q028', 'Q028 - Cali - Centro Calle 13', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-11', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-12', 'q029', '101888', NULL, 'Q029', 'Q029 - Cali - Cc Unico 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-12', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-13', 'q030', '101888', NULL, 'Q030', 'Q030 - Popayan - Cc Campanario', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-13', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-14', 'q031', '101888', NULL, 'Q031', 'Q031 - Cali - Centro 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-14', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-15', 'q033', '101888', NULL, 'Q033', 'Q033 - Cartagena - Cc Caribe Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-15', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-16', 'q035', '101888', NULL, 'Q035', 'Q035 - Barranquilla - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-16', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-17', 'q038', '101888', NULL, 'Q038', 'Q038 - Pereira - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-17', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-18', 'q039', '101888', NULL, 'Q039', 'Q039 - Cali - Cc Unico 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-18', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-19', 'q040', '101888', NULL, 'Q040', 'Q040 - Cali - Cc Unicentro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-19', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-20', 'q041', '101888', NULL, 'Q041', 'Q041 - Cali - Cc Calima', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-20', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-21', 'q044', '101888', NULL, 'Q044', 'Q044 - Popayan - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-21', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-22', 'q045', '101888', NULL, 'Q045', 'Q045 - Pasto - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-22', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-23', 'q046', '101888', NULL, 'Q046', 'Q046 - Cucuta - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-23', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-24', 'q049', '101888', NULL, 'Q049', 'Q049 - Dosquebradas - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-24', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-25', 'q053', '101888', NULL, 'Q053', 'Q053 - Neiva - Cc San Pedro Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-25', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-26', 'q054', '101888', NULL, 'Q054', 'Q054 - Sincelejo - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-26', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-27', 'q056', '101888', NULL, 'Q056', 'Q056 - Pitalito - Cc San Antonio', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-27', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-28', 'q057', '101888', NULL, 'Q057', 'Q057 - Pasto - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-28', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-29', 'q058', '101888', NULL, 'Q058', 'Q058 - Pereira - Cc Victoria Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-29', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-30', 'q061', '101888', NULL, 'Q061', 'Q061 - Armenia - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-30', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-31', 'q062', '101888', NULL, 'Q062', 'Q062 - Monteria - Cc Alamedas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-31', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-32', 'q068', '101888', NULL, 'Q068', 'Q068 - Cartagena - Cc Outlet del Bosque', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-32', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-33', 'q069', '101888', NULL, 'Q069', 'Q069 - Ibague - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-33', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-34', 'q071', '101888', NULL, 'Q071', 'Q071 - Neiva - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-34', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-35', 'q073', '101888', NULL, 'Q073', 'Q073 - Yumbo - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-35', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-36', 'q074', '101888', NULL, 'Q074', 'Q074 - Villavicencio - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-36', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-37', 'q076', '101888', NULL, 'Q076', 'Q076 - Medellin - Cc Florida', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-37', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-38', 'q077', '101888', NULL, 'Q077', 'Q077 - Florencia - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-38', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-39', 'q078', '101888', NULL, 'Q078', 'Q078 - Soledad - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-39', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-40', 'q080', '101888', NULL, 'Q080', 'Q080 - Valledupar - Cc Mayales', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-40', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-41', 'q083', '101888', NULL, 'Q083', 'Q083 - Yopal - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-41', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-42', 'q084', '101888', NULL, 'Q084', 'Q084 - Santa Marta - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-42', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-43', 'q085', '101888', NULL, 'Q085', 'Q085 - Ibague - Cc La Estacion', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-43', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-44', 'q086', '101888', NULL, 'Q086', 'Q086 - Villavicencio - Cc Viva', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-44', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-45', 'q087', '101888', NULL, 'Q087', 'Q087 - Palmira - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-45', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-46', 'q088', '101888', NULL, 'Q088', 'Q088 - Palmira - Cc Llanogrande', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-46', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-47', 'q089', '101888', NULL, 'Q089', 'Q089 - Palmira - Cc Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-47', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-48', 'q090', '101888', NULL, 'Q090', 'Q090 - Ipiales - Cc Gran Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-48', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-49', 'q091', '101888', NULL, 'Q091', 'Q091 - Armenia - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-49', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-50', 'q092', '101888', NULL, 'Q092', 'Q092 - Cartagena - Cc San Fernando', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-50', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-51', 'q094', '101888', NULL, 'Q094', 'Q094 - Medellin - Cc Aventura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-51', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-52', 'q097', '101888', NULL, 'Q097', 'Q097 - Cartago - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-52', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-53', 'q102', '101888', NULL, 'Q102', 'Q102 - Valledupar - Cc Guatapuri', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-53', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-54', 'q105', '101888', NULL, 'Q105', 'Q105 - Pereira - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-54', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-55', 'q106', '101888', NULL, 'Q106', 'Q106 - Soledad - Cc Nuestro Atlantico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-55', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-56', 'q107', '101888', NULL, 'Q107', 'Q107 - Monteria - Cc Nuestro Monteria', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-56', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-57', 'q109', '101888', NULL, 'Q109', 'Q109 - Cartagena - Cc La Castellana', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-57', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-58', 'q112', '101888', NULL, 'Q112', 'Q112 - Medellin - Cc Molinos Medellin', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-58', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-59', 'q113', '101888', NULL, 'Q113', 'Q113 - Envigado - Cc Viva Local-221', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-59', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-60', 'q115', '101888', NULL, 'Q115', 'Q115 - Cucuta - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-60', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-61', 'q116', '101888', NULL, 'Q116', 'Q116 - Cartago - Cc Nuestro Cartago', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-61', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-62', 'q117', '101888', NULL, 'Q117', 'Q117 - Neiva - Cc Unico', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-62', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-63', 'q118', '101888', NULL, 'Q118', 'Q118 - Sincelejo - Cc Guacari', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-63', 'sup-costa-sur', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-64', 'q120', '101888', NULL, 'Q120', 'Q120 - Cali - Plaza Q', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-64', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-65', 'q122', '101888', NULL, 'Q122', 'Q122 - Tulua - Centro Calle 27', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-65', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-66', 'q124', '101888', NULL, 'Q124', 'Q124 - Bogotáá - Cc Nuestro Bogotáá', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-66', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-67', 'q125', '101888', NULL, 'Q125', 'Q125 - Bello - Cc Plaza Fabricato', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-67', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-68', 'q126', '101888', NULL, 'Q126', 'Q126 - Ipiales - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-68', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-69', 'q127', '101888', NULL, 'Q127', 'Q127 - Sabaneta - CC Mayorca', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-69', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-70', 'q128', '101888', NULL, 'Q128', 'Q128 - Barranquilla - CC Parque Alegra', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-70', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-71', 'q129', '101888', NULL, 'Q129', 'Q129 - Bogotáá - CC Plaza de las Américas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-71', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-72', 'q131', '101888', NULL, 'Q131', 'Q131 - Cúcuta - CC Jardin Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-72', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-73', 'q133', '101888', NULL, 'Q133', 'Q133 - Popayán - CC Terra Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-73', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-74', 'q134', '101888', NULL, 'Q134', 'Q134 - Cali - CC Cosmocentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-74', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-75', 'q135', '101888', NULL, 'Q135', 'Q135 - Pasto - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-75', 'sup-narino', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-76', 'q136', '101888', NULL, 'Q136', 'Q136 - Yopal - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-76', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-77', 'q138', '101888', NULL, 'Q138', 'Q138 - Manizales - CC Fundadores', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-77', 'sup-eje-cafetero-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-78', 'q139', '101888', NULL, 'Q139', 'Q139 - Armenia - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-78', 'sup-eje-cafetero-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-79', 'q140', '101888', NULL, 'Q140', 'Q140 - Cartagena - CC Mall Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-79', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-80', 'q143', '101888', NULL, 'Q143', 'Q143 - Sabaneta - CC Mayorca Etapa 1', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-80', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-81', 'q144', '101888', NULL, 'Q144', 'Q144 - Popayán - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-81', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-82', 'q145', '101888', NULL, 'Q145', 'Q145 - Neiva - CC Unicentro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-82', 'sup-tolhuca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-83', 'q146', '101888', NULL, 'Q146', 'Q146 - Palmira - Centro 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-83', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-84', 'q147', '101888', NULL, 'Q147', 'Q147 - Cali - Mall Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-84', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-85', 'q148', '101888', NULL, 'Q148', 'Q148 - Medellín - Carabobo Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-85', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-86', 'q149', '101888', NULL, 'Q149', 'Q149 - Medellín - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-86', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-87', 'q152', '101888', NULL, 'Q152', 'Q152 - Rionegro - CC San Nicolás', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-87', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-88', 'q153', '101888', NULL, 'Q153', 'Q153 - Palmira - CC Llanogrande 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-88', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-89', 'q154', '101888', NULL, 'Q154', 'Q154 - Santa Marta - CC Buenavista', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-89', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-90', 'q155', '101888', NULL, 'Q155', 'Q155 - Bogotáá - CC Outlet las Américas', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-90', 'sup-centro-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-91', 'q156', '101888', NULL, 'Q156', 'Q156 - Medellín - CC Santa Fe', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-91', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-92', 'q157', '101888', NULL, 'Q157', 'Q157 - Riohacha - CC Viva Wajira', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-92', 'sup-costa-norte', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-93', 'qst501', '101888', NULL, 'QST501', 'QST501 - Cali - Plaza Q', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-93', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-94', 'qst502', '101888', NULL, 'QST502', 'QST502 - Cali - CC Único 2', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-94', 'sup-valle-sur-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-95', 'qst503', '101888', NULL, 'QST503', 'QST503 - Medellín - CC Florida', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-95', 'sup-antioquia-casanare-2', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-96', 'qst504', '101888', NULL, 'QST504', 'QST504 - Cali - CC Jardín Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-96', 'sup-cali-2-cauca', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-97', 'qst505', '101888', NULL, 'QST505', 'QST505 - Tuluá - CC La Herradura', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-97', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-98', 'qst506', '101888', NULL, 'QST506', 'QST506 - Palmira - CC Llanogrande', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-98', 'sup-valle-centro', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-99', 'qst508', '101888', NULL, 'QST508', 'QST508 - Medellín - CC Mayorca', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-99', 'sup-antioquia-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-100', 'qst509', '101888', NULL, 'QST509', 'QST509 - Cúcuta - CC Jardín Plaza', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-100', 'sup-santanderes', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-101', 'qst510', '101888', NULL, 'QST510', 'QST510 - YUMBO - CC UNICO', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-101', 'sup-cali-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES ('user-pdv-102', 'q132', '101888', NULL, 'Q132', 'Q132 - Valledupar - Centro', 'PDV', 'ADMINISTRADOR DE TIENDA', 'VENTAS RETAIL', 'FIJO', 'pdv-102', 'sup-centro-1', 42, true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id, password = EXCLUDED.password;
