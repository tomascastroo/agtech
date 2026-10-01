/**
 * Datos ficticios de demostración (en español, con nombres y lugares verosímiles).
 * Ninguna persona, empresa ni establecimiento corresponde a datos reales.
 */
import type { Position } from '../../common/geo/geojson.js';
import type {
  DocumentStatus,
  DocumentType,
} from '../../modules/documents/domain/document.types.js';
import type {
  EstablishmentType,
  Tenure,
} from '../../modules/establishments/domain/establishment.types.js';

export interface DemoUser {
  email: string;
  fullName: string;
  role: string;
}

export interface DemoEstablishment {
  key: string;
  name: string;
  holderName: string;
  holderTaxId: string;
  renspa: string | null;
  type: EstablishmentType;
  tenure: Tenure;
  province: string;
  locality: string;
  areaHa: number;
  center: Position;
}

export interface DemoDocument {
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  issuedAt: string;
  expiresAt: string | null;
  scope: 'ESTABLISHMENT' | 'ASSET';
  fields: [string, string][];
}

export type HistoryKind = 'CAMERA' | 'SATELLITE' | 'OBJECT';

export interface DemoAsset {
  key: string;
  establishment: string;
  typeCode: string;
  name: string;
  declaredQuantity: number;
  declaredValueUsd: number;
  areaHa?: number;
  metadata: Record<string, unknown>;
  status: 'DRAFT' | 'VERIFIED' | 'OBSERVED';
  documents: DemoDocument[];
  /** Cámaras (número de serie) con su escena simulada. */
  cameras?: { serial: string; label: string; offset: [number, number] }[];
  objectScene?: string;
  satelliteScene?: string;
  /**
   * Serie Sentinel-2 REAL (infra/seed-assets/satellite/real/<clave>): el polígono del activo y
   * el historial de verificaciones salen de observaciones reales; `history` se ignora.
   */
  satelliteFixture?: string;
  /** Fechas (AAAA-MM-DD) de las observaciones usadas como verificaciones históricas. */
  fixtureRunDates?: string[];
  /** Historial: días hacia atrás y cantidad detectada en cada verificación. */
  history: { daysAgo: number; detected?: number; ndvi?: number }[];
  guarantee: boolean;
  monitoringIntervalHours: number;
  /** Antigüedad máxima de evidencia (por defecto según el tipo de fuente). */
  maxEvidenceAgeHours?: number;
}

export const ORGANIZATION = {
  name: 'Banco del Campo',
  legalName: 'Banco del Campo S.A.',
  taxId: '30-50001234-6',
  kind: 'BANK' as const,
};

export const SECOND_ORGANIZATION = {
  name: 'Pampa Seguros',
  legalName: 'Pampa Compañía de Seguros S.A.',
  taxId: '30-71456789-2',
  kind: 'INSURER' as const,
};

export const USERS: DemoUser[] = [
  { email: 'maria.lopez@bancodelcampo.com.ar', fullName: 'María López', role: 'ADMIN' },
  {
    email: 'federico.gimenez@bancodelcampo.com.ar',
    fullName: 'Federico Giménez',
    role: 'RISK_ANALYST',
  },
  { email: 'laura.benitez@bancodelcampo.com.ar', fullName: 'Laura Benítez', role: 'AUDITOR' },
  { email: 'martin.sosa@bancodelcampo.com.ar', fullName: 'Martín Sosa', role: 'VIEWER' },
];

export const SECOND_ORG_USER: DemoUser = {
  email: 'julian.herrera@pampaseguros.com.ar',
  fullName: 'Julián Herrera',
  role: 'ADMIN',
};

