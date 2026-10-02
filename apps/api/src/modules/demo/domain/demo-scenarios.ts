/**
 * Escenarios de "Simular solicitud". Todos usan datos FICTICIOS:
 *  - productor Juan Pérez, CUIT 20-00000001-9 (dígito verificador válido, número elegido para la
 *    demo: no es de una persona);
 *  - establecimiento "La Esperanza", Villaguay, Entre Ríos;
 *  - RENSPA 99.001.0.00001/00 (código de provincia 99: inexistente).
 * Los documentos son imágenes de DEMOSTRACIÓN (infra/seed-assets/demo-documents) que pasan por
 * el OCR real. Nada se presenta como documento oficial.
 */
export const DEMO_PRODUCER = {
  name: 'Juan Pérez',
  taxId: '20-00000001-9',
  renspa: '99.001.0.00001/00',
  establishment: 'La Esperanza',
  province: 'Entre Ríos',
  locality: 'Villaguay',
  location: { latitude: -31.8653, longitude: -59.0269 },
} as const;

export type DemoDocument =
  | 'constancia-cuit'
  | 'renspa'
  | 'renspa-inconsistente'
  | 'certificado-vacunacion'
  | 'contrato-arrendamiento';

export const DEMO_DOCUMENT_TYPES: Record<DemoDocument, string> = {
  'constancia-cuit': 'ID_CUIT',
  renspa: 'RENSPA',
  'renspa-inconsistente': 'RENSPA',
  'certificado-vacunacion': 'SANITARY_CERTIFICATE',
  'contrato-arrendamiento': 'LEASE_CONTRACT',
};

export interface DemoScenario {
  code: string;
  name: string;
  description: string;
  /** Qué muestra en una presentación. */
  shows: string;
  system: 'CRIA' | 'FEEDLOT';
  documents: DemoDocument[];
  photos: number;
  /** Pedidos de la entidad al productor (requisitos del checklist). */
  requestRequirements: string[];
  /** El productor envía la declaración (se ejecuta la verificación). */
  submit: boolean;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    code: 'COMPLETE',
    name: 'Demo ganadera completa',
    description:
      'Rodeo de cría de 1.500 bovinos con documentación consistente, enviado a verificar.',
    shows: 'Flujo completo: documentos leídos por OCR, datos consistentes y verificación.',
    system: 'CRIA',
    documents: ['constancia-cuit', 'renspa', 'certificado-vacunacion', 'contrato-arrendamiento'],
    photos: 3,
    requestRequirements: [],
    submit: true,
  },
  {
    code: 'MISSING_DOCUMENTS',
    name: 'Demo con documentación faltante',
    description:
      'Falta el RENSPA y el certificado sanitario: la entidad ya se los pidió al productor.',
    shows: 'Checklist con pendientes, pedido de documentación y tarea del productor.',
    system: 'CRIA',
    documents: ['constancia-cuit'],
    photos: 3,
    requestRequirements: ['RENSPA'],
    submit: false,
  },
  {
    code: 'INCONSISTENT',
    name: 'Demo con inconsistencia documental',
    description: 'El RENSPA del documento no coincide con el declarado.',
    shows: 'OCR que detecta una inconsistencia y el motivo exacto.',
    system: 'CRIA',
    documents: ['constancia-cuit', 'renspa-inconsistente', 'certificado-vacunacion'],
    photos: 3,
    requestRequirements: [],
    submit: false,
  },
  {
    code: 'READY',
    name: 'Demo lista para verificar',
    description: 'Feedlot con documentación y fotos cargadas; falta que el productor envíe.',
    shows: 'Solicitud completa a la espera del envío y la verificación.',
    system: 'FEEDLOT',
    documents: ['constancia-cuit', 'renspa', 'certificado-vacunacion', 'contrato-arrendamiento'],
    photos: 3,
    requestRequirements: [],
    submit: false,
  },
];

export function demoScenario(code: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.code === code);
}
