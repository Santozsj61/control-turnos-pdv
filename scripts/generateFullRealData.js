import fs from 'fs';
import path from 'path';

// 1. Definición de los 12 Líderes Reales y sus Zonas
const realLeaders = [
  {
    id: "sup-alexander-lopez",
    name: "Alexander Lopez",
    code: "COD-VALLE-CENTRO",
    zoneName: "ZONA VALLE CENTRO & TULUÁ",
    email: "alexander.lopez@quest.com.co",
    documentId: "1018001"
  },
  {
    id: "sup-andrea-perez",
    name: "Andrea Pérez",
    code: "COD-CENTRO-ORIENTE",
    zoneName: "ZONA BOGOTÁ, IBAGUÉ & LLANOS",
    email: "andrea.perez@quest.com.co",
    documentId: "1018002"
  },
  {
    id: "sup-andres-osorio",
    name: "Andres Osorio",
    code: "COD-EJE-CAFETERO",
    zoneName: "ZONA EJE CAFETERO",
    email: "andres.osorio@quest.com.co",
    documentId: "1018003"
  },
  {
    id: "sup-anyela-gonzalez",
    name: "Anyela Gonzalez",
    code: "COD-CALI-1",
    zoneName: "ZONA CALI 1 & CENTRO",
    email: "anyela.gonzalez@quest.com.co",
    documentId: "1018004"
  },
  {
    id: "sup-carlos-correa",
    name: "Carlos Correa",
    code: "COD-COSTA-NORTE",
    zoneName: "ZONA COSTA & CARIBE",
    email: "carlos.correa@quest.com.co",
    documentId: "1018005"
  },
  {
    id: "sup-fabian-sanchez",
    name: "Fabian Sanchez",
    code: "COD-SANTANDERES",
    zoneName: "ZONA SANTANDERES & CESAR",
    email: "fabian.sanchez@quest.com.co",
    documentId: "1018006"
  },
  {
    id: "sup-jose-salazar",
    name: "Jose Salazar",
    code: "COD-NARINO",
    zoneName: "ZONA NARIÑO",
    email: "jose.salazar@quest.com.co",
    documentId: "1018007"
  },
  {
    id: "sup-julian-marin",
    name: "Julian Marin",
    code: "COD-QST",
    zoneName: "ZONA FORMATO QST",
    email: "julian.marin@quest.com.co",
    documentId: "1018008"
  },
  {
    id: "sup-yoryani-valderrama",
    name: "Yoryani Valderrama",
    code: "COD-CALI-SUR-CAUCA",
    zoneName: "ZONA CALI SUR, VALLE & CAUCA",
    email: "yoryani.valderrama@quest.com.co",
    documentId: "1018009"
  },
  {
    id: "sup-zona-medellin",
    name: "Zona Medellin",
    code: "COD-ANTIOQUIA",
    zoneName: "ZONA ANTIOQUIA & MEDELLÍN",
    email: "lider.medellin@quest.com.co",
    documentId: "1018010"
  },
  {
    id: "sup-zona-neiva",
    name: "Zona Neiva",
    code: "COD-TOLHUCA",
    zoneName: "ZONA HUILA & CAQUETÁ",
    email: "lider.neiva@quest.com.co",
    documentId: "1018011"
  },
  {
    id: "sup-zona-yopal",
    name: "Zona Yopal",
    code: "COD-CASANARE",
    zoneName: "ZONA CASANARE & YOPAL",
    email: "lider.yopal@quest.com.co",
    documentId: "1018012"
  }
];

// Helper para limpiar texto con problemas de tildes o codificación
function cleanText(txt) {
  if (!txt) return "";
  return txt
    .replace(/MEDELL\?N/g, "MEDELLÍN")
    .replace(/Medelln/g, "Medellín")
    .replace(/Bogot/g, "Bogotá")
    .replace(/Prez/g, "Pérez")
    .replace(/Nario/g, "Nariño")
    .trim();
}