export const ESTABLISHMENTS: DemoEstablishment[] = [
  {
    key: 'LE',
    name: 'La Esperanza',
    holderName: 'Agropecuaria La Esperanza S.A.',
    holderTaxId: '30-71548963-1',
    renspa: '06.687.0.01542/00',
    type: 'CRIA',
    tenure: 'LEASED',
    province: 'Buenos Aires',
    locality: 'Rauch',
    areaHa: 2450,
    center: [-59.153, -36.7905],
  },
  {
    key: 'DJ',
    name: 'Finca Don José',
    holderName: 'Bodega y Viñedos Don José S.R.L.',
    holderTaxId: '30-70981234-9',
    renspa: null,
    type: 'VITIVINICOLA',
    tenure: 'OWNED',
    province: 'Mendoza',
    locality: 'Luján de Cuyo',
    areaHa: 140,
    center: [-68.921, -33.078],
  },
  {
    key: 'LA',
    name: 'Campo Los Álamos',
    holderName: 'Los Álamos Agro S.A.',
    holderTaxId: '30-71234567-1',
    renspa: null,
    type: 'AGRICOLA',
    tenure: 'LEASED',
    province: 'Santa Fe',
    locality: 'General López',
    areaHa: 420,
    center: [-61.912, -33.759],
  },
  {
    key: 'SJ',
    name: 'San José',
    holderName: 'José Ignacio Ferreyra',
    holderTaxId: '20-22345678-3',
    renspa: null,
    type: 'FRUTICOLA',
    tenure: 'OWNED',
    province: 'Río Negro',
    locality: 'Allen',
    areaHa: 110,
    center: [-67.827, -38.979],
  },
  {
    key: 'ET',
    name: 'El Trébol',
    holderName: 'Hacienda El Trébol S.A.',
    holderTaxId: '30-69876543-3',
    renspa: '30.113.0.00412/00',
    type: 'CICLO_COMPLETO',
    tenure: 'OWNED',
    province: 'Entre Ríos',
    locality: 'Villaguay',
    areaHa: 1100,
    center: [-59.031, -31.865],
  },
  {
    key: 'LC',
    name: 'Los Ceibos',
    holderName: 'Agrícola Los Ceibos S.A.',
    holderTaxId: '30-71111222-3',
    renspa: null,
    type: 'AGRICOLA',
    tenure: 'OWNED',
    province: 'Buenos Aires',
    locality: 'Pergamino',
    areaHa: 560,
    center: [-60.585, -33.901],
  },
  {
    key: 'DA',
    name: 'Don Alberto',
    holderName: 'Alberto Raúl Giordano',
    holderTaxId: '20-17654321-4',
    renspa: null,
    type: 'MIXTO',
    tenure: 'OWNED',
    province: 'Córdoba',
    locality: 'Marcos Juárez',
    areaHa: 300,
    center: [-62.109, -32.698],
  },
  {
    key: 'LM',
    name: 'Las Marías',
    holderName: 'Forestal Las Marías S.A.',
    holderTaxId: '20-24567890-9',
    renspa: null,
    type: 'FORESTAL',
    tenure: 'OWNED',
    province: 'Entre Ríos',
    locality: 'Villaguay',
    areaHa: 260,
    center: [-58.048, -31.392],
  },
  {
    key: 'SC',
    name: 'Santa Clara',
    holderName: 'Ganadera Santa Clara S.R.L.',
    holderTaxId: '30-68321654-9',
    renspa: '14.091.0.00733/00',
    type: 'CRIA',
    tenure: 'LEASED',
    province: 'Córdoba',
    locality: 'Laboulaye',
    areaHa: 900,
    center: [-63.392, -34.127],
  },
  {
    key: 'AU',
    name: 'La Aurora',
    holderName: 'Acopio La Aurora S.A.',
    holderTaxId: '33-71665544-5',
    renspa: null,
    type: 'AGRICOLA',
    tenure: 'OWNED',
    province: 'Santa Fe',
    locality: 'Rufino',
    areaHa: 180,
    center: [-62.711, -34.262],
  },
];

