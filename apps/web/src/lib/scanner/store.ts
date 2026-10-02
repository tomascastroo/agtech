/**
 * Almacenamiento local del escáner (IndexedDB): el escaneo se guarda en el teléfono mientras
 * se hace, con o sin señal, y se sincroniza después. Los cuadros se borran del teléfono recién
 * cuando el servidor confirmó que los tiene todos.
 */
import type { LineSpec } from './tracker';

export type ScanMode = 'FIXED' | 'SWEEP';
export type FrameKind = 'SAMPLE' | 'KEY';

/** Estado local de un escaneo (lo que ve el productor). */
export type LocalScanState =
  | 'RECORDING' // en curso
  | 'PENDING_SYNC' // guardado en el teléfono, esperando señal
  | 'SYNCING' // subiendo cuadros
  | 'PROCESSING' // el servidor está calculando el conteo oficial
  | 'COMPLETED' // conteo oficial disponible
  | 'FAILED'; // el procesamiento oficial falló (se puede reintentar)

export interface DeviceResult {
  netCount: number;
  positiveCrossings: number;
  negativeCrossings: number;
  confirmedTracks: number;
  maxSimultaneous: number;
  detectionFrames: number;
  inferenceFps: number;
  backend: string;
  model: string;
  tracker: string;
  preliminary: true;
}

export interface LocalScan {
  id: string;
  requestId: string;
  assetName: string;
  mode: ScanMode;
  startedAt: string;
  endedAt: string | null;
  durationS: number;
  sampledFps: number;
  frameWidth: number;
  frameHeight: number;
  line: Pick<LineSpec, 'orientation' | 'position'>;
  location: { latitude: number; longitude: number; accuracyM: number } | null;
  locationEnd: { latitude: number; longitude: number } | null;
  maxDisplacementM: number | null;
  heading: { startDeg: number | null; sweptDeg: number | null; source: string } | null;
  device: Record<string, unknown>;
  deviceResult: DeviceResult | null;
  warnings: string[];
  frameCount: number;
  keyFrameCount: number;
  uploaded: number;
  state: LocalScanState;
  official: {
    count: number | null;
    quality: string | null;
    lowerBound: boolean;
    simulated: boolean;
  } | null;
  error: string | null;
  updatedAt: string;
}

export interface LocalFrame {
  scanId: string;
  kind: FrameKind;
  index: number;
  capturedMs: number;
  sha256: string;
  blob: Blob;
}

/** Escaneos que se están grabando en esta página (la sincronización no los toca). */
export const activeScans = new Set<string>();

const DB_NAME = 'agrogarantias-scanner';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openScannerDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('scans')) db.createObjectStore('scans', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('frames')) {
        const frames = db.createObjectStore('frames', { keyPath: ['scanId', 'kind', 'index'] });
        frames.createIndex('byScan', 'scanId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name: 'scans' | 'frames', mode: IDBTransactionMode) {
  const db = await openScannerDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function saveScan(scan: LocalScan): Promise<void> {
  await done(
    (await store('scans', 'readwrite')).put({ ...scan, updatedAt: new Date().toISOString() }),
  );
}

export async function getScan(id: string): Promise<LocalScan | undefined> {
  return done((await store('scans', 'readonly')).get(id) as IDBRequest<LocalScan | undefined>);
}

export async function listScans(requestId?: string): Promise<LocalScan[]> {
  const all = (await done((await store('scans', 'readonly')).getAll())) as LocalScan[];
  return all
    .filter((s) => !requestId || s.requestId === requestId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function updateScan(
  id: string,
  patch: Partial<LocalScan>,
): Promise<LocalScan | undefined> {
  const current = await getScan(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  await saveScan(next);
  return next;
}

export async function putFrame(frame: LocalFrame): Promise<void> {
  await done((await store('frames', 'readwrite')).put(frame));
}

export async function framesOf(scanId: string): Promise<LocalFrame[]> {
  const index = (await store('frames', 'readonly')).index('byScan');
  const frames = (await done(index.getAll(IDBKeyRange.only(scanId)))) as LocalFrame[];
  return frames.sort((a, b) =>
    a.kind === b.kind ? a.index - b.index : a.kind.localeCompare(b.kind),
  );
}

export type FrameKey = [scanId: string, kind: FrameKind, index: number];

/**
 * Claves de los cuadros de un escaneo, sin cargar las imágenes: un escaneo de 3 minutos son
 * ~1.000 JPEG y tenerlos todos en memoria a la vez hace que iOS cierre la página.
 */
export async function frameKeysOf(scanId: string): Promise<FrameKey[]> {
  const index = (await store('frames', 'readonly')).index('byScan');
  const keys = (await done(index.getAllKeys(IDBKeyRange.only(scanId)))) as FrameKey[];
  return keys.sort((a, b) => (a[1] === b[1] ? a[2] - b[2] : a[1].localeCompare(b[1])));
}

export async function getFrame(key: FrameKey): Promise<LocalFrame | undefined> {
  return done((await store('frames', 'readonly')).get(key) as IDBRequest<LocalFrame | undefined>);
}

export async function deleteFrames(scanId: string): Promise<void> {
  const keys = await frameKeysOf(scanId);
  const s = await store('frames', 'readwrite');
  await Promise.all(keys.map((key) => done(s.delete(key))));
}

/**
 * Renumera los cuadros de cada tipo para que los índices queden consecutivos (0..n-1) en orden
 * de captura: si algún cuadro no se pudo guardar no quedan huecos (el servidor exige todos los
 * índices declarados para finalizar). Procesa un cuadro a la vez. Devuelve cuántos hay.
 */
export async function compactFrames(scanId: string): Promise<{ samples: number; keys: number }> {
  const keys = await frameKeysOf(scanId);
  const count = { SAMPLE: 0, KEY: 0 };
  for (const key of keys) {
    const kind = key[1];
    const target = count[kind]++;
    if (key[2] === target) continue;
    const frame = await getFrame(key);
    if (!frame) continue;
    const s = await store('frames', 'readwrite');
    await done(s.delete(key));
    await done(s.put({ ...frame, index: target }));
  }
  return { samples: count.SAMPLE, keys: count.KEY };
}

export async function deleteScan(id: string): Promise<void> {
  await deleteFrames(id);
  await done((await store('scans', 'readwrite')).delete(id));
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
