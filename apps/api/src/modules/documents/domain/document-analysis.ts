import { DOCUMENT_TYPE_NAMES, type DocumentType } from './document.types.js';

/**
 * Validación del contenido de un documento (OCR / capa de texto) contra los datos declarados.
 * Compara RENSPA, CUIT, titular, tipo y vencimiento. NO certifica la autenticidad legal del
 * documento: solo indica si lo que se lee coincide con lo declarado o si requiere revisión humana.
 */

export const DOCUMENT_ANALYSIS_STATUSES = [
  'PENDING',
  'CONSISTENT',
  'REVIEW_REQUIRED',
  'FAILED',
] as const;
export type DocumentAnalysisStatus = (typeof DOCUMENT_ANALYSIS_STATUSES)[number];

/** Por debajo de esta confianza de lectura el resultado siempre requiere revisión humana. */
export const MIN_EXTRACTION_CONFIDENCE = 0.75;

export interface ExtractedFields {
  renspa: string[];
  cuit: string[];
  holderNames: string[];
  issuedAt: string | null;
  expiresAt: string | null;
  dates: string[];
  establishmentNames?: string[];
  localities?: string[];
  provinces?: string[];
  headCounts?: number[];
  vaccines?: string[];
}

/** Campo leído tal como figura (original), normalizado y con la confianza de su línea. */
export interface FieldEntry {
  field: string;
  original: string;
  normalized: string;
  confidence: number | null;
  line: number;
}

export interface TextAnalysis {
  method: 'PDF_TEXT' | 'OCR';
  textConfidence: number;
  textExcerpt: string;
  detectedType: string;
  fields: ExtractedFields;
  entries?: FieldEntry[];
}

export interface DeclaredData {
  documentType: DocumentType;
  renspa: string | null;
  holderName: string | null;
  holderTaxId: string | null;
  establishmentName?: string | null;
  locality?: string | null;
  province?: string | null;
}

export type CheckKey =
  | 'TEXT'
  | 'DOCUMENT_TYPE'
  | 'RENSPA'
  | 'CUIT'
  | 'HOLDER'
  | 'EXPIRY'
  | 'ESTABLISHMENT'
  | 'LOCALITY'
  | 'PROVINCE';
export type CheckStatus = 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'NOT_DECLARED';

export interface ValidationResult {
  check: CheckKey;
  status: CheckStatus;
  required: boolean;
  expected: string | null;
  found: string[];
  message: string;
}

/** Campos que el tipo de documento debe contener para considerarse consistente. */
const REQUIRED_FIELDS: Partial<Record<DocumentType, CheckKey[]>> = {
  RENSPA: ['RENSPA'],
  ID_CUIT: ['CUIT'],
  MIPYME_CERTIFICATE: ['CUIT'],
};

const LEGAL_SUFFIXES = /\b(S\.?A\.?S?|S\.?R\.?L\.?|S\.?C\.?A\.?|S\.?H\.?|SOCIEDAD ANONIMA)\b/g;

/** Mayúsculas, sin acentos, sin forma societaria ni separadores (el OCR suele perder espacios). */
export function compactName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^A-Z0-9]/g, '');
}

const digits = (value: string) => value.replace(/\D/g, '');

