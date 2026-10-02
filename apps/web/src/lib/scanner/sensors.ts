/**
 * Sensores del escáner: GPS (ubicación y desplazamiento del operador), rumbo/giroscopio
 * (arco barrido y velocidad de giro en el modo móvil) y pantalla siempre encendida.
 * Todo es opcional: si un sensor no está disponible o se niega el permiso, el escaneo sigue y
 * el dato queda vacío (y se informa como advertencia).
 */

export function haversineM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export class GpsTracker {
  start: { latitude: number; longitude: number; accuracyM: number } | null = null;
  last: { latitude: number; longitude: number } | null = null;
  maxDisplacementM = 0;
  private watchId: number | null = null;

  begin(): void {
    if (!('geolocation' in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        const here = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        // Se toma como inicio la primera posición con precisión razonable.
        if (
          !this.start ||
          (this.start.accuracyM > 50 && p.coords.accuracy < this.start.accuracyM)
        ) {
          this.start = { ...here, accuracyM: p.coords.accuracy };
        } else if (p.coords.accuracy <= 50) {
          this.maxDisplacementM = Math.max(this.maxDisplacementM, haversineM(this.start, here));
        }
        this.last = here;
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }

  end(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** Rumbo de la cámara (brújula) y velocidad de giro (giroscopio). */
export class HeadingTracker {
  startDeg: number | null = null;
  source: 'compass' | 'orientation' | 'none' = 'none';
  /** Grados/segundo (suavizado). */
  turnRate = 0;
  private unwrapped: number | null = null;
  private min = 0;
  private max = 0;
  private lastRaw: number | null = null;
  private lastT = 0;
  private readonly onOrientation = (event: Event) =>
    this.handle(event as OrientationEventWithCompass);
  private readonly onMotion = (event: DeviceMotionEvent) => {
    const r = event.rotationRate;
    if (r && r.alpha !== null && r.beta !== null && r.gamma !== null) {
      const rate = Math.hypot(r.alpha, r.beta, r.gamma);
      this.turnRate = 0.8 * this.turnRate + 0.2 * rate;
    }
  };

  /** En iOS hay que pedir permiso desde un gesto del usuario. */
  static async requestPermission(): Promise<boolean> {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof D.requestPermission === 'function') {
      try {
        return (await D.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  begin(): void {
    window.addEventListener('deviceorientationabsolute', this.onOrientation);
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('devicemotion', this.onMotion);
  }

  end(): void {
    window.removeEventListener('deviceorientationabsolute', this.onOrientation);
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
  }

  get sweptDeg(): number | null {
    return this.unwrapped === null ? null : this.max - this.min;
  }

  private handle(event: OrientationEventWithCompass) {
    let raw: number | null = null;
    if (typeof event.webkitCompassHeading === 'number') {
      raw = event.webkitCompassHeading;
      this.source = 'compass';
    } else if (event.alpha !== null) {
      raw = 360 - event.alpha; // alpha crece en sentido antihorario
      if (this.source === 'none') this.source = 'orientation';
    }
    if (raw === null) return;
    const now = performance.now();
    if (this.lastRaw === null || this.unwrapped === null) {
      this.startDeg = raw;
      this.unwrapped = 0;
    } else {
      let delta = raw - this.lastRaw;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      this.unwrapped += delta;
      const dt = (now - this.lastT) / 1000;
      if (dt > 0 && dt < 1) this.turnRate = 0.8 * this.turnRate + 0.2 * Math.abs(delta / dt);
    }
    this.min = Math.min(this.min, this.unwrapped);
    this.max = Math.max(this.max, this.unwrapped);
    this.lastRaw = raw;
    this.lastT = now;
  }
}

/** Mantiene la pantalla encendida mientras se escanea (si el navegador lo permite). */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    const lock = await nav.wakeLock?.request('screen');
    return () => void lock?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}
