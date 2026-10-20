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

  return entry;
}

/**
 * Fetch audit logs (combining local storage cache)
 */
export async function getAuditLogs() {
  let remoteLogs = [];

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
