import type { ExifGps } from '../../../common/files/exif-gps.js';

/**
 * Origen de la ubicación de una evidencia. La ubicación del establecimiento es contexto del
 * activo, nunca la ubicación de captura de una foto.
 */
export const LOCATION_SOURCES = [
  'DEVICE_GPS', // geolocalización del teléfono al tomar/subir la foto
  'EXIF', // GPS embebido en la imagen
  'MANUAL', // coordenadas ingresadas por un usuario
  'DEVICE_INSTALLATION', // cámara fija con ubicación registrada
  'ASSET_LOCATION', // solo contexto: ubicación del establecimiento/activo
  'NONE',
] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

/** Fuentes que representan dónde se capturó la imagen (sirven para la verificación de geocerca). */
export const CAPTURE_LOCATION_SOURCES: ReadonlySet<LocationSource> = new Set([
  'DEVICE_GPS',
  'EXIF',
  'MANUAL',
  'DEVICE_INSTALLATION',
]);

export interface ClientLocation {
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  locationSource?: LocationSource;
}

export interface ResolvedLocation {
  /** Ubicación de captura (se guarda en evidence.location); null si no se conoce. */
  capture: { latitude: number; longitude: number } | null;
  source: LocationSource;
  accuracyM: number | null;
  /** Ubicación de contexto (establecimiento) cuando no hay ubicación de captura. */
  context: { latitude: number; longitude: number } | null;
}

/**
 * Prioridad: GPS del dispositivo → GPS EXIF de la imagen → coordenadas manuales. Si el cliente
 * solo informa la ubicación del establecimiento, se registra como contexto y no como captura.
 */
export function resolveCaptureLocation(client: ClientLocation, exif: ExifGps): ResolvedLocation {
  const has = client.latitude !== undefined && client.longitude !== undefined;
  const coords = has ? { latitude: client.latitude!, longitude: client.longitude! } : null;
  if (coords && client.locationSource === 'DEVICE_GPS') {
    return {
      capture: coords,
      source: 'DEVICE_GPS',
      accuracyM: client.accuracyM ?? null,
      context: null,
    };
  }
  if (exif.latitude !== null && exif.longitude !== null) {
    return {
      capture: { latitude: exif.latitude, longitude: exif.longitude },
      source: 'EXIF',
      accuracyM: exif.accuracyM,
      context: client.locationSource === 'ASSET_LOCATION' ? coords : null,
    };
  }
  if (coords && client.locationSource === 'ASSET_LOCATION') {
    return { capture: null, source: 'ASSET_LOCATION', accuracyM: null, context: coords };
  }
  if (coords) {
    return {
      capture: coords,
      source: 'MANUAL',
      accuracyM: client.accuracyM ?? null,
      context: null,
    };
  }
  return { capture: null, source: 'NONE', accuracyM: null, context: null };
}

/** Origen para evidencias anteriores a este registro (metadata sin locationSource). */
export function inferLocationSource(e: {
  metadata: Record<string, unknown>;
  deviceId: string | null;
  location: unknown;
  type: string;
}): LocationSource | null {
  const declared = e.metadata.locationSource;
  if (typeof declared === 'string') return declared as LocationSource;
  if (e.type !== 'IMAGE') return null;
  if (e.deviceId && e.location) return 'DEVICE_INSTALLATION';
  return e.location ? 'MANUAL' : 'NONE';
}
