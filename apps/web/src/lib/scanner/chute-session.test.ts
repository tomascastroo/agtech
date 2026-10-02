import type { ChuteFrame, TrackedDetection } from './chute-matching';
import { DEFAULT_CAPTURE_ZONE } from './chute-matching';
import { sceneState, spread } from './chute-session';
import { simulatedEid, SimulatedRfidReader, type RfidRead } from './rfid-reader';

const SIZE = { width: 640, height: 480 };
const cow = (x: number, trackId: number | null = 1, confirmed = true): TrackedDetection => ({
  x,
  y: 120,
  width: 220,
  height: 260,
  score: 0.9,
  trackId,
  confirmed,
});
const frames = (dets: TrackedDetection[][]): ChuteFrame[] =>
  dets.map((detections, i) => ({
    index: i,
    capturedMs: i * 125,
    detections,
    sharpness: 0,
    brightness: 128,
  }));
const state = (dets: TrackedDetection[][]) => sceneState(frames(dets), SIZE, DEFAULT_CAPTURE_ZONE);

describe('Manga + RFID: estado en vivo de la escena', () => {
  it('sin bovino → esperando', () => {
    expect(state([])).toBe('WAITING_FOR_ANIMAL');
    expect(state([[], []])).toBe('WAITING_FOR_ANIMAL');
  });
  it('un bovino recién detectado → detectado; quieto y seguido → esperando RFID', () => {
    expect(state([[cow(200, 1, false)]])).toBe('ANIMAL_DETECTED');
    expect(state(Array.from({ length: 8 }, () => [cow(200)]))).toBe('WAITING_FOR_RFID');
  });
  it('caminando → esperando que quede quieto', () => {
    expect(state(Array.from({ length: 8 }, (_, i) => [cow(90 + i * 30)]))).toBe(
      'WAITING_FOR_STABLE_TRACK',
    );
  });
  it('dos bovinos en la zona → no se puede asociar', () => {
    expect(state([[cow(80, 1), cow(340, 2)]])).toBe('MULTIPLE_ANIMALS');
  });
  it('reparte los cuadros de la ventana sin pasar el límite del servidor', () => {
    const picked = spread(
      Array.from({ length: 30 }, (_, i) => i),
      24,
    );
    expect(picked).toHaveLength(24);
    expect(picked[0]).toBe(0);
    expect(picked[23]).toBe(29);
    expect(spread([1, 2], 24)).toEqual([1, 2]);
  });
});

describe('Lector RFID SIMULADO', () => {
  it('emite caravanas deterministas, marcadas como SIMULADAS', async () => {
    const reader = new SimulatedRfidReader();
    const reads: RfidRead[] = [];
    await reader.start((r) => reads.push(r));
    reader.trigger(undefined, 10);
    reader.trigger(undefined, 20);
    reader.trigger('9X?', 30);
    expect(reads.map((r) => r.electronicId)).toEqual(['032000000000001', '032000000000002', '9X?']);
    expect(reads.every((r) => r.source === 'SIMULATED' && r.readerDeviceId === null)).toBe(true);
    expect(reader.label).toBe('SIMULADO');
    expect(simulatedEid(3)).toBe('032000000000003');
    reader.stop();
    reader.trigger();
    expect(reads).toHaveLength(3);
  });
});
