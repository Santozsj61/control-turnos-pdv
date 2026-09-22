import React, { useState, useEffect } from 'react';
import { CheckSquare, Clock, User, Store, AlertCircle, CheckCircle2, XCircle, Plus, Send, ShieldCheck, MessageSquare, Sparkles, Mail, Tag, Building2 } from 'lucide-react';

const ASSIGNED_AREAS = [
  'Mantenimiento y Obras',
  'Capacitación y Reuniones',
  'Incapacidad o Licencia',
  'Auditoría e Inventario',
  'Líder de Zona',
  'Evento Comercial',
  'Tiempo Adicional Autorizado',
  'Recepción Logística'
];

export default function PermissionsView({ currentUser, pdvs, supervisors, onRefreshSchedules }) {
  const isSupervisor = currentUser.role === 'SUPERVISOR';
  const isAdmin = currentUser.role === 'ADMIN';
  const isEmployee = currentUser.role === 'EMPLOYEE';
  const isMaintenanceApprover = currentUser.role === 'MAINTENANCE_APPROVER';
  const canApprove = isSupervisor || isAdmin || isMaintenanceApprover;

  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Collaborators in PDV for selection
  const [pdvEmployees, setPdvEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');

  // Form fields for employee request
  const [assignedArea, setAssignedArea] = useState('Líder de Zona');
  const [requestDate, setRequestDate] = useState('2026-09-02');
  const [reqStartTime, setReqStartTime] = useState('13:58');
  const [reqEndTime, setReqEndTime] = useState('20:28');
  const [isDayOffChange, setIsDayOffChange] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState(null);

  // Review fields for supervisor / maintenance approver
  const [reviewModalPerm, setReviewModalPerm] = useState(null);
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const userPdv = pdvs.find(p => p.id === currentUser.pdvId);
  const mySupervisor = supervisors.find(s => s.id === currentUser.supervisorId || s.id === userPdv?.supervisorId);

  // Load collaborators for this PDV (or all employees if admin/supervisor)
  async function fetchPdvEmployees() {
    try {
      let url = '/api/users?role=EMPLOYEE';
      if (currentUser.pdvId) {
        url += `&pdvId=${currentUser.pdvId}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        setPdvEmployees(json.data);
        if (json.data.length > 0 && !selectedEmpId) {
          setSelectedEmpId(json.data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching PDV employees:', err);
    }
  }

  // Load permissions based on current user role
  async function fetchPermissions() {
    setLoading(true);
    try {
      let url = '/api/permissions';
      if (isEmployee && currentUser.pdvId) {
        // Show all permissions for this PDV's store collaborators
        url += `?pdvId=${currentUser.pdvId}`;
      } else if (isEmployee) {
        url += `?userId=${currentUser.id}`;
      } else if (isSupervisor) {
        // Find supervisor record matching this user
        const supRecord = supervisors.find(s => s.name === currentUser.fullName || currentUser.id.includes(s.id));
        if (supRecord) {
          url += `?supervisorId=${supRecord.id}`;
        }
      } else if (isMaintenanceApprover) {
        url += `?recipientRole=MAINTENANCE_APPROVER`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setPermissions(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPermissions();
    fetchPdvEmployees();
  }, [currentUser.id, currentUser.role, currentUser.pdvId]);

  // Submit permission request identifying the chosen collaborator
  async function handleSubmitRequest(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setFormMsg({ type: 'error', text: 'Por favor ingresa el motivo o justificación del cambio.' });
      return;
    }

    const targetEmployee = pdvEmployees.find(emp => emp.id === selectedEmpId) || currentUser;

    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetEmployee.id,
          date: requestDate,
          originalStartTime: '10:00',
          originalEndTime: '20:30',
          requestedStartTime: isDayOffChange ? '' : reqStartTime,
          requestedEndTime: isDayOffChange ? '' : reqEndTime,
          isDayOffChange,
          reason,
          assignedArea
        })
      });

      const json = await res.json();
      if (json.success) {
        const destText = assignedArea === 'Mantenimiento y Obras'
          ? 'al Correo Corporativo de Mantenimiento y Obras'
          : `a tu jefe inmediato (${mySupervisor?.name || 'Asignado'})`;
        setFormMsg({ type: 'success', text: `¡Solicitud para "${targetEmployee.fullName}" [${assignedArea}] radicada exitosamente ${destText}!` });
        setReason('');
        setTimeout(() => {
          setShowModal(false);
          setFormMsg(null);
          fetchPermissions();
        }, 1500);
      } else {
        setFormMsg({ type: 'error', text: json.error || 'Error al enviar solicitud' });
      }
    } catch (err) {
      setFormMsg({ type: 'error', text: 'Error de comunicación con el servidor' });
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Supervisor approval or rejection
  async function handleReviewStatus(permId, status) {
    setReviewing(true);
    try {
      const res = await fetch(`/api/permissions/${permId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          supervisorNotes: supervisorNotes || (status === 'APPROVED' ? 'Aprobado según solicitud.' : 'Rechazado por necesidades de cobertura.'),
          reviewerId: currentUser.id
        })
      });

      const json = await res.json();
      if (json.success) {
        setReviewModalPerm(null);
        setSupervisorNotes('');
        fetchPermissions();
        if (onRefreshSchedules) onRefreshSchedules();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReviewing(false);
    }
  }

  const pendingCount = permissions.filter(p => p.status === 'PENDING').length;
  const filteredList = permissions.filter(p => filterStatus === 'ALL' || p.status === filterStatus);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {isSupervisor ? 'Bandeja de Autorización de Jefatura' : 'Gestión de Permisos y Novedades'}
            </span>
            {pendingCount > 0 && (
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingCount} pendiente(s)
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mt-1">
            {isSupervisor ? `Solicitudes de mi Equipo (${currentUser.fullName})` : 'Solicitud de Cambio de Horario / Permiso'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isSupervisor
              ? 'Revisa y autoriza o rechaza los cambios de horario solicitados por los colaboradores de tus PDVs.'
              : `Todo cambio durante el día debe ser previamente autorizado por tu jefe inmediato (${mySupervisor?.name || 'Asignado'}).`}
          </p>
        </div>

        {isEmployee && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Solicitud de Permiso</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              filterStatus === st
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {st === 'ALL' ? 'Todos los Permisos' : st === 'PENDING' ? `Pendientes (${pendingCount})` : st === 'APPROVED' ? 'Aprobados' : 'Rechazados'}
          </button>
        ))}
      </div>

      {/* Permissions List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Cargando solicitudes de permisos...</div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
          <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No hay registros cargados. Utilice las opciones de importación o nuevo registro para comenzar.</h3>
          <p className="text-xs text-slate-500 mt-1">
            {isSupervisor ? 'No tienes solicitudes pendientes de tus colaboradores.' : 'Utiliza el botón "+ Nueva Solicitud de Permiso" para radicar novedades.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((perm) => {
            const isPending = perm.status === 'PENDING';
            const isApproved = perm.status === 'APPROVED';
            const isRejected = perm.status === 'REJECTED';

            return (
              <div
                key={perm.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs space-y-4 transition ${
                  isPending ? 'border-amber-300 ring-2 ring-amber-400/20' : isApproved ? 'border-emerald-200' : 'border-rose-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span>{perm.userName}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {perm.pdvName} | CC: {perm.userDocument}
                    </div>
                    {perm.assignedArea && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Tag className="w-3 h-3 text-indigo-500" />
                          Área: {perm.assignedArea}
                        </span>
                        {perm.recipientRole === 'MAINTENANCE_APPROVER' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            <Mail className="w-2.5 h-2.5 text-purple-600" />
                            Notificado a Mantenimiento
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1 ${
                    isPending ? 'bg-amber-100 text-amber-800' : isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {isPending ? '🟡 Pendiente' : isApproved ? '🟢 Aprobado' : '🔴 Rechazado'}
                  </span>
                </div>

                {/* Change details box */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold text-slate-500">Fecha del Cambio:</span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {perm.date}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="font-semibold text-slate-500">Horario Solicitado:</span>
                    <span className="font-extrabold text-blue-700">
                      {perm.isDayOffChange ? 'Día Libre / Descanso' : `${perm.requestedStartTime} a ${perm.requestedEndTime}`}
                    </span>
                  </div>

                  <div className="pt-1">
                    <span className="font-semibold text-slate-500 block mb-0.5">Motivo / Justificación:</span>
                    <p className="text-slate-800 italic bg-white p-2 rounded border border-slate-200">
                      "{perm.reason}"
                    </p>
                  </div>
                </div>

                {/* Supervisor Feedback */}
                {perm.supervisorNotes && (
                  <div className="text-xs bg-slate-100 p-2.5 rounded-lg border border-slate-200 text-slate-700">
                    <strong className="text-slate-900">Respuesta de Jefatura ({perm.supervisorName}):</strong> {perm.supervisorNotes}
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Evaluado el {new Date(perm.reviewedAt).toLocaleString('es-CO')}
                    </div>
                  </div>
                )}

                {/* Action Buttons for Supervisor / Maintenance Approver */}
                {canApprove && isPending && (
                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      onClick={() => { setReviewModalPerm(perm); setSupervisorNotes(''); }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition shadow-xs flex items-center justify-center gap-2"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>Revisar y Decidir Solicitud</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Employee Create Request Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                <span>Solicitud de Modificación de Horario</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            {formMsg && (
              <div className={`p-3 rounded-xl text-xs font-medium ${formMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {formMsg.text}
              </div>
            )}

            <form onSubmit={handleSubmitRequest} className="space-y-4 text-xs">
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-blue-900 text-xs">
                <strong>Destinatario de Autorización:</strong> {assignedArea === 'Mantenimiento y Obras' ? 'Correo Corporativo de Mantenimiento y Obras' : `Tu jefe directo ${mySupervisor?.name || 'Asignado'} (${userPdv?.name})`}.
              </div>

              {/* Selector de Colaborador del PDV */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>Colaborador que solicita el Permiso / Novedad *</span>
                </label>
                <select
                  required
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {pdvEmployees.length === 0 && (
                    <option value={currentUser.id}>{currentUser.fullName} ({currentUser.position || 'Administrador PDV'})</option>
                  )}
                  {pdvEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} - CC: {emp.documentId} ({emp.position || 'Asesor'})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Identifica qué colaborador del equipo de este PDV es quien radicará la solicitud.
                </span>
              </div>

              {/* Selector Desplegable de Área Asignada */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-purple-600" />
                  <span>Área a la que se debe Asignar la Novedad *</span>
                </label>
                <select
                  required
                  value={assignedArea}
                  onChange={(e) => setAssignedArea(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  {ASSIGNED_AREAS.map(area => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Selecciona la categoría o área operativa correspondiente a la solicitud.
                </span>
              </div>

              {/* Alerta si es Mantenimiento y Obras */}
              {assignedArea === 'Mantenimiento y Obras' && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2.5 text-purple-950 text-xs animate-in fade-in">
                  <Mail className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold text-purple-900">Enrutamiento Directo a Mantenimiento y Obras:</strong>
                    Esta solicitud será remitida directamente al correo corporativo parametrizado por Auditoría VRX para su aprobación inmediata.
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Fecha del Día a Modificar</label>
                <input
                  type="date"
                  required
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dayOffChange"
                  checked={isDayOffChange}
                  onChange={(e) => setIsDayOffChange(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="dayOffChange" className="font-semibold text-slate-700 cursor-pointer">
                  Solicito cambiar este día por descanso / día libre
                </label>
              </div>

              {!isDayOffChange && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nueva Hora Entrada</label>
                    <input
                      type="time"
                      value={reqStartTime}
                      onChange={(e) => setReqStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nueva Hora Salida</label>
                    <input
                      type="time"
                      value={reqEndTime}
                      onChange={(e) => setReqEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motivo / Justificación Detallada *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej: Cita médica de especialista en la mañana, permiso compensado en la tarde..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 shadow-md"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Enviando...' : 'Radicar Solicitud'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supervisor Review Modal */}
      {reviewModalPerm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <span>Decisión de Jefatura sobre Solicitud</span>
            </h3>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div><strong>Colaborador:</strong> {reviewModalPerm.userName} (CC: {reviewModalPerm.userDocument})</div>
              <div><strong>PDV:</strong> {reviewModalPerm.pdvName}</div>
              <div><strong>Área Asignada:</strong> <span className="font-bold text-indigo-700">{reviewModalPerm.assignedArea || 'Líder de Zona'}</span></div>
              <div><strong>Fecha Solicitada:</strong> {reviewModalPerm.date}</div>
              <div><strong>Horario Propuesto:</strong> {reviewModalPerm.isDayOffChange ? 'Día de Descanso' : `${reviewModalPerm.requestedStartTime} a ${reviewModalPerm.requestedEndTime}`}</div>
              <div className="pt-1"><strong>Motivo:</strong> "{reviewModalPerm.reason}"</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notas / Observaciones del Jefe Directo</label>
              <textarea
                rows={2}
                placeholder="Ej: Aprobado. El colaborador cubre el horario de cierre."
                value={supervisorNotes}
                onChange={(e) => setSupervisorNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalPerm(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleReviewStatus(reviewModalPerm.id, 'REJECTED')}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-xs"
              >
                Rechazar
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleReviewStatus(reviewModalPerm.id, 'APPROVED')}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aprobar y Modificar Turno</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
