import { vi } from 'vitest';
import type { LocalChuteCapture, LocalFrame, LocalScan } from './store';

/**
 * Manga + RFID sin señal: la sesión queda en el teléfono (OFFLINE) y se sube después
 * (SINCRONIZANDO → PROCESANDO → VERIFICADO EN SERVIDOR). Lo que vale es la decisión del servidor.
 * IndexedDB se reemplaza por memoria y la API por un doble que registra las llamadas.
 */
const scans = new Map<string, LocalScan>();
const frames = new Map<string, LocalFrame>();
const calls: { path: string; method: string; body?: unknown }[] = [];
let server: Record<string, unknown> = {};

vi.mock('./store', () => ({
  activeScans: new Set<string>(),
  compactFrames: vi.fn(),
  deleteFrames: async (id: string) => {
    for (const k of [...frames.keys()]) if (k.startsWith(`${id}:`)) frames.delete(k);
  },
  deleteScan: async (id: string) => void scans.delete(id),
  frameKeysOf: async (id: string) =>
    [...frames.values()]
      .filter((f) => f.scanId === id)
      .sort((a, b) => a.index - b.index)
      .map((f) => [f.scanId, f.kind, f.index]),
  getFrame: async ([id, kind, index]: [string, string, number]) =>
    frames.get(`${id}:${kind}:${index}`),
  getScan: async (id: string) => scans.get(id),
  listScans: async () => [...scans.values()],
  updateScan: async (id: string, patch: Partial<LocalScan>) => {
    const next = { ...scans.get(id)!, ...patch };
    scans.set(id, next);
    return next;
  },
}));

vi.mock('@/lib/api/client', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: async (path: string, options: { method?: string; body?: unknown } = {}) => {
      calls.push({ path, method: options.method ?? 'GET', body: options.body });
      if (path.endsWith('/finalize')) return { ...server, status: 'PROCESSING' };
      if (path.endsWith('/captures') || path.endsWith('/frames')) return {};
      return server;
    },
  };
});

const { syncPendingScans } = await import('./sync');

const capture = (n: number, eids: string[]): LocalChuteCapture => ({
  id: `cap-${n}`,
  sequence: n,
  rfidSource: 'SIMULATED',
  readerDeviceId: null,
  reads: eids.map((electronicId, i) => ({ electronicId, atMs: n * 5000 + i * 100 })),
  frameIndices: [2 * (n - 1), 2 * (n - 1) + 1],
  clientTrackId: n,
  preliminary: { status: 'CONFIRMED', reason: 'ONE_STABLE_ANIMAL', electronicId: eids[0]! },
  capturedAt: new Date().toISOString(),
  official: null,
});

function localScan(): LocalScan {
  return {
    id: 'scan-1',
    requestId: 'req-1',
    assetName: 'Rodeo',
    mode: 'CHUTE',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationS: 12,
    sampledFps: 8,
    frameWidth: 640,
    frameHeight: 480,
    line: { orientation: 'vertical', position: 0.5 },
    location: null,
    locationEnd: null,
    maxDisplacementM: null,
    heading: null,
    device: { rfidReader: 'SIMULADO' },
    deviceResult: null,
    warnings: [],
    frameCount: 4,
    keyFrameCount: 0,
    captureZone: { x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.98 },
    captures: [
      capture(1, ['032000000000001']),
      // El celular dijo CONFIRMED con dos caravanas distintas: el servidor decide.
      capture(2, ['032000000000002', '032000000000003']),
    ],
    uploaded: 0,
    state: 'PENDING_SYNC',
    official: null,
    error: null,
    updatedAt: new Date().toISOString(),
  };
}

describe('Manga + RFID: captura sin señal y sincronización posterior', () => {
  beforeEach(() => {
    scans.clear();
    frames.clear();
    calls.length = 0;
    scans.set('scan-1', localScan());
    for (let index = 0; index < 4; index++)
      frames.set(`scan-1:SAMPLE:${index}`, {
        scanId: 'scan-1',
        kind: 'SAMPLE',
        index,
        capturedMs: index * 125,
        sha256: 'a'.repeat(64),
        blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      });
    server = {
      id: 'scan-1',
      status: 'UPLOADING',
      receivedSampleIndices: [],
      receivedKeyIndices: [],
      official: null,
      quality: null,
      error: null,
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin señal no sube nada: queda guardado en el teléfono', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await syncPendingScans();
    expect(calls).toHaveLength(0);
    expect(scans.get('scan-1')!.state).toBe('PENDING_SYNC');
    expect(frames.size).toBe(4);
  });

  it('al volver la señal: sesión, cuadros, capturas y finalización; el oficial reemplaza al preliminar', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    await syncPendingScans();
    const create = calls[0]!;
    expect(create).toMatchObject({ method: 'POST', path: '/producer/me/requests/req-1/scans' });
    expect(create.body).toMatchObject({ mode: 'CHUTE', captureZone: { x1: 0.1 } });
    expect(calls.filter((c) => c.path.endsWith('/frames'))).toHaveLength(4);
    const sent = calls.filter((c) => c.path.endsWith('/captures')).map((c) => c.body);
    expect(sent).toEqual([
      expect.objectContaining({ id: 'cap-1', rfidSource: 'SIMULATED', frameIndices: [0, 1] }),
      expect.objectContaining({
        id: 'cap-2',
        clientResult: expect.objectContaining({ status: 'CONFIRMED', preliminary: true }),
      }),
    ]);
    const finalize = calls.find((c) => c.path.endsWith('/finalize'))!;
    expect(finalize.body).toMatchObject({ expectedFrames: 4, expectedCaptures: 2 });
    expect(scans.get('scan-1')!.state).toBe('PROCESSING');
    expect(frames.size).toBe(0); // el servidor ya los tiene

    server = {
      id: 'scan-1',
      status: 'COMPLETED',
      official: {
        count: 1,
        lowerBound: true,
        model: { simulated: true },
        chute: { confirmed: 1, ambiguous: 1, insufficient: 0, identified: 1, rfidSimulated: true },
      },
      quality: 'LIMITED',
      error: null,
      captures: [
        {
          id: 'cap-1',
          status: 'CONFIRMED',
          reason: 'ONE_STABLE_ANIMAL',
          electronicId: '032000000000001',
          internalCode: 'BOV-00001',
          bestFrames: 2,
        },
        {
          id: 'cap-2',
          status: 'AMBIGUOUS',
          reason: 'MULTIPLE_RFID',
          electronicId: null,
          internalCode: null,
          bestFrames: 0,
        },
      ],
    };
    await syncPendingScans();
    const done = scans.get('scan-1')!;
    expect(done.state).toBe('COMPLETED');
    expect(done.official).toMatchObject({ count: 1, lowerBound: true, simulated: true });
    expect(done.captures![0]!.official).toMatchObject({
      status: 'CONFIRMED',
      internalCode: 'BOV-00001',
    });
    // El celular había dicho CONFIRMED; queda como referencia, el oficial es AMBIGUO.
    expect(done.captures![1]!.preliminary.status).toBe('CONFIRMED');
    expect(done.captures![1]!.official).toMatchObject({ status: 'AMBIGUOUS', electronicId: null });
  });
});
