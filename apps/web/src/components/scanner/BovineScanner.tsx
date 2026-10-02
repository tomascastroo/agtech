'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OrtYoloxDetector, type InferenceBackend } from '@/lib/scanner/detector';
import { HeadingTracker } from '@/lib/scanner/sensors';
import { MAX_DURATION_S, ScanSessionEngine, type LiveState } from '@/lib/scanner/session';
import { scanStatus } from '@/lib/scanner/status';
import { getScan, type LocalScan, type ScanMode } from '@/lib/scanner/store';
import { onScansChanged, syncPendingScans } from '@/lib/scanner/sync';
import styles from './scanner.module.css';

type Phase = 'setup' | 'loading' | 'scanning' | 'finishing' | 'summary';

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

const MODES: { mode: ScanMode; title: string; text: string }[] = [
  {
    mode: 'FIXED',
    title: 'Escáner fijo (manga / tranquera)',
    text: 'Apoyá el celular quieto frente a un punto de paso. Cuenta cada animal que cruza la línea. Es el conteo comparable con lo declarado si pasa todo el rodeo.',
  },
  {
    mode: 'SWEEP',
    title: 'Escáner móvil (barrido)',
    text: 'Quedate quieto en un punto y girá despacio de izquierda a derecha sobre el rodeo. Empezá apuntando a un costado del rodeo. Cuenta lo que se ve: es una cota inferior, no el stock total.',
  },
];

