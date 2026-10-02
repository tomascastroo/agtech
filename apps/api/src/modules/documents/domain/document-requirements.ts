import type { DocumentAnalysisStatus, ValidationResult } from './document-analysis.js';
import type { DocumentStatus, DocumentType } from './document.types.js';

/**
 * Requisitos documentales para crédito/garantía ganadera.
 *
 * No hay una lista universal: cada producto de crédito (línea de un banco, o la evaluación de
 * AgroGarantías) define qué requisitos aplica y con qué obligatoriedad. El catálogo describe cada
 * requisito con su fuente pública (ver docs/credit-documentation-research.md); los productos de
 * REFERENCIA reproducen lo que publica una línea concreta y NO son la lista oficial del banco.
 * Al crear una solicitud se copian los requisitos del producto elegido (la solicitud conserva su
 * checklist aunque el catálogo cambie) y el banco puede marcar uno como NO APLICA.
 */

export const REQUIREMENT_CATEGORIES = {
  PRODUCER: 'Productor',
  LIVESTOCK_ACTIVITY: 'Actividad ganadera',
  CREDIT_LINE: 'Línea de crédito',
  COLLATERAL: 'Garantía / hacienda',
  CREDIT_ASSESSMENT: 'Calificación crediticia',
} as const;
export type RequirementCategory = keyof typeof REQUIREMENT_CATEGORIES;

export const OBLIGATIONS = ['MANDATORY', 'CONDITIONAL', 'EVALUATION'] as const;
export type Obligation = (typeof OBLIGATIONS)[number];
export const OBLIGATION_LABELS: Record<Obligation, string> = {
  MANDATORY: 'Obligatorio',
  CONDITIONAL: 'Condicional',
  EVALUATION: 'Según evaluación',
};

/** Validación automática disponible para el documento (OCR + reglas, sin modelos generativos). */
export type RequirementValidation = 'OCR_CHECK' | 'MANUAL_REVIEW';

export interface RequirementSource {
  label: string;
  url: string;
}

export interface RequirementDefinition {
  code: string;
  name: string;
  description: string;
  /** Para qué se pide (lo ve el productor). */
  purpose: string;
  category: RequirementCategory;
  /** Tipos de documento que lo satisfacen (cualquiera). */
  documentTypes: DocumentType[];
  validation: RequirementValidation;
  /** Cómo cargarlo (lo ve el productor). */
  howTo: string;
  sources: RequirementSource[];
  /** Verificación contra una fuente oficial: hoy ninguna está conectada. */
  officialVerification: string | null;
}

const SRC = {
  bice: {
    label: 'BICE – créditos en valor producto para el sector ganadero',
    url: 'https://www.bice.com.ar/productos/creditos-en-valor-producto-para-el-sector-ganadero/',
  },
  renspa: {
    label: 'SENASA – Inscribir/actualizar establecimientos en el RENSPA',
    url: 'https://www.argentina.gob.ar/inscribir-reinscribir-en-el-registro-nacional-sanitario-de-productores-agropecuarios-renspa',
  },
  ganar: {
    label: 'argentina.gob.ar – Acceder a un crédito (productores ganaderos)',
    url: 'https://www.argentina.gob.ar/servicio/acceder-un-credito-productores-ganaderos-tamberos-y-cooperativas-agropecuarias',
  },
  mipyme: {
    label: 'argentina.gob.ar – Certificado MiPyME',
    url: 'https://www.argentina.gob.ar/produccion/registrar-una-pyme/certificado-pyme',
  },
  bcraGestion: {
    label: 'BCRA – Gestión crediticia (texto ordenado)',
    url: 'https://www.bcra.gob.ar/archivos/Pdfs/texord/t-gescre.pdf',
  },
  res329: {
    label: 'SENASA – Resolución E 329/2017 (engorde a corral)',
    url: 'https://www.argentina.gob.ar/normativa/nacional/norma-274944/texto',
  },
  magypLines: {
    label: 'MAGyP – Líneas de crédito vigentes (feedlot)',
    url: 'https://magyp.gob.ar/acercaralimentos/_pdf/211022_lineas_de_creditos_vigentes.pdf',
  },
  prenda: {
    label: 'Decreto-Ley 15.348/46 – Prenda con registro',
    url: 'https://www.argentina.gob.ar/normativa/nacional/norma-44079/texto',
  },
  marca: {
    label: 'Chaco – Requisitos de boleto de marca y señal',
    url: 'https://ele.chaco.gob.ar/mod/book/view.php?id=229594',
  },
} satisfies Record<string, RequirementSource>;

