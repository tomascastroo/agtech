'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHUTE_REASON_LABELS,
  ChuteSessionEngine,
  type ChuteLive,
} from '@/lib/scanner/chute-session';
import { OrtYoloxDetector, prefersWasm, type InferenceBackend } from '@/lib/scanner/detector';
import { MAX_PHOTOS, PhotoSessionEngine, type PhotoShot } from '@/lib/scanner/photo-session';
import { SimulatedRfidReader } from '@/lib/scanner/rfid-reader';
import { HeadingTracker } from '@/lib/scanner/sensors';
import { MAX_DURATION_S, ScanSessionEngine, type LiveState } from '@/lib/scanner/session';
import { scanStatus } from '@/lib/scanner/status';
import {
  getScan,
  type LocalChuteCapture,
  type LocalScan,
  type ScanMode,
} from '@/lib/scanner/store';
import { onScansChanged, syncPendingScans } from '@/lib/scanner/sync';
import type { Box } from '@/lib/scanner/tracker';
import styles from './scanner.module.css';

type Phase = 'setup' | 'loading' | 'scanning' | 'photo' | 'chute' | 'finishing' | 'summary';

/** Tipo de producción del rodeo (lo informa la API): ordena y recomienda los modos. */
export interface ScannerProfile {
  system: 'FEEDLOT' | 'CRIA' | 'PASTOREO';
  label: string;
  recommendedModes: ScanMode[];
  guidance: string;
}

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

export const MODES: { mode: ScanMode; title: string; text: string; result: string }[] = [
  {
    mode: 'FIXED',
    title: 'Escáner fijo (manga / tranquera)',
    text: 'Apoyá el celular quieto frente a un punto de paso. Cuenta cada animal que cruza la línea.',
    result: 'Comparable con lo declarado si pasa todo el rodeo.',
  },
  {
    mode: 'SWEEP',
    title: 'Escáner móvil (barrido)',
    text: 'Quedate quieto en un punto y girá despacio de izquierda a derecha sobre el rodeo. Empezá apuntando a un costado del rodeo.',
    result: 'Cuenta lo que se ve: cota inferior, no el stock total.',
  },
  {
    mode: 'PEN',
    title: 'Escáner de corral (animales quietos)',
    text: 'Para corrales, aguadas o agrupamientos: apuntá al grupo y, si no entra en cuadro, mové la cámara despacio para cubrir las otras zonas. Cada animal se cuenta una vez aunque lo vuelvas a filmar.',
    result: 'Bovinos observados: cota inferior (los tapados por otros no se ven).',
  },
  {
    mode: 'PHOTO',
    title: 'Analizar foto',
    text: `Sacá una o varias fotos del mismo grupo (hasta ${MAX_PHOTOS}). Para cubrir un grupo grande, sacalas seguidas y con una parte en común.`,
    result: 'Bovinos en las fotos: cota inferior.',
  },
  {
    mode: 'CHUTE',
    title: 'Manga + RFID (ESCANEO INDIVIDUAL)',
    text: 'Un bovino por vez en la manga, quieto frente a la cámara. Leé su caravana electrónica: si hay un único bovino estable, la lectura queda asociada con imágenes de respaldo. Después, registrá el siguiente.',
    result:
      'Bovinos identificados por caravana. La identidad la da el RFID; la cámara no reconoce animales por su aspecto.',
  },
];