/** Escáner de Bovinos: cámara del celular + YOLOX en el dispositivo + conteo por línea. */
export function BovineScanner({ requestId, assetName }: { requestId: string; assetName: string }) {
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<ScanMode>('FIXED');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<InferenceBackend | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [result, setResult] = useState<LocalScan | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ScanSessionEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      // Salir del escáner a mitad de un escaneo lo finaliza y lo deja guardado para subir, en
      // lugar de dejar el muestreo corriendo sin cámara.
      void engineRef.current?.finish();
      engineRef.current = null;
      stopCamera();
    },
    [stopCamera],
  );

  // Estado de sincronización del resultado (OFFLINE / SINCRONIZANDO / VERIFICADO).
  useEffect(() => {
    if (!result) return;
    const refresh = () => void getScan(result.id).then((s) => s && setResult(s));
    const off = onScansChanged(refresh);
    const timer = window.setInterval(() => {
      void syncPendingScans().then(refresh);
    }, 5_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [result?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    setPhase('loading');
    try {
      // Giroscopio/brújula: velocidad de giro (barrido) o quietud del celular (fijo).
      await HeadingTracker.requestPermission();
      setMessage('Abriendo la cámara…');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (!video.videoWidth)
        await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
      const detector = await OrtYoloxDetector.create(setMessage);
      setBackend(detector.backend);
      const engine = new ScanSessionEngine(
        video,
        detector,
        mode,
        { id: requestId, assetName },
        (state) => {
          setLive(state);
          draw(canvasRef.current, video, state);
        },
      );
      engineRef.current = engine;
      await engine.start();
      setMessage(null);
      setPhase('scanning');
    } catch (e) {
      stopCamera();
      setPhase('setup');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Sin permiso de cámara: habilitalo en el navegador para escanear.'
          : `No se pudo iniciar el escáner: ${(e as Error).message}`,
      );
    }
  };

  const finish = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setPhase('finishing');
    const scan = await engine.finish();
    engineRef.current = null;
    stopCamera();
    setResult(scan);
    setPhase('summary');
    void syncPendingScans();
  }, [stopCamera]);

  useEffect(() => {
    if (phase === 'scanning' && live && live.elapsedS >= MAX_DURATION_S) void finish();
  }, [phase, live, finish]);

  const status = result ? scanStatus(result, online) : null;
  const chipClass =
    status?.tone === 'done'
      ? styles.chipDone
      : status?.tone === 'error'
        ? styles.chipError
        : status?.tone === 'offline' || (!status && !online)
          ? styles.chipOffline
          : styles.chipOnline;

  return (
    <div className={styles.screen} data-testid="bovine-scanner">
      <div className={styles.topbar}>
        <Link
          href={`/productor/solicitudes/${requestId}#escaner`}
          className={styles.close}
          aria-label="Salir del escáner"
        >
          ✕
        </Link>
        <strong>Escáner de bovinos · {assetName}</strong>
        <span className={`${styles.chip} ${chipClass}`} data-testid="scanner-status">
          {status ? status.label : online ? 'EN LÍNEA' : 'OFFLINE'}
        </span>
      </div>

      {phase === 'setup' || phase === 'loading' ? (
        <div className={styles.setup}>
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`${styles.modeCard} ${mode === m.mode ? styles.modeCardActive : ''}`}
              onClick={() => setMode(m.mode)}
              aria-pressed={mode === m.mode}
              disabled={phase === 'loading'}
            >
              <strong>{m.title}</strong>
              <span className={styles.small}>{m.text}</span>
            </button>
          ))}
          <p className={styles.note}>
            El número que ves en pantalla es <b>preliminar</b> (calculado en tu celular). El conteo
            oficial lo recalcula AgroGarantías en el servidor con los cuadros del escaneo. No se
            graba el video: se guardan cuadros muestreados. Funciona sin señal y se sincroniza solo.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="button"
            className={styles.primary}
            onClick={() => void start()}
            disabled={phase === 'loading'}
          >
            {phase === 'loading' ? (message ?? 'Preparando…') : 'Iniciar escaneo'}
          </button>
        </div>
      ) : null}

      <div
        className={styles.viewport}
        style={phase === 'setup' || phase === 'summary' ? { display: 'none' } : undefined}
      >
        <div className={styles.stage}>
          <video ref={videoRef} className={styles.video} playsInline muted aria-label="Cámara" />
          <canvas ref={canvasRef} className={styles.overlay} />
        </div>
        {live?.warning ? (
          <div className={styles.warning} role="alert">
            {live.warning}
          </div>
        ) : null}
      </div>

      {phase === 'scanning' || phase === 'finishing' ? (
        <div className={styles.panel}>
          <div className={styles.counterRow}>
            <div>
              <div className={styles.counter} data-testid="scanner-count">
                {live?.netCount ?? 0}
              </div>
              <div className={styles.counterLabel}>bovinos contados (preliminar)</div>
            </div>
            <div className={styles.newBadge} data-testid="scanner-new">
              +{live?.newLast10s ?? 0} nuevos
            </div>
          </div>
          <div className={styles.stats}>
            <span>En cuadro: {live?.visible ?? 0}</span>
            <span>
              {Math.floor(live?.elapsedS ?? 0)} s / {MAX_DURATION_S} s
            </span>
            <span>Cuadros guardados: {live?.samples ?? 0}</span>
            <span>
              IA: {backend === 'webgpu' ? 'WebGPU' : 'WASM'} ·{' '}
              {(live?.inferenceFps ?? 0).toFixed(1)}/s
            </span>
          </div>
          {mode === 'SWEEP' ? (
            <div>
              <div className={styles.small}>
                Arco barrido:{' '}
                {live?.sweptDeg !== null && live?.sweptDeg !== undefined
                  ? `${Math.round(live.sweptDeg)}°`
                  : 'sin brújula'}
              </div>
              <div className={styles.arc}>
                <div
                  className={styles.arcFill}
                  style={{ width: `${Math.min(100, ((live?.sweptDeg ?? 0) / 180) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            onClick={() => void finish()}
            disabled={phase === 'finishing'}
          >
            {phase === 'finishing' ? 'Guardando…' : 'FINALIZAR'}
          </button>
        </div>
      ) : null}

      {phase === 'summary' && result ? (
        <div className={styles.setup} data-testid="scanner-summary">
          <div className={styles.counter}>{result.deviceResult?.netCount ?? 0}</div>
          <div className={styles.counterLabel}>
            bovinos contados en el celular (preliminar,{' '}
            {result.mode === 'SWEEP' ? 'barrido: cota inferior' : 'paso controlado'})
          </div>
          <div className={styles.stats}>
            <span>Duración: {Math.round(result.durationS)} s</span>
            <span>
              Cuadros: {result.frameCount} + {result.keyFrameCount} representativos
            </span>
            <span>
              GPS:{' '}
              {result.location ? `±${Math.round(result.location.accuracyM)} m` : 'sin ubicación'}
            </span>
          </div>
          {status ? (
            <p data-testid="scanner-sync-detail">
              <span className={`${styles.chip} ${chipClass}`}>{status.label}</span> {status.detail}
            </p>
          ) : null}
          {result.warnings.length ? (
            <ul className={styles.small}>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <Link
            className={styles.secondary}
            style={{ display: 'grid', placeItems: 'center' }}
            href={`/productor/solicitudes/${requestId}#escaner`}
          >
            Volver a la solicitud
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Dibuja cajas, IDs y la línea de conteo sobre el video (coordenadas del cuadro). */
function draw(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, state: LiveState) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const unit = Math.max(2, canvas.width / 320);
  ctx.setLineDash([unit * 4, unit * 3]);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = unit;
  ctx.beginPath();
  ctx.moveTo(state.linePx, 0);
  ctx.lineTo(state.linePx, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `bold ${unit * 7}px sans-serif`;
  for (const track of state.tracks) {
    const [x1, y1, x2, y2] = track.box;
    ctx.strokeStyle = track.confirmed ? '#38d27a' : '#f5c542';
    ctx.lineWidth = unit;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.fillStyle = track.confirmed ? '#38d27a' : '#f5c542';
    ctx.fillText(`#${track.id}`, x1 + unit, Math.max(unit * 8, y1 - unit));
  }
}
