import { db } from './db.js';
import { runReconciliation as runCore } from '../src/utils/reconciliation.js';

export function runReconciliation({ weekStart, weekEnd, pdvId, supervisorId, documentId }) {
  const users = db.getUsers();
  const pdvs = db.getPDVs();
  const supervisors = db.getSupervisors();
  const allSchedules = db.getSchedules();
  const allPunches = db.getPunchRecords();
  const config = db.getConfig();

  return runCore({
    users,
    pdvs,
    supervisors,
    allSchedules,
    allPunches,
    config,
    weekStart,
    weekEnd,
    pdvId,
    supervisorId,
    documentId
  });
}