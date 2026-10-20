import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const STORAGE_KEY = 'control_turnos_audit_logs';

/**
 * Format date to Colombian locale (UTC-5)
 */
export function formatAuditDate(isoString) {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch (e) {
    return isoString;
  }
}

/**
 * Record an audit log event
 */
export async function recordAuditEvent({
  userName,
  userRole,
  action,
  actionLabel,
  pdvName = 'Nacional / Corporativo',
  detail = '',
  metadata = {}
}) {
  const entry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    user_name: userName || 'USUARIO DESCONOCIDO',
    user_role: userRole || 'INVITADO',
    action: action || 'MOVIMIENTO',
    action_label: actionLabel || action || 'Movimiento del Sistema',
    pdv_name: pdvName || 'General',
    detail: detail || '',
    metadata: metadata || {}
  };

  // 1. Always save in localStorage for instant retrieval and offline resilience
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    if (list.length > 2500) list.length = 2500;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Error saving audit log in localStorage:', e);
  }

  // 2. Insert into Supabase quest_cortes (replicated globally across Colombia)
  if (isSupabaseConfigured && supabase) {
    try {
      const { error: corteErr } = await supabase.from('quest_cortes').upsert({
        id: entry.id,
        name: entry.action_label || entry.action || 'AUDIT_LOG',
        date: entry.created_at ? entry.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        data: [entry],
        pdv_data: entry,
        created_at: entry.created_at
      });
      if (corteErr) {
        console.warn('Error guardando auditoría en quest_cortes:', corteErr.message);
      }
    } catch (err) {
      console.warn('Excepción guardando auditoría en la nube:', err);
    }

    // 3. Optional fallback to audit_logs table
    try {
      await supabase.from('audit_logs').insert([
        {
          id: entry.id,
          user_name: entry.user_name,
          user_role: entry.user_role,
          action: entry.action,
          action_label: entry.action_label,
          pdv_name: entry.pdv_name,
          detail: entry.detail,
          metadata: entry.metadata,
          created_at: entry.created_at
        }
      ]);
    } catch (e) {}
  }

  return entry;
}

/**
 * Fetch audit logs (combining Supabase cloud + local cache)
 */
export async function getAuditLogs() {
  let remoteLogs = [];
  if (isSupabaseConfigured && supabase) {
    // 1. Fetch from quest_cortes (global store)
    try {
      const { data, error } = await supabase
        .from('quest_cortes')
        .select('*')
        .like('id', 'audit-%')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!error && Array.isArray(data) && data.length > 0) {
        data.forEach(row => {
          const item = (row.pdv_data && row.pdv_data.id)
            ? row.pdv_data
            : (Array.isArray(row.data) && row.data[0]?.id)
              ? row.data[0]
              : {
                  id: row.id,
                  created_at: row.created_at,
                  user_name: 'Usuario Registrado',
                  user_role: 'SISTEMA',
                  action: 'MOVIMIENTO',
                  action_label: row.name,
                  pdv_name: 'Nacional',
                  detail: row.name
                };
          remoteLogs.push(item);
        });
      }
    } catch (e) {
      console.warn('Error leyendo auditoría de quest_cortes:', e);
    }

    // 2. Fetch from audit_logs table if exists
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!error && Array.isArray(data) && data.length > 0) {
        remoteLogs.push(...data);
      }
    } catch (e) {}
  }

  // Local logs
  let localLogs = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localLogs = raw ? JSON.parse(raw) : [];
  } catch (e) {}

  // Merge unique by ID
  const map = new Map();
  remoteLogs.forEach(item => map.set(item.id, item));
  localLogs.forEach(item => {
    if (!map.has(item.id)) map.set(item.id, item);
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // If completely empty, seed standard reference samples
  if (merged.length === 0) {
    const samples = [
      {
        id: 'audit-sample-1',
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        user_name: 'Alexander Lopez (Líder 1)',
        user_role: 'SUPERVISOR',
        action: 'LOGIN',
        action_label: 'Inicio de Sesión',
        pdv_name: 'Zona Antioquia',
        detail: 'Ingreso al sistema con perfil Líder de Zona Regional',
        metadata: {}
      },
      {
        id: 'audit-sample-2',
        created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        user_name: '1102 (Tienda Oficial)',
        user_role: 'PDV',
        action: 'SCHEDULE_SUBMIT',
        action_label: 'Envío de Turnos Semanales',
        pdv_name: '1102 - Tienda Oficial',
        detail: 'Programación semanal 2026-10-19 cerrada y enviada a revisión',
        metadata: {}
      },
      {
        id: 'audit-sample-3',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        user_name: 'DIRECCIÓN DE TALENTO HUMANO',
        user_role: 'HR_ADMIN',
        action: 'PERMISSION_APPROVE',
        action_label: 'Aprobación de Novedad',
        pdv_name: 'Palmira',
        detail: 'Aprobó novedad de incapacidad médica de 7h',
        metadata: {}
      }
    ];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
    } catch (e) {}
    return samples;
  }

  return merged;
}

/**
 * Clear audit logs (local cache)
 */
export function clearLocalAuditLogs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}
