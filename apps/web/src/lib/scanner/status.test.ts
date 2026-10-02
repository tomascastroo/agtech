import { scanStatus } from './status';

const base = { uploaded: 0, frameCount: 100, keyFrameCount: 4, official: null, error: null };

describe('estado visible del escaneo', () => {
  it('sin señal muestra OFFLINE y con señal pendiente de sincronizar', () => {
    expect(scanStatus({ ...base, state: 'PENDING_SYNC' }, false).label).toBe('OFFLINE');
    expect(scanStatus({ ...base, state: 'PENDING_SYNC' }, true).label).toBe('PENDIENTE');
  });

  it('muestra el avance de la subida y el conteo oficial con su alcance', () => {
    expect(scanStatus({ ...base, state: 'SYNCING', uploaded: 52 }, true).detail).toBe(
      'Subiendo cuadros 52/104',
    );
    const done = scanStatus(
      {
        ...base,
        state: 'COMPLETED',
        official: { count: 37, quality: 'COMPLETE', lowerBound: true, simulated: false },
      },
      true,
    );
    expect(done.label).toBe('VERIFICADO EN SERVIDOR');
    expect(done.detail).toBe('Conteo oficial: 37 (cota inferior)');
  });
});