export function validateDocument(
  analysis: TextAnalysis,
  declared: DeclaredData,
  today = new Date(),
): { status: DocumentAnalysisStatus; results: ValidationResult[] } {
  const required = new Set(REQUIRED_FIELDS[declared.documentType] ?? []);
  const results: ValidationResult[] = [];
  const f = analysis.fields;
  const textLength = analysis.textExcerpt.trim().length;

  results.push({
    check: 'TEXT',
    status: textLength > 0 ? 'MATCH' : 'NOT_FOUND',
    required: true,
    expected: null,
    found: [],
    message:
      textLength === 0
        ? 'No se pudo leer texto en el documento'
        : analysis.textConfidence < MIN_EXTRACTION_CONFIDENCE
          ? `Lectura de baja confianza (${Math.round(analysis.textConfidence * 100)} %)`
          : analysis.method === 'PDF_TEXT'
            ? 'Texto leído de la capa de texto del PDF'
            : `Texto leído por OCR (confianza ${Math.round(analysis.textConfidence * 100)} %)`,
  });

  if (declared.documentType !== 'OTHER') {
    const unknown = analysis.detectedType === 'UNKNOWN';
    results.push({
      check: 'DOCUMENT_TYPE',
      status: unknown
        ? 'NOT_FOUND'
        : analysis.detectedType === declared.documentType
          ? 'MATCH'
          : 'MISMATCH',
      required: true,
      expected: declared.documentType,
      found: unknown ? [] : [analysis.detectedType],
      message: unknown
        ? 'No se reconoce el tipo de documento por su contenido'
        : analysis.detectedType === declared.documentType
          ? 'El contenido corresponde al tipo declarado'
          : `Se cargó como «${DOCUMENT_TYPE_NAMES[declared.documentType] ?? declared.documentType}» pero el contenido parece «${DOCUMENT_TYPE_NAMES[analysis.detectedType as DocumentType] ?? analysis.detectedType}»`,
    });
  }

  results.push(
    compareIdentifier('RENSPA', declared.renspa, f.renspa, required.has('RENSPA'), 'RENSPA'),
  );
  results.push(
    compareIdentifier('CUIT', declared.holderTaxId, f.cuit, required.has('CUIT'), 'CUIT'),
  );

  if (declared.holderName) {
    const expected = compactName(declared.holderName);
    const text = compactName(analysis.textExcerpt);
    const names = f.holderNames.map(compactName).filter((n) => n.length >= 4);
    const match =
      expected.length >= 4 &&
      (text.includes(expected) || names.some((n) => n.includes(expected) || expected.includes(n)));
    results.push({
      check: 'HOLDER',
      status: match ? 'MATCH' : f.holderNames.length ? 'MISMATCH' : 'NOT_FOUND',
      required: false,
      expected: declared.holderName,
      found: f.holderNames,
      message: match
        ? 'El titular coincide con el declarado'
        : f.holderNames.length
          ? 'El titular leído no coincide con el declarado'
          : 'No se encontró el titular en el documento',
    });
  }

  // Establecimiento, localidad y provincia: solo se comparan si el documento los menciona (no
  // todos los documentos los traen; su ausencia no es una inconsistencia).
  results.push(
    ...compareText(
      'ESTABLISHMENT',
      declared.establishmentName,
      f.establishmentNames,
      'Establecimiento',
    ),
    ...compareText('LOCALITY', declared.locality, f.localities, 'Localidad'),
    ...compareText('PROVINCE', declared.province, f.provinces, 'Provincia'),
  );

  if (f.expiresAt) {
    const expired = f.expiresAt < today.toISOString().slice(0, 10);
    results.push({
      check: 'EXPIRY',
      status: expired ? 'MISMATCH' : 'MATCH',
      required: false,
      expected: null,
      found: [f.expiresAt],
      message: expired ? `Vencido el ${f.expiresAt}` : `Vigente hasta ${f.expiresAt}`,
    });
  }

  const review =
    analysis.textConfidence < MIN_EXTRACTION_CONFIDENCE ||
    results.some((r) => r.status === 'MISMATCH' || (r.required && r.status === 'NOT_FOUND'));
  return { status: review ? 'REVIEW_REQUIRED' : 'CONSISTENT', results };
}

function compareText(
  check: 'ESTABLISHMENT' | 'LOCALITY' | 'PROVINCE',
  expected: string | null | undefined,
  found: string[] | undefined,
  label: string,
): ValidationResult[] {
  if (!expected || !found?.length) return [];
  const want = compactName(expected);
  const match = found.some((v) => {
    const got = compactName(v);
    return got.length >= 3 && (got === want || got.includes(want) || want.includes(got));
  });
  return [
    {
      check,
      status: match ? 'MATCH' : 'MISMATCH',
      required: false,
      expected,
      found,
      message: match
        ? `${label} coincide con lo declarado`
        : `${label} del documento distinto de lo declarado`,
    },
  ];
}

function compareIdentifier(
  check: 'RENSPA' | 'CUIT',
  expected: string | null,
  found: string[],
  required: boolean,
  label: string,
): ValidationResult {
  if (!expected) {
    return {
      check,
      status: 'NOT_DECLARED',
      required: false,
      expected: null,
      found,
      message: `No hay ${label} declarado para comparar`,
    };
  }
  const match = found.some((v) => digits(v) === digits(expected));
  return {
    check,
    status: match ? 'MATCH' : found.length ? 'MISMATCH' : 'NOT_FOUND',
    required,
    expected,
    found,
    message: match
      ? `${label} coincide con el declarado`
      : found.length
        ? `${label} del documento distinto del declarado`
        : `No se encontró ${label} en el documento`,
  };
}