/** Escáner de Bovinos: cámara del celular + YOLOX en el dispositivo + conteo según el modo. */
export function BovineScanner({
  requestId,
  assetName,
  profile = null,
}: {
  requestId: string;
  assetName: string;
  profile?: ScannerProfile | null;
}) {
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<ScanMode>(profile?.recommendedModes[0] ?? 'FIXED');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<InferenceBackend | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [shots, setShots] = useState<PhotoShot[]>([]);
  const [shooting, setShooting] = useState(false);
  const [kind, setKind] = useState<'video' | 'photo' | null>(null);
  const [result, setResult] = useState<LocalScan | null>(null);
  const [chute, setChute] = useState<ChuteLive | null>(null);
  const chuteRef = useRef<ChuteSessionEngine | null>(null);
  const readerRef = useRef<SimulatedRfidReader | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ScanSessionEngine | null>(null);
  const photoRef = useRef<PhotoSessionEngine | null>(null);
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
      if (chuteRef.current?.captures.length) void chuteRef.current.finish();
      chuteRef.current = null;
      if (photoRef.current?.shots.length) void photoRef.current.finish();
      photoRef.current = null;
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
      if (mode !== 'PHOTO' && mode !== 'CHUTE') {
        // Giroscopio/brújula: velocidad de giro (barrido/corral) o quietud del celular (fijo).
        await HeadingTracker.requestPermission();
      }
      setMessage('Abriendo la cámara…');
      // iPhone con video continuo: 640×480 alcanza (el detector usa 416 px y el servidor 640 px)
      // y reduce la memoria. Las fotos son de a una: resolución mayor.
      const lowMemory = prefersWasm() && mode !== 'PHOTO';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: lowMemory ? 640 : 1280 },
          height: { ideal: lowMemory ? 480 : 720 },
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
      if (mode === 'CHUTE') {
        // Hoy solo hay lector SIMULADO (ver rfid-reader.ts): todo queda marcado SIMULADO.
        const reader = new SimulatedRfidReader();
        readerRef.current = reader;
        const engine = new ChuteSessionEngine(
          video,
          detector,
          { id: requestId, assetName },
          reader,
          (state) => {
            setChute(state);
            drawChute(canvasRef.current, video, state);
          },
        );
        chuteRef.current = engine;
        await engine.start();
        setKind('video');
        setMessage(null);
        setPhase('chute');
        return;
      }
      if (mode === 'PHOTO') {
        const photo = new PhotoSessionEngine(video, detector, { id: requestId, assetName });
        photoRef.current = photo;
        await photo.start();
        setKind('photo');
        setMessage(null);
        setPhase('photo');
        return;
      }
      const engine = new ScanSessionEngine(
        video,
        detector,
        mode,
        { id: requestId, assetName },
        (state) => {
          setLive(state);
          draw(canvasRef.current, video, state, mode);
        },
      );
      engineRef.current = engine;
      await engine.start();
      setKind('video');
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

  const takePhoto = async () => {
    const photo = photoRef.current;
    if (!photo || shooting) return;
    setShooting(true);
    try {
      const shot = await photo.capture();
      setShots((s) => [...s, shot]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setShooting(false);
    }
  };

  const finish = useCallback(async () => {
    const engine = engineRef.current;
    const photo = photoRef.current;
    const chuteEngine = chuteRef.current;
    if (!engine && !photo && !chuteEngine) return;
    setPhase('finishing');
    const scan = engine
      ? await engine.finish()
      : chuteEngine
        ? await chuteEngine.finish()
        : await photo!.finish();
    engineRef.current = null;
    photoRef.current = null;
    chuteRef.current = null;
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
  const still = mode === 'PEN' || mode === 'PHOTO';
  const ordered = profile
    ? [...MODES].sort(
        (a, b) => rank(profile.recommendedModes, a.mode) - rank(profile.recommendedModes, b.mode),
      )
    : MODES;

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
          {profile ? (
            <div className={styles.profile} data-testid="scanner-profile">
              <b>{profile.label}:</b> {profile.guidance}
            </div>
          ) : null}
          {ordered.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`${styles.modeCard} ${mode === m.mode ? styles.modeCardActive : ''}`}
              onClick={() => setMode(m.mode)}
              aria-pressed={mode === m.mode}
              disabled={phase === 'loading'}
            >
              <strong>
                {m.title}
                {profile?.recommendedModes[0] === m.mode ? (
                  <span className={styles.badge}>Recomendado</span>
                ) : null}
              </strong>
              <span className={styles.small}>{m.text}</span>
              <span className={styles.small} style={{ display: 'block', marginTop: 4 }}>
                <b>Resultado:</b> {m.result}
              </span>
            </button>
          ))}
          <p className={styles.note}>
            El número que ves en pantalla es <b>preliminar</b> (calculado en tu celular). El conteo
            oficial lo recalcula AgroGarantías en el servidor. No se graba el video: se guardan
            cuadros muestreados o las fotos. Funciona sin señal y se sincroniza solo.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="button"
            className={styles.primary}
            onClick={() => void start()}
            disabled={phase === 'loading'}
          >
            {phase === 'loading'
              ? (message ?? 'Preparando…')
              : mode === 'PHOTO'
                ? 'Abrir cámara'
                : mode === 'CHUTE'
                  ? 'Iniciar sesión de manga'
                  : 'Iniciar escaneo'}
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
        {live?.guidance.length ? (
          <div className={styles.guidanceList} role="alert" data-testid="scanner-guidance">
            {live.guidance.slice(0, 2).map((g, i) => (
              <div key={g.code} className={i === 0 ? styles.warning : styles.warningSoft}>
                {g.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {phase === 'scanning' || (phase === 'finishing' && kind === 'video' && mode !== 'CHUTE') ? (
        <div className={styles.panel}>
          <div className={styles.counterRow}>
            <div>
              <div className={styles.counter} data-testid="scanner-count">
                {(still ? live?.observed : live?.netCount) ?? 0}
              </div>
              <div className={styles.counterLabel}>
                {still
                  ? 'bovinos observados (preliminar, cota inferior)'
                  : 'bovinos contados (preliminar)'}
              </div>
            </div>
            {still ? (
              <div className={styles.newBadge} data-testid="scanner-coverage">
                {(live?.coverageViews ?? 1).toFixed(1)} vistas
              </div>
            ) : (
              <div className={styles.newBadge} data-testid="scanner-new">
                +{live?.newLast10s ?? 0} nuevos
              </div>
            )}
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
          {mode === 'SWEEP' || mode === 'PEN' ? (
            <div>
              <div className={styles.small}>
                {mode === 'PEN' ? 'Giro medido: ' : 'Arco barrido: '}
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

      {phase === 'chute' || (phase === 'finishing' && mode === 'CHUTE') ? (
        <div className={styles.panel} data-testid="chute-panel">
          <div className={styles.counterRow}>
            <div>
              <div
                className={styles.chuteState}
                data-testid="chute-state"
                data-state={chute?.state ?? 'WAITING_FOR_ANIMAL'}
              >
                {chute?.label ?? 'Esperando bovino en la manga'}
              </div>
              <div className={styles.small}>
                Bovinos en la zona: {chute?.inZone ?? 0} · Lector RFID:{' '}
                <span className={`${styles.chip} ${styles.chipOffline}`} data-testid="rfid-reader">
                  {chute?.readerLabel ?? 'SIMULADO'}
                </span>
              </div>
            </div>
            <div className={styles.newBadge} data-testid="chute-count">
              {chute?.confirmed ?? 0}/{chute?.captures ?? 0}
            </div>
          </div>
          {chute?.last ? (
            <ChuteResultCard last={chute.last} />
          ) : (
            <p className={styles.small}>
              Un bovino por vez dentro del recuadro. Cuando esté quieto, pasá el lector por la
              caravana. Con más de un bovino, o si se mueve o queda tapado, la lectura{' '}
              <b>no se asocia</b>.
            </p>
          )}
          <div className={styles.buttonRow}>
            {chute?.last ? (
              <button
                type="button"
                className={styles.primary}
                data-testid="chute-next"
                onClick={() => chuteRef.current?.next()}
              >
                Registrar siguiente bovino
              </button>
            ) : (
              <button
                type="button"
                className={styles.primary}
                data-testid="chute-read"
                onClick={() => readerRef.current?.trigger()}
                disabled={chute?.state === 'MATCHING' || phase === 'finishing'}
              >
                Leer RFID (SIMULADO)
              </button>
            )}
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void finish()}
              disabled={!chute?.captures || chute.state === 'MATCHING' || phase === 'finishing'}
            >
              {phase === 'finishing' ? 'Guardando…' : 'FINALIZAR'}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'photo' || (phase === 'finishing' && kind === 'photo') ? (
        <div className={styles.panel} data-testid="scanner-photos">
          {shots.length ? (
            <>
              <div className={styles.counterRow}>
                <div>
                  <div className={styles.counter} data-testid="scanner-count">
                    {shots[shots.length - 1]!.count}
                  </div>
                  <div className={styles.counterLabel}>bovinos en la última foto (preliminar)</div>
                </div>
                <div className={styles.newBadge}>
                  {shots.length} foto{shots.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className={styles.shots}>
                {shots.map((s) => (
                  <div className={styles.shot} key={s.index}>
                    <ShotPreview shot={s} />
                    <span className={styles.shotCount}>{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.small}>
              Encuadrá el grupo y tocá <b>Tomar foto</b>. Se analiza en el celular y se guarda con
              fecha, hora y ubicación.
            </p>
          )}
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void takePhoto()}
              disabled={shooting || phase === 'finishing' || shots.length >= MAX_PHOTOS}
            >
              {shooting ? 'Analizando…' : shots.length ? 'Otra foto' : 'Tomar foto'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void finish()}
              disabled={!shots.length || phase === 'finishing'}
            >
              {phase === 'finishing' ? 'Guardando…' : 'FINALIZAR'}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'summary' && result?.mode === 'CHUTE' ? (
        <ChuteSummary result={result} status={status} chipClass={chipClass} requestId={requestId} />
      ) : null}

      {phase === 'summary' && result && result.mode !== 'CHUTE' ? (
        <div className={styles.setup} data-testid="scanner-summary">
          <div className={styles.counter}>{result.deviceResult?.netCount ?? 0}</div>
          <div className={styles.counterLabel}>
            {result.mode === 'PHOTO'
              ? 'bovinos en las fotos (preliminar, máximo por foto)'
              : result.mode === 'PEN'
                ? 'bovinos observados en el celular (preliminar, cota inferior)'
                : `bovinos contados en el celular (preliminar, ${result.mode === 'SWEEP' ? 'barrido: cota inferior' : 'paso controlado'})`}
          </div>
          <div className={styles.stats}>
            <span>Duración: {Math.round(result.durationS)} s</span>
            <span>
              {result.mode === 'PHOTO'
                ? `Fotos: ${result.frameCount}`
                : `Cuadros: ${result.frameCount} + ${result.keyFrameCount} representativos`}
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

const formatEid = (eid: string) =>
  /^\d{15}$/.test(eid)
    ? `${eid.slice(0, 3)} ${eid.slice(3, 7)} ${eid.slice(7, 11)} ${eid.slice(11)}`
    : eid;

const CHUTE_RESULT_TITLES = {
  CONFIRMED: '✓ Bovino identificado',
  AMBIGUOUS: 'Ambiguo: no se asoció',
  INSUFFICIENT_EVIDENCE: 'No determinable: no se asoció',
} as const;

/** Resultado del último animal (preliminar del celular hasta que confirme el servidor). */
function ChuteResultCard({ last }: { last: NonNullable<ChuteLive['last']> }) {
  const ok = last.status === 'CONFIRMED';
  return (
    <div
      className={ok ? styles.chuteOk : styles.chuteNo}
      data-testid="chute-result"
      data-status={last.status}
    >
      <strong>{CHUTE_RESULT_TITLES[last.status]}</strong>
      {ok && last.electronicId ? (
        <div>
          RFID: <b data-testid="chute-eid">{formatEid(last.electronicId)}</b>
          {last.simulated ? ' · SIMULADO' : ''}
        </div>
      ) : (
        <div>{CHUTE_REASON_LABELS[last.reason] ?? last.reason}</div>
      )}
      <div className={styles.small}>
        Animal #{last.sequence} · Imágenes de evidencia: {last.frames} ·{' '}
        {new Date(last.capturedAt).toLocaleString('es-AR')}
      </div>
      <div className={styles.small}>
        Estado: PRELIMINAR (celular). El resultado oficial lo confirma el servidor al sincronizar.
      </div>
    </div>
  );
}

function captureView(c: LocalChuteCapture) {
  const official = c.official && c.official.status !== 'PENDING' ? c.official : null;
  const status: LocalChuteCapture['preliminary']['status'] =
    official && official.status !== 'PENDING' ? official.status : c.preliminary.status;
  const reason = official?.reason ?? c.preliminary.reason;
  const eid =
    status === 'CONFIRMED' ? (official?.electronicId ?? c.preliminary.electronicId) : null;
  return { status, reason, eid, official, code: official?.internalCode ?? null };
}

/** Resumen de la sesión de manga: cada animal con su estado (preliminar u oficial). */
function ChuteSummary({
  result,
  status,
  chipClass,
  requestId,
}: {
  result: LocalScan;
  status: ReturnType<typeof scanStatus> | null;
  chipClass: string;
  requestId: string;
}) {
  const captures = result.captures ?? [];
  const confirmed = captures.filter((c) => captureView(c).status === 'CONFIRMED').length;
  return (
    <div className={styles.setup} data-testid="scanner-summary">
      <div className={styles.counter}>{result.official?.count ?? confirmed}</div>
      <div className={styles.counterLabel}>
        bovinos identificados por caravana{' '}
        {result.official ? '(oficial, servidor)' : '(preliminar, celular)'}
        {captures.some((c) => c.rfidSource === 'SIMULATED') ? ' · SIMULADO' : ''}
      </div>
      {status ? (
        <p data-testid="scanner-sync-detail">
          <span className={`${styles.chip} ${chipClass}`}>{status.label}</span> {status.detail}
        </p>
      ) : null}
      <ul className={styles.chuteList} data-testid="chute-captures">
        {captures.map((c) => {
          const v = captureView(c);
          return (
            <li key={c.id} data-status={v.status}>
              <b>#{c.sequence}</b>{' '}
              {v.status === 'CONFIRMED'
                ? `✓ ${v.code ? `${v.code} · ` : ''}${formatEid(v.eid ?? '')}`
                : `${CHUTE_RESULT_TITLES[v.status]} (${CHUTE_REASON_LABELS[v.reason ?? ''] ?? v.reason})`}{' '}
              <span className={styles.small}>
                · {c.frameIndices.length} imágenes · {v.official ? 'OFICIAL' : 'PRELIMINAR'}
                {c.rfidSource === 'SIMULATED' ? ' · SIMULADO' : ''}
              </span>
            </li>
          );
        })}
      </ul>
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
  );
}

/** Zona de captura y cajas seguidas sobre el video (manga). */
function drawChute(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, live: ChuteLive) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const unit = Math.max(2, canvas.width / 320);
  const { x1, y1, x2, y2 } = live.zone;
  ctx.setLineDash([unit * 4, unit * 3]);
  ctx.strokeStyle =
    live.state === 'WAITING_FOR_RFID' || live.state === 'CONFIRMED'
      ? '#38d27a'
      : live.state === 'MULTIPLE_ANIMALS'
        ? '#e5484d'
        : 'rgba(255,255,255,0.9)';
  ctx.lineWidth = unit;
  ctx.strokeRect(
    x1 * canvas.width,
    y1 * canvas.height,
    (x2 - x1) * canvas.width,
    (y2 - y1) * canvas.height,
  );
  ctx.setLineDash([]);
  ctx.font = `bold ${unit * 7}px sans-serif`;
  for (const track of live.tracks) {
    const [bx1, by1, bx2, by2] = track.box;
    ctx.strokeStyle = track.confirmed ? '#38d27a' : '#f5c542';
    ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(`#${track.id}`, bx1 + unit, Math.max(unit * 8, by1 - unit));
  }
}

function rank(order: ScanMode[], mode: ScanMode): number {
  const i = order.indexOf(mode);
  return i === -1 ? order.length : i;
}

/** Miniatura de una foto con las cajas detectadas en el celular. */
function ShotPreview({ shot }: { shot: PhotoShot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = shot.width;
      canvas.height = shot.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      drawBoxes(ctx, shot.boxes, shot.width);
    };
    img.src = shot.previewUrl;
  }, [shot]);
  return <canvas ref={ref} aria-label={`Foto ${shot.index + 1}: ${shot.count} bovinos`} />;
}

function drawBoxes(ctx: CanvasRenderingContext2D, boxes: readonly Box[], width: number) {
  const unit = Math.max(2, width / 320);
  ctx.strokeStyle = '#38d27a';
  ctx.lineWidth = unit;
  for (const [x1, y1, x2, y2] of boxes) ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
}

/** Dibuja cajas, IDs y (en paso/barrido) la línea de conteo sobre el video. */
function draw(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  state: LiveState,
  mode: ScanMode,
) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const unit = Math.max(2, canvas.width / 320);
  if (mode === 'FIXED' || mode === 'SWEEP') {
    ctx.setLineDash([unit * 4, unit * 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = unit;
    ctx.beginPath();
    ctx.moveTo(state.linePx, 0);
    ctx.lineTo(state.linePx, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
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