/** Catálogo (extensible): un requisito por código. */
export const REQUIREMENT_CATALOG = {
  TAX_ID: {
    code: 'TAX_ID',
    name: 'CUIT / constancia de inscripción en ARCA',
    description: 'Identificación fiscal del productor o de la empresa.',
    purpose: 'Identificar al titular del crédito y verificar que coincida con lo declarado.',
    category: 'PRODUCER',
    documentTypes: ['ID_CUIT'],
    validation: 'OCR_CHECK',
    howTo: 'Descargá la constancia desde el sitio de ARCA con tu clave fiscal y subí el PDF.',
    sources: [SRC.ganar, SRC.mipyme],
    officialVerification: null,
  },
  RENSPA: {
    code: 'RENSPA',
    name: 'RENSPA',
    description: 'Inscripción del establecimiento en el Registro Nacional Sanitario (SENASA).',
    purpose: 'Asociar al productor con el establecimiento y la producción ganadera.',
    category: 'LIVESTOCK_ACTIVITY',
    documentTypes: ['RENSPA'],
    validation: 'OCR_CHECK',
    howTo: 'Subí la constancia o credencial RENSPA del establecimiento (foto o PDF).',
    sources: [SRC.renspa, SRC.bice, SRC.ganar],
    officialVerification: 'SENASA (no conectado)',
  },
  SANITARY_CERTIFICATE: {
    code: 'SANITARY_CERTIFICATE',
    name: 'Certificado sanitario / vacunación',
    description: 'Vacunación del rodeo (aftosa, brucelosis) según la línea.',
    purpose: 'Acreditar el cumplimiento sanitario del rodeo.',
    category: 'LIVESTOCK_ACTIVITY',
    documentTypes: ['SANITARY_CERTIFICATE'],
    validation: 'OCR_CHECK',
    howTo: 'Subí el certificado de la última campaña de vacunación (foto o PDF).',
    sources: [SRC.ganar],
    officialVerification: 'SENASA (no conectado)',
  },
  STOCK_CERTIFICATE: {
    code: 'STOCK_CERTIFICATE',
    name: 'Existencias certificadas (SENASA)',
    description: 'Informe de stock bovino del establecimiento.',
    purpose: 'Dimensionar el crédito y respaldar la cantidad de cabezas declarada.',
    category: 'LIVESTOCK_ACTIVITY',
    documentTypes: ['STOCK_CERTIFICATE'],
    validation: 'OCR_CHECK',
    howTo: 'Subí el informe de existencias emitido por SENASA (con fecha reciente).',
    sources: [SRC.magypLines],
    officialVerification: 'SENASA (no conectado)',
  },
  FEEDLOT_REGISTRATION: {
    code: 'FEEDLOT_REGISTRATION',
    name: 'Registro de engorde a corral (Res. SENASA 329/17)',
    description: 'Inscripción en el Registro Especial de Bovinos de Engorde a Corral.',
    purpose: 'Acreditar que el establecimiento es un feedlot registrado.',
    category: 'LIVESTOCK_ACTIVITY',
    documentTypes: ['FEEDLOT_REGISTRATION'],
    validation: 'OCR_CHECK',
    howTo: 'Subí la constancia de inscripción en el registro de engorde a corral.',
    sources: [SRC.res329, SRC.magypLines],
    officialVerification: 'SENASA (no conectado)',
  },
  MIPYME_CERTIFICATE: {
    code: 'MIPYME_CERTIFICATE',
    name: 'Certificado MiPyME',
    description: 'Certificado MiPyME vigente.',
    purpose: 'Acceder a líneas con cupo o bonificación para MiPyMEs.',
    category: 'CREDIT_LINE',
    documentTypes: ['MIPYME_CERTIFICATE'],
    validation: 'OCR_CHECK',
    howTo: 'Descargá el certificado MiPyME desde ARCA y subí el PDF.',
    sources: [SRC.mipyme, SRC.bice],
    officialVerification: null,
  },
  ACTIVITY_HISTORY: {
    code: 'ACTIVITY_HISTORY',
    name: 'Antigüedad en la actividad ganadera',
    description: 'Actividad comprobable (registros SENASA, ARCA o documentación contable).',
    purpose: 'Algunas líneas exigen años de actividad comprobable.',
    category: 'CREDIT_LINE',
    documentTypes: ['FINANCIAL_STATEMENTS', 'OTHER'],
    validation: 'MANUAL_REVIEW',
    howTo: 'Subí documentación que acredite la actividad (balances, constancias).',
    sources: [SRC.bice],
    officialVerification: null,
  },
  LAND_TENURE: {
    code: 'LAND_TENURE',
    name: 'Tenencia del campo (escritura o arrendamiento)',
    description: 'Título de propiedad o contrato de arrendamiento del establecimiento.',
    purpose: 'Ubicar la hacienda y acreditar la tenencia del establecimiento.',
    category: 'COLLATERAL',
    documentTypes: ['PROPERTY_DEED', 'LEASE_CONTRACT'],
    validation: 'OCR_CHECK',
    howTo: 'Subí la escritura o el contrato de arrendamiento vigente.',
    sources: [],
    officialVerification: null,
  },
  BRAND_TITLE: {
    code: 'BRAND_TITLE',
    name: 'Boleto de marca y señal',
    description: 'Título provincial de la marca del ganado.',
    purpose: 'Acreditar la propiedad del ganado marcado.',
    category: 'COLLATERAL',
    documentTypes: ['BRAND_TITLE'],
    validation: 'OCR_CHECK',
    howTo: 'Subí el boleto de marca y señal vigente.',
    sources: [SRC.marca],
    officialVerification: null,
  },
  LIVESTOCK_PLEDGE: {
    code: 'LIVESTOCK_PLEDGE',
    name: 'Prenda con registro sobre la hacienda',
    description: 'Contrato de prenda inscripto, si la garantía es prendaria.',
    purpose: 'Constituir la hacienda como garantía del crédito.',
    category: 'COLLATERAL',
    documentTypes: ['OTHER'],
    validation: 'MANUAL_REVIEW',
    howTo: 'Lo gestiona la entidad con el productor; subí la constancia de inscripción.',
    sources: [SRC.prenda],
    officialVerification: null,
  },
  INSURANCE: {
    code: 'INSURANCE',
    name: 'Póliza de seguro',
    description: 'Seguro sobre la hacienda en garantía.',
    purpose: 'Cubrir el bien en garantía.',
    category: 'COLLATERAL',
    documentTypes: ['INSURANCE_POLICY'],
    validation: 'MANUAL_REVIEW',
    howTo: 'Subí la póliza vigente.',
    sources: [],
    officialVerification: null,
  },
  FINANCIAL_STATEMENTS: {
    code: 'FINANCIAL_STATEMENTS',
    name: 'Información financiera',
    description: 'Estados contables, manifestación de bienes o flujo de fondos.',
    purpose: 'Evaluar la capacidad de repago.',
    category: 'CREDIT_ASSESSMENT',
    documentTypes: ['FINANCIAL_STATEMENTS'],
    validation: 'MANUAL_REVIEW',
    howTo: 'Subí el último balance o la manifestación de bienes firmada.',
    sources: [SRC.bcraGestion],
    officialVerification: null,
  },
} as const satisfies Record<string, RequirementDefinition>;
export type RequirementCode = keyof typeof REQUIREMENT_CATALOG;
export const REQUIREMENT_CODES = Object.keys(REQUIREMENT_CATALOG) as RequirementCode[];

