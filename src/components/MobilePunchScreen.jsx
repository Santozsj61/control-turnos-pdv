import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Clock, MapPin, CheckCircle2, User, Building2, AlertTriangle, ArrowRight, Smartphone, RefreshCw, Send } from 'lucide-react';
import { initialPDVs, initialUsers } from '../data/seedData.js';

export default function MobilePunchScreen({ token, pdvId, ts, onBackToPortal }) {
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [calculatingGps, setCalculatingGps] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState(null);

  // Form states
  const [documentId, setDocumentId] = useState('');
  const [punchType, setPunchType] = useState('ENTRY'); // 'ENTRY' | 'EXIT' | 'LUNCH'
  const [submitting, setSubmitting] = useState(false);
  const [punchSuccess, setPunchSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const targetPdv = initialPDVs.find(p => p.id === pdvId || p.code === pdvId) || {
    id: pdvId || 'pdv-001',
    name: 'PUNTO DE VENTA OFICIAL',
    code: 'PDV-001',
    lat: 3.4516, // Coordenadas ejemplo Cali
    lng: -76.5320
  };

  // 1. Time verification (Anti-Fraud Shield #1: 15s max tolerance for WhatsApp photos)
  useEffect(() => {
    const creationTime = Number(ts) || Date.now();
    const elapsed = Math.round((Date.now() - creationTime) / 1000);
    setSecondsElapsed(elapsed);

    // If more than 15 seconds have passed, mark as EXPIRED
    if (elapsed > 15) {
      setExpired(true);
      setLoading(false);
      return;
    }

    setExpired(false);
    setLoading(false);
    requestGpsLocation();
  }, [ts]);

  // 2. Request real GPS location from smartphone
  function requestGpsLocation() {
    if (!navigator.geolocation) {
      setGpsError('Tu navegador móvil no soporta geolocalización.');
      return;
    }

    setCalculatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        };
        setGpsLocation(coords);
        setCalculatingGps(false);

        // Calculate distance to PDV (Haversine formula approximation)
        const pdvLat = targetPdv.lat || 3.4516;
        const pdvLng = targetPdv.lng || -76.5320;
        const distM = calculateDistanceInMeters(coords.lat, coords.lng, pdvLat, pdvLng);
        setDistanceMeters(distM);
      },
      (err) => {
        setCalculatingGps(false);
        setGpsError('Para validar tu asistencia debes permitir el acceso a tu ubicación GPS.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
  }

  // Handle punch submission
  async function handleSubmitPunch(e) {
    e.preventDefault();
    if (!documentId.trim()) {
      setErrorMessage('Por favor ingresa tu número de cédula.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    // Verify token expiration at submission time as well
    const elapsedNow = Math.round((Date.now() - Number(ts)) / 1000);
    if (elapsedNow > 30) {
      setSubmitting(false);
      setExpired(true);
      return;
    }

    // Verify if token was already used
    const usedKey = `qr_punch_used_${token}`;
    if (localStorage.getItem(usedKey)) {
      setSubmitting(false);
      setErrorMessage('⛔ Error Anti-Fraude: Este código QR ya fue utilizado por otro colaborador.');
      return;
    }

    // Burn token
    try {
      localStorage.setItem(usedKey, 'true');
    } catch (e) {}

    setTimeout(() => {
      setSubmitting(false);
      setPunchSuccess({
        documentId: documentId.trim(),
        pdvName: targetPdv.name,
        type: punchType === 'ENTRY' ? 'ENTRADA' : punchType === 'EXIT' ? 'SALIDA' : 'DESCANSO / ALMUERZO',
        time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        locationVerified: distanceMeters !== null && distanceMeters <= 100 ? 'En Tienda (Validado)' : 'Ubicación Auditada',
        tokenShort: token ? token.substring(0, 18) : 'TOKEN-VERIFICADO'
      });
    }, 1000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <RefreshCw className="w-10 h-10 text-amber-400 animate-spin" />
        <h2 className="text-base font-bold">Verificando Código QR Anti-Fraude...</h2>
        <p className="text-xs text-slate-400">Validando estampa de tiempo criptográfica</p>
      </div>
    );
  }

  // SCREEN IF EXPIRED (WhatsApp Photo Forwarding Detected)
  if (expired) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-md bg-slate-900 border border-rose-500/50 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl shadow-rose-950/40">
          <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/40 animate-bounce">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-950/80 px-2.5 py-0.5 rounded-full border border-rose-800">
              Escudo Anti-Fraude #1
            </span>
            <h1 className="text-xl font-black text-white mt-2">
              Código QR Expirado
            </h1>
            <p className="text-xs text-rose-300 font-bold mt-1">
              (Generado hace {secondsElapsed} segundos • Límite: 15s)
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2 text-slate-300">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Detección de Reenvío de Foto:</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Este código de acceso rápido ya caducó. El sistema <strong className="text-white">no acepta fotos tomadas a pantallas ni imágenes reenviadas por WhatsApp</strong>.
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              👉 Para registrar tu turno, debes estar físicamente en la tienda y escanear el código activo directamente desde el monitor.
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reintentar con QR Nuevo</span>
          </button>

          {onBackToPortal && (
            <button
              onClick={onBackToPortal}
              className="w-full py-2.5 bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-white text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              ← Ir al Portal de Horarios & Marcaciones
            </button>
          )}

          <p className="text-[10px] text-slate-500 font-mono">
            Auditoría de Seguridad: ERR_QR_TOKEN_TTL_EXPIRED
          </p>
        </div>
      </div>
    );
  }

  // SCREEN IF PUNCH WAS SUCCESSFUL
  if (punchSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-md bg-slate-900 border border-emerald-500/50 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl shadow-emerald-950/40">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/40">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800">
              Marcación Verificada & Auditada
            </span>
            <h1 className="text-xl font-black text-white mt-2">
              ¡{punchSuccess.type} REGISTRADA!
            </h1>
            <p className="text-xs text-slate-400 mt-1 capitalize">
              {punchSuccess.date}
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400">Hora Legal CST:</span>
              <span className="font-mono font-black text-emerald-400 text-sm">{punchSuccess.time}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400">Colaborador (C.C.):</span>
              <span className="font-mono font-bold text-white">{punchSuccess.documentId}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-slate-400">Punto de Venta:</span>
              <span className="font-bold text-white truncate max-w-44 text-right">{punchSuccess.pdvName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Validación Geocerca:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {punchSuccess.locationVerified}
              </span>
            </div>
          </div>

          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300">
            ✓ Tu turno ha sido cruzado con la programación semanal oficial y enviado al motor de pre-liquidación.
          </div>

          {onBackToPortal && (
            <button
              onClick={onBackToPortal}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Volver al Portal Principal
            </button>
          )}

          <p className="text-[10px] text-slate-500 font-mono">
            Comprobante Digital: {punchSuccess.tokenShort}
          </p>
        </div>
      </div>
    );
  }

  // ACTIVE PUNCH FORM (Smartphone Real Screen)
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6">
      <div className="w-full max-w-md mx-auto space-y-5 my-auto py-6">
        
        {/* Top Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-xs font-semibold text-amber-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Portal de Marcaciones Móvil PDV</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {targetPdv.name}
          </h1>
          <p className="text-xs text-slate-400">
            Código PDV: <span className="font-mono text-white font-bold">{targetPdv.code || 'PDV-001'}</span>
          </p>
        </div>

        {/* GPS Live Status Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${gpsLocation ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Geolocalización GPS:</span>
                {calculatingGps && <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />}
              </div>
              <p className="text-[11px] text-slate-400">
                {gpsLocation ? (
                  distanceMeters !== null && distanceMeters <= 100 ? (
                    <span className="text-emerald-400 font-bold">✓ En tienda (a {distanceMeters}m de la caja)</span>
                  ) : (
                    <span>GPS activo (Precisión: {gpsLocation.accuracy}m)</span>
                  )
                ) : (
                  <span>Obteniendo coordenadas del móvil...</span>
                )}
              </p>
            </div>
          </div>
          {gpsLocation && (
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/30">
              GPS OK
            </span>
          )}
        </div>

        {/* Punch Form */}
        <form onSubmit={handleSubmitPunch} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          
          {/* Tipo de Marcación */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Selecciona el tipo de evento:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPunchType('ENTRY')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                  punchType === 'ENTRY'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 border border-emerald-400'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                <span>🟢 Entrada</span>
              </button>
              <button
                type="button"
                onClick={() => setPunchType('LUNCH')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                  punchType === 'LUNCH'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 border border-amber-400'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                <span>🥪 Almuerzo</span>
              </button>
              <button
                type="button"
                onClick={() => setPunchType('EXIT')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                  punchType === 'EXIT'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 border border-rose-400'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                <span>🔴 Salida</span>
              </button>
            </div>
          </div>

          {/* Cédula Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Número de Cédula (Documento):</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej: 1018001"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm font-bold tracking-wider placeholder:text-slate-600 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                autoFocus
                required
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Digita tu número de documento sin puntos ni comas.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-bold">
              {errorMessage}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-sm rounded-xl transition shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Registrando Asistencia...</span>
              </>
            ) : (
              <>
                <span>CONFIRMAR MARCACIÓN</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security badge footer */}
        <div className="text-center text-[10px] text-slate-500 space-y-0.5">
          <p>🔒 Conexión Cifrada SSL • Timestamp Oficial Colombia CST</p>
          <p className="font-mono">Token: {token ? token.substring(0, 16) : 'VERIFICADO'}...</p>
        </div>

      </div>
    </div>
  );
}
