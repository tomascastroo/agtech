import { detectFileKind, DOCUMENT_UPLOAD_POLICY, sanitizeFileName } from './file-signature.js';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);

describe('Validación de archivos', () => {
  it('detecta el tipo real por magic bytes', () => {
    expect(detectFileKind(pdf)?.mime).toBe('application/pdf');
    expect(detectFileKind(png)?.mime).toBe('image/png');
    expect(detectFileKind(exe)).toBeNull();
  });

  it('acepta un PDF coherente', () => {
    const result = DOCUMENT_UPLOAD_POLICY.validate({
      buffer: pdf,
      originalname: 'renspa.pdf',
      mimetype: 'application/pdf',
      size: pdf.length,
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza contenido que no coincide con el MIME o la extensión declarados', () => {
    expect(
      DOCUMENT_UPLOAD_POLICY.validate({
        buffer: exe,
        originalname: 'renspa.pdf',
        mimetype: 'application/pdf',
        size: exe.length,
      }).ok,
    ).toBe(false);
    expect(
      DOCUMENT_UPLOAD_POLICY.validate({
        buffer: pdf,
        originalname: 'renspa.pdf',
        mimetype: 'image/png',
        size: pdf.length,
      }).ok,
    ).toBe(false);
    expect(
      DOCUMENT_UPLOAD_POLICY.validate({
        buffer: pdf,
        originalname: 'renspa.exe',
        mimetype: 'application/pdf',
        size: pdf.length,
      }).ok,
    ).toBe(false);
  });

  it('rechaza archivos que exceden el tamaño máximo', () => {
    const result = DOCUMENT_UPLOAD_POLICY.validate({
      buffer: pdf,
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      size: 16 * 1_048_576,
    });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('15 MB') });
  });

  it('sanitiza nombres de archivo (rutas, caracteres de control y comillas)', () => {
    expect(sanitizeFileName('../../etc/"passwd"\u0000.pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('C:\\docs\\Escritura   La Esperanza.pdf')).toBe(
      'Escritura La Esperanza.pdf',
    );
  });
});