const id = (holder: string, cuit: string): DemoDocument => ({
  type: 'ID_CUIT',
  status: 'VALID',
  title: 'Constancia de CUIT del titular',
  issuedAt: '2026-02-10',
  expiresAt: null,
  scope: 'ESTABLISHMENT',
  fields: [
    ['Titular', holder],
    ['CUIT', cuit],
    ['Condición', 'Responsable inscripto'],
  ],
});

const deed = (name: string, ha: number): DemoDocument => ({
  type: 'PROPERTY_DEED',
  status: 'VALID',
  title: 'Escritura del inmueble',
  issuedAt: '2014-08-21',
  expiresAt: null,
  scope: 'ESTABLISHMENT',
  fields: [
    ['Inmueble', name],
    ['Superficie', `${ha.toLocaleString('es-AR')} ha`],
    ['Inscripción', 'Registro de la Propiedad Inmueble'],
  ],
});

const lease = (name: string, expiresAt: string): DemoDocument => ({
  type: 'LEASE_CONTRACT',
  status: 'VALID',
  title: 'Contrato de arrendamiento rural',
  issuedAt: '2025-05-01',
  expiresAt,
  scope: 'ESTABLISHMENT',
  fields: [
    ['Inmueble', name],
    ['Plazo', '3 campañas'],
    ['Vencimiento', expiresAt],
  ],
});

const insurance = (detail: string, expiresAt: string): DemoDocument => ({
  type: 'INSURANCE_POLICY',
  status: 'VALID',
  title: 'Póliza de seguro',
  issuedAt: '2026-03-01',
  expiresAt,
  scope: 'ASSET',
  fields: [
    ['Cobertura', detail],
    ['Aseguradora', 'Cooperativa de Seguros del Litoral (ficticia)'],
  ],
});

