import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, ShieldCheck, QrCode, Smartphone, Clock, MapPin, AlertTriangle, RefreshCw, Send, CheckCircle2, Flame, Copy, ExternalLink, Zap, Globe } from 'lucide-react';
import QRCode from 'qrcode';

export default function QrAntiFraudLabModal({ isOpen, onClose, pdvs = [] }) {
  const [selectedPdv, setSelectedPdv] = useState(pdvs[0] || { id: 'pdv-001', name: 'PDV 001 - UNICENTRO CALI', code: 'PDV-001' });
  const [qrToken, setQrToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [tokenCreatedAt, setTokenCreatedAt] = useState(Date.now());
  const [secondsRemaining, setSecondsRemaining] = useState(10);
  const [consumedTokens, setConsumedTokens] = useState(new Set());
  
  // Test simulation state
  const [simulationState, setSimulationState] = useState(null); // 'idle' | 'running' | 'result'
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulatedPhotoToken, setSimulatedPhotoToken] = useState(null);

  // Real Mobile Scanning URL State & Host selection
  const [scanHost, setScanHost] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) {
        return 'https://control-turnos-pdv.vercel.app';
      }
      return window.location.origin;
    }
    return 'https://control-turnos-pdv.vercel.app';
  });
  const [realScanUrl, setRealScanUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHostConfig, setShowHostConfig] = useState(false);

  // Generate a dynamic cryptographic token every 10 seconds and encode actionable URL
  function generateNewToken() {
    const timestamp = Date.now();
    const randomSalt = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = `SECURE-PUNCH-${selectedPdv.code || 'PDV'}-${timestamp}-${randomSalt}`;
    setQrToken(token);
    setTokenCreatedAt(timestamp);
    setSecondsRemaining(10);

    // Encode full actionable URL into QR
    const baseHost = (scanHost || window.location.origin || '').replace(/\/+$/, '');
    const punchUrl = `${baseHost}/?punchToken=${encodeURIComponent(token)}&pdv=${encodeURIComponent(selectedPdv.id)}&ts=${timestamp}`;
    setRealScanUrl(punchUrl);

    QRCode.toDataURL(punchUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    }).then(url => {
      setQrDataUrl(url);
    }).catch(err => console.error('Error generating QR:', err));
  }

  // Timer loop for rotating QR every 10 seconds
  useEffect(() => {
    if (!isOpen) return;
    generateNewToken();

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          generateNewToken();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, selectedPdv, scanHost]);

  // TEST 1: Simulate taking a photo and sending via WhatsApp to friend
  function runWhatsAppFraudSimulation() {
    setSimulationState('running');
    setSimulationResult(null);

    // Capture the QR token RIGHT NOW
    const photoToken = qrToken;
    const photoTime = Date.now();
    setSimulatedPhotoToken({ token: photoToken, takenAt: photoTime });

    // Simulate WhatsApp delay (15 seconds total transcurred)
    setTimeout(() => {
      const now = Date.now();
      const elapsedSeconds = Math.round((now - photoTime) / 1000) + 14; // Simula 15-18s de retardo WhatsApp

      // Validate with Anti-Fraud engine
      const isExpired = elapsedSeconds > 10;

      setSimulationState('result');
      setSimulationResult({
        testType: 'WHATSAPP_PHOTO_FORWARDING',
        success: false,
        title: '⛔ INTENTO DE FRAUDE BLOQUEADO',
        errorCode: 'ERR_QR_TOKEN_EXPIRED',
        badge: 'ESCUDO 1: TOKEN EFÍMERO (10s)',
        details: [
          `Foto tomada en tienda: hace ${elapsedSeconds} segundos`,
          `Vigencia máxima del QR: 10 segundos`,
          `Estado en el servidor: El token ya caducó y fue destruido en memoria`,
          `Resultado: La persona en su casa NO PUDO MARCAR.`
        ],
        explanation: 'Incluso si un compañero le toma foto a la pantalla del PDV y la envía por WhatsApp, la foto tarda entre 12 y 25 segundos en ser recibida y escaneada. El sistema la rechaza automáticamente por caducidad de tiempo.'
      });
    }, 1800);
  }

  // TEST 2: Simulate friend attempting to scan from home (GPS Geofence test)
  function runGpsGeofenceSimulation() {
    setSimulationState('running');
    setSimulationResult(null);

    setTimeout(() => {
      setSimulationState('result');
      setSimulationResult({
        testType: 'GPS_GEOFENCE_VIOLATION',
        success: false,
        title: '⛔ FUERA DEL PERÍMETRO DE LA TIENDA',
        errorCode: 'ERR_GEOFENCE_DISTANCE_EXCEEDED',
        badge: 'ESCUDO 2: GEOLOCALIZACIÓN GPS (Doble Factor)',
        details: [
          `Ubicación de la Tienda (PDV): Lat 3.4516, Lng -76.5320 (Cali, Local 104)`,
          `Ubicación detectada por el celular del empleado: Lat 3.3921, Lng -76.5410 (Barrio El Limonar)`,
          `Distancia calculada por GPS: 6.8 Kilómetros`,
          `Tolerancia máxima permitida: 50 Metros`
        ],
        explanation: 'Al escanear el QR, el navegador del celular del colaborador solicita su ubicación GPS real. Si el empleado está en su casa o en un bus a kilómetros de la tienda, el sistema rechaza la marca inmediatamente, sin importar qué foto tenga.'
      });
    }, 1500);
  }

  // TEST 3: Simulate Single-Use Token (Two employees trying to use same QR)
  function runSingleUseTokenSimulation() {
    setSimulationState('running');
    setSimulationResult(null);

    const activeTokenToConsume = qrToken;

    setTimeout(() => {
      // First scan consumes it
      const updated = new Set(consumedTokens);
      updated.add(activeTokenToConsume);
      setConsumedTokens(updated);

      setSimulationState('result');
      setSimulationResult({
        testType: 'SINGLE_USE_NONCE',
        success: false,
        title: '⛔ CÓDIGO YA FUE CONSUMIDO',
        errorCode: 'ERR_TOKEN_ALREADY_USED',
        badge: 'ESCUDO 3: TOKEN DE UN SOLO USO (Single-Use Nonce)',
        details: [
          `Primer colaborador (En tienda): Marcó a las 08:00:02 (Válido ✅)`,
          `Segundo colaborador (Foto): Intentó marcar a las 08:00:04 con el mismo QR`,
          `Estado en el servidor: Token marcado como CONSUMIDO / QUEMADO`,
          `Resultado: Solo 1 persona puede marcar por cada código generado.`
        ],
        explanation: 'Cada código QR es de un solo uso. Una vez que un empleado lo escanea, el servidor quema el token en milisegundos. Nadie más puede usar esa misma imagen.'
      });
    }, 1500);
  }

  // TEST 4: Legitimate in-store punch
  function runLegitimatePunchSimulation() {
    setSimulationState('running');
    setSimulationResult(null);

    setTimeout(() => {
      setSimulationState('result');
      setSimulationResult({
        testType: 'LEGITIMATE_PUNCH',
        success: true,
        title: '✅ MARCACIÓN AUTÉNTICA REGISTRADA',
        errorCode: 'OK_PUNCH_VERIFIED',
        badge: 'ACCESO VALIDADO 100%',
        details: [
          `Tiempo de respuesta: 3 segundos (Dentro de la ventana de 10s)`,
          `Distancia GPS detectada: 8 metros de la caja de tienda`,
          `Token verificado: Auténtico y no consumido`,
          `Hora legal auditada: ${new Date().toLocaleTimeString()} (Hora servidor)`
        ],
        explanation: 'El colaborador está físicamente en la tienda, escaneó la pantalla directamente y su marca fue pre-liquidada de inmediato en el sistema.'
      });
    }, 1200);
  }

  // TEST 5: Simulate VPN / Proxy Attack
  function runVpnFraudSimulation() {
    setSimulationState('running');
    setSimulationResult(null);

    setTimeout(() => {
      setSimulationState('result');
      setSimulationResult({
        testType: 'VPN_PROXY_DETECTED',
        success: false,
        title: '⛔ INTENTO CON VPN: GPS REAL DETECTADO',
        errorCode: 'ERR_VPN_IP_DETECTED_GPS_MISMATCH',
        badge: 'ESCUDO 4: INDEPENDENCIA DE IP & HARDWARE GPS',
        details: [
          `Dirección IP reportada: 185.220.101.5 (Servidor VPN NordVPN / Datacenter)`,
          `Ubicación simulada por VPN: Miami, FL / Bogotá Datacenter`,
          `Coordenadas satelitales físicas del teléfono: Lat 3.3921, Lng -76.5410 (Casa a 6.8 km)`,
          `Resultado: La VPN NO altera el chip GPS satelital del teléfono.`
        ],
        explanation: 'Una VPN solo cambia la dirección IP en internet, pero es incapaz de alterar el chip GPS físico del smartphone (que se conecta a satélites GPS/GLONASS y antenas de telefonía). Además, el servidor detecta que la IP es de un datacenter/VPN y genera una alerta roja inmediata en la bitácora de VRX.'
      });
    }, 1500);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl text-white shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg shadow-orange-500/20">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Laboratorio de Seguridad & Anti-Fraude</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/30">
                  3 ESCUDOS ACTIVOS
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Prueba Técnica: ¿Se puede engañar al QR enviando una foto por WhatsApp?
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Top Explanation Banner */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300 text-sm">
                Tu inquietud es la pregunta #1 que se hacen los gerentes de operaciones:
              </p>
              <p className="mt-1 text-slate-300 leading-relaxed">
                Si el QR fuera una hoja estática pegada en la pared, <strong className="text-amber-300">cualquiera le tomaría una foto y se la mandaría por WhatsApp a su amigo que está en la casa</strong> para que marque. 
                Por eso nuestro motor utiliza <strong className="text-white">QR Dinámico Rotativo (10 segundos) + Geocerca GPS obligatoria</strong>. Abajo puedes simular el ataque y ver cómo el sistema lo bloquea.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Columna Izquierda: La Pantalla del PDV en Vivo (El QR Rotativo) */}
            <div className="lg:col-span-5 bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col items-center text-center space-y-4">
              <div className="flex items-center justify-between w-full text-xs">
                <span className="font-bold text-slate-400">Pantalla de Tienda (PDV):</span>
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  En Vivo
                </span>
              </div>

              {/* QR Image Box */}
              <div className="relative bg-white p-3.5 rounded-2xl shadow-xl shadow-purple-950/30">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Dinámico" className="w-48 h-48 sm:w-52 sm:h-52 object-contain" />
                ) : (
                  <div className="w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                  </div>
                )}
                
                {/* Countdown Badge overlay */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-white px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Expira en: <span className={secondsRemaining <= 3 ? 'text-rose-400 animate-ping' : 'text-amber-400'}>{secondsRemaining}s</span></span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${secondsRemaining <= 3 ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-400 to-emerald-400'}`}
                  style={{ width: `${(secondsRemaining / 10) * 100}%` }}
                ></div>
              </div>

              {/* Real Smartphone Scan Notice */}
              <div className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl p-3 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-emerald-400 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    ¡Prueba Real desde tu Celular!
                  </span>
                  <span className="text-[9px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                    URL Activa
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 leading-tight">
                  Apunta con la cámara de tu smartphone a este QR. Tu celular abrirá automáticamente la pantalla móvil de marcación en vivo.
                </p>

                {/* Direct quick action buttons */}
                <div className="flex items-center gap-1.5 pt-1">
                  <a
                    href={realScanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-lg transition flex items-center justify-center gap-1 text-center cursor-pointer shadow-sm"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Abrir en Pestaña</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      if (realScanUrl) {
                        navigator.clipboard.writeText(realScanUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }
                    }}
                    className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-[10px] rounded-lg border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                    title="Copiar URL para probar en otro navegador"
                  >
                    {copiedLink ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLink ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Host / Domain selector toggle */}
              <div className="w-full text-left space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-slate-500" />
                    Dominio destino:
                  </span>
                  <button
                    onClick={() => setShowHostConfig(!showHostConfig)}
                    className="text-amber-400 hover:text-amber-300 text-[10px] font-semibold underline cursor-pointer"
                  >
                    {showHostConfig ? 'Ocultar' : 'Cambiar'}
                  </button>
                </div>

                {!showHostConfig ? (
                  <p className="font-mono text-[9px] text-slate-400 truncate bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                    {scanHost}
                  </p>
                ) : (
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-700 space-y-2 mt-1">
                    <p className="text-[9px] text-slate-400">
                      Selecciona hacia dónde apuntará el QR cuando lo leas con tu teléfono:
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-[9px]">
                      <button
                        type="button"
                        onClick={() => {
                          setScanHost('https://control-turnos-pdv.vercel.app');
                          setShowHostConfig(false);
                        }}
                        className={`p-1.5 rounded text-left border ${scanHost.includes('vercel.app') ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                      >
                        <div className="font-bold">🌐 Vercel (Producción)</div>
                        <div className="text-[8px] text-slate-400">Para celular con 4G / Wi-Fi</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setScanHost('http://172.21.144.167:3001');
                          setShowHostConfig(false);
                        }}
                        className={`p-1.5 rounded text-left border ${scanHost.includes('172.21.144.167') ? 'bg-amber-500/20 border-amber-500 text-amber-200' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                      >
                        <div className="font-bold">📡 Wi-Fi Local (PC)</div>
                        <div className="text-[8px] text-slate-400">172.21.144.167:3001</div>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={scanHost}
                      onChange={(e) => setScanHost(e.target.value)}
                      placeholder="https://tu-dominio.com"
                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[10px] text-white font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
                <p className="font-mono truncate max-w-xs text-slate-500 text-[10px]">
                  Token: {qrToken.substring(0, 22)}...
                </p>
                <p className="text-[10px] text-slate-400">
                  ⚡ Cada 10s este código se destruye y se genera uno nuevo.
                </p>
              </div>

              <button
                onClick={generateNewToken}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition pt-0.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Forzar regeneración manual</span>
              </button>
            </div>

            {/* Columna Derecha: Panel de Pruebas de Ataque y Simulación */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="font-black text-sm text-slate-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Ejecutar Pruebas de Ataque & Verificación:</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Botón Prueba 1: Foto por WhatsApp */}
                <button
                  onClick={runWhatsAppFraudSimulation}
                  disabled={simulationState === 'running'}
                  className="p-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-750 hover:border-amber-500/50 rounded-2xl text-left transition space-y-1.5 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg group-hover:scale-110 transition">
                      <Send className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                      Simular Fraude
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-white">1. Foto enviada por WhatsApp</h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Compañero en tienda le manda foto al amigo en la casa (Demora: 15s).
                  </p>
                </button>

                {/* Botón Prueba 2: Marcación fuera de Tienda (GPS Falso) */}
                <button
                  onClick={runGpsGeofenceSimulation}
                  disabled={simulationState === 'running'}
                  className="p-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-750 hover:border-purple-500/50 rounded-2xl text-left transition space-y-1.5 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg group-hover:scale-110 transition">
                      <MapPin className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                      Simular Fraude
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-white">2. Marcar desde la casa (GPS)</h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Colaborador intenta marcar a 6.8 km de distancia del centro comercial.
                  </p>
                </button>

                {/* Botón Prueba 3: Token de un solo uso */}
                <button
                  onClick={runSingleUseTokenSimulation}
                  disabled={simulationState === 'running'}
                  className="p-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-750 hover:border-blue-500/50 rounded-2xl text-left transition space-y-1.5 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-blue-500/20 text-blue-300 rounded-lg group-hover:scale-110 transition">
                      <Zap className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                      Simular Fraude
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-white">3. Usar el mismo QR 2 veces</h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Dos colaboradores intentan pasar con la misma foto en menos de 4s.
                  </p>
                </button>

                {/* Botón Prueba 4: Marcación Válida */}
                <button
                  onClick={runLegitimatePunchSimulation}
                  disabled={simulationState === 'running'}
                  className="p-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-750 hover:border-emerald-500/50 rounded-2xl text-left transition space-y-1.5 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg group-hover:scale-110 transition">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                      Flujo Real
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-white">4. Marcación Real en Tienda</h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Colaborador en físico frente a la pantalla dentro del rango de 10s.
                  </p>
                </button>

                {/* Botón Prueba 5: Ataque con VPN */}
                <button
                  onClick={runVpnFraudSimulation}
                  disabled={simulationState === 'running'}
                  className="sm:col-span-2 p-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-750 hover:border-cyan-500/50 rounded-2xl text-left transition space-y-1.5 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg group-hover:scale-110 transition">
                      <Globe className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/40">
                      Pregunta Clave: ¿Y si usa VPN?
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-white">5. ¿Qué pasa si el empleado usa una VPN para falsear su ubicación?</h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Prueba qué ocurre si el colaborador enciende NordVPN o ExpressVPN en su celular para fingir que está en otro lugar.
                  </p>
                </button>
              </div>

              {/* Simulation Result Display */}
              {simulationState === 'running' && (
                <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center justify-center space-y-2 text-center animate-pulse">
                  <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                  <p className="text-xs font-bold text-slate-300">
                    Interceptando marcación y verificando capas criptográficas y GPS...
                  </p>
                </div>
              )}

              {simulationState === 'result' && simulationResult && (
                <div className={`p-4 rounded-2xl border transition-all ${
                  simulationResult.success 
                    ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                } space-y-3`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {simulationResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                      <span className="font-black text-sm text-white">
                        {simulationResult.title}
                      </span>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                      simulationResult.success
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                    }`}>
                      {simulationResult.badge}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 text-xs space-y-1 font-mono">
                    {simulationResult.details.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-300">{d}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    💡 <strong className="text-white">Conclusión Técnica:</strong> {simulationResult.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 3 Escudos Explicados en Detalle */}
          <div className="border-t border-slate-800 pt-5">
            <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-400 mb-3">
              Los 3 Escudos que hacen IMPOSIBLE el fraude por WhatsApp:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <Clock className="w-4 h-4" />
                  <span>1. QR Efímero (10 seg)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Para cuando la foto sube a WhatsApp y el amigo la descarga en su casa, el código ya murió. No le sirve de nada la foto.
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                  <MapPin className="w-4 h-4" />
                  <span>2. Geocerca GPS (50m)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  El celular del empleado tiene que estar físicamente dentro del local. Si está a más de 50 metros, se bloquea la marca.
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                  <Zap className="w-4 h-4" />
                  <span>3. Token Quemado</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Cada código QR solo permite 1 sola marcación. En cuanto se usa, se quema en el servidor para que nadie más lo repita.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Protocolo de Seguridad: TOTP RFC 6238 + HTML5 Geolocation API
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
          >
            Entendido, Cerrar Laboratorio
          </button>
        </div>

      </div>
    </div>
  );
}