export interface ProductRequirement {
  code: RequirementCode;
  obligation: Obligation;
  /** Cuándo aplica (para CONDICIONAL / SEGÚN EVALUACIÓN). */
  condition: string | null;
}

export interface CreditProduct {
  code: string;
  name: string;
  description: string;
  /** REFERENCE: reproduce lo publicado por una línea; BASE: evaluación de AgroGarantías. */
  kind: 'BASE' | 'REFERENCE';
  assetTypeCodes: string[];
  sources: RequirementSource[];
  consultedAt: string | null;
  requirements: ProductRequirement[];
}

const req = (
  code: RequirementCode,
  obligation: Obligation,
  condition: string | null = null,
): ProductRequirement => ({ code, obligation, condition });

/** Productos de crédito. El banco elige uno al crear la solicitud. */
export const CREDIT_PRODUCTS: CreditProduct[] = [
  {
    code: 'LIVESTOCK_GUARANTEE_BASE',
    name: 'Garantía sobre hacienda – checklist base',
    description:
      'Documentación mínima para verificar una garantía ganadera en AgroGarantías. La entidad puede agregar o quitar requisitos.',
    kind: 'BASE',
    assetTypeCodes: ['BOVINOS'],
    sources: [],
    consultedAt: null,
    requirements: [
      req('TAX_ID', 'MANDATORY'),
      req('RENSPA', 'MANDATORY'),
      req('LAND_TENURE', 'CONDITIONAL', 'Si la hacienda está en campo propio o arrendado'),
      req('SANITARY_CERTIFICATE', 'CONDITIONAL', 'Según la línea de crédito'),
      req('STOCK_CERTIFICATE', 'EVALUATION', 'Si la entidad pide respaldo del stock declarado'),
      req('BRAND_TITLE', 'EVALUATION', 'Si la entidad lo pide para acreditar propiedad'),
      req('FINANCIAL_STATEMENTS', 'EVALUATION', 'Según la calificación crediticia'),
    ],
  },
  {
    code: 'REF_BICE_VALOR_NOVILLO',
    name: 'Referencia: créditos en kilos de novillo (BICE)',
    description:
      'Requisitos publicados por BICE para la línea en valor producto (cría, ciclo completo, cabaña). Referencia pública: confirmar con la entidad.',
    kind: 'REFERENCE',
    assetTypeCodes: ['BOVINOS'],
    sources: [SRC.bice],
    consultedAt: '2026-10-02',
    requirements: [
      req('MIPYME_CERTIFICATE', 'MANDATORY'),
      req('RENSPA', 'MANDATORY'),
      req('ACTIVITY_HISTORY', 'MANDATORY', 'Al menos 5 años de actividad comprobable'),
      req(
        'LIVESTOCK_PLEDGE',
        'CONDITIONAL',
        'Personas humanas: garantía de SGR o fondo de garantía',
      ),
      req('TAX_ID', 'EVALUATION', 'Legajo del cliente'),
      req('FINANCIAL_STATEMENTS', 'EVALUATION', 'Según la calificación crediticia'),
    ],
  },
  {
    code: 'REF_BNA_FEEDLOT',
    name: 'Referencia: compra de maíz para feedlot (BNA + FONDAGRO)',
    description:
      'Requisitos publicados para la línea de engorde a corral. Referencia pública: confirmar con la entidad.',
    kind: 'REFERENCE',
    assetTypeCodes: ['BOVINOS'],
    sources: [SRC.magypLines, SRC.res329],
    consultedAt: '2026-10-02',
    requirements: [
      req('FEEDLOT_REGISTRATION', 'MANDATORY'),
      req('STOCK_CERTIFICATE', 'MANDATORY', 'Informe de stock de SENASA con no más de 30 días'),
      req('MIPYME_CERTIFICATE', 'MANDATORY'),
      req('TAX_ID', 'EVALUATION', 'Legajo del cliente'),
    ],
  },
];

