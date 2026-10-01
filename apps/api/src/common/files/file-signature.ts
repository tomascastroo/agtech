/**
 * Detección del tipo real de archivo por "magic bytes". El MIME declarado por el cliente no
 * es confiable: se acepta un archivo solo si extensión, MIME declarado y contenido coinciden.
 */
export interface FileKind {
  mime: string;
  extensions: string[];
}

const KINDS: { kind: FileKind; matches: (b: Buffer) => boolean }[] = [
  {
    kind: { mime: 'application/pdf', extensions: ['pdf'] },
    matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    kind: { mime: 'image/png', extensions: ['png'] },
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    kind: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: { mime: 'image/webp', extensions: ['webp'] },
    matches: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export function detectFileKind(buffer: Buffer): FileKind | null {
  return KINDS.find(({ matches }) => buffer.length >= 12 && matches(buffer))?.kind ?? null;
}

export function fileExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  return match ? match[1]!.toLowerCase() : '';
}

/** Nombre de archivo apto para mostrar/descargar: sin rutas, caracteres de control ni comillas. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'archivo';
  const cleaned = base
    .normalize('NFC')
    // oxlint-disable-next-line no-control-regex -- se eliminan caracteres de control a propósito
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'archivo').slice(0, 200);
}

export class UploadPolicy {
  constructor(
    readonly allowedMimes: readonly string[],
    readonly maxBytes: number,
  ) {}

  /** Devuelve el tipo validado o un mensaje de error. */
  validate(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }): { ok: true; kind: FileKind } | { ok: false; reason: string } {
    if (file.size <= 0) return { ok: false, reason: 'El archivo está vacío' };
    if (file.size > this.maxBytes) {
      return {
        ok: false,
        reason: `El archivo supera el máximo de ${Math.round(this.maxBytes / 1_048_576)} MB`,
      };
    }
    const kind = detectFileKind(file.buffer);
    if (!kind || !this.allowedMimes.includes(kind.mime)) {
      return { ok: false, reason: 'Tipo de archivo no permitido' };
    }
    if (file.mimetype !== kind.mime) {
      return { ok: false, reason: 'El tipo declarado no coincide con el contenido del archivo' };
    }
    if (!kind.extensions.includes(fileExtension(file.originalname))) {
      return { ok: false, reason: 'La extensión no coincide con el contenido del archivo' };
    }
    return { ok: true, kind };
  }
}

export const DOCUMENT_UPLOAD_POLICY = new UploadPolicy(
  ['application/pdf', 'image/png', 'image/jpeg'],
  15 * 1_048_576,
);

export const EVIDENCE_UPLOAD_POLICY = new UploadPolicy(
  ['image/png', 'image/jpeg', 'image/webp'],
  20 * 1_048_576,
);

/** Opciones de multer: un único archivo en memoria y nombres de archivo decodificados como UTF-8. */
export function uploadOptions(maxBytes: number) {
  return {
    limits: { fileSize: maxBytes, files: 1, fields: 12, parts: 14 },
    defParamCharset: 'utf8',
  };
}
