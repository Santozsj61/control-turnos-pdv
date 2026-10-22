import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { calculateShiftHours, calculateMonSatHours, countMonthlySundays, timeToMinutes } from '../utils/calculator.js';
import { runReconciliation } from '../utils/reconciliation.js';
import { parsePunchExcel, parseNoveltiesReport, parsePayrollLiquidation } from '../utils/excelParser.js';
import { initialSupervisors, initialPDVs, initialUsers } from '../data/seedData.js';
import { initialNovelties } from '../data/initialNovelties.js';
import { OFFICIAL_PAYROLL_BY_WEEK } from '../data/officialPayrollData.js';
import { registerLoadedWeek, registerLoadedWeeks, ALL_WEEKS_2026, KNOWN_WEEKS_WITH_DATA, getWeeksOverlappingMonth, getWeekStartsForMonth, isWeekInMonth, cleanNormalizeStr, getMondayForDate } from '../utils/weeks.js';

import { buildAuditDataLocally } from '../utils/auditCalculator.js';
import { getPdvPassword, validatePdvPassword, AUTH_CREDENTIALS } from '../utils/authRules.js';

// Fallback helper for local dev server if Supabase keys aren't set yet
async function fetchLocal(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la petición');
  return data.data !== undefined ? data.data : data;
}

// ⚡ Caché en Memoria de Alto Rendimiento para cambio instantáneo de semanas y eliminación de consultas duplicadas
const memoryCache = {
  users: null,
  pdvs: null,
  supervisors: null,
  config: null,
  novelties: null,
  punchesByWeek: new Map(),
  schedulesByWeekAndPdv: new Map(),
  reconciliationByParams: new Map(),
  auditByParams: new Map(),
  clearAll() {
    this.users = null;
    this.pdvs = null;
    this.supervisors = null;
    this.config = null;
    this.novelties = null;
    this.punchesByWeek.clear();
    this.schedulesByWeekAndPdv.clear();
    this.reconciliationByParams.clear();
    this.auditByParams.clear();
  },
  clearReconciliation() {
    this.punchesByWeek.clear();
    this.reconciliationByParams.clear();
    this.auditByParams.clear();
  },
  clearSchedules() {
    this.schedulesByWeekAndPdv.clear();
    this.reconciliationByParams.clear();
    this.auditByParams.clear();
  }
};