export function creditProduct(code: string): CreditProduct | undefined {
  return CREDIT_PRODUCTS.find((p) => p.code === code);
}

export function productsFor(assetTypeCode: string): CreditProduct[] {
  return CREDIT_PRODUCTS.filter((p) => p.assetTypeCodes.includes(assetTypeCode));
}

// ---------------------------------------------------------------------------------------------
// Estado de cada requisito en una solicitud
// ---------------------------------------------------------------------------------------------

export const REQUIREMENT_STATUSES = [
  'PENDING',
  'UPLOADED',
  'PROCESSING',
  'CONSISTENT',
  'INCONSISTENT',
  'REVIEW_REQUIRED',
  'NOT_APPLICABLE',
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  PENDING: 'Pendiente',
  UPLOADED: 'Cargado',
  PROCESSING: 'Procesando',
  CONSISTENT: 'Consistente',
  INCONSISTENT: 'Inconsistente',
  REVIEW_REQUIRED: 'Requiere revisión',
  NOT_APPLICABLE: 'No aplica',
};

export interface RequirementDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  createdAt: Date;
  analysis: { status: DocumentAnalysisStatus; validationResults: ValidationResult[] } | null;
}

export interface RequirementEvaluation {
  status: RequirementStatus;
  /** Motivo legible del estado (siempre presente). */
  reason: string;
  documentId: string | null;
}

