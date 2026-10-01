/**
 * Lectura mínima de EXIF en JPEG: GPS (lat/lon/precisión) y fecha original de captura.
 * Sin dependencias: recorre el segmento APP1 "Exif" (TIFF) y los IFD 0, Exif y GPS.
 */
export interface ExifGps {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  capturedAt: string | null; // "YYYY-MM-DDTHH:mm:ss" sin zona (EXIF no la incluye)
  offset: string | null; // OffsetTimeOriginal, p. ej. "-03:00"
}

const EMPTY: ExifGps = {
  latitude: null,
  longitude: null,
  accuracyM: null,
  capturedAt: null,
  offset: null,
};

export function readExifGps(buf: Buffer): ExifGps {
  try {
    return parse(buf) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function parse(buf: Buffer): ExifGps | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return null;
    const marker = buf[pos + 1]!;
    const size = buf.readUInt16BE(pos + 2);
    if (marker === 0xe1 && buf.toString('latin1', pos + 4, pos + 10) === 'Exif\0\0') {
      return readTiff(buf.subarray(pos + 10, pos + 2 + size));
    }
    if (marker === 0xda) return null; // empieza la imagen: no hay EXIF
    pos += 2 + size;
  }
  return null;
}

function readTiff(t: Buffer): ExifGps {
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; valueOffset: number }>();
    if (ifd <= 0 || ifd + 2 > t.length) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > t.length) break;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valueOffset: e + 8 });
    }
    return out;
  };
  const pointer = (e?: { valueOffset: number }) => (e ? u32(e.valueOffset) : 0);
  const rationals = (e?: { count: number; valueOffset: number }) => {
    if (!e) return null;
    const at = u32(e.valueOffset);
    const values: number[] = [];
    for (let i = 0; i < e.count; i++) {
      const den = u32(at + i * 8 + 4);
      values.push(den ? u32(at + i * 8) / den : 0);
    }
    return values;
  };
  const ascii = (e?: { count: number; valueOffset: number }) => {
    if (!e) return null;
    const at = e.count > 4 ? u32(e.valueOffset) : e.valueOffset;
    return (
      t
        .toString('latin1', at, at + e.count)
        .replace(/\0+$/, '')
        .trim() || null
    );
  };

  const ifd0 = entries(u32(4));
  const exif = entries(pointer(ifd0.get(0x8769)));
  const gps = entries(pointer(ifd0.get(0x8825)));
  const dms = (v: number[] | null) =>
    v && v.length >= 3 ? v[0]! + v[1]! / 60 + v[2]! / 3600 : null;
  let latitude = dms(rationals(gps.get(2)));
  let longitude = dms(rationals(gps.get(4)));
  if (latitude !== null && ascii(gps.get(1))?.toUpperCase() === 'S') latitude = -latitude;
  if (longitude !== null && ascii(gps.get(3))?.toUpperCase() === 'W') longitude = -longitude;
  const valid =
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0);
  const accuracy = rationals(gps.get(0x1f))?.[0] ?? null;
  const original = ascii(exif.get(0x9003));
  const m = original?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  return {
    latitude: valid ? Math.round(latitude! * 1e7) / 1e7 : null,
    longitude: valid ? Math.round(longitude! * 1e7) / 1e7 : null,
    accuracyM: valid && accuracy !== null ? Math.round(accuracy * 10) / 10 : null,
    capturedAt: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null,
    offset: ascii(exif.get(0x9011)),
  };
}