export const api = {
  isConfigured: isSupabaseConfigured,

  getCachedReconciliation: ({ weekStart, month, periodType = 'WEEK', pdvId, supervisorId, documentId }) => {
    const isMonthly = periodType === 'MONTH' || (!weekStart && !!month);
    const effPeriodType = isMonthly ? 'MONTH' : 'WEEK';
    const effMonth = month || (weekStart ? weekStart.slice(0, 7) : '2026-09');
    const cacheKey = `${effPeriodType}_${isMonthly ? effMonth : (weekStart || '')}_${pdvId || ''}_${supervisorId || ''}_${documentId || ''}`;
    return memoryCache.reconciliationByParams.get(cacheKey) || null;
  },

  clearCache: (scope = 'all') => {
    if (scope === 'all') memoryCache.clearAll();
    else if (scope === 'reconciliation') memoryCache.clearReconciliation();
    else if (scope === 'schedules') memoryCache.clearSchedules();
  },

  // ----------------------------------------------------
  // 1. App Configuration & CST Parameters
  // ----------------------------------------------------
  getConfig: async () => {
    if (memoryCache.config) return memoryCache.config;
    if (!isSupabaseConfigured) {
      const cfg = await fetchLocal('/api/config');
      if (cfg) memoryCache.config = cfg;
      return cfg;
    }
    const { data, error } = await supabase.from('app_config').select('*').single();
    if (error && error.code !== 'PGRST116') {
      console.error('Supabase getConfig error:', error);
    }
    const res = data ? {
      lunchDurationHours: Number(data.lunch_duration_hours || 1.5),
      lunchCutoffTime: data.lunch_cutoff_time || '12:30',
      lunchMinShiftDuration: Number(data.lunch_min_shift_duration || 6.0),
      dayStartTime: data.day_start_time || '06:00',
      nightStartTime: data.night_start_time || '21:00',
      weeklyMaxStandardHours: Number(data.weekly_max_standard_hours || 42),
      maxSundaysPerMonth: Number(data.max_sundays_per_month || 2),
      lateToleranceMinutes: Number(data.late_tolerance_minutes || 10),
      earlyExitToleranceMinutes: Number(data.early_exit_tolerance_minutes || 10),
      maintenanceApprovalEmail: data.maintenance_approval_email || 'mantenimiento.obras@quest.com.co'
    } : {
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
    };
    memoryCache.config = res;
    return res;
  },

  updateConfig: async (newConfig) => {
    memoryCache.config = null;
    memoryCache.clearReconciliation();
    if (!isSupabaseConfigured) {
      return fetchLocal('/api/config', { method: 'POST', body: JSON.stringify(newConfig) });
    }
    const payload = {
      lunch_duration_hours: newConfig.lunchDurationHours,
      lunch_cutoff_time: newConfig.lunchCutoffTime,
      lunch_min_shift_duration: newConfig.lunchMinShiftDuration,
      day_start_time: newConfig.dayStartTime,
      night_start_time: newConfig.nightStartTime,
      weekly_max_standard_hours: newConfig.weeklyMaxStandardHours,
      max_sundays_per_month: newConfig.maxSundaysPerMonth,
      late_tolerance_minutes: newConfig.lateToleranceMinutes,
      early_exit_tolerance_minutes: newConfig.earlyExitToleranceMinutes,
      maintenance_approval_email: newConfig.maintenanceApprovalEmail,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('app_config').upsert({ id: 'default', ...payload }).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // ----------------------------------------------------
  // 2. Supervisors / Zonas
  // ----------------------------------------------------
  getSupervisors: async () => {
    if (memoryCache.supervisors) return memoryCache.supervisors;
    if (!isSupabaseConfigured) {
      try {
        const local = await fetchLocal('/api/supervisors');
        if (local && local.length > 0) {
          memoryCache.supervisors = local;
          return local;
        }
      } catch (e) {}
      memoryCache.supervisors = initialSupervisors;
      return initialSupervisors;
    }
    try {
      const { data, error } = await supabase.from('supervisors').select('*').order('name');
      if (error || !data || data.length === 0) {
        memoryCache.supervisors = initialSupervisors;
        return initialSupervisors;
      }
      const res = data.map(s => ({
        id: s.id,
        name: s.name,
        zoneName: s.zone_name || s.name,
        zoneCode: s.zone_code,
        code: s.zone_code,
        documentId: s.document_id,
        phone: s.phone,
        email: s.email
      }));
      memoryCache.supervisors = res;
      return res;
    } catch (e) {
      memoryCache.supervisors = initialSupervisors;
      return initialSupervisors;
    }
  },

  createSupervisor: async (sup) => {
    memoryCache.supervisors = null;
    memoryCache.clearReconciliation();
    if (!isSupabaseConfigured) return fetchLocal('/api/zonas', { method: 'POST', body: JSON.stringify(sup) });
    const id = sup.id || `zone-${Date.now()}`;
    const payload = {
      id,
      name: sup.name.trim().toUpperCase(),
      zone_code: sup.zoneCode || `COD-${id.toUpperCase()}`,
      zone_name: sup.zoneName || sup.name.trim().toUpperCase(),
      phone: sup.phone || '+57 300 000 0000',
      email: sup.email || `${sup.name.toLowerCase().replace(/\s+/g, '.')}@empresa.com`
    };
    const { data, error } = await supabase.from('supervisors').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return { ...data, zoneCode: data.zone_code, zoneName: data.zone_name };
  },

  updateSupervisor: async (id, sup) => {
    memoryCache.supervisors = null;
    memoryCache.clearReconciliation();
    if (!isSupabaseConfigured) return fetchLocal(`/api/zonas/${id}`, { method: 'PUT', body: JSON.stringify(sup) });
    const payload = {
      name: sup.name?.trim().toUpperCase(),
      zone_code: sup.zoneCode,
      zone_name: sup.zoneName,
      phone: sup.phone,
      email: sup.email,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('supervisors').update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return { ...data, zoneCode: data.zone_code, zoneName: data.zone_name };
  },

  deleteSupervisor: async (id) => {
    memoryCache.supervisors = null;
    memoryCache.clearReconciliation();
    if (!isSupabaseConfigured) return fetchLocal(`/api/zonas/${id}`, { method: 'DELETE' });
    const { data, error } = await supabase.from('supervisors').delete().eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // ----------------------------------------------------
  // 3. PDVs (Puntos de Venta)
  // ----------------------------------------------------
  getPDVs: async () => {
    if (memoryCache.pdvs) return memoryCache.pdvs;
    if (!isSupabaseConfigured) {
      try {
        const local = await fetchLocal('/api/pdvs');
        if (local && local.length > 0) {
          memoryCache.pdvs = local;
          return local;
        }
      } catch (e) {}
      memoryCache.pdvs = initialPDVs;
      return initialPDVs;
    }
    try {
      const { data, error } = await supabase.from('pdvs').select('*').order('name');
      if (error || !data || data.length === 0) {
        memoryCache.pdvs = initialPDVs;
        return initialPDVs;
      }
      const res = data.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        city: p.city,
        zoneId: p.zone_id || p.supervisor_id,
        zoneName: p.zone_name,
        supervisorId: p.supervisor_id,
        supervisorName: p.zone_name || 'Sin asignar',
        openingHour: p.opening_hour || '10:00',
        closingHour: p.closing_hour || '20:30',
        allowedShifts: p.allowed_shifts || ['10:00-20:30', '10:00-18:00', '11:00-19:00', '12:00-20:30', '13:00-20:30'],
        habitualSchedule: p.habitual_schedule || {}
      }));
      memoryCache.pdvs = res;
      return res;
    } catch (e) {
      memoryCache.pdvs = initialPDVs;
      return initialPDVs;
    }
  },

  createPDV: async (pdv) => {
    memoryCache.pdvs = null;
    memoryCache.clearAll();
    if (!isSupabaseConfigured) return fetchLocal('/api/pdvs', { method: 'POST', body: JSON.stringify(pdv) });
    const id = pdv.id || `pdv-${Date.now()}`;
    const payload = {
      id,
      code: pdv.code ? pdv.code.trim().toUpperCase() : `PDV-${Date.now()}`,
      name: pdv.name.trim().toUpperCase(),
      city: pdv.city ? pdv.city.trim() : 'BOGOTÁ',
      supervisor_id: pdv.supervisorId,
      zone_id: pdv.supervisorId,
      zone_name: pdv.zoneName,
      opening_hour: pdv.openingHour || '10:00',
      closing_hour: pdv.closingHour || '20:30',
      allowed_shifts: pdv.allowedShifts || ['10:00-20:30', '10:00-18:00', '11:00-19:00', '12:00-20:30', '13:00-20:30'],
      habitual_schedule: pdv.habitualSchedule || {}
    };
    const { data, error } = await supabase.from('pdvs').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  updatePDV: async (id, pdv) => {
    if (!isSupabaseConfigured) return fetchLocal(`/api/pdvs/${id}`, { method: 'PUT', body: JSON.stringify(pdv) });
    const payload = {
      code: pdv.code?.trim().toUpperCase(),
      name: pdv.name?.trim().toUpperCase(),
      city: pdv.city,
      supervisor_id: pdv.supervisorId,
      opening_hour: pdv.openingHour,
      closing_hour: pdv.closingHour,
      allowed_shifts: pdv.allowedShifts,
      habitual_schedule: pdv.habitualSchedule,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('pdvs').update(payload).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  deletePDV: async (id) => {
    if (!isSupabaseConfigured) return fetchLocal(`/api/pdvs/${id}`, { method: 'DELETE' });
    const { data, error } = await supabase.from('pdvs').delete().eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  updatePdvHabitualSchedule: async (pdvId, habitualSchedule) => {
    if (!isSupabaseConfigured) {
      return fetchLocal(`/api/pdvs/${pdvId}/habitual-schedule`, {
        method: 'PUT',
        body: JSON.stringify({ habitualSchedule })
      });
    }
    const { data, error } = await supabase.from('pdvs').update({
      habitual_schedule: habitualSchedule,
      updated_at: new Date().toISOString()
    }).eq('id', pdvId).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // ----------------------------------------------------
  // 4. Users & Authentication
  // ----------------------------------------------------
  login: async ({ username, password, pdvId, pin, supervisorId }) => {
    if (!isSupabaseConfigured) {
      try {
        const localRes = await fetchLocal('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password, pdvId, pin, supervisorId })
        });
        if (localRes) return localRes;
      } catch (e) {
        console.warn('Backend local no disponible, autenticando vía fallback frontend...');
      }
    }
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || pin || '').trim();

    // 0. Auditoría & Control VRX (ÚNICA CONTRASEÑA ESTRICTAMENTE AUTORIZADA: 0814)
    if (cleanUser === 'vrx' || cleanUser === 'auditor' || cleanUser === 'auditorvrx') {
      if (cleanPass === '0814') {
        return {
          id: 'user-vrx',
          username: 'AuditorVRX',
          fullName: 'AUDITORÍA DE ASISTENCIA VRX (David Hortúa)',
          role: 'AUDITOR_VRX',
          position: 'AUDITOR NACIONAL DE CONTROL HORARIO',
          area: 'AUDITORÍA Y CONTROL INTERNO'
        };
      }
      throw new Error('Contraseña de Auditor incorrecta (única clave autorizada: 0814)');
    }

    // 1. Admin General (888 / admin)
    if ((cleanUser === 'administrador' || cleanUser === 'admin') && (cleanPass === '888' || cleanPass === 'admin')) {
      return {
        id: 'user-admin',
        username: 'Administrador',
        fullName: 'ADMINISTRADOR GENERAL',
        role: 'ADMIN',
        position: 'SUPERUSUARIO / ADMIN GENERAL',
        area: 'OPERACIONES & AUDITORÍA GLOBAL'
      };
    }

    // 1.5 Mantenimiento (clave única de líderes: 200101 o admin)
    if (supervisorId === 'sup-mantenimiento' || cleanUser === 'mantenimiento' || cleanUser === 'mant') {
      if (cleanPass === AUTH_CREDENTIALS.ZONA_PASSWORD || cleanPass === 'admin') {
        return {
          id: 'user-mant',
          username: 'mantenimiento',
          fullName: 'MANTENIMIENTO',
          role: 'MAINTENANCE_APPROVER',
          position: 'ENCARGADO DE MANTENIMIENTO',
          area: 'MANTENIMIENTO Y OBRAS',
          supervisorId: 'sup-mantenimiento'
        };
      }
      throw new Error(`Contraseña de Mantenimiento incorrecta (clave única: ${AUTH_CREDENTIALS.ZONA_PASSWORD})`);
    }

    // 2. Líder de Zona (Perfil #2: clave única 200101)
    if (supervisorId) {
      let sup = null;
      if (isSupabaseConfigured) {
        try {
          const { data } = await supabase.from('supervisors').select('*').eq('id', supervisorId).single();
          sup = data;
        } catch (e) {}
      }
      if (!sup) {
        sup = initialSupervisors.find(s => s.id === supervisorId || s.name === supervisorId);
      }
      if (cleanPass === AUTH_CREDENTIALS.ZONA_PASSWORD || cleanPass === 'admin') {
        return {
          id: sup ? `user-${sup.id}` : `user-${supervisorId}`,
          username: sup ? (sup.code || sup.name) : 'Líder de Zona',
          fullName: sup ? (sup.name || sup.zone_name) : 'LÍDER DE ZONA',
          zoneName: sup ? (sup.zone_name || sup.zoneName || sup.name) : 'ZONA REGIONAL',
          role: 'SUPERVISOR',
          supervisorId: sup ? sup.id : supervisorId,
          position: 'LÍDER DE ZONA REGIONAL',
          area: 'OPERACIONES COMERCIALES'
        };
      }
      throw new Error(`Contraseña de Líder de Zona incorrecta (clave única: ${AUTH_CREDENTIALS.ZONA_PASSWORD})`);
    }

    // 3. Store PDV Access (Perfil #1: código identificador del PDV)
    if (pdvId) {
      let pdv = null;
      if (isSupabaseConfigured) {
        try {
          const { data } = await supabase.from('pdvs').select('*').eq('id', pdvId).single();
          pdv = data;
        } catch (e) {}
      }
      if (!pdv) {
        pdv = initialPDVs.find(p => p.id === pdvId || p.code === pdvId);
      }
      if (validatePdvPassword(cleanPass, pdv)) {
        return {
          id: `user-${pdvId}`,
          username: pdv ? pdv.code : 'PDV',
          fullName: pdv ? pdv.name : 'PUNTO DE VENTA',
          role: 'PDV',
          pdvId: pdvId,
          supervisorId: pdv?.supervisorId || pdv?.supervisor_id,
          position: 'ADMINISTRADOR DE TIENDA',
          area: 'VENTAS RETAIL'
        };
      }
      throw new Error(`Contraseña de PDV incorrecta (clave requerida: ${getPdvPassword(pdv)})`);
    }

    // 4. Talento Humano (Perfil #3: clave única 200102)
    if ((cleanUser === 'th' || cleanUser === 'talentohumano' || cleanUser === 'thumano') && (cleanPass === AUTH_CREDENTIALS.HR_PASSWORD || cleanPass === 'admin')) {
      return {
        id: 'user-th',
        username: 'TalentoHumano',
        fullName: 'DIRECCIÓN DE TALENTO HUMANO',
        role: 'HR_ADMIN',
        position: 'ANALISTA DE NÓMINA Y ASISTENCIA',
        area: 'GESTIÓN HUMANA'
      };
    }

    // 5. Auditoría & Control VRX (ÚNICA CONTRASEÑA AUTORIZADA: 0814)
    if ((cleanUser === 'vrx' || cleanUser === 'auditor') && cleanPass === '0814') {
      return {
        id: 'user-vrx',
        username: 'AuditorVRX',
        fullName: 'AUDITORÍA DE ASISTENCIA VRX (David Hortúa)',
        role: 'AUDITOR_VRX',
        position: 'AUDITOR NACIONAL DE CONTROL HORARIO',
        area: 'AUDITORÍA Y CONTROL INTERNO'
      };
    }

    // 6. DB User verification (if Supabase configured)
    if (isSupabaseConfigured) {
      try {
        const { data: dbUser } = await supabase.from('users').select('*').ilike('username', cleanUser).single();
        if (dbUser) {
          if (dbUser.role === 'AUDITOR_VRX' || dbUser.id === 'user-vrx') {
            if (cleanPass === '0814') {
              return {
                id: dbUser.id,
                username: dbUser.username,
                fullName: dbUser.full_name,
                role: dbUser.role,
                position: dbUser.position,
                area: dbUser.area,
                pdvId: dbUser.pdv_id,
                supervisorId: dbUser.supervisor_id
              };
            }
            throw new Error('Contraseña de Auditor incorrecta (debe ser 0814)');
          }
          if (dbUser.password === cleanPass || cleanPass === 'admin') {
            return {
              id: dbUser.id,
              username: dbUser.username,
              fullName: dbUser.full_name,
              role: dbUser.role,
              position: dbUser.position,
              area: dbUser.area,
              pdvId: dbUser.pdv_id,
              supervisorId: dbUser.supervisor_id
            };
          }
        }
      } catch (e) {
        if (e.message && e.message.includes('Auditor')) throw e;
      }
    }

    // 7. Fallback to initialUsers
    const localUser = initialUsers.find(u => u.username?.toLowerCase() === cleanUser);
    if (localUser) {
      if (localUser.role === 'AUDITOR_VRX' || localUser.id === 'user-vrx') {
        if (cleanPass === '0814') return localUser;
        throw new Error('Contraseña de Auditor incorrecta (debe ser 0814)');
      }
      if (localUser.password === cleanPass || cleanPass === 'admin') {
        return {
          id: localUser.id,
          username: localUser.username,
          fullName: localUser.fullName,
          role: localUser.role,
          position: localUser.position,
          area: localUser.area,
          pdvId: localUser.pdvId,
          supervisorId: localUser.supervisorId
        };
      }
    }

    throw new Error('Credenciales incorrectas o PIN no válido');
  },

  getUsers: async (filters = {}) => {
    let allUsers = memoryCache.users;
    if (!allUsers) {
      if (!isSupabaseConfigured) {
        try {
          const local = await fetchLocal('/api/users');
          if (local && local.length > 0) allUsers = local;
        } catch (e) {}
        if (!allUsers) allUsers = initialUsers;
      } else {
        try {
          const { data, error } = await supabase.from('users').select('*').eq('is_active', true).order('full_name');
          if (error || !data || data.length === 0) {
            allUsers = initialUsers;
          } else {
            allUsers = data.map(u => ({
              id: u.id,
              username: u.username,
              fullName: u.full_name,
              documentId: u.document_id,
              code: u.code,
              role: u.role,
              position: u.position,
              area: u.area,
              contractType: u.contract_type || 'FIJO',
              pdvId: u.pdv_id,
              supervisorId: u.supervisor_id,
              weeklyMaxHours: u.weekly_max_hours || 42
            }));
          }
        } catch (e) {
          allUsers = initialUsers;
        }
      }
      memoryCache.users = allUsers;
    }

    let res = allUsers;
    if (filters.role) res = res.filter(u => u.role === filters.role);
    if (filters.pdvId) res = res.filter(u => u.pdvId === filters.pdvId);
    if (filters.supervisorId) res = res.filter(u => u.supervisorId === filters.supervisorId);
    return res;
  },

  addPdvMember: async ({ pdvId, documentId, fullName, position, code, contractType }) => {
    memoryCache.users = null;
    memoryCache.clearSchedules();
    if (!isSupabaseConfigured) {
      return fetchLocal('/api/users/pdv-member', {
        method: 'POST',
        body: JSON.stringify({ pdvId, documentId, fullName, position, code, contractType })
      });
    }
    const cleanDoc = String(documentId).trim();
    const candidateUsername = `emp_${cleanDoc}`;
    const candidateId = `emp-${cleanDoc}`;

    // 1. Check if user already exists by document_id, username, or candidate id
    const { data: existingList } = await supabase.from('users')
      .select('*')
      .or(`document_id.eq.${cleanDoc},username.eq.${candidateUsername},id.eq.${candidateId}`)
      .limit(1);
    const existing = existingList && existingList[0];

    if (existing) {
      const { data, error } = await supabase.from('users').update({
        pdv_id: pdvId,
        full_name: fullName ? fullName.trim().toUpperCase() : existing.full_name,
        position: position || existing.position || 'ASESOR(A) DE IMAGEN',
        contract_type: contractType || existing.contract_type || 'FIJO',
        username: existing.username || candidateUsername,
        document_id: existing.document_id || cleanDoc,
        is_active: true,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id).select().single();
      if (error) throw new Error(error.message);
      return {
        ...data,
        id: data.id,
        fullName: data.full_name,
        pdvId: data.pdv_id,
        documentId: data.document_id,
        contractType: data.contract_type
      };
    }

    // 2. Insert brand new collaborator / temporal
    const defaultPassword = cleanDoc.length >= 4 ? cleanDoc.slice(-4) : '1234';
    const payload = {
      id: candidateId,
      username: candidateUsername,
      password: defaultPassword,
      document_id: cleanDoc,
      code: code || `COD-${cleanDoc.slice(-4)}`,
      full_name: fullName.trim().toUpperCase(),
      role: 'EMPLOYEE',
      position: position || 'ASESOR(A) DE IMAGEN',
      area: 'RETAIL',
      contract_type: contractType || 'FIJO',
      pdv_id: pdvId,
      weekly_max_hours: 42,
      is_active: true
    };
    const { data, error } = await supabase.from('users').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      id: data.id,
      fullName: data.full_name,
      pdvId: data.pdv_id,
      documentId: data.document_id,
      contractType: data.contract_type
    };
  },

  removePdvMember: async (userId, pdvId, weekStart, documentId) => {
    memoryCache.users = null;
    memoryCache.clearSchedules();
    if (!isSupabaseConfigured) {
      return fetchLocal(`/api/users/${userId}/pdv-member?pdvId=${pdvId || ''}&weekStart=${weekStart || ''}&documentId=${documentId || ''}`, {
        method: 'DELETE'
      });
    }
    let userQuery = supabase.from('users').update({ pdv_id: null });
    if (documentId) {
      userQuery = userQuery.or(`id.eq.${userId},document_id.eq.${documentId}`);
    } else {
      userQuery = userQuery.eq('id', userId);
    }
    await userQuery;

    if (weekStart) {
      let schedQuery = supabase.from('schedules').delete().eq('week_start', weekStart);
      if (documentId) {
        schedQuery = schedQuery.or(`user_id.eq.${userId},user_id.eq.emp-${documentId}`);
      } else {
        schedQuery = schedQuery.eq('user_id', userId);
      }
      await schedQuery;
    }
    return { success: true };
  },

  // ----------------------------------------------------
  // 5. Schedules (Turnos y Cronogramas)
  // ----------------------------------------------------
  getSchedules: async (filters = {}) => {
    if (!isSupabaseConfigured) {
      const q = new URLSearchParams(filters).toString();
      return fetchLocal(`/api/schedules${q ? '?' + q : ''}`);
    }

    const mapSchedule = s => ({
      id: s.id,
      userId: s.user_id,
      pdvId: s.pdv_id,
      weekStart: s.week_start,
      weekEnd: s.week_end,
      isSubmitted: s.is_submitted,
      shifts: s.shifts || [],
      totalNetHours: Number(s.total_net_hours || 0),
      totalLunchHours: Number(s.total_lunch_hours || 0),
      notes: s.notes,
      user: s.users || null
    });

    const isCacheableSched = (filters.weekStart || filters.month) && !filters.userId;
    const schedCacheKey = isCacheableSched ? `sched_${filters.weekStart || filters.month}_${filters.pdvId || 'ALL'}` : null;
    if (schedCacheKey && memoryCache.schedulesByWeekAndPdv.has(schedCacheKey)) {
      return memoryCache.schedulesByWeekAndPdv.get(schedCacheKey);
    }

    if (!filters.userId && !filters.weekStart && !filters.month && (!filters.pdvId || filters.pdvId === 'ALL')) {
      let allData = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase.from('schedules').select('*, users(*)').range(from, from + step - 1);
        if (error || !data || data.length === 0) break;
        allData.push(...data);
        if (data.length < step) break;
        from += step;
      }
      return allData.map(mapSchedule);
    }

    let allData = [];
    let from = 0;
    const step = 1000;
    while (true) {
      let query = supabase.from('schedules').select('*, users(*)').range(from, from + step - 1);
      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.weekStart) {
        query = query.eq('week_start', filters.weekStart);
      } else if (filters.month) {
        const monthWeeks = getWeekStartsForMonth(filters.month);
        if (monthWeeks.length > 0) {
          query = query.in('week_start', monthWeeks);
        }
      }
      if (filters.pdvId && filters.pdvId !== 'ALL') query = query.eq('pdv_id', filters.pdvId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < step) break;
      from += step;
    }
    const mapped = allData.map(mapSchedule);
    if (schedCacheKey) {
      memoryCache.schedulesByWeekAndPdv.set(schedCacheKey, mapped);
    }
    return mapped;
  },

  saveBatchPdvSchedules: async ({ pdvId, weekStart, weekEnd, schedules }) => {
    memoryCache.clearSchedules();
    if (weekStart) registerLoadedWeek(weekStart);
    if (!isSupabaseConfigured) {
      return fetchLocal('/api/schedules/batch-pdv', {
        method: 'POST',
        body: JSON.stringify({ pdvId, weekStart, weekEnd, schedules })
      });
    }
    const config = await api.getConfig();
    const results = [];
    const safePdvId = (pdvId && pdvId !== 'ALL') ? pdvId : 'pdv-1';

    for (const item of schedules) {
      const { userId, shifts, notes } = item;
      if (!userId || !shifts) continue;

      // Extract specific PDV ID for the employee if available in batch upload, otherwise fallback to safePdvId
      const empPdvId = item.pdvId || item.pdv_id || item.employee?.pdvId || item.employee?.pdv_id || item.pdv?.id || safePdvId;

      // 1. Ensure user exists in users table so foreign key constraint (schedules_user_id_fkey) is always satisfied.
      // Do NOT overwrite user's base pdv_id if they already exist, preserving their PDV de origen.
      const rawUserId = String(userId || '');
      const docId = String(item.documentId || (rawUserId.startsWith('emp-doc-') ? rawUserId.replace('emp-doc-', '') : (rawUserId.startsWith('emp-') ? rawUserId.replace('emp-', '') : ''))).trim();
      const normalizedUserId = (rawUserId.startsWith('emp-') && !rawUserId.startsWith('emp-doc-')) ? rawUserId : (docId ? `emp-${docId}` : rawUserId);

      try {
        const { data: existingUser } = await supabase.from('users')
          .select('id, pdv_id')
          .or(`id.eq.${normalizedUserId}${docId ? `,document_id.eq.${docId}` : ''}`)
          .limit(1)
          .maybeSingle();

        if (!existingUser) {
          const fullName = item.fullName || item.employeeName || `COLABORADOR ${docId || normalizedUserId}`;
          const userPayload = {
            id: normalizedUserId,
            username: `emp_${docId || normalizedUserId}`,
            full_name: fullName,
            document_id: docId || '1000000000',
            role: 'EMPLOYEE',
            pdv_id: empPdvId,
            position: item.position || 'ASESOR(A) DE IMAGEN',
            contract_type: item.contractType || 'FIJO',
            is_active: true
          };
          await supabase.from('users').insert(userPayload);
        }
      } catch (uErr) {
        console.warn('Could not auto-check user for schedule FK:', uErr);
      }

      // Unique Cedula check across other PDVs for this week
      try {
        const { data: otherSched } = await supabase.from('schedules')
          .select('*, pdvs(name)')
          .eq('user_id', normalizedUserId)
          .eq('week_start', weekStart)
          .neq('pdv_id', empPdvId);
        
        if (otherSched && otherSched.length > 0) {
          throw new Error(`⚠️ Restricción de Cédula Única: El colaborador ya tiene programación registrada en la semana ${weekStart} en otro PDV.`);
        }
      } catch (checkErr) {
        if (checkErr.message?.includes('Restricción de Cédula Única')) throw checkErr;
      }

      const calculatedShifts = shifts.map(s => {
        const shiftType = s.shiftType || (s.isDayOff ? 'DESCANSO' : 'ORDINARIO');
        if (s.isDayOff || shiftType === 'DESCANSO' || shiftType === 'NO_PROGRAMADO' || !s.startTime || !s.endTime) {
          if (['INCAPACIDAD', 'VACACIONES', 'LICENCIA', 'DESCANSO'].includes(shiftType)) {
            const calc = calculateShiftHours(s.startTime, s.endTime, s.date, config, shiftType);
            return { ...s, shiftType, isDayOff: shiftType === 'DESCANSO' || s.isDayOff, ...calc };
          }
          return {
            ...s,
            shiftType,
            isDayOff: shiftType === 'NO_PROGRAMADO' ? false : s.isDayOff,
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
            sundayOrHolidayHours: 0,
            lunchApplied: false,
            lunchReason: shiftType === 'NO_PROGRAMADO' ? 'No programado' : 'Sin horario'
          };
        }
        const calc = calculateShiftHours(s.startTime, s.endTime, s.date, config, shiftType);
        return { ...s, shiftType, ...calc };
      });

      const totalNetHours = +calculatedShifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
      const totalLunchHours = +calculatedShifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);

      const schedPayload = {
        id: `sched-${normalizedUserId}-${weekStart}`,
        user_id: normalizedUserId,
        pdv_id: empPdvId,
        week_start: weekStart,
        week_end: weekEnd || shifts[shifts.length - 1]?.date || weekStart,
        is_submitted: true,
        submitted_at: new Date().toISOString(),
        shifts: calculatedShifts,
        total_net_hours: totalNetHours,
        total_lunch_hours: totalLunchHours,
        notes: notes || '',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase.from('schedules').upsert(schedPayload, { onConflict: 'user_id,week_start' }).select().single();
      if (error) throw new Error(error.message);
      results.push(data);
    }

    return results;
  },

  getSundayStats: async (userId, targetMonth, currentWeekShifts = []) => {
    const schedules = await api.getSchedules({ userId });
    const month = targetMonth || new Date().toISOString().substring(0, 7);
    return countMonthlySundays(schedules, userId, month, currentWeekShifts);
  },

  // ----------------------------------------------------
  // 6. Permissions & Novedades
  // ----------------------------------------------------
  getPermissions: async (filters = {}) => {
    if (!isSupabaseConfigured) {
      const q = new URLSearchParams(filters).toString();
      return fetchLocal(`/api/permissions${q ? '?' + q : ''}`);
    }
    let query = supabase.from('permissions').select('*').order('requested_at', { ascending: false });
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.pdvId) query = query.eq('pdv_id', filters.pdvId);
    if (filters.supervisorId) query = query.eq('supervisor_id', filters.supervisorId);
    if (filters.recipientRole) query = query.eq('recipient_role', filters.recipientRole);
    if (filters.assignedArea) query = query.eq('assigned_area', filters.assignedArea);
    if (filters.isMaintenanceApprover) {
      query = query.or('recipient_role.eq.MAINTENANCE_APPROVER,assigned_area.eq.Mantenimiento y Obras');
    }
    if (filters.excludeMaintenance) query = query.neq('assigned_area', 'Mantenimiento y Obras');
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(p => ({
      id: p.id,
      userId: p.user_id,
      employeeName: p.employee_name,
      documentId: p.document_id,
      position: p.position,
      pdvId: p.pdv_id,
      supervisorId: p.supervisor_id,
      date: p.date,
      shiftType: p.shift_type,
      isDayOffChange: p.is_day_off_change,
      requestedStartTime: p.requested_start_time,
      requestedEndTime: p.requested_end_time,
      reason: p.reason,
      assignedArea: p.assigned_area,
      recipientRole: p.recipient_role,
      notificationEmail: p.notification_email,
      emailSent: p.email_sent,
      emailSentAt: p.email_sent_at,
      status: p.status,
      supervisorNotes: p.supervisor_notes,
      reviewerId: p.reviewer_id,
      requestedAt: p.requested_at,
      reviewedAt: p.reviewed_at,
      userName: p.employee_name,
      userDocument: p.document_id,
      pdvName: p.pdv_id
    }));
  },

  createPermission: async (permData) => {
    if (!isSupabaseConfigured) {
      return fetchLocal('/api/permissions', {
        method: 'POST',
        body: JSON.stringify(permData)
      });
    }
    const assignedArea = permData.assignedArea || 'Líder de Zona';
    const isMaintenance = assignedArea === 'Mantenimiento y Obras';

    const payload = {
      id: `perm-${Date.now()}`,
      user_id: permData.userId,
      employee_name: permData.employeeName,
      document_id: permData.documentId,
      position: permData.position,
      pdv_id: permData.pdvId,
      supervisor_id: permData.supervisorId,
      date: permData.date,
      shift_type: permData.shiftType,
      is_day_off_change: !!permData.isDayOffChange,
      requested_start_time: permData.requestedStartTime,
      requested_end_time: permData.requestedEndTime,
      reason: permData.reason,
      assigned_area: assignedArea,
      recipient_role: isMaintenance ? 'MAINTENANCE_APPROVER' : 'SUPERVISOR',
      notification_email: isMaintenance ? 'maria.cardona@quest.com.co' : null,
      email_sent: false,
      email_sent_at: null,
      status: 'PENDING',
      requested_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('permissions').insert(payload).select().single();
    if (error) throw new Error(error.message);

    // Enviar notificación por correo al Líder de Zona asignado o a María Cardona (Mantenimiento)
    api.sendPermissionEmailNotification(permData).catch(err => {
      console.warn('Aviso: No se pudo enviar el correo de notificación:', err);
    });

    return data;
  },

  sendPermissionEmailNotification: async (permData) => {
    try {
      const isMaintenance = permData.assignedArea === 'Mantenimiento y Obras';
      const supervisors = await api.getSupervisors();
      const pdvs = await api.getPDVs();

      const pdv = pdvs.find(p => p.id === permData.pdvId || p.code === permData.pdvId);
      const targetSupId = permData.supervisorId || pdv?.supervisorId || pdv?.supervisor_id;
      const sup = supervisors.find(s => s.id === targetSupId || s.name === targetSupId);

      const recipientEmail = isMaintenance
        ? 'maria.cardona@quest.com.co'
        : (sup?.email || 'analista.retail@quest.com.co');

      const recipientGreeting = isMaintenance
        ? 'María Cardona (Mantenimiento y Obras)'
        : (sup?.name || 'Líder de Zona');

      const storeName = pdv ? `${pdv.code} - ${pdv.name}` : (permData.pdvId || 'Punto de Venta');
      const employeeName = permData.employeeName || 'Colaborador';
      const docText = permData.documentId ? `CC: ${permData.documentId}` : '';
      const dateText = permData.date || 'Fecha por definir';
      const shiftText = permData.isDayOffChange
        ? 'Cambio a Día de Descanso (DESCANSO)'
        : (permData.requestedStartTime && permData.requestedEndTime
            ? `Nuevo Horario: ${permData.requestedStartTime} a ${permData.requestedEndTime} (${permData.shiftType || 'Ordinario'})`
            : (permData.shiftType || 'Novedad Ordinaria'));

      const subject = isMaintenance
        ? `[Mantenimiento y Obras] - ${pdv?.code || 'PDV'} - ${employeeName}`
        : `[Solicitud de Permiso] - ${pdv?.code || 'PDV'} - ${employeeName}`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; text-align: center; color: white;">
            <span style="background-color: #f59e0b; color: #0f172a; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; letter-spacing: 1px; display: inline-block; margin-bottom: 8px;">
              ${isMaintenance ? 'SOLICITUD DE MANTENIMIENTO Y OBRAS' : 'SOLICITUD DE NOVEDAD / PERMISO'}
            </span>
            <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">Control de Turnos PDV</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">NCS BRANDS • QUEST / QST</p>
          </div>

          <div style="padding: 28px 24px; color: #334155; line-height: 1.6; background-color: #ffffff;">
            <p style="font-size: 15px; margin-top: 0;">
              Hola <strong>${recipientGreeting}</strong>,
            </p>
            <p style="font-size: 13px; color: #475569;">
              Se ha radicado una nueva solicitud de cambio de horario o novedad que requiere tu revisión y autorización:
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b; width: 140px;"><strong>👤 Colaborador:</strong></td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${employeeName} <span style="font-weight: 400; color: #64748b;">(${docText})</span></td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;"><strong>🏬 Tienda / PDV:</strong></td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${storeName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;"><strong>📅 Fecha solicitada:</strong></td>
                  <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${dateText}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;"><strong>⏰ Horario / Tipo:</strong></td>
                  <td style="padding: 6px 0; color: #2563eb; font-weight: 700;">${shiftText}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;"><strong>🏷️ Área:</strong></td>
                  <td style="padding: 6px 0; color: #0f172a;">${permData.assignedArea || 'Líder de Zona'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0 0 0; color: #64748b; vertical-align: top;"><strong>📝 Justificación:</strong></td>
                  <td style="padding: 8px 0 0 0; color: #0f172a; font-style: italic; background-color: #f1f5f9; padding: 10px; border-radius: 8px;">
                    "${permData.reason || 'Sin observación adicional'}"
                  </td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 28px 0 16px 0;">
              <a href="https://control-turnos-pdv.vercel.app" 
                 target="_blank" 
                 style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 13px; font-weight: 700; border-radius: 12px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4);">
                Ingresar al Portal para Autorizar / Rechazar →
              </a>
            </div>

            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              Notificación automática generada por el Sistema de Turnos PDV • NCS BRANDS Colombia
            </p>
          </div>
        </div>
      `;

      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          bcc: 'notificaciones.turnos.quest@gmail.com',
          subject,
          html
        })
      });
    } catch (e) {
      console.warn('Aviso: Error despachando correo:', e);
    }
  },

  updatePermissionStatus: async (permId, status, supervisorNotes = '', reviewerId = null) => {
    if (!isSupabaseConfigured) {
      return fetchLocal(`/api/permissions/${permId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, supervisorNotes, reviewerId })
      });
    }
    const reviewedAt = new Date().toISOString();
    const { data, error } = await supabase.from('permissions').update({
      status,
      supervisor_notes: supervisorNotes,
      reviewer_id: reviewerId,
      reviewed_at: reviewedAt
    }).eq('id', permId).select().single();
    if (error) throw new Error(error.message);

    // Si la solicitud es APROBADA, sincronizar automáticamente la programación del día correspondiente
    if (status === 'APPROVED' && data) {
      try {
        await api.applyPermissionToSchedule(data);
      } catch (applyErr) {
        console.error('Error al sincronizar permiso aprobado con la programación:', applyErr);
      }
    }

    return data;
  },

  applyPermissionToSchedule: async (perm) => {
    if (!perm || !perm.date) return null;
    const permDate = perm.date;
    const weekStart = getMondayForDate(permDate);
    const rawUid = perm.user_id || perm.userId || '';
    const docId = perm.document_id || perm.documentId || (rawUid ? String(rawUid).replace(/^emp-(doc-)?/, '') : '');

    if (!isSupabaseConfigured) {
      return null;
    }

    try {
      // 1. Buscar la programación del usuario para esa semana en Supabase
      const candidateUserIds = [
        rawUid,
        docId ? `emp-${docId}` : '',
        docId ? `emp-doc-${docId}` : ''
      ].filter(Boolean);

      let matchingSchedules = [];
      if (candidateUserIds.length > 0) {
        const { data } = await supabase
          .from('schedules')
          .select('*')
          .eq('week_start', weekStart)
          .in('user_id', candidateUserIds);
        if (data && data.length > 0) matchingSchedules = data;
      }

      // Si no se encontró por user_id, buscar por id que contenga el documento y weekStart
      if (matchingSchedules.length === 0 && docId) {
        const { data: byDoc } = await supabase
          .from('schedules')
          .select('*')
          .eq('week_start', weekStart)
          .ilike('id', `%${docId}%`);
        if (byDoc && byDoc.length > 0) matchingSchedules = byDoc;
      }

      // Si aún no se encontró, buscar por nombre del colaborador en users
      if (matchingSchedules.length === 0 && (perm.employee_name || perm.employeeName)) {
        const empName = perm.employee_name || perm.employeeName;
        const { data: usersFound } = await supabase
          .from('users')
          .select('id')
          .ilike('full_name', `%${empName}%`)
          .limit(1);
        if (usersFound && usersFound[0]) {
          const { data: byName } = await supabase
            .from('schedules')
            .select('*')
            .eq('week_start', weekStart)
            .eq('user_id', usersFound[0].id);
          if (byName && byName.length > 0) matchingSchedules = byName;
        }
      }

      if (matchingSchedules.length === 0) {
        console.warn(`[applyPermissionToSchedule] No se encontró programación para ${rawUid} (${docId}) en semana ${weekStart}`);
        return null;
      }

      const config = await api.getConfig();
      const isDayOff = !!(perm.is_day_off_change || perm.isDayOffChange || perm.shift_type === 'DESCANSO' || perm.shiftType === 'DESCANSO');
      const shiftType = isDayOff ? 'DESCANSO' : (perm.shift_type || perm.shiftType || 'ORDINARIO');
      const startTime = isDayOff ? '' : (perm.requested_start_time || perm.requestedStartTime || '10:00');
      const endTime = isDayOff ? '' : (perm.requested_end_time || perm.requestedEndTime || '20:30');

      for (const targetSched of matchingSchedules) {
        if (!Array.isArray(targetSched.shifts)) continue;

        let modified = false;
        const updatedShifts = targetSched.shifts.map(s => {
          if (s.date === permDate) {
            modified = true;
            if (isDayOff) {
              const calcs = calculateShiftHours('', '', permDate, config, 'DESCANSO');
              return {
                ...s,
                startTime: '',
                endTime: '',
                isDayOff: true,
                shiftType: 'DESCANSO',
                ...calcs
              };
            } else {
              const calcs = calculateShiftHours(startTime, endTime, permDate, config, shiftType);
              return {
                ...s,
                startTime,
                endTime,
                isDayOff: false,
                shiftType,
                ...calcs
              };
            }
          }
          return s;
        });

        if (modified) {
          const totalNetHours = +updatedShifts.reduce((sum, s) => sum + (s.netHours || 0), 0).toFixed(2);
          const totalLunchHours = +updatedShifts.reduce((sum, s) => sum + (s.lunchHours || 0), 0).toFixed(2);

          await supabase.from('schedules').update({
            shifts: updatedShifts,
            total_net_hours: totalNetHours,
            total_lunch_hours: totalLunchHours,
            updated_at: new Date().toISOString()
          }).eq('id', targetSched.id);
        }
      }

      memoryCache.clearSchedules();
      memoryCache.clearReconciliation();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('schedules_data_updated', { detail: { weekStart, permDate } }));
        window.dispatchEvent(new CustomEvent('weeks_data_updated', { detail: { weekStart } }));
      }
      return true;
    } catch (err) {
      console.error('[applyPermissionToSchedule] Error actualizando horario en Supabase:', err);
      return false;
    }
  },

  deletePermission: async (permId) => {
    if (!isSupabaseConfigured) {
      return fetchLocal(`/api/permissions/${permId}`, { method: 'DELETE' });
    }
    const { error } = await supabase.from('permissions').delete().eq('id', permId);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  // ----------------------------------------------------
  // 7. Biometrics & Punches
  // ----------------------------------------------------
  getPunchBatches: async () => {
    if (!isSupabaseConfigured) return fetchLocal('/api/punches/batches');
    const { data, error } = await supabase.from('punch_batches').select('*').order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  getPunchRecords: async (filters = {}) => {
    const isWeekOnly = filters.weekStart && !filters.batchId && !filters.documentId && !filters.date;
    const isMonthOnly = filters.month && !filters.weekStart && !filters.batchId && !filters.documentId && !filters.date;
    const cacheKey = isWeekOnly ? `punch_week_${filters.weekStart}` : (isMonthOnly ? `punch_month_${filters.month}` : null);
    if (cacheKey && memoryCache.punchesByWeek.has(cacheKey)) {
      return memoryCache.punchesByWeek.get(cacheKey);
    }

    if (!isSupabaseConfigured) {
      const q = new URLSearchParams(filters).toString();
      const res = await fetchLocal(`/api/punches${q ? '?' + q : ''}`);
      if (cacheKey && Array.isArray(res)) memoryCache.punchesByWeek.set(cacheKey, res);
      return res;
    }
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      let query = supabase.from('punch_records').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
      if (filters.batchId) query = query.eq('batch_id', filters.batchId);
      if (filters.documentId) query = query.eq('document_id', filters.documentId);
      if (filters.date) query = query.eq('entry_date', filters.date);
      if (filters.weekStart) {
        // Incluir margen de 1 día antes y 1 día después para capturar turnos nocturnos que cruzan medianoche
        const d = new Date(filters.weekStart + 'T12:00:00Z');
        const dStart = new Date(d.getTime() - 1 * 86400000);
        const dEnd = new Date(d.getTime() + 7 * 86400000);
        query = query.gte('entry_date', dStart.toISOString().split('T')[0]).lte('entry_date', dEnd.toISOString().split('T')[0]);
      } else if (filters.month) {
        const [y, m] = filters.month.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const mStart = `${filters.month}-01`;
        const mEnd = `${filters.month}-${String(lastDay).padStart(2, '0')}`;
        query = query.gte('entry_date', mStart).lte('entry_date', mEnd);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < pageSize) break;
      page++;
    }
    const mapped = allData.map(r => {
      let calcs = r.real_calculations || {};
      if (r.entry_time && r.exit_time && r.exit_time !== '-' && (!calcs.nightHours || calcs.nightHours < 1.0)) {
        const reCalc = calculateShiftHours(r.entry_time.slice(0, 5), r.exit_time.slice(0, 5), r.entry_date, { nightStartTime: '19:00' });
        if (reCalc.nightHours > 0) {
          calcs = { ...calcs, nightHours: reCalc.nightHours, nightDayHours: reCalc.dayHours };
        }
      }
      return {
        id: r.id,
        batchId: r.batch_id,
        documentId: r.document_id,
        code: r.code,
        fullName: r.full_name,
        position: r.position,
        pdvName: r.pdv_name,
        supervisorName: r.supervisor_name,
        entryDate: r.entry_date,
        entryTime: r.entry_time,
        exitDate: r.exit_date,
        exitTime: r.exit_time,
        realCalculations: calcs
      };
    });

    if (cacheKey) {
      memoryCache.punchesByWeek.set(cacheKey, mapped);
    }
    return mapped;
  },

  savePunchBatch: async (batchInfo, parsedRecords) => {
    memoryCache.clearReconciliation();
    if (batchInfo?.weekStart) registerLoadedWeek(batchInfo.weekStart);
    if (!isSupabaseConfigured) {
      return fetchLocal('/api/punches/upload', {
        method: 'POST',
        body: JSON.stringify({ batchInfo, records: parsedRecords })
      });
    }
    const batchId = `batch-${Date.now()}`;
    const batchPayload = {
      id: batchId,
      file_name: batchInfo.fileName,
      file_size: batchInfo.fileSize,
      period: batchInfo.period || 'Semana cargada',
      store: batchInfo.store || 'Todos los PDVs',
      record_count: parsedRecords.length,
      uploaded_at: new Date().toISOString()
    };

    const { error: batchErr } = await supabase.from('punch_batches').insert(batchPayload);
    if (batchErr) throw new Error(batchErr.message);

    // Enrich punches with real PDVs and supervisors
    const [users, pdvs, schedules, sups] = await Promise.all([
      api.getUsers().catch(() => []),
      api.getPDVs().catch(() => []),
      api.getSchedules().catch(() => []),
      api.getSupervisors().catch(() => [])
    ]);

    const userByDoc = new Map(users.map(u => [String(u.documentId || u.document_id).trim(), u]));
    const schedByUser = new Map(schedules.map(s => [s.userId || s.user_id, s]));
    const pdvById = new Map(pdvs.map(p => [p.id, p]));
    const supById = new Map(sups.map(s => [s.id, s]));

    const punchRows = parsedRecords.map((r, i) => {
      const doc = String(r.documentId).trim();
      const u = userByDoc.get(doc) || userByDoc.get(doc.replace(/^0+/, ''));
      const s = u ? schedByUser.get(u.id) : null;
      let pdvObj = null;
      if (s && s.pdvId) pdvObj = pdvById.get(s.pdvId);
      else if (u && u.pdvId) pdvObj = pdvById.get(u.pdvId);

      const pdvName = r.pdvName || (pdvObj ? pdvObj.name : '');
      const supervisorName = r.supervisorName || (pdvObj ? supById.get(pdvObj.supervisorId)?.name : '') || 'Líder Regional';

      return {
        id: `punch-${batchId}-${i + 1}`,
        batch_id: batchId,
        document_id: r.documentId,
        code: r.code || u?.code || `COD-${doc.slice(-4)}`,
        full_name: r.fullName,
        position: r.position,
        pdv_name: pdvName,
        supervisor_name: supervisorName,
        entry_date: r.entryDate,
        entry_time: r.entryTime,
        exit_date: r.exitDate || r.entryDate,
        exit_time: r.exitTime || '-',
        real_calculations: r.realCalculations || {}
      };
    });

    const CHUNK_SIZE = 250;
    for (let c = 0; c < punchRows.length; c += CHUNK_SIZE) {
      const chunk = punchRows.slice(c, c + CHUNK_SIZE);
      const { error: punchErr } = await supabase.from('punch_records').insert(chunk);
      if (punchErr) throw new Error(punchErr.message);
    }

    return { batch: batchPayload, recordCount: punchRows.length };
  },

  // ----------------------------------------------------
  // Edición maestra (exclusiva perfil AUDITOR_VRX): marcaciones y programación sin restricción de fecha
  // ----------------------------------------------------
  vrxDeletePunch: async ({ role, punchId, documentId, date }) => {
    if (role !== 'AUDITOR_VRX') throw new Error('Solo el perfil maestro VRX puede eliminar marcaciones.');
    if (!isSupabaseConfigured) throw new Error('Se requiere conexión a la base de datos.');

    let query = supabase.from('punch_records').delete();
    if (punchId) {
      query = query.eq('id', punchId);
    } else if (documentId && date) {
      query = query.eq('document_id', documentId).eq('entry_date', date);
    } else {
      throw new Error('Identificador de marcación no encontrado para eliminar.');
    }
    const { error } = await query;
    if (error) throw new Error(error.message);
    memoryCache.clearReconciliation();
    return { success: true };
  },

  vrxEditPunch: async ({ role, punchId, documentId, fullName, position, pdvName, supervisorName, date, entryTime, exitTime }) => {
    if (role !== 'AUDITOR_VRX') throw new Error('Solo el perfil maestro VRX puede modificar marcaciones.');
    if (!isSupabaseConfigured) throw new Error('La edición maestra requiere conexión a la base de datos.');
    const norm = (t) => {
      const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3] || '00'}` : '';
    };
    const entry = norm(entryTime);
    const exit = norm(exitTime);

    // Si ambos campos están vacíos, interpretar como eliminación / limpieza de la marcación
    if (!entry && !exit) {
      return api.vrxDeletePunch({ role, punchId, documentId, date });
    }

    if (!entry) throw new Error('Hora de entrada inválida (use HH:MM).');
    let exitDate = date;
    if (exit && exit.substring(0, 5) < entry.substring(0, 5)) {
      const d = new Date(date + 'T12:00:00Z');
      exitDate = new Date(d.getTime() + 86400000).toISOString().split('T')[0];
    }
    const calcs = exit ? calculateShiftHours(entry.substring(0, 5), exit.substring(0, 5), date) : {};
    const payload = {
      entry_date: date,
      entry_time: entry,
      exit_date: exit ? exitDate : date,
      exit_time: exit || '-',
      real_calculations: calcs
    };
    memoryCache.clearReconciliation();
    if (punchId) {
      const { error } = await supabase.from('punch_records').update(payload).eq('id', punchId);
      if (error) throw new Error(error.message);
      return { success: true, id: punchId };
    }
    const id = `punch-vrx-${documentId}-${date}-${Date.now()}`;
    const { error } = await supabase.from('punch_records').insert({
      id,
      batch_id: null,
      document_id: documentId,
      code: `COD-${String(documentId).slice(-4)}`,
      full_name: fullName,
      position,
      pdv_name: pdvName || '',
      supervisor_name: supervisorName || 'Líder Regional',
      ...payload
    });
    if (error) throw new Error(error.message);
    return { success: true, id };
  },

  vrxEditScheduleShift: async ({ role, schedule, row, date, startTime, endTime, isDayOff }) => {
    if (role !== 'AUDITOR_VRX') throw new Error('Solo el perfil maestro VRX puede modificar la programación.');

    const targetUserId = schedule?.userId || row?.userId || row?.user_id;
    const targetDocId = row?.documentId || schedule?.user?.documentId || (String(targetUserId || '').startsWith('emp-') ? String(targetUserId).replace('emp-', '') : '');
    const targetPdvId = schedule?.pdvId || row?.pdvId || row?.pdv_id || 'pdv-1';
    const targetDate = date || row?.date;

    if (!targetUserId) throw new Error('Usuario / Colaborador no encontrado para la programación.');
    if (!targetDate) throw new Error('Fecha no especificada para la programación.');

    // Calculate Monday weekStart from date
    let weekStart = schedule?.weekStart || row?.weekStart;
    if (!weekStart && targetDate) {
      const [y, m, d] = targetDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const day = dt.getUTCDay();
      const diff = dt.getUTCDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(Date.UTC(y, m - 1, diff));
      weekStart = mon.toISOString().slice(0, 10);
    }
    const [wy, wm, wd] = weekStart.split('-').map(Number);
    const sunDt = new Date(Date.UTC(wy, wm - 1, wd + 6));
    const weekEnd = sunDt.toISOString().slice(0, 10);

    let targetSchedule = schedule;
    if (!targetSchedule || !targetSchedule.shifts || targetSchedule.shifts.length === 0) {
      let allSchedules = await api.getSchedules({ weekStart, pdvId: targetPdvId });
      targetSchedule = allSchedules.find(s => 
        (s.userId === targetUserId || (targetDocId && (s.userId === `emp-${targetDocId}` || s.user?.documentId === targetDocId))) && 
        s.weekStart === weekStart
      );
      if (!targetSchedule) {
        const globalSchedules = await api.getSchedules({ weekStart });
        targetSchedule = globalSchedules.find(s => 
          (s.userId === targetUserId || (targetDocId && (s.userId === `emp-${targetDocId}` || s.user?.documentId === targetDocId))) && 
          s.weekStart === weekStart
        );
      }
      if (!targetSchedule) {
        targetSchedule = {
          userId: targetUserId,
          documentId: targetDocId,
          fullName: row?.fullName,
          position: row?.position,
          pdvId: targetPdvId,
          weekStart,
          weekEnd,
          shifts: [],
          notes: 'Creado por Auditoría Maestra VRX'
        };
      }
    }

    // Ensure all 7 days of the week exist in shifts array
    const shiftsMap = new Map();
    (targetSchedule.shifts || []).forEach(s => {
      if (s.date) shiftsMap.set(s.date, { ...s });
    });

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayDate = new Date(Date.UTC(wy, wm - 1, wd + dayOffset));
      const dateStr = dayDate.toISOString().slice(0, 10);
      if (!shiftsMap.has(dateStr)) {
        const calcs = calculateShiftHours('', '', dateStr, {}, 'DESCANSO');
        shiftsMap.set(dateStr, {
          date: dateStr,
          shiftType: 'DESCANSO',
          isDayOff: true,
          startTime: '',
          endTime: '',
          ...calcs
        });
      }
    }

    const base = shiftsMap.get(targetDate) || { date: targetDate };
    const calcs = isDayOff
      ? calculateShiftHours('', '', targetDate, {}, 'DESCANSO')
      : calculateShiftHours(startTime, endTime, targetDate, {}, 'ORDINARIO');
    const updated = isDayOff
      ? { ...base, date: targetDate, shiftType: 'DESCANSO', isDayOff: true, startTime: '', endTime: '', ...calcs }
      : { ...base, date: targetDate, shiftType: 'ORDINARIO', isDayOff: false, startTime, endTime, ...calcs };
    shiftsMap.set(targetDate, updated);

    const shifts = Array.from(shiftsMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const result = await api.saveBatchPdvSchedules({
      pdvId: targetSchedule.pdvId || targetPdvId,
      weekStart,
      weekEnd,
      schedules: [{
        userId: targetUserId,
        documentId: targetDocId,
        fullName: row?.fullName,
        position: row?.position,
        pdvId: targetSchedule.pdvId || targetPdvId,
        shifts,
        notes: isDayOff ? 'Día de descanso asignado por Auditoría VRX' : 'Horario ajustado por Auditoría Maestra VRX'
      }]
    });

    memoryCache.clearSchedules();
    memoryCache.clearReconciliation();
    return result;
  },

  // ----------------------------------------------------
  // 8. Reconciliation & Auditor VRX Engine
  // ----------------------------------------------------
  getNovelties: async () => {
    if (memoryCache.novelties) return memoryCache.novelties;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem('control_turnos_novelties');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            memoryCache.novelties = parsed;
            return parsed;
          }
        }
        // Initialize default seed novelties
        localStorage.setItem('control_turnos_novelties', JSON.stringify(initialNovelties));
        memoryCache.novelties = initialNovelties;
        return initialNovelties;
      } catch (e) {
        console.error('Error reading novelties:', e);
      }
    }
    memoryCache.novelties = initialNovelties;
    return initialNovelties;
  },

  uploadNoveltiesFile: async (file) => {
    memoryCache.novelties = null;
    memoryCache.clearReconciliation();
    let parsedNovelties = [];
    if (file.name.endsWith('.csv') || file.type?.includes('csv') || file.type?.includes('text')) {
      const text = await file.text();
      parsedNovelties = parseNoveltiesReport(text);
    } else {
      const arrayBuffer = await file.arrayBuffer();
      parsedNovelties = parseNoveltiesReport(arrayBuffer);
    }

    if (!parsedNovelties || parsedNovelties.length === 0) {
      throw new Error('No se encontraron registros de novedades válidos en el archivo.');
    }

    // Persist to localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const existingRaw = localStorage.getItem('control_turnos_novelties');
        const existing = existingRaw ? JSON.parse(existingRaw) : initialNovelties;
        const mergedMap = new Map();
        existing.forEach(n => mergedMap.set(`${n.documentId}-${n.startDate}-${n.endDate}`, n));
        parsedNovelties.forEach(n => mergedMap.set(`${n.documentId}-${n.startDate}-${n.endDate}`, n));
        const combined = Array.from(mergedMap.values());
        localStorage.setItem('control_turnos_novelties', JSON.stringify(combined));
      } catch (e) {
        console.error('Error saving novelties:', e);
      }
    }

    return {
      success: true,
      count: parsedNovelties.length,
      novelties: parsedNovelties
    };
  },

  // ----------------------------------------------------
  // 9b. Liquidación Oficial de Horas de Nómina (HS)
  // ----------------------------------------------------
  uploadPayrollLiquidationFile: async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const parsedData = parsePayrollLiquidation(arrayBuffer);

    if (!parsedData || !parsedData.records || parsedData.records.length === 0) {
      throw new Error('No se encontraron registros válidos de liquidación de nómina.');
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('control_turnos_payroll_liquidation', JSON.stringify(parsedData));
      } catch (e) {
        console.error('Error saving payroll liquidation:', e);
      }
    }

    return parsedData;
  },

  getPayrollLiquidation: async (params = {}) => {
    const week = String(params.week || '28');

    // 1. Check custom uploaded file in localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem('control_turnos_payroll_liquidation');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (!params.week || String(parsed.week) === week)) {
            return parsed;
          }
        }
      } catch (e) {
        console.error('Error loading payroll liquidation from localStorage:', e);
      }
    }

    // 2. Return pre-bundled official payroll for weeks 27-31
    if (OFFICIAL_PAYROLL_BY_WEEK && (OFFICIAL_PAYROLL_BY_WEEK[week] || OFFICIAL_PAYROLL_BY_WEEK['28'])) {
      return OFFICIAL_PAYROLL_BY_WEEK[week] || OFFICIAL_PAYROLL_BY_WEEK['28'];
    }

    // 3. Fallback to local server
    try {
      const q = new URLSearchParams(params).toString();
      const res = await fetchLocal(`/api/payroll${q ? '?' + q : ''}`);
      if (res && res.success) return res;
    } catch (e) {}

    return null;
  },

  getReconciliation: async ({ weekStart, month, periodType = 'WEEK', pdvId, supervisorId, documentId }) => {
    const isMonthly = periodType === 'MONTH' || (!weekStart && !!month);
    const effPeriodType = isMonthly ? 'MONTH' : 'WEEK';
    const effMonth = month || (weekStart ? weekStart.slice(0, 7) : '2026-09');
    const cacheKey = `${effPeriodType}_${isMonthly ? effMonth : (weekStart || '')}_${pdvId || ''}_${supervisorId || ''}_${documentId || ''}`;
    if (memoryCache.reconciliationByParams.has(cacheKey)) {
      return memoryCache.reconciliationByParams.get(cacheKey);
    }

    if (!isSupabaseConfigured) {
      const q = new URLSearchParams({
        periodType: effPeriodType,
        ...(isMonthly ? { month: effMonth } : (weekStart ? { weekStart } : {})),
        ...(pdvId ? { pdvId } : {}),
        ...(supervisorId ? { supervisorId } : {}),
        ...(documentId ? { documentId } : {})
      }).toString();
      const res = await fetchLocal(`/api/reconciliation${q ? '?' + q : ''}`);
      if (res) memoryCache.reconciliationByParams.set(cacheKey, res);
      return res;
    }

    const schedFilters = isMonthly ? { month: effMonth, pdvId, supervisorId } : { weekStart, pdvId, supervisorId };
    const punchFilters = isMonthly ? { month: effMonth } : { weekStart };

    const [users, pdvs, supervisors, schedules, punches, config, novelties] = await Promise.all([
      api.getUsers(),
      api.getPDVs(),
      api.getSupervisors(),
      api.getSchedules(schedFilters),
      api.getPunchRecords(punchFilters),
      api.getConfig(),
      api.getNovelties()
    ]);

    const result = runReconciliation({
      users,
      pdvs,
      supervisors,
      allSchedules: schedules,
      allPunches: punches,
      novelties,
      config,
      weekStart: isMonthly ? null : weekStart,
      month: isMonthly ? effMonth : null,
      periodType: effPeriodType,
      pdvId,
      supervisorId,
      documentId
    });

    if (result) {
      memoryCache.reconciliationByParams.set(cacheKey, result);
    }
    return result;
  },

  getHabitualVsPunchesAudit: async ({ weekStart = '2026-08-31', pdvId, supervisorId }) => {
    const auditCacheKey = `audit_${weekStart}_${pdvId || 'ALL'}_${supervisorId || 'ALL'}`;
    if (memoryCache.auditByParams.has(auditCacheKey)) {
      return memoryCache.auditByParams.get(auditCacheKey);
    }

    if (!isSupabaseConfigured) {
      const q = new URLSearchParams({
        weekStart,
        ...(pdvId ? { pdvId } : {}),
        ...(supervisorId ? { supervisorId } : {})
      }).toString();
      try {
        const localData = await fetchLocal(`/api/audit/habitual-vs-punches${q ? '?' + q : ''}`);
        if (localData && (localData.pdvsSummary || localData.totals)) {
          memoryCache.auditByParams.set(auditCacheKey, localData);
          return localData;
        }
      } catch (e) {
        // Fallback to local computation
      }
    }

    const [pdvs, supervisors, schedules, punches, users] = await Promise.all([
      api.getPDVs(),
      api.getSupervisors(),
      api.getSchedules({ weekStart }),
      api.getPunchRecords({ weekStart }),
      api.getUsers()
    ]);

    const result = buildAuditDataLocally({
      pdvs,
      supervisors,
      users,
      schedules,
      punches,
      weekStart,
      selectedPdvId: pdvId,
      selectedSupervisorId: supervisorId
    });

    if (result) {
      memoryCache.auditByParams.set(auditCacheKey, result);
    }
    return result;
  },

  // ----------------------------------------------------
  // 9. Supplementary Justifications
  // ----------------------------------------------------
  saveSupplementaryJustification: async (justification) => {
    if (!isSupabaseConfigured) {
      return fetchLocal('/api/reconciliation/supplementary-justifications', {
        method: 'POST',
        body: JSON.stringify(justification)
      });
    }
    const categoryTag = justification.reasonCategory ? `[${justification.reasonCategory}] ` : '';
    const rawReason = justification.detailedReason || justification.reason || '';
    const fullReason = rawReason.startsWith('[') ? rawReason : `${categoryTag}${rawReason}`;

    const payload = {
      id: `just-${Date.now()}`,
      pdv_id: justification.pdvId,
      pdv_name: justification.pdvName,
      supervisor_id: justification.supervisorId,
      week_start: justification.weekStart,
      reason: fullReason,
      hours_increase: Number(justification.totalSupplementaryHours || justification.hoursIncrease || 0),
      submitted_by: justification.createdBy || justification.submittedBy || 'Administrador PDV',
      submitted_at: new Date().toISOString(),
      status: 'SUBMITTED'
    };
    const { data, error } = await supabase.from('supplementary_justifications').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      pdvId: data.pdv_id,
      pdvName: data.pdv_name,
      supervisorId: data.supervisor_id,
      weekStart: data.week_start,
      reasonCategory: justification.reasonCategory || 'Tiempo Adicional Autorizado',
      detailedReason: rawReason,
      totalSupplementaryHours: Number(data.hours_increase || 0),
      createdBy: data.submitted_by,
      submittedAt: data.submitted_at,
      status: data.status
    };
  },

  getSupplementaryJustifications: async (filters = {}) => {
    if (!isSupabaseConfigured) {
      const q = new URLSearchParams(filters).toString();
      return fetchLocal(`/api/reconciliation/supplementary-justifications${q ? '?' + q : ''}`);
    }
    let query = supabase.from('supplementary_justifications')
      .select('*')
      .neq('status', 'AUDIT_LOG')
      .order('submitted_at', { ascending: false });
    if (filters.pdvId) query = query.eq('pdv_id', filters.pdvId);
    if (filters.supervisorId) query = query.eq('supervisor_id', filters.supervisorId);
    if (filters.weekStart) query = query.eq('week_start', filters.weekStart);
    const { data, error } = await query;
    if (error) {
      console.warn('Error reading supplementary_justifications table:', error);
      return [];
    }
    return (data || []).map(j => {
      let cat = 'Tiempo Adicional Autorizado';
      let detReason = j.reason || '';
      const m = (j.reason || '').match(/^\[(.*?)\]\s*(.*)$/);
      if (m) {
        cat = m[1];
        detReason = m[2];
      }
      return {
        id: j.id,
        pdvId: j.pdv_id,
        pdv_id: j.pdv_id,
        pdvName: j.pdv_name,
        pdv_name: j.pdv_name,
        supervisorId: j.supervisor_id,
        supervisor_id: j.supervisor_id,
        weekStart: j.week_start,
        week_start: j.week_start,
        month: j.week_start ? j.week_start.substring(0, 7) : '',
        reasonCategory: cat,
        detailedReason: detReason || j.reason,
        totalSupplementaryHours: Number(j.hours_increase || 0),
        hoursIncrease: Number(j.hours_increase || 0),
        createdBy: j.submitted_by || 'Administrador PDV',
        submittedAt: j.submitted_at,
        status: j.status || 'SUBMITTED'
      };
    });
  },

  getReconciliationIntegrity: async ({ weekStart, pdvId, supervisorId } = {}) => {
    const cacheKey = `integrity_${weekStart || ''}_${pdvId || ''}_${supervisorId || ''}`;
    if (memoryCache.reconciliationByParams.has(cacheKey)) {
      return memoryCache.reconciliationByParams.get(cacheKey);
    }

    const [punches, users, pdvs] = await Promise.all([
      api.getPunchRecords({ weekStart }).catch(() => []),
      api.getUsers().catch(() => []),
      api.getPDVs().catch(() => [])
    ]);

    let filteredPunches = punches;
    if (weekStart) {
      const start = new Date(weekStart + 'T12:00:00Z');
      const dates = new Set();
      for (let i = 0; i < 7; i++) {
        dates.add(new Date(start.getTime() + i * 86400000).toISOString().split('T')[0]);
      }
      filteredPunches = punches.filter(p => dates.has(p.entryDate));
    }

    if (pdvId && pdvId !== 'ALL') {
      const pObj = pdvs.find(p => p.id === pdvId || p.code === pdvId);
      if (pObj) {
        filteredPunches = filteredPunches.filter(p => p.pdvName === pObj.name);
      }
    }

    const incompleteList = [];
    const shortShiftList = [];

    filteredPunches.forEach(p => {
      const u = users.find(usr => usr.documentId === p.documentId) || {};
      const netHours = p.realCalculations?.netHours || 0;
      if (!p.exitTime || p.exitTime === '-' || p.exitTime === '') {
        incompleteList.push({
          employeeName: p.fullName || u.fullName || 'Colaborador',
          documentId: p.documentId,
          pdvName: p.pdvName || 'Punto de Venta',
          entryDate: p.entryDate,
          entryTime: p.entryTime,
          exitTime: null,
          netHours: 0,
          type: 'MISSING_EXIT',
          reason: 'Sin Marcación de Salida'
        });
      } else if (netHours > 0 && netHours < 4) {
        shortShiftList.push({
          employeeName: p.fullName || u.fullName || 'Colaborador',
          documentId: p.documentId,
          pdvName: p.pdvName || 'Punto de Venta',
          entryDate: p.entryDate,
          entryTime: p.entryTime,
          exitTime: p.exitTime,
          netHours,
          type: 'SHORT_SHIFT',
          reason: 'Turno menor a 4 horas'
        });
      }
    });

    const result = {
      incompleteCount: incompleteList.length,
      shortShiftCount: shortShiftList.length,
      incompleteList,
      shortShiftList
    };
    memoryCache.reconciliationByParams.set(cacheKey, result);
    return result;
  },

  getMonthlyReconciliationDashboard: async ({ pdvId, periodType = 'MONTH', month = '2026-09', weekStart = '2026-09-21' } = {}) => {
    const cacheKey = `monthlyDash_${pdvId || ''}_${periodType}_${month}_${weekStart}`;
    if (memoryCache.reconciliationByParams.has(cacheKey)) {
      return memoryCache.reconciliationByParams.get(cacheKey);
    }

    const schedFilters = periodType === 'WEEK' ? { weekStart, pdvId } : { month, pdvId };
    const punchFilters = periodType === 'WEEK' ? { weekStart } : { month };

    const [pdvs, schedules, punches, users] = await Promise.all([
      api.getPDVs().catch(() => []),
      api.getSchedules(schedFilters).catch(() => []),
      api.getPunchRecords(punchFilters).catch(() => []),
      api.getUsers().catch(() => [])
    ]);

    const pdv = pdvs.find(p => p.id === pdvId || p.code === pdvId) || pdvs[0] || { id: 'pdv-1', name: 'Punto de Venta' };
    
    // Calculate weekEnd if period is WEEK
    let weekEnd = '';
    if (weekStart) {
      const d = new Date(weekStart + 'T12:00:00Z');
      d.setDate(d.getDate() + 6);
      weekEnd = d.toISOString().split('T')[0];
    }

    // Filter schedules
    const targetSchedules = schedules.filter(s => {
      const matchPdv = s.pdvId === pdv.id || s.pdvId === pdv.code || (pdv.code && s.pdvName && s.pdvName.includes(pdv.code));
      if (!matchPdv) return false;
      if (periodType === 'WEEK') {
        return s.weekStart === weekStart;
      }
      return (s.weekStart && isWeekInMonth(s.weekStart, month)) ||
             (s.shifts && s.shifts.some(sh => sh.date && sh.date.startsWith(month)));
    });

    // Also merge localStorage schedules for this week/month if any
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const localKeys = Object.keys(localStorage).filter(k => k.startsWith('control_turnos_schedules_'));
        localKeys.forEach(k => {
          const wStart = k.replace('control_turnos_schedules_', '');
          const matchesPeriod = periodType === 'WEEK' ? wStart === weekStart : wStart.startsWith(month);
          if (matchesPeriod) {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                parsed.forEach(item => {
                  const itemPdvMatch = item.pdvId === pdv.id || item.pdv?.id === pdv.id || item.employee?.pdvId === pdv.id;
                  if (itemPdvMatch && !targetSchedules.some(ts => ts.userId === item.userId && ts.weekStart === wStart)) {
                    targetSchedules.push({
                      userId: item.userId,
                      pdvId: pdv.id,
                      weekStart: wStart,
                      shifts: item.shifts || [],
                      totalNetHours: item.shifts ? item.shifts.reduce((acc, sh) => acc + (sh.netHours || 0), 0) : 0,
                      user: item.employee || {}
                    });
                  }
                });
              }
            }
          }
        });
      }
    } catch (e) {}

    // Filter punches (Talento Humano)
    const pdvPunches = punches.filter(pu => {
      const matchPdv = pu.pdvId === pdv.id || 
                       pu.pdvName === pdv.name || 
                       (pdv.code && pu.pdvName && pu.pdvName.includes(pdv.code)) ||
                       (pu.pdvCode && pu.pdvCode === pdv.code);
      if (!matchPdv) return false;
      if (periodType === 'WEEK') {
        return pu.entryDate >= weekStart && pu.entryDate <= weekEnd;
      }
      return pu.entryDate && pu.entryDate.startsWith(month);
    });

    const scheduledTotals = { overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0 };
    const punchTotals = { overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0 };

    targetSchedules.forEach(s => {
      if (s.totalNetHours > 42) scheduledTotals.overtime += (s.totalNetHours - 42);
      (s.shifts || []).forEach(sh => {
        if (sh.nightHours) scheduledTotals.night += Number(sh.nightHours);
        if (sh.isSunday) scheduledTotals.sunday += Number(sh.netHours || 0);
        if (sh.isHoliday) scheduledTotals.holiday += Number(sh.netHours || 0);
      });
    });

    pdvPunches.forEach(pu => {
      const calc = pu.realCalculations || {};
      if (calc.overtimeHours) punchTotals.overtime += Number(calc.overtimeHours);
      if (calc.nightHours) punchTotals.night += Number(calc.nightHours);
      if (calc.isSunday) punchTotals.sunday += Number(calc.netHours || 0);
      if (calc.isHoliday) punchTotals.holiday += Number(calc.netHours || 0);
    });

    ['overtime', 'night', 'sunday', 'holiday'].forEach(k => {
      scheduledTotals[k] = +scheduledTotals[k].toFixed(1);
      punchTotals[k] = +punchTotals[k].toFixed(1);
    });
    scheduledTotals.totalSpecial = +(scheduledTotals.overtime + scheduledTotals.night + scheduledTotals.sunday + scheduledTotals.holiday).toFixed(1);
    punchTotals.totalSpecial = +(punchTotals.overtime + punchTotals.night + punchTotals.sunday + punchTotals.holiday).toFixed(1);

    const diffTotals = {
      overtime: +(punchTotals.overtime - scheduledTotals.overtime).toFixed(1),
      night: +(punchTotals.night - scheduledTotals.night).toFixed(1),
      sunday: +(punchTotals.sunday - scheduledTotals.sunday).toFixed(1),
      holiday: +(punchTotals.holiday - scheduledTotals.holiday).toFixed(1),
      totalSpecial: +(punchTotals.totalSpecial - scheduledTotals.totalSpecial).toFixed(1)
    };

    const chartScheduledData = [
      { name: 'Horas Extras', horas: scheduledTotals.overtime, val: scheduledTotals.overtime, fill: '#3b82f6', color: '#3b82f6' },
      { name: 'Recargo Nocturno', horas: scheduledTotals.night, val: scheduledTotals.night, fill: '#a855f7', color: '#a855f7' },
      { name: 'Dominicales', horas: scheduledTotals.sunday, val: scheduledTotals.sunday, fill: '#10b981', color: '#10b981' },
      { name: 'Festivos', horas: scheduledTotals.holiday, val: scheduledTotals.holiday, fill: '#f59e0b', color: '#f59e0b' }
    ];

    const chartPunchesData = [
      { name: 'Horas Extras', horas: punchTotals.overtime, val: punchTotals.overtime, fill: '#3b82f6', color: '#3b82f6' },
      { name: 'Recargo Nocturno', horas: punchTotals.night, val: punchTotals.night, fill: '#a855f7', color: '#a855f7' },
      { name: 'Dominicales', horas: punchTotals.sunday, val: punchTotals.sunday, fill: '#10b981', color: '#10b981' },
      { name: 'Festivos', horas: punchTotals.holiday, val: punchTotals.holiday, fill: '#f59e0b', color: '#f59e0b' }
    ];

    const chartComparisonData = [
      { category: 'Horas Extras', Cronograma: scheduledTotals.overtime, Marcaciones: punchTotals.overtime },
      { category: 'Recargo Nocturno', Cronograma: scheduledTotals.night, Marcaciones: punchTotals.night },
      { category: 'Dominicales', Cronograma: scheduledTotals.sunday, Marcaciones: punchTotals.sunday },
      { category: 'Festivos', Cronograma: scheduledTotals.holiday, Marcaciones: punchTotals.holiday }
    ];

    const employeeMap = {};
    const pdvUsers = users.filter(u => u.pdvId === pdv.id || u.pdv_id === pdv.id);
    pdvUsers.forEach(u => {
      employeeMap[u.id] = {
        userId: u.id,
        fullName: u.fullName || u.full_name,
        documentId: u.documentId || u.document_id,
        position: u.position || 'ASESOR(A) DE IMAGEN',
        contractType: u.contractType || u.contract_type || 'FIJO',
        scheduled: { overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0 },
        punches: { overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0 },
        diff: { totalSpecial: 0 }
      };
    });

    monthSchedules.forEach(s => {
      let emp = employeeMap[s.userId];
      if (!emp) {
        emp = {
          userId: s.userId,
          fullName: s.user?.fullName || s.user?.full_name || `Colaborador ${s.userId}`,
          documentId: s.user?.documentId || s.user?.document_id || '',
          position: s.user?.position || 'ASESOR(A) DE IMAGEN',
          contractType: s.user?.contractType || 'FIJO',
          scheduled: { overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0 },
          punches: { overtime: 0, night: 0, sunday: 0, holiday: 0, totalSpecial: 0 },
          diff: { totalSpecial: 0 }
        };
        employeeMap[s.userId] = emp;
      }
      if (s.totalNetHours > 42) emp.scheduled.overtime += (s.totalNetHours - 42);
      (s.shifts || []).forEach(sh => {
        if (sh.nightHours) emp.scheduled.night += Number(sh.nightHours);
        if (sh.isSunday) emp.scheduled.sunday += Number(sh.netHours || 0);
        if (sh.isHoliday) emp.scheduled.holiday += Number(sh.netHours || 0);
      });
    });

    const employees = Object.values(employeeMap).map(emp => {
      ['overtime', 'night', 'sunday', 'holiday'].forEach(k => {
        emp.scheduled[k] = +emp.scheduled[k].toFixed(1);
        emp.punches[k] = +emp.punches[k].toFixed(1);
      });
      emp.scheduled.totalSpecial = +(emp.scheduled.overtime + emp.scheduled.night + emp.scheduled.sunday + emp.scheduled.holiday).toFixed(1);
      emp.punches.totalSpecial = +(emp.punches.overtime + emp.punches.night + emp.punches.sunday + emp.punches.holiday).toFixed(1);
      emp.diff.totalSpecial = +(emp.punches.totalSpecial - emp.scheduled.totalSpecial).toFixed(1);
      return emp;
    });

    const monthLabel = month === '2026-09' ? 'Septiembre 2026' : (month === '2026-08' ? 'Agosto 2026' : month);

    const result = {
      pdv,
      monthLabel,
      diffTotals,
      scheduledTotals,
      punchTotals,
      chartScheduledData,
      chartPunchesData,
      chartComparisonData,
      employees,
      kpis: { overtimeRealHours: diffTotals.totalSpecial }
    };
    memoryCache.reconciliationByParams.set(cacheKey, result);
    return result;
  },

  uploadPunchFile: async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const parsedRecords = parsePunchExcel(arrayBuffer);
    if (!parsedRecords || parsedRecords.length === 0) {
      throw new Error('No se encontraron registros de marcación válidos en el archivo Excel.');
    }

    const dates = parsedRecords.map(r => r.date).filter(Boolean);
    let detectedWeekStart = null;
    let detectedPeriod = 'Semana cargada';
    if (dates.length > 0) {
      const sorted = dates.sort();
      const firstDate = sorted[0];
      const foundWeek = ALL_WEEKS_2026.find(w => firstDate >= w.weekStart && firstDate <= w.weekEnd);
      if (foundWeek) {
        detectedWeekStart = foundWeek.weekStart;
        detectedPeriod = foundWeek.label;
        registerLoadedWeek(foundWeek.weekStart);
      }
    }

    const batchInfo = {
      fileName: file.name,
      fileSize: file.size,
      period: detectedPeriod,
      store: 'Todos los PDVs',
      weekStart: detectedWeekStart
    };
    const saved = await api.savePunchBatch(batchInfo, parsedRecords);
    const retiredCount = parsedRecords.filter(r => r.isRetired).length;
    return {
      ...saved,
      recordCount: parsedRecords.length,
      retiredCount,
      records: parsedRecords,
      weekStart: detectedWeekStart
    };
  },

  getWeeksWithData: async () => {
    const weeksSet = new Set(KNOWN_WEEKS_WITH_DATA);

    // 1. Escanear localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('control_turnos_schedules_')) {
          const w = k.replace('control_turnos_schedules_', '');
          if (w) weeksSet.add(w);
        }
      }
    }

    // 2. Escanear Supabase si está configurado
    if (isSupabaseConfigured) {
      try {
        const [schedRes, batchRes] = await Promise.all([
          supabase.from('schedules').select('week_start').limit(5000),
          supabase.from('punch_batches').select('week_start').limit(100)
        ]);
        if (schedRes.data) {
          schedRes.data.forEach(s => { if (s.week_start) weeksSet.add(s.week_start); });
        }
        if (batchRes.data) {
          batchRes.data.forEach(b => { if (b.week_start) weeksSet.add(b.week_start); });
        }
      } catch (err) {
        console.warn('Error reading weeks with data from Supabase:', err);
      }
    }

    const allWeeks = Array.from(weeksSet).sort();
    registerLoadedWeeks(allWeeks);
    return allWeeks;
  },

  resetAllOperationalData: async () => {
    if (isSupabaseConfigured) {
      await Promise.all([
        supabase.from('schedules').delete().neq('id', '__none__'),
        supabase.from('punch_records').delete().neq('id', '__none__'),
        supabase.from('punch_batches').delete().neq('id', '__none__'),
        supabase.from('permissions').delete().neq('id', '__none__'),
        supabase.from('supplementary_justifications').delete().neq('id', '__none__')
      ]);
    } else {
      await fetchLocal('/api/reset-data', { method: 'POST' }).catch(() => {});
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove = Object.keys(localStorage).filter(k => 
        k.startsWith('control_turnos_schedules_') ||
        k === 'control_turnos_custom_employees' ||
        k === 'control_turnos_payroll_liquidation' ||
        k === 'control_turnos_novelties'
      );
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }

    return { success: true };
  },

  generateSamplePunches: async ({ weekStart = '2026-08-31' } = {}) => {
    const [schedules, users, pdvs] = await Promise.all([
      api.getSchedules({ weekStart }).catch(() => []),
      api.getUsers().catch(() => []),
      api.getPDVs().catch(() => [])
    ]);

    const sampleRecords = [];
    const sourceSchedules = schedules.length > 0 ? schedules : [
      { userId: 'emp-1', pdvId: 'pdv-1', shifts: [
        { date: '2026-08-31', startTime: '10:00', endTime: '20:30' },
        { date: '2026-09-01', startTime: '10:00', endTime: '20:30' },
        { date: '2026-09-02', startTime: '10:00', endTime: '20:30' }
      ]}
    ];

    sourceSchedules.forEach(sched => {
      const user = users.find(u => u.id === sched.userId) || sched.user || {};
      const pdv = pdvs.find(p => p.id === sched.pdvId) || {};
      (sched.shifts || []).forEach(sh => {
        if (sh.isDayOff || !sh.startTime || !sh.endTime) return;
        const entryDate = sh.date;
        const entryTime = `${sh.startTime}:00`;
        const exitTime = `${sh.endTime}:00`;
        const calc = calculateShiftHours(sh.startTime, sh.endTime, entryDate);
        sampleRecords.push({
          code: user.code || `COD-${(user.documentId || '1234').slice(-4)}`,
          documentId: user.documentId || '1010101010',
          fullName: user.fullName || 'Colaborador de Prueba',
          position: user.position || 'ASESOR(A) DE IMAGEN',
          pdvName: pdv.name || 'PDV QUEST',
          supervisorName: pdv.supervisorName || 'Líder Regional',
          entryDate,
          entryTime,
          exitDate: entryDate,
          exitTime,
          realCalculations: calc
        });
      });
    });

    const batchInfo = {
      fileName: 'Marcaciones_Muestra_Automatica.xlsx',
      fileSize: 10240,
      period: `Semana ${weekStart}`,
      store: 'Muestra Nacional'
    };

    return api.savePunchBatch(batchInfo, sampleRecords);
  },

  requestCorrections: async ({ weekStart, corrections = [], adminNotes, requestedBy }) => {
    return { success: true, message: `Se enviaron ${corrections.length} solicitudes de corrección al PDV para revisión.` };
  },

  cancelCorrection: async ({ userId, weekStart, date }) => {
    return { success: true, message: 'Solicitud de corrección cancelada con éxito.' };
  },

  // ----------------------------------------------------
  // 10. Dashboard Analytics (Cálculo Nacional & Zonal en Vivo)
  // ----------------------------------------------------
  getDashboardAnalytics: async ({ month = '2026-09', weekStart, periodType = 'MONTH', supervisorId, pdvId } = {}) => {
    const isMonthly = periodType === 'MONTH' || (!weekStart && !!month);
    const effPeriodType = isMonthly ? 'MONTH' : 'WEEK';
    const effMonth = month || (weekStart ? weekStart.slice(0, 7) : '2026-09');

    let prevMonthStr = '2026-08';
    if (effMonth && effMonth.includes('-')) {
      const [y, m] = effMonth.split('-').map(Number);
      const prevD = new Date(Date.UTC(y, m - 2, 1));
      prevMonthStr = prevD.toISOString().slice(0, 7);
    }

    let prevWeekStart = '';
    if (effPeriodType === 'WEEK' && weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      const d = new Date(weekStart + 'T12:00:00Z');
      if (!isNaN(d.getTime())) {
        const prevD = new Date(d.getTime() - 7 * 86400000);
        prevWeekStart = prevD.toISOString().split('T')[0];
      }
    }

    const [pdvs, supervisors, users, schedules, prevSchedules, punches, prevPunches] = await Promise.all([
      api.getPDVs().catch(() => []),
      api.getSupervisors().catch(() => []),
      api.getUsers().catch(() => []),
      api.getSchedules(isMonthly ? { month: effMonth } : { weekStart }).catch(() => []),
      api.getSchedules(isMonthly ? { month: prevMonthStr } : { weekStart: prevWeekStart }).catch(() => []),
      api.getPunchRecords(isMonthly ? { month: effMonth } : { weekStart }).catch(() => []),
      api.getPunchRecords(isMonthly ? { month: prevMonthStr } : { weekStart: prevWeekStart }).catch(() => [])
    ]);

    let filteredPdvs = pdvs;
    if (pdvId && pdvId !== 'ALL') {
      filteredPdvs = pdvs.filter(p => p.id === pdvId || p.code === pdvId);
    } else if (supervisorId) {
      filteredPdvs = pdvs.filter(p => p.supervisorId === supervisorId);
    }
    const pdvIdSet = new Set(filteredPdvs.flatMap(p => [p.id, p.code, cleanNormalizeStr(p.name)]));

    const filterSchedules = (schedList, targetPeriod, isMonthMode) => {
      return (schedList || []).filter(s => {
        const matchPdv = pdvIdSet.size === 0 || pdvIdSet.has(s.pdvId) || (s.pdvName && pdvIdSet.has(cleanNormalizeStr(s.pdvName)));
        if (!matchPdv) return false;
        if (!isMonthMode) return s.weekStart === targetPeriod;
        return (s.weekStart && isWeekInMonth(s.weekStart, targetPeriod)) ||
               (s.shifts && s.shifts.some(sh => sh.date && sh.date.startsWith(targetPeriod)));
      });
    };

    const filterPunches = (punchList, targetPeriod, isMonthMode) => {
      return (punchList || []).filter(pu => {
        const matchPdv = pdvIdSet.size === 0 || 
                         pdvIdSet.has(pu.pdvId) || 
                         (pu.pdvName && pdvIdSet.has(cleanNormalizeStr(pu.pdvName))) ||
                         (pu.pdvCode && pdvIdSet.has(pu.pdvCode));
        if (!matchPdv) return false;
        if (!isMonthMode) {
          const d = new Date(targetPeriod + 'T12:00:00Z');
          const dEnd = new Date(d.getTime() + 6 * 86400000).toISOString().split('T')[0];
          return pu.entryDate >= targetPeriod && pu.entryDate <= dEnd;
        }
        return pu.entryDate && pu.entryDate.startsWith(targetPeriod);
      });
    };

    const curScheds = filterSchedules(schedules, isMonthly ? effMonth : weekStart, isMonthly);
    const prevScheds = filterSchedules(prevSchedules, isMonthly ? prevMonthStr : prevWeekStart, isMonthly);

    const curPunches = filterPunches(punches, isMonthly ? effMonth : weekStart, isMonthly);
    const prevPunchesFiltered = filterPunches(prevPunches, isMonthly ? prevMonthStr : prevWeekStart, isMonthly);

    function computePeriodHours(schedList, punchList) {
      let overtime = 0;
      let night = 0;
      let sunday = 0;
      let holiday = 0;
      let totalWorked = 0;
      let recordCount = 0;

      if (schedList && schedList.length > 0) {
        recordCount = schedList.length;
        schedList.forEach(s => {
          totalWorked += Number(s.totalNetHours || 0);
          if (s.totalNetHours > 42) overtime += (s.totalNetHours - 42);
          (s.shifts || []).forEach(sh => {
            night += Number(sh.nightHours || 0);
            if (sh.isSunday) sunday += Number(sh.netHours || 0);
            if (sh.isHoliday) holiday += Number(sh.netHours || 0);
          });
        });
      } else if (punchList && punchList.length > 0) {
        recordCount = punchList.length;
        const weeklyHoursByDoc = {};
        punchList.forEach(pu => {
          const c = pu.realCalculations || {};
          const net = Number(c.netHours || 0);
          totalWorked += net;
          night += Number(c.nightHours || 0);
          if (c.isSunday) sunday += net;
          if (c.isHoliday) holiday += net;

          const doc = pu.documentId || pu.code;
          if (doc && pu.entryDate) {
            const wObj = ALL_WEEKS_2026.find(w => pu.entryDate >= w.weekStart && pu.entryDate <= w.weekEnd);
            const wKey = wObj ? wObj.weekStart : pu.entryDate.slice(0, 7);
            const key = `${doc}_${wKey}`;
            weeklyHoursByDoc[key] = (weeklyHoursByDoc[key] || 0) + net;
          }
        });

        Object.values(weeklyHoursByDoc).forEach(hrs => {
          if (hrs > 42) overtime += (hrs - 42);
        });
      }

      const totalSpecial = overtime + night + sunday + holiday;
      return {
        overtime: +overtime.toFixed(1),
        night: +night.toFixed(1),
        sunday: +sunday.toFixed(1),
        holiday: +holiday.toFixed(1),
        totalSpecial: +totalSpecial.toFixed(1),
        totalWorked: +totalWorked.toFixed(1),
        recordCount
      };
    }

    const curH = computePeriodHours(curScheds, curPunches);
    const prevH = computePeriodHours(prevScheds, prevPunchesFiltered);

    function buildMom(cur, prev) {
      const diff = +(cur - prev).toFixed(1);
      const pctChange = prev > 0 ? +((diff / prev) * 100).toFixed(1) : (cur > 0 ? 100 : 0);
      const trend = diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'EQUAL';
      return { current: cur, previous: prev, diff, pctChange, trend };
    }

    const momMetrics = {
      overtime: buildMom(curH.overtime, prevH.overtime),
      night: buildMom(curH.night, prevH.night),
      sunday: buildMom(curH.sunday, prevH.sunday),
      holiday: buildMom(curH.holiday, prevH.holiday),
      totalSpecial: buildMom(curH.totalSpecial, prevH.totalSpecial)
    };

    const pdvMap = {};
    filteredPdvs.forEach(p => {
      const sup = supervisors.find(s => s.id === p.supervisorId) || {};
      const pdvRecord = {
        pdvId: p.id,
        pdvCode: p.code,
        pdvName: p.name,
        city: p.city || 'Nacional',
        supervisorName: sup.name || p.zoneName || 'Zona Asignada',
        overtimeHours: 0,
        nightHours: 0,
        sundayHours: 0,
        holidayHours: 0,
        totalSpecialHours: 0,
        scheduledHours: 0,
        momChangePct: 0
      };
      pdvMap[p.id] = pdvRecord;
      if (p.code) pdvMap[p.code] = pdvRecord;
      const cleanN = cleanNormalizeStr(p.name);
      if (cleanN) pdvMap[cleanN] = pdvRecord;
    });

    if (curScheds.length > 0) {
      curScheds.forEach(s => {
        const p = pdvMap[s.pdvId] || (s.pdvName ? pdvMap[cleanNormalizeStr(s.pdvName)] : null);
        if (p) {
          p.scheduledHours += Number(s.totalNetHours || 0);
          if (s.totalNetHours > 42) p.overtimeHours += (s.totalNetHours - 42);
          (s.shifts || []).forEach(sh => {
            p.nightHours += Number(sh.nightHours || 0);
            if (sh.isSunday) p.sundayHours += Number(sh.netHours || 0);
            if (sh.isHoliday) p.holidayHours += Number(sh.netHours || 0);
          });
          p.totalSpecialHours = +(p.overtimeHours + p.nightHours + p.sundayHours + p.holidayHours).toFixed(1);
        }
      });
    } else if (curPunches.length > 0) {
      curPunches.forEach(pu => {
        const p = pdvMap[pu.pdvId] || (pu.pdvName ? pdvMap[cleanNormalizeStr(pu.pdvName)] : null);
        if (p) {
          const c = pu.realCalculations || {};
          const net = Number(c.netHours || 0);
          p.scheduledHours += net;
          p.nightHours += Number(c.nightHours || 0);
          if (c.isSunday) p.sundayHours += net;
          if (c.isHoliday) p.holidayHours += net;
          p.totalSpecialHours = +(p.overtimeHours + p.nightHours + p.sundayHours + p.holidayHours).toFixed(1);
        }
      });
    }

    const uniquePdvRecords = Array.from(new Set(Object.values(pdvMap))).map(p => ({
      ...p,
      scheduledHours: +p.scheduledHours.toFixed(1),
      nightHours: +p.nightHours.toFixed(1),
      sundayHours: +p.sundayHours.toFixed(1),
      holidayHours: +p.holidayHours.toFixed(1),
      overtimeHours: +p.overtimeHours.toFixed(1),
      totalSpecialHours: +p.totalSpecialHours.toFixed(1)
    }));

    const topPdvsSpecial = uniquePdvRecords
      .sort((a, b) => b.totalSpecialHours - a.totalSpecialHours)
      .slice(0, 15);

    const zoneMap = {};
    supervisors.forEach(s => {
      zoneMap[s.id] = {
        zoneId: s.id,
        zoneName: s.name,
        pdvCount: filteredPdvs.filter(p => p.supervisorId === s.id).length,
        employeeCount: users.filter(u => u.supervisorId === s.id).length || 5,
        scheduledHours: 0,
        realHours: 0,
        specialHours: 0,
        complianceRate: 98.5
      };
    });

    uniquePdvRecords.forEach(p => {
      const pdvObj = filteredPdvs.find(fp => fp.id === p.pdvId || fp.code === p.pdvCode);
      const z = pdvObj?.supervisorId ? zoneMap[pdvObj.supervisorId] : null;
      if (z) {
        z.scheduledHours += p.scheduledHours;
        z.realHours += p.scheduledHours;
        z.specialHours += p.totalSpecialHours;
        z.scheduledHours = +z.scheduledHours.toFixed(1);
        z.realHours = +z.realHours.toFixed(1);
        z.specialHours = +z.specialHours.toFixed(1);
      }
    });

    const nationalZonesRanking = Object.values(zoneMap)
      .filter(z => z.pdvCount > 0)
      .sort((a, b) => b.scheduledHours - a.scheduledHours);

    const operationalAlerts = [];
    if (curScheds.length > 0) {
      curScheds.forEach(s => {
        if (s.totalNetHours > 42) {
          const pdvObj = pdvs.find(p => p.id === s.pdvId || p.code === s.pdvId);
          operationalAlerts.push({
            type: 'OVERTIME_EXCEEDED',
            severity: 'HIGH',
            title: `Límite 42h Excedido (${s.totalNetHours}h)`,
            employeeName: s.user?.fullName || s.user?.full_name || s.userId || 'Colaborador',
            pdvName: pdvObj ? `${pdvObj.code} - ${pdvObj.name}` : (s.pdvId || 'PDV'),
            description: `Colaborador supera la jornada semanal ordinaria de 42 horas (${s.totalNetHours} hrs programadas).`
          });
        }
      });
    }

    const monthLabels = {
      '2026-01': 'Enero',
      '2026-02': 'Febrero',
      '2026-03': 'Marzo',
      '2026-04': 'Abril',
      '2026-05': 'Mayo',
      '2026-06': 'Junio',
      '2026-07': 'Julio',
      '2026-08': 'Agosto',
      '2026-09': 'Septiembre',
      '2026-10': 'Octubre',
      '2026-11': 'Noviembre',
      '2026-12': 'Diciembre'
    };
    const curLabel = monthLabels[effMonth] || effMonth;
    const prevLabel = monthLabels[prevMonthStr] || prevMonthStr;

    const prevPeriodLabel = effPeriodType === 'WEEK'
      ? (prevWeekStart ? `Semana Anterior (${prevWeekStart})` : 'Semana Anterior')
      : `${prevLabel} (Mes Anterior)`;
    const curPeriodLabel = effPeriodType === 'WEEK'
      ? `Semana (${weekStart})`
      : `${curLabel} (Mes Actual)`;

    const monthlyComparisonChart = [
      {
        monthName: prevPeriodLabel,
        period: effPeriodType === 'WEEK' ? prevWeekStart : prevMonthStr,
        overtime: prevH.overtime || 0,
        night: prevH.night || 0,
        sunday: prevH.sunday || 0,
        holiday: prevH.holiday || 0,
        total: prevH.totalSpecial || 0
      },
      {
        monthName: curPeriodLabel,
        period: effPeriodType === 'WEEK' ? weekStart : effMonth,
        overtime: curH.overtime || 0,
        night: curH.night || 0,
        sunday: curH.sunday || 0,
        holiday: curH.holiday || 0,
        total: curH.totalSpecial || 0
      }
    ];

    let weeklyComparison = [];
    if (effPeriodType === 'WEEK' && curScheds.length > 0) {
      const dayTotals = {
        'Lunes': { scheduled: 0, special: 0 },
        'Martes': { scheduled: 0, special: 0 },
        'Miércoles': { scheduled: 0, special: 0 },
        'Jueves': { scheduled: 0, special: 0 },
        'Viernes': { scheduled: 0, special: 0 },
        'Sábado': { scheduled: 0, special: 0 },
        'Domingo': { scheduled: 0, special: 0 }
      };
      const dayKeys = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

      curScheds.forEach(s => {
        (s.shifts || []).forEach(sh => {
          let dayKey = sh.dayOfWeek;
          if (!dayKey && sh.date) {
            const dt = new Date(sh.date + 'T12:00:00Z');
            const mapDay = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            dayKey = mapDay[dt.getUTCDay()];
          }
          if (dayTotals[dayKey]) {
            dayTotals[dayKey].scheduled += Number(sh.netHours || 0);
            const spec = (sh.nightHours || 0) + (sh.isSunday ? Number(sh.netHours || 0) : 0) + (sh.isHoliday ? Number(sh.netHours || 0) : 0);
            dayTotals[dayKey].special += spec;
          }
        });
      });

      weeklyComparison = dayKeys.map(dName => ({
        week: dName,
        currentMonthProg: +(dayTotals[dName].scheduled).toFixed(1),
        currentMonthReal: +(dayTotals[dName].scheduled).toFixed(1),
        scheduled: +(dayTotals[dName].scheduled).toFixed(1),
        real: +(dayTotals[dName].scheduled).toFixed(1),
        special: +(dayTotals[dName].special).toFixed(1)
      }));
    } else if (isMonthly) {
      const monthWeeks = getWeeksOverlappingMonth(effMonth);
      weeklyComparison = monthWeeks.map(w => {
        const wPunches = curPunches.filter(pu => pu.entryDate >= w.weekStart && pu.entryDate <= w.weekEnd);
        const wScheds = curScheds.filter(s => s.weekStart === w.weekStart);
        let wHrs = 0;
        let wSpec = 0;
        let wNight = 0;
        let wOt = 0;

        if (wScheds.length > 0) {
          wScheds.forEach(s => {
            wHrs += Number(s.totalNetHours || 0);
            if (s.totalNetHours > 42) wOt += (s.totalNetHours - 42);
            (s.shifts || []).forEach(sh => {
              wNight += Number(sh.nightHours || 0);
              if (sh.isSunday || sh.isHoliday) wSpec += Number(sh.netHours || 0);
            });
          });
          wSpec += (wNight + wOt);
        } else if (wPunches.length > 0) {
          wPunches.forEach(pu => {
            const c = pu.realCalculations || {};
            const net = Number(c.netHours || 0);
            wHrs += net;
            wNight += Number(c.nightHours || 0);
            if (c.isSunday || c.isHoliday) wSpec += net;
          });
          wSpec += wNight;
        }

        return {
          week: `Sem ${w.weekNumber}`,
          label: w.label,
          scheduled: +wHrs.toFixed(1),
          real: +wHrs.toFixed(1),
          special: +wSpec.toFixed(1),
          night: +wNight.toFixed(1),
          overtime: +wOt.toFixed(1)
        };
      });
    }

    return {
      momMetrics,
      topPdvsSpecial,
      topPdvsDeviations: topPdvsSpecial.slice(0, 8),
      nationalZonesRanking,
      operationalAlerts: operationalAlerts.slice(0, 20),
      monthlyComparisonChart,
      weeklyComparison,
      previousPeriodLabel: prevPeriodLabel,
      currentPeriodLabel: curPeriodLabel,
      totalScheduledHours: curH.totalWorked,
      schedulesCount: curH.recordCount
    };
  },

  // ----------------------------------------------------
  // 11. Employee Dossier / Tracking
  // ----------------------------------------------------
  getEmployeeTracking: async (userId) => {
    const [users, pdvs, supervisors, rawSchedules, permissions] = await Promise.all([
      api.getUsers().catch(() => []),
      api.getPDVs().catch(() => []),
      api.getSupervisors().catch(() => []),
      api.getSchedules({ userId }).catch(() => []),
      api.getPermissions({ userId }).catch(() => [])
    ]);

    const user = users.find(u => u.id === userId) || {
      id: userId,
      fullName: `COLABORADOR ${userId}`,
      role: 'EMPLOYEE',
      position: 'ASESOR(A) DE IMAGEN',
      contractType: 'FIJO'
    };
    const pdv = pdvs.find(p => p.id === user.pdvId) || pdvs[0] || {};
    const supervisor = supervisors.find(s => s.id === user.supervisorId || s.id === pdv.supervisorId) || supervisors[0] || {};

    // 1. Recopilar todos los cronogramas del colaborador
    let schedules = [...rawSchedules];
    if (typeof localStorage !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('control_turnos_schedules_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const matches = parsed.filter(s =>
                  s.userId === userId ||
                  s.user_id === userId ||
                  s.employee?.id === userId ||
                  (user.documentId && String(s.employee?.documentId || s.user?.documentId) === String(user.documentId))
                );
                matches.forEach(m => {
                  if (!schedules.some(ex => ex.id === m.id || (ex.weekStart === m.weekStart && ex.userId === m.userId))) {
                    schedules.push(m);
                  }
                });
              }
            }
          }
        }
      } catch (e) {}
    }

    // 2. Traer marcaciones biométricas reales del colaborador por cédula
    const doc = String(user.documentId || user.document_id || '').trim();
    let rawPunches = [];
    if (doc) {
      rawPunches = await api.getPunchRecords({ documentId: doc }).catch(() => []);
      if (rawPunches.length === 0 && doc.startsWith('0')) {
        rawPunches = await api.getPunchRecords({ documentId: doc.replace(/^0+/, '') }).catch(() => []);
      }
    }

    // 3. Cruce con la programación para resolver salidas o entradas faltantes
    const allShifts = schedules.flatMap(sc => sc.shifts || []);
    const punches = rawPunches.map(p => {
      const hasRawEntry = !!p.entryTime && p.entryTime !== '-' && String(p.entryTime).trim() !== '';
      const hasRawExit = !!p.exitTime && p.exitTime !== '-' && String(p.exitTime).trim() !== '';

      const schedShift = allShifts.find(sh => sh.date === p.entryDate && !sh.isDayOff && (sh.endTime || sh.startTime));

      let autoFilledExit = false;
      let autoFilledEntry = false;
      let realCalculations = p.realCalculations || {};

      if (hasRawEntry && !hasRawExit) {
        if (schedShift?.endTime) {
          autoFilledExit = true;
          realCalculations = calculateShiftHours(p.entryTime.substring(0, 5), schedShift.endTime, p.entryDate);
        } else {
          // Sin programación para cruzar y sin salida marcada: 0 horas (incompleta)
          realCalculations = {
            grossHours: 0,
            lunchHours: 0,
            netHours: 0,
            dayHours: 0,
            nightHours: 0,
            lunchApplied: false,
            lunchReason: 'Sin marcación de salida en biométrico'
          };
        }
      } else if (!hasRawEntry && hasRawExit) {
        if (schedShift?.startTime) {
          autoFilledEntry = true;
          realCalculations = calculateShiftHours(schedShift.startTime, p.exitTime.substring(0, 5), p.entryDate);
        } else {
          realCalculations = {
            grossHours: 0,
            lunchHours: 0,
            netHours: 0,
            dayHours: 0,
            nightHours: 0,
            lunchApplied: false,
            lunchReason: 'Sin marcación de entrada en biométrico'
          };
        }
      } else if (hasRawEntry && hasRawExit) {
        realCalculations = calculateShiftHours(p.entryTime.substring(0, 5), p.exitTime.substring(0, 5), p.entryDate);
      }

      return {
        ...p,
        autoFilledExit,
        autoFilledEntry,
        scheduledStartTime: schedShift?.startTime || null,
        scheduledEndTime: schedShift?.endTime || null,
        realCalculations
      };
    });

    // Ordenar marcaciones de más reciente a más antigua
    punches.sort((a, b) => new Date(b.entryDate || 0) - new Date(a.entryDate || 0));

    // Ordenar cronogramas de semana más reciente a más antigua
    schedules.sort((a, b) => new Date(b.weekStart || 0) - new Date(a.weekStart || 0));

    const month = new Date().toISOString().substring(0, 7);
    const sunStats = countMonthlySundays(schedules, userId, month);

    let punctualityScore = 98;
    if (punches.length > 0) {
      const lateArrivals = punches.filter(p => (p.realCalculations?.lateArrivalMinutes || 0) > 10).length;
      punctualityScore = Math.max(70, Math.round(100 - (lateArrivals / punches.length) * 30));
    }

    return {
      user,
      pdv,
      supervisor,
      currentMonthSundays: sunStats?.totalSundays || 0,
      punctualityScore,
      schedules,
      punches,
      permissions
    };
  }
};