/**
 * Estado de un requisito a partir de su documento más reciente:
 *  - la revisión humana del banco manda (VALID → consistente, REJECTED/EXPIRED → inconsistente);
 *  - si hay validación automática: lectura en curso → procesando; consistente; un dato distinto
 *    del declarado → inconsistente; lectura fallida o dato no encontrado → requiere revisión;
 *  - sin validación automática → cargado (lo revisa una persona).
 */
export function evaluateRequirement(
  definition: Pick<RequirementDefinition, 'documentTypes' | 'validation'>,
  documents: RequirementDocument[],
  options: { notApplicable?: boolean } = {},
): RequirementEvaluation {
  if (options.notApplicable)
    return {
      status: 'NOT_APPLICABLE',
      reason: 'La entidad indicó que no aplica',
      documentId: null,
    };
  const doc = documents
    .filter((d) => definition.documentTypes.includes(d.type))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!doc) return { status: 'PENDING', reason: 'Documento no cargado', documentId: null };
  const at = { documentId: doc.id };
  if (doc.status === 'VALID')
    return { status: 'CONSISTENT', reason: 'Revisado y aceptado por la entidad', ...at };
  if (doc.status === 'REJECTED')
    return { status: 'INCONSISTENT', reason: 'Rechazado en la revisión de la entidad', ...at };
  if (doc.status === 'EXPIRED')
    return { status: 'INCONSISTENT', reason: 'Documento vencido', ...at };
  if (definition.validation === 'MANUAL_REVIEW')
    return { status: 'UPLOADED', reason: 'Cargado; pendiente de revisión de la entidad', ...at };
  const a = doc.analysis;
  if (!a || a.status === 'PENDING')
    return { status: 'PROCESSING', reason: 'Leyendo el documento (OCR)', ...at };
  if (a.status === 'FAILED')
    return { status: 'REVIEW_REQUIRED', reason: 'No se pudo leer el documento', ...at };
  if (a.status === 'CONSISTENT')
    return { status: 'CONSISTENT', reason: 'Datos consistentes con la declaración', ...at };
  const mismatch = a.validationResults.find((r) => r.status === 'MISMATCH');
  if (mismatch) return { status: 'INCONSISTENT', reason: mismatch.message, ...at };
  const missing = a.validationResults.find((r) => r.required && r.status === 'NOT_FOUND');
  return {
    status: 'REVIEW_REQUIRED',
    reason: missing?.message ?? 'Lectura de baja confianza: requiere revisión',
    ...at,
  };
}
