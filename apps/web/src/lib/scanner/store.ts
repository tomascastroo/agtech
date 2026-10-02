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

export async function deleteFrames(scanId: string): Promise<void> {
  const frames = await framesOf(scanId);
  const s = await store('frames', 'readwrite');
  await Promise.all(frames.map((f) => done(s.delete([f.scanId, f.kind, f.index]))));
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
