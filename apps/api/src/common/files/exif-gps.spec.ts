import { readExifGps } from './exif-gps.js';

/** JPEG mínimo con APP1 EXIF (big-endian): IFD0 → GPS IFD y Exif IFD. */
function jpegWithExif(opts: { lat: number; lon: number; acc?: number; date?: string }) {
  const parts: Buffer[] = [];
  const tiff = Buffer.alloc(400);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  // IFD0 (offset 8): 2 entradas → ExifIFD (0x8769) y GPS IFD (0x8825)
  tiff.writeUInt16BE(2, 8);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(count, at + 4);
    tiff.writeUInt32BE(value, at + 8);
  };
  entry(10, 0x8769, 4, 1, 40);
  entry(22, 0x8825, 4, 1, 80);
  // Exif IFD (40): DateTimeOriginal ASCII 20 bytes en 300
  tiff.writeUInt16BE(1, 40);
  entry(42, 0x9003, 2, 20, 300);
  tiff.write(`${opts.date ?? '2026:10:01 14:30:00'}\0`, 300, 'latin1');
  // GPS IFD (80): LatRef, Lat, LonRef, Lon, HPositioningError
  tiff.writeUInt16BE(5, 80);
  const ref = (at: number, tag: number, c: string) => {
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(2, at + 2);
    tiff.writeUInt32BE(2, at + 4);
    tiff.write(`${c}\0`, at + 8, 'latin1');
  };
  const toDms = (v: number) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = (a - d - m / 60) * 3600;
    return [d, m, Math.round(s * 1000)];
  };
  const rat = (at: number, tag: number, values: number[], dens: number[], off: number) => {
    entry(at, tag, 5, values.length, off);
    values.forEach((v, i) => {
      tiff.writeUInt32BE(v, off + i * 8);
      tiff.writeUInt32BE(dens[i]!, off + i * 8 + 4);
    });
  };
  ref(82, 1, opts.lat < 0 ? 'S' : 'N');
  rat(94, 2, toDms(opts.lat), [1, 1, 1000], 200);
  ref(106, 3, opts.lon < 0 ? 'W' : 'E');
  rat(118, 4, toDms(opts.lon), [1, 1, 1000], 230);
  rat(130, 0x1f, [Math.round((opts.acc ?? 5) * 10)], [10], 260);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(app1.length + 2, 2);
  parts.push(Buffer.from([0xff, 0xd8]), header, app1, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

describe('EXIF GPS', () => {
  it('lee latitud/longitud (hemisferio sur/oeste), precisión y fecha original', () => {
    const exif = readExifGps(jpegWithExif({ lat: -36.7905, lon: -59.153, acc: 8.5 }));
    expect(exif.latitude).toBeCloseTo(-36.7905, 4);
    expect(exif.longitude).toBeCloseTo(-59.153, 4);
    expect(exif.accuracyM).toBe(8.5);
    expect(exif.capturedAt).toBe('2026-10-01T14:30:00');
  });

  it('devuelve vacío para imágenes sin EXIF o no JPEG', () => {
    expect(readExifGps(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2])).latitude).toBeNull();
    expect(readExifGps(Buffer.from('%PDF-1.4')).latitude).toBeNull();
  });
});