// 2. Mapeo Oficial de los 101 PDVs extraídos de la Hoja Base del Excel Maestro
const rawPdvMapping = [
  { code: "N10", name: "N10-Carpa Quest Medellin-CC DEMODA Outle", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q003", name: "Q003 - Cali - Calle 23", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q007", name: "Q007 - Tulua - Centro", city: "Tuluá", leader: "Alexander Lopez" },
  { code: "Q008", name: "Q008 - Cali - Alameda", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q014", name: "Q014 - Tulua - Cc Herradura", city: "Tuluá", leader: "Alexander Lopez" },
  { code: "Q016", name: "Q016 - Cali - Cc Palmetto", city: "Cali", leader: "Yoryani Valderrama" },
  { code: "Q018", name: "Q018 - Cali - Cc Jardin Plaza", city: "Cali", leader: "Yoryani Valderrama" },
  { code: "Q021", name: "Q021 - Cali - Cc Chipichape", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q023", name: "Q023 - Barranquilla - Cc Portal", city: "Barranquilla", leader: "Carlos Correa" },
  { code: "Q027", name: "Q027 - Cucuta - Cc Ventura Plaza", city: "Cúcuta", leader: "Fabian Sanchez" },
  { code: "Q028", name: "Q028 - Cali - Centro Calle 13", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q029", name: "Q029 - Cali - Cc Unico 1", city: "Cali", leader: "Yoryani Valderrama" },
  { code: "Q030", name: "Q030 - Popayan - Cc Campanario", city: "Popayán", leader: "Yoryani Valderrama" },
  { code: "Q031", name: "Q031 - Cali - Centro 1", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q033", name: "Q033 - Cartagena - Cc Caribe Plaza", city: "Cartagena", leader: "Carlos Correa" },
  { code: "Q035", name: "Q035 - Barranquilla - Cc Unico", city: "Barranquilla", leader: "Carlos Correa" },
  { code: "Q038", name: "Q038 - Pereira - Cc Unicentro", city: "Pereira", leader: "Andres Osorio" },
  { code: "Q039", name: "Q039 - Cali - Cc Unico 2", city: "Cali", leader: "Yoryani Valderrama" },
  { code: "Q040", name: "Q040 - Cali - Cc Unicentro 2", city: "Cali", leader: "Yoryani Valderrama" },
  { code: "Q041", name: "Q041 - Cali - Cc Calima", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q044", name: "Q044 - Popayan - Centro", city: "Popayán", leader: "Yoryani Valderrama" },
  { code: "Q045", name: "Q045 - Pasto - Cc Unicentro", city: "Pasto", leader: "Jose Salazar" },
  { code: "Q046", name: "Q046 - Cucuta - Centro 2", city: "Cúcuta", leader: "Fabian Sanchez" },
  { code: "Q049", name: "Q049 - Dosquebradas - Cc Unico", city: "Dosquebradas", leader: "Andres Osorio" },
  { code: "Q053", name: "Q053 - Neiva - Cc San Pedro Plaza", city: "Neiva", leader: "Zona Neiva" },
  { code: "Q054", name: "Q054 - Sincelejo - Centro", city: "Sincelejo", leader: "Carlos Correa" },
  { code: "Q056", name: "Q056 - Pitalito - Cc San Antonio", city: "Pitalito", leader: "Zona Neiva" },
  { code: "Q057", name: "Q057 - Pasto - Cc Unico", city: "Pasto", leader: "Jose Salazar" },
  { code: "Q058", name: "Q058 - Pereira - Cc Victoria Plaza", city: "Pereira", leader: "Andres Osorio" },
  { code: "Q061", name: "Q061 - Armenia - Cc Unicentro", city: "Armenia", leader: "Andres Osorio" },
  { code: "Q062", name: "Q062 - Monteria - Cc Alamedas", city: "Montería", leader: "Carlos Correa" },
  { code: "Q068", name: "Q068 - Cartagena - Cc Outlet del Bosque", city: "Cartagena", leader: "Carlos Correa" },
  { code: "Q069", name: "Q069 - Ibague - Centro", city: "Ibagué", leader: "Andrea Pérez" },
  { code: "Q071", name: "Q071 - Neiva - Centro", city: "Neiva", leader: "Zona Neiva" },
  { code: "Q073", name: "Q073 - Yumbo - Cc Unico", city: "Yumbo", leader: "Alexander Lopez" },
  { code: "Q074", name: "Q074 - Villavicencio - Cc Unico", city: "Villavicencio", leader: "Andrea Pérez" },
  { code: "Q076", name: "Q076 - Medellin - Cc Florida", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q077", name: "Q077 - Florencia - Cc Gran Plaza", city: "Florencia", leader: "Zona Neiva" },
  { code: "Q078", name: "Q078 - Soledad - Cc Gran Plaza", city: "Soledad", leader: "Carlos Correa" },
  { code: "Q080", name: "Q080 - Valledupar - Cc Mayales", city: "Valledupar", leader: "Fabian Sanchez" },
  { code: "Q083", name: "Q083 - Yopal - Cc Unicentro", city: "Yopal", leader: "Zona Yopal" },
  { code: "Q084", name: "Q084 - Santa Marta - Centro", city: "Santa Marta", leader: "Carlos Correa" },
  { code: "Q085", name: "Q085 - Ibague - Cc La Estacion", city: "Ibagué", leader: "Andrea Pérez" },
  { code: "Q086", name: "Q086 - Villavicencio - Cc Viva", city: "Villavicencio", leader: "Andrea Pérez" },
  { code: "Q087", name: "Q087 - Palmira - Centro", city: "Palmira", leader: "Alexander Lopez" },
  { code: "Q088", name: "Q088 - Palmira - Cc Llanogrande", city: "Palmira", leader: "Alexander Lopez" },
  { code: "Q089", name: "Q089 - Palmira - Cc Unicentro", city: "Palmira", leader: "Alexander Lopez" },
  { code: "Q090", name: "Q090 - Ipiales - Cc Gran Plaza", city: "Ipiales", leader: "Jose Salazar" },
  { code: "Q091", name: "Q091 - Armenia - Centro", city: "Armenia", leader: "Andres Osorio" },
  { code: "Q092", name: "Q092 - Cartagena - Cc San Fernando", city: "Cartagena", leader: "Carlos Correa" },
  { code: "Q094", name: "Q094 - Medellin - Cc Aventura", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q097", name: "Q097 - Cartago - Centro", city: "Cartago", leader: "Andres Osorio" },
  { code: "Q102", name: "Q102 - Valledupar - Cc Guatapuri", city: "Valledupar", leader: "Fabian Sanchez" },
  { code: "Q105", name: "Q105 - Pereira - Centro", city: "Pereira", leader: "Andres Osorio" },
  { code: "Q106", name: "Q106 - Soledad - Cc Nuestro Atlantico", city: "Soledad", leader: "Carlos Correa" },
  { code: "Q107", name: "Q107 - Monteria - Cc Nuestro Monteria", city: "Montería", leader: "Carlos Correa" },
  { code: "Q109", name: "Q109 - Cartagena - Cc La Castellana", city: "Cartagena", leader: "Carlos Correa" },
  { code: "Q112", name: "Q112 - Medellin - Cc Molinos Medellin", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q113", name: "Q113 - Envigado - Cc Viva Local-221", city: "Envigado", leader: "Zona Medellin" },
  { code: "Q115", name: "Q115 - Cucuta - Centro", city: "Cúcuta", leader: "Fabian Sanchez" },
  { code: "Q116", name: "Q116 - Cartago - Cc Nuestro Cartago", city: "Cartago", leader: "Andres Osorio" },
  { code: "Q117", name: "Q117 - Neiva - Cc Unico", city: "Neiva", leader: "Zona Neiva" },
  { code: "Q118", name: "Q118 - Sincelejo - Cc Guacari", city: "Sincelejo", leader: "Carlos Correa" },
  { code: "Q120", name: "Q120 - Cali - Plaza Q", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q122", name: "Q122 - Tulua - Centro Calle 27", city: "Tuluá", leader: "Alexander Lopez" },
  { code: "Q124", name: "Q124 - Bogotá - Cc Nuestro Bogotá", city: "Bogotá", leader: "Andrea Pérez" },
  { code: "Q125", name: "Q125 - Bello - Cc Plaza Fabricato", city: "Bello", leader: "Zona Medellin" },
  { code: "Q126", name: "Q126 - Ipiales - Centro", city: "Ipiales", leader: "Jose Salazar" },
  { code: "Q127", name: "Q127 - Sabaneta - CC Mayorca", city: "Sabaneta", leader: "Zona Medellin" },
  { code: "Q128", name: "Q128 - Barranquilla - CC Parque Alegra", city: "Barranquilla", leader: "Carlos Correa" },
  { code: "Q129", name: "Q129 - Bogotá - CC Plaza de las Américas", city: "Bogotá", leader: "Andrea Pérez" },
  { code: "Q131", name: "Q131 - Cúcuta - CC Jardin Plaza", city: "Cúcuta", leader: "Fabian Sanchez" },
  { code: "Q132", name: "Q132 - Valledupar - Centro", city: "Valledupar", leader: "Fabian Sanchez" },
  { code: "Q133", name: "Q133 - Popayán - CC Terra Plaza", city: "Popayán", leader: "Yoryani Valderrama" },
  { code: "Q134", name: "Q134 - Cali - CC Cosmocentro", city: "Cali", leader: "Yoryani Valderrama" },
  { code: "Q135", name: "Q135 - Pasto - Centro", city: "Pasto", leader: "Jose Salazar" },
  { code: "Q136", name: "Q136 - Yopal - Centro", city: "Yopal", leader: "Zona Yopal" },
  { code: "Q138", name: "Q138 - Manizales - CC Fundadores", city: "Manizales", leader: "Andres Osorio" },
  { code: "Q139", name: "Q139 - Armenia - Centro 2", city: "Armenia", leader: "Andres Osorio" },
  { code: "Q140", name: "Q140 - Cartagena - CC Mall Plaza", city: "Cartagena", leader: "Carlos Correa" },
  { code: "Q143", name: "Q143 - Sabaneta - CC Mayorca Etapa 1", city: "Sabaneta", leader: "Zona Medellin" },
  { code: "Q144", name: "Q144 - Popayán - Centro 2", city: "Popayán", leader: "Yoryani Valderrama" },
  { code: "Q145", name: "Q145 - Neiva - CC Unicentro", city: "Neiva", leader: "Zona Neiva" },
  { code: "Q146", name: "Q146 - Palmira - Centro 2", city: "Palmira", leader: "Alexander Lopez" },
  { code: "Q147", name: "Q147 - Cali - Mall Plaza", city: "Cali", leader: "Anyela Gonzalez" },
  { code: "Q148", name: "Q148 - Medellín - Carabobo Centro", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q149", name: "Q149 - Medellín - Centro", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q152", name: "Q152 - Rionegro - CC San Nicolás", city: "Rionegro", leader: "Zona Medellin" },
  { code: "Q153", name: "Q153 - Palmira - CC Llanogrande 2", city: "Palmira", leader: "Alexander Lopez" },
  { code: "Q154", name: "Q154 - Santa Marta - CC Buenavista", city: "Santa Marta", leader: "Carlos Correa" },
  { code: "Q155", name: "Q155 - Bogotá - CC Outlet las Américas", city: "Bogotá", leader: "Andrea Pérez" },
  { code: "Q156", name: "Q156 - Medellín - CC Santa Fe", city: "Medellín", leader: "Zona Medellin" },
  { code: "Q157", name: "Q157 - Riohacha - CC Viva Wajira", city: "Riohacha", leader: "Fabian Sanchez" },
  { code: "QST501", name: "QST501 - Cali - Plaza Q", city: "Cali", leader: "Julian Marin" },
  { code: "QST502", name: "QST502 - Cali - CC Único 2", city: "Cali", leader: "Julian Marin" },
  { code: "QST503", name: "QST503 - Medellín - CC Florida", city: "Medellín", leader: "Julian Marin" },
  { code: "QST504", name: "QST504 - Cali - CC Jardín Plaza", city: "Cali", leader: "Julian Marin" },
  { code: "QST505", name: "QST505 - Tuluá - CC La Herradura", city: "Tuluá", leader: "Julian Marin" },
  { code: "QST506", name: "QST506 - Palmira - CC Llanogrande", city: "Palmira", leader: "Julian Marin" },
  { code: "QST508", name: "QST508 - Medellín - CC Mayorca", city: "Medellín", leader: "Julian Marin" },
  { code: "QST509", name: "QST509 - Cúcuta - CC Jardín Plaza", city: "Cúcuta", leader: "Julian Marin" }
];

console.log(`Cargados ${rawPdvMapping.length} PDVs maestros.`);

// Asociar cada PDV con su líder y zona correspondiente
const leaderLookup = new Map();
realLeaders.forEach(l => {
  leaderLookup.set(l.name.toLowerCase().trim(), l);
});

const initialPDVs = rawPdvMapping.map((p, idx) => {
  const normLeader = p.leader.replace(/Prez/g, "Pérez").trim();
  const leaderObj = leaderLookup.get(normLeader.toLowerCase()) || realLeaders[0];

  return {
    id: `pdv-${idx + 1}`,
    code: p.code,
    name: cleanText(p.name),
    city: p.city,
    zoneId: leaderObj.id,
    zoneName: leaderObj.zoneName,
    supervisorId: leaderObj.id,
    openingHour: "10:00",
    closingHour: "20:30",
    allowedShifts: ["10:00-20:30", "10:00-18:00", "11:00-19:00", "12:00-20:30", "13:00-20:30"]
  };
});

// 3. Usuarios de roles principales + Líderes + PDVs
const initialUsers = [
  { id: "user-admin", username: "admin", fullName: "ADMINISTRADOR GENERAL", role: "ADMIN", position: "SUPERUSUARIO / ADMIN GENERAL", area: "OPERACIONES & AUDITORÍA GLOBAL" },
  { id: "user-th", username: "th", fullName: "DIRECCIÓN DE TALENTO HUMANO", role: "HR", position: "ANALISTA DE NÓMINA Y ASISTENCIA", area: "GESTIÓN HUMANA" },
  { id: "user-vrx", username: "vrx", fullName: "AUDITORÍA DE ASISTENCIA VRX", role: "AUDITOR_VRX", position: "AUDITOR NACIONAL DE CONTROL HORARIO", area: "AUDITORÍA Y CONTROL INTERNO" },
  { id: "user-mant", username: "mant", fullName: "APROBADOR MANTENIMIENTO Y OBRAS", role: "MAINTENANCE_APPROVER", position: "COORDINADOR DE MANTENIMIENTO", area: "MANTENIMIENTO Y OBRAS" }
];

// Agregar usuario para cada líder
realLeaders.forEach(l => {
  initialUsers.push({
    id: `user-${l.id}`,
    username: l.name.toLowerCase().replace(/\s+/g, '.'),
    fullName: l.name.toUpperCase(),
    role: "SUPERVISOR",
    supervisorId: l.id,
    position: "LÍDER REGIONAL DE OPERACIONES",
    area: l.zoneName
  });
});

// Agregar usuario para cada tienda / PDV
initialPDVs.forEach(p => {
  initialUsers.push({
    id: `user-${p.id}`,
    username: p.code.toLowerCase(),
    code: p.code,
    fullName: p.name,
    role: "PDV",
    pdvId: p.id,
    supervisorId: p.supervisorId,
    position: "ADMINISTRADOR DE TIENDA",
    area: "VENTAS RETAIL"
  });
});

// 4. Guardar en src/data/seedData.js
const seedJsContent = `// Archivo generado automáticamente con los 101 PDVs Reales y los 12 Líderes de Zona
export const initialSupervisors = ${JSON.stringify(realLeaders, null, 2)};

export const initialPDVs = ${JSON.stringify(initialPDVs, null, 2)};

export const initialUsers = ${JSON.stringify(initialUsers, null, 2)};
`;

fs.writeFileSync('src/data/seedData.js', seedJsContent, 'utf-8');
console.log('src/data/seedData.js actualizado con éxito!');

// 5. Guardar en server/seed101PDVs.json
const seed101Json = {
  zonesList: realLeaders.map(l => ({ id: l.id, name: l.zoneName, leaderName: l.name, code: l.code })),
  pdvsList: initialPDVs
};
fs.writeFileSync('server/seed101PDVs.json', JSON.stringify(seed101Json, null, 2), 'utf-8');
console.log('server/seed101PDVs.json actualizado con éxito!');

// 6. Generar supabase_schema.sql
function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

let sql = `-- ====================================================================
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
`;

realLeaders.forEach(s => {
  sql += `INSERT INTO supervisors (id, name, zone_code, zone_name, document_id, email)
VALUES (${esc(s.id)}, ${esc(s.name)}, ${esc(s.code)}, ${esc(s.zoneName)}, ${esc(s.documentId)}, ${esc(s.email)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone_name = EXCLUDED.zone_name;
`;
});

sql += `
-- 6.3 Maestro Oficial de los 101 Puntos de Venta (PDVs)
`;

initialPDVs.forEach(p => {
  const allowedShiftsJson = JSON.stringify(p.allowedShifts || []);
  const habitualJson = JSON.stringify(p.habitualSchedule || {});
  sql += `INSERT INTO pdvs (id, code, name, city, zone_id, zone_name, supervisor_id, opening_hour, closing_hour, allowed_shifts, habitual_schedule)
VALUES (${esc(p.id)}, ${esc(p.code)}, ${esc(p.name)}, ${esc(p.city)}, ${esc(p.zoneId || p.supervisorId)}, ${esc(p.zoneName)}, ${esc(p.supervisorId)}, ${esc(p.openingHour || '10:00')}, ${esc(p.closingHour || '20:30')}, '${allowedShiftsJson.replace(/'/g, "''")}'::jsonb, '${habitualJson.replace(/'/g, "''")}'::jsonb)
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, city = EXCLUDED.city, supervisor_id = EXCLUDED.supervisor_id, zone_name = EXCLUDED.zone_name;
`;
});

sql += `
-- 6.4 Usuarios y Perfiles del Sistema
`;

initialUsers.forEach(u => {
  sql += `INSERT INTO users (id, username, password, document_id, code, full_name, role, position, area, contract_type, pdv_id, supervisor_id, weekly_max_hours, is_active)
VALUES (${esc(u.id)}, ${esc(u.username)}, ${esc(u.password)}, ${esc(u.documentId)}, ${esc(u.code)}, ${esc(u.fullName)}, ${esc(u.role)}, ${esc(u.position)}, ${esc(u.area)}, ${esc(u.contractType || 'FIJO')}, ${esc(u.pdvId)}, ${esc(u.supervisorId)}, ${u.weeklyMaxHours || 42}, ${u.isActive !== false})
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pdv_id = EXCLUDED.pdv_id, supervisor_id = EXCLUDED.supervisor_id;
`;
});

fs.writeFileSync('supabase_schema.sql', sql, 'utf-8');
console.log(`supabase_schema.sql generado exitosamente! Tamaño: ${(sql.length / 1024).toFixed(1)} KB`);