export const ASSETS: DemoAsset[] = [
  {
    key: 'LE-BOV',
    establishment: 'LE',
    typeCode: 'BOVINOS',
    name: 'Rodeo de cría La Esperanza',
    declaredQuantity: 1500,
    declaredValueUsd: 1_350_000,
    metadata: {
      sistema_productivo: 'Cría',
      raza_predominante: 'Aberdeen Angus',
      vacas: 780,
      vaquillonas: 200,
      terneros: 380,
      novillos: 100,
      toros: 40,
      marca_registrada: 'LE-1987',
      ultima_vacunacion_aftosa: '2026-05-18',
    },
    status: 'VERIFIED',
    documents: [
      {
        type: 'RENSPA',
        status: 'VALID',
        title: 'Constancia RENSPA (SENASA)',
        issuedAt: '2025-06-30',
        expiresAt: '2027-06-30',
        scope: 'ESTABLISHMENT',
        fields: [
          ['RENSPA', '06.687.0.01542/00'],
          ['Establecimiento', 'La Esperanza'],
          ['Actividad', 'Cría bovina'],
        ],
      },
      lease('La Esperanza — Rauch', '2028-04-30'),
      { ...id('Agropecuaria La Esperanza S.A.', '30-71548963-1'), status: 'PENDING_REVIEW' },
      {
        type: 'SANITARY_CERTIFICATE',
        status: 'VALID',
        title: 'Certificado de vacunación antiaftosa',
        issuedAt: '2026-05-18',
        expiresAt: '2027-05-18',
        scope: 'ASSET',
        fields: [
          ['Campaña', '1.ª campaña 2026'],
          ['Cabezas vacunadas', '1.540'],
        ],
      },
    ],
    cameras: [
      { serial: 'CAM-LE-01', label: 'Aguada Norte', offset: [-900, 1300] },
      { serial: 'CAM-LE-02', label: 'Aguada Sur', offset: [800, -1500] },
      { serial: 'CAM-LE-03', label: 'Potrero 4', offset: [-1600, -200] },
      { serial: 'CAM-LE-04', label: 'Potrero 7', offset: [1500, 600] },
      { serial: 'CAM-LE-05', label: 'Manga y corrales', offset: [150, 100] },
      { serial: 'CAM-LE-06', label: 'Bajo del arroyo', offset: [-300, -1900] },
    ],
    history: [35, 28, 21, 14, 7].map((daysAgo) => ({ daysAgo, detected: 1482 })),
    guarantee: false,
    monitoringIntervalHours: 168,
    // Cadencia semanal con un día de tolerancia.
    maxEvidenceAgeHours: 192,
  },
  {
    key: 'DJ-VIN',
    establishment: 'DJ',
    typeCode: 'VINEDOS',
    name: 'Viñedo Malbec — Finca Don José',
    declaredQuantity: 12.5,
    declaredValueUsd: 250_000,
    areaHa: 12.5,
    metadata: {
      varietal_principal: 'Malbec',
      sistema_conduccion: 'Espaldero',
      riego: 'Goteo',
      anio_implantacion: 2008,
      malla_antigranizo: true,
    },
    status: 'OBSERVED',
    documents: [
      deed('Finca Don José — Luján de Cuyo', 140),
      id('Bodega y Viñedos Don José S.R.L.', '30-70981234-9'),
      insurance('Granizo y heladas', '2027-03-01'),
    ],
    satelliteFixture: 'don-jose-vinedo',
    // Dos verificaciones con follaje (verano) y dos en reposo invernal.
    fixtureRunDates: ['2026-02-23', '2026-03-22', '2026-09-01', '2026-09-26'],
    history: [],
    guarantee: false,
    monitoringIntervalHours: 240,
  },
  {
    key: 'LA-TRI',
    establishment: 'LA',
    typeCode: 'CULTIVOS',
    name: 'Trigo — Campaña 2026/27',
    declaredQuantity: 61,
    declaredValueUsd: 64_000,
    areaHa: 61,
    metadata: {
      cultivo: 'Trigo',
      campania: '2026/27',
      fecha_siembra: '2026-06-01',
      rinde_esperado_t_ha: 4.2,
      seguro_agricola: true,
    },
    status: 'VERIFIED',
    documents: [
      lease('Campo Los Álamos — General López', '2029-04-30'),
      id('Los Álamos Agro S.A.', '30-71234567-1'),
      insurance('Seguro agrícola multirriesgo', '2027-05-31'),
    ],
    satelliteFixture: 'los-alamos-trigo',
    history: [],
    guarantee: true,
    monitoringIntervalHours: 240,
  },
  {
    key: 'LA-SIL',
    establishment: 'LA',
    typeCode: 'SILOBOLSAS',
    name: 'Silobolsas Lote 3 — soja',
    declaredQuantity: 1800,
    declaredValueUsd: 612_000,
    metadata: {
      grano: 'Soja',
      cantidad_bolsas: 9,
      fecha_embolsado: '2026-05-12',
      humedad_pct: 12.5,
    },
    status: 'VERIFIED',
    documents: [insurance('Robo e incendio de granos embolsados', '2027-05-12')],
    objectScene: 'silobolsas-los-alamos',
    cameras: [{ serial: 'CAM-LA-SB1', label: 'Playa de silobolsas', offset: [300, -200] }],
    history: [{ daysAgo: 12 }, { daysAgo: 3 }],
    guarantee: true,
    monitoringIntervalHours: 168,
  },
  {
    key: 'SJ-FRU',
    establishment: 'SJ',
    typeCode: 'FRUTALES',
    name: 'Montes de pera Williams',
    declaredQuantity: 85,
    declaredValueUsd: 1_105_000,
    areaHa: 85,
    metadata: {
      especie: 'Peral',
      variedad: 'Williams',
      plantas_por_ha: 1250,
      malla_antigranizo: true,
    },
    status: 'VERIFIED',
    documents: [
      deed('Chacra San José — Allen', 110),
      id('José Ignacio Ferreyra', '20-22345678-3'),
      insurance('Granizo', '2027-02-28'),
    ],
    satelliteScene: 'san-jose-frutales',
    history: [
      { daysAgo: 25, detected: 84.4, ndvi: 0.74 },
      { daysAgo: 4, detected: 84.6, ndvi: 0.75 },
    ],
    guarantee: true,
    monitoringIntervalHours: 240,
  },
  {
    key: 'ET-BOV',
    establishment: 'ET',
    typeCode: 'BOVINOS',
    name: 'Rodeo ciclo completo El Trébol',
    declaredQuantity: 820,
    declaredValueUsd: 738_000,
    metadata: {
      sistema_productivo: 'Ciclo completo',
      raza_predominante: 'Hereford',
      vacas: 330,
      vaquillonas: 90,
      terneros: 200,
      novillos: 180,
      toros: 20,
    },
    status: 'VERIFIED',
    documents: [
      {
        type: 'RENSPA',
        status: 'VALID',
        title: 'Constancia RENSPA (SENASA)',
        issuedAt: '2025-03-15',
        expiresAt: '2027-03-15',
        scope: 'ESTABLISHMENT',
        fields: [
          ['RENSPA', '30.113.0.00412/00'],
          ['Establecimiento', 'El Trébol'],
        ],
      },
      deed('El Trébol — Villaguay', 1100),
      id('Hacienda El Trébol S.A.', '30-69876543-3'),
      insurance('Mortandad de hacienda', '2027-01-31'),
    ],
    cameras: [
      { serial: 'CAM-ET-01', label: 'Aguada principal', offset: [-600, 700] },
      { serial: 'CAM-ET-02', label: 'Potrero La Loma', offset: [900, 300] },
      { serial: 'CAM-ET-03', label: 'Corrales', offset: [100, -150] },
      { serial: 'CAM-ET-04', label: 'Bajo del arroyo', offset: [-800, -900] },
    ],
    history: [
      { daysAgo: 42, detected: 812 },
      { daysAgo: 12, detected: 812 },
    ],
    guarantee: true,
    monitoringIntervalHours: 336,
    maxEvidenceAgeHours: 336,
  },
  {
    key: 'LC-MAI',
    establishment: 'LC',
    typeCode: 'CULTIVOS',
    name: 'Maíz temprano — Campaña 2026/27',
    declaredQuantity: 54,
    declaredValueUsd: 70_000,
    areaHa: 54,
    metadata: {
      cultivo: 'Maíz',
      campania: '2026/27',
      fecha_siembra: '2026-09-14',
      rinde_esperado_t_ha: 9.5,
      seguro_agricola: true,
    },
    status: 'OBSERVED',
    documents: [
      deed('Los Ceibos — Pergamino', 560),
      id('Agrícola Los Ceibos S.A.', '30-71111222-3'),
      insurance('Seguro agrícola granizo', '2027-04-30'),
    ],
    satelliteFixture: 'los-ceibos-maiz',
    // Cobertura antes del barbecho, caída por barbecho químico y lote en implantación.
    fixtureRunDates: ['2026-08-08', '2026-08-23', '2026-09-22'],
    history: [],
    guarantee: false,
    monitoringIntervalHours: 240,
  },
  {
    key: 'DA-MAQ',
    establishment: 'DA',
    typeCode: 'MAQUINARIA',
    name: 'Cosechadora axial 2022',
    declaredQuantity: 1,
    declaredValueUsd: 385_000,
    metadata: {
      tipo: 'Cosechadora',
      marca: 'Agromáquinas del Sur',
      modelo: 'AX-9',
      anio: 2022,
      numero_serie: 'AX9-22-04187',
      dominio: 'AF123QW',
    },
    status: 'VERIFIED',
    documents: [
      id('Alberto Raúl Giordano', '20-17654321-4'),
      insurance('Todo riesgo maquinaria agrícola', '2027-06-30'),
    ],
    objectScene: 'cosechadora-don-alberto',
    cameras: [{ serial: 'CAM-DA-01', label: 'Galpón de maquinaria', offset: [120, 80] }],
    history: [{ daysAgo: 30 }, { daysAgo: 6 }],
    guarantee: true,
    monitoringIntervalHours: 168,
  },
  {
    key: 'LM-FOR',
    establishment: 'LM',
    typeCode: 'FORESTAL',
    name: 'Eucalyptus grandis — Lotes 1 a 4',
    declaredQuantity: 80,
    declaredValueUsd: 320_000,
    areaHa: 80,
    metadata: {
      especie: 'Eucalipto',
      anio_plantacion: 2017,
      densidad_arboles_ha: 1111,
      plan_manejo_aprobado: true,
    },
    status: 'VERIFIED',
    documents: [
      deed('Las Marías — Villaguay', 260),
      id('Forestal Las Marías S.A.', '20-24567890-9'),
    ],
    satelliteFixture: 'las-marias-forestal',
    history: [],
    guarantee: true,
    monitoringIntervalHours: 720,
  },
  {
    key: 'SC-BOV',
    establishment: 'SC',
    typeCode: 'BOVINOS',
    name: 'Rodeo de cría Santa Clara',
    declaredQuantity: 640,
    declaredValueUsd: 560_000,
    metadata: {
      sistema_productivo: 'Cría',
      raza_predominante: 'Brangus',
      vacas: 360,
      vaquillonas: 70,
      terneros: 190,
      toros: 20,
    },
    status: 'DRAFT',
    documents: [
      {
        type: 'RENSPA',
        status: 'PENDING_REVIEW',
        title: 'Constancia RENSPA (SENASA)',
        issuedAt: '2026-04-27',
        expiresAt: '2028-04-27',
        scope: 'ESTABLISHMENT',
        fields: [
          ['RENSPA', '14.091.0.00733/00'],
          ['Establecimiento', 'Santa Clara'],
        ],
      },
      { ...lease('Santa Clara — Laboulaye', '2027-10-15'), status: 'PENDING_REVIEW' },
    ],
    history: [],
    guarantee: false,
    monitoringIntervalHours: 168,
  },
  {
    key: 'AU-SIL',
    establishment: 'AU',
    typeCode: 'SILOS',
    name: 'Planta de silos La Aurora',
    declaredQuantity: 2400,
    declaredValueUsd: 744_000,
    metadata: { cantidad_silos: 4, capacidad_total_t: 3000, grano_almacenado: 'Maíz' },
    status: 'VERIFIED',
    documents: [
      deed('La Aurora — Rufino', 180),
      id('Acopio La Aurora S.A.', '33-71665544-5'),
      insurance('Incendio y granizo de instalaciones', '2027-03-31'),
    ],
    objectScene: 'silos-la-aurora',
    cameras: [{ serial: 'CAM-AU-01', label: 'Planta de silos', offset: [-150, 120] }],
    history: [{ daysAgo: 14 }, { daysAgo: 2 }],
    guarantee: true,
    monitoringIntervalHours: 168,
  },
  {
    key: 'AU-GAL',
    establishment: 'AU',
    typeCode: 'INFRAESTRUCTURA',
    name: 'Galpón de acopio 1.200 m²',
    declaredQuantity: 1,
    declaredValueUsd: 210_000,
    metadata: { tipo: 'Galpón', superficie_m2: 1200, anio_construccion: 2015 },
    status: 'VERIFIED',
    documents: [insurance('Incendio y vendaval', '2027-03-31')],
    objectScene: 'galpon-la-aurora',
    cameras: [{ serial: 'CAM-AU-02', label: 'Galpón de acopio', offset: [200, -100] }],
    history: [{ daysAgo: 14 }, { daysAgo: 2 }],
    guarantee: true,
    monitoringIntervalHours: 336,
  },
];

export const LE_ANIMAL_CATEGORIES = [
  'VACA',
  'VACA',
  'VACA',
  'VAQUILLONA',
  'TERNERO',
  'TERNERA',
  'NOVILLO',
  'TORO',
] as const;
