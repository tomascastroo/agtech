import { resolveCaptureLocation } from './capture-location.js';

const NO_EXIF = {
  latitude: null,
  longitude: null,
  accuracyM: null,
  capturedAt: null,
  offset: null,
};
const EXIF = { ...NO_EXIF, latitude: -36.8, longitude: -59.16, accuracyM: 6 };
const RAUCH = { latitude: -36.7905, longitude: -59.153 };

describe('Ubicación de captura de una foto', () => {
  it('prioriza el GPS del dispositivo con su precisión', () => {
    const r = resolveCaptureLocation(
      { latitude: -34.6, longitude: -58.4, accuracyM: 12, locationSource: 'DEVICE_GPS' },
      EXIF,
    );
    expect(r).toMatchObject({ source: 'DEVICE_GPS', accuracyM: 12, capture: { latitude: -34.6 } });
  });

  it('usa el GPS EXIF si el dispositivo no informó ubicación', () => {
    expect(resolveCaptureLocation({}, EXIF)).toMatchObject({ source: 'EXIF', accuracyM: 6 });
  });

  it('la ubicación del establecimiento nunca se registra como ubicación de captura', () => {
    const r = resolveCaptureLocation({ ...RAUCH, locationSource: 'ASSET_LOCATION' }, NO_EXIF);
    expect(r.capture).toBeNull();
    expect(r.source).toBe('ASSET_LOCATION');
    expect(r.context).toEqual(RAUCH);
  });

  it('sin GPS ni EXIF queda sin ubicación', () => {
    expect(resolveCaptureLocation({}, NO_EXIF)).toMatchObject({ source: 'NONE', capture: null });
  });
});
