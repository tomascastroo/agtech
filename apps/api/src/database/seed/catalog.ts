/**
 * Catálogo base del sistema: tipos de activo (con su esquema de metadata), fuentes de
 * evidencia, modelos de IA registrados y reglas de alerta por defecto. Es configuración de
 * referencia, no datos de demostración.
 */
import type { AlertConditionType, AlertSeverity } from '../../modules/alerts/domain/alert.types.js';
import type {
  AssetCategory,
  Mobility,
  QuantityUnit,
  VerificationStrategyCode,
} from '../../modules/assets/domain/asset.types.js';
import type { EvidenceSourceKind } from '../../modules/evidence/domain/evidence.types.js';

const DATE = '^\\d{4}-\\d{2}-\\d{2}$';

export interface AssetTypeSeed {
  code: string;
  name: string;
  category: AssetCategory;
  defaultUnit: QuantityUnit;
  verificationStrategy: VerificationStrategyCode;
  evidenceSources: string[];
  requiredDocuments: string[];
  mobility: Mobility;
  metadataSchema: Record<string, unknown>;
}

/**
 * JSON Schema de metadata. JSONB no preserva el orden de las claves: el orden de presentación
 * se fija explícitamente con la anotación x-order.
 */
const schema = (properties: Record<string, Record<string, unknown>>, required: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties: Object.fromEntries(
    Object.entries(properties).map(([key, property], index) => [
      key,
      { ...property, 'x-order': index + 1 },
    ]),
  ),
});

export const ASSET_TYPES: AssetTypeSeed[] = [
  {
    code: 'BOVINOS',
    name: 'Bovinos',
    category: 'LIVESTOCK',
    defaultUnit: 'HEAD',
    verificationStrategy: 'LIVESTOCK_COUNTING',
    evidenceSources: ['CAMERA', 'MANUAL_UPLOAD', 'RFID'],
    requiredDocuments: ['RENSPA', 'PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'HIGH',
    metadataSchema: schema(
      {
        sistema_productivo: {
          type: 'string',
          title: 'Sistema productivo',
          enum: ['Cría', 'Recría', 'Invernada', 'Ciclo completo', 'Tambo', 'Feedlot'],
        },
        raza_predominante: { type: 'string', title: 'Raza predominante', maxLength: 60 },
        vacas: { type: 'integer', title: 'Vacas', minimum: 0 },
        vaquillonas: { type: 'integer', title: 'Vaquillonas', minimum: 0 },
        terneros: { type: 'integer', title: 'Terneros/as', minimum: 0 },
        novillos: { type: 'integer', title: 'Novillos/novillitos', minimum: 0 },
        toros: { type: 'integer', title: 'Toros', minimum: 0 },
        marca_registrada: { type: 'string', title: 'Marca / señal registrada', maxLength: 60 },
        ultima_vacunacion_aftosa: {
          type: 'string',
          title: 'Última vacunación antiaftosa',
          pattern: DATE,
          'x-widget': 'date',
        },
      },
      ['sistema_productivo', 'raza_predominante'],
    ),
  },
  {
    code: 'CULTIVOS',
    name: 'Cultivos',
    category: 'CROP',
    defaultUnit: 'HECTARE',
    verificationStrategy: 'VEGETATION_AREA',
    evidenceSources: ['SATELLITE', 'MANUAL_UPLOAD'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        cultivo: {
          type: 'string',
          title: 'Cultivo',
          enum: ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo', 'Cebada'],
        },
        campania: { type: 'string', title: 'Campaña', pattern: '^\\d{4}/\\d{2}$' },
        fecha_siembra: {
          type: 'string',
          title: 'Fecha de siembra',
          pattern: DATE,
          'x-widget': 'date',
        },
        rinde_esperado_t_ha: {
          type: 'number',
          title: 'Rinde esperado (t/ha)',
          minimum: 0,
          maximum: 20,
        },
        seguro_agricola: { type: 'boolean', title: 'Seguro agrícola contratado' },
      },
      ['cultivo', 'campania'],
    ),
  },
  {
    code: 'VINEDOS',
    name: 'Viñedos',
    category: 'PERENNIAL',
    defaultUnit: 'HECTARE',
    verificationStrategy: 'VEGETATION_AREA',
    evidenceSources: ['SATELLITE', 'MANUAL_UPLOAD'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        varietal_principal: { type: 'string', title: 'Varietal principal', maxLength: 60 },
        sistema_conduccion: {
          type: 'string',
          title: 'Sistema de conducción',
          enum: ['Espaldero', 'Parral', 'Vaso'],
        },
        riego: { type: 'string', title: 'Riego', enum: ['Goteo', 'Surco', 'Sin riego'] },
        anio_implantacion: {
          type: 'integer',
          title: 'Año de implantación',
          minimum: 1900,
          maximum: 2100,
        },
        malla_antigranizo: { type: 'boolean', title: 'Malla antigranizo' },
      },
      ['varietal_principal'],
    ),
  },
  {
    code: 'FRUTALES',
    name: 'Frutales',
    category: 'PERENNIAL',
    defaultUnit: 'HECTARE',
    verificationStrategy: 'VEGETATION_AREA',
    evidenceSources: ['SATELLITE', 'MANUAL_UPLOAD'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        especie: {
          type: 'string',
          title: 'Especie',
          enum: ['Manzano', 'Peral', 'Cerezo', 'Limonero', 'Naranjo', 'Arándano', 'Durazno'],
        },
        variedad: { type: 'string', title: 'Variedad', maxLength: 60 },
        plantas_por_ha: { type: 'integer', title: 'Plantas por hectárea', minimum: 0 },
        malla_antigranizo: { type: 'boolean', title: 'Malla antigranizo' },
      },
      ['especie'],
    ),
  },
  {
    code: 'FORESTAL',
    name: 'Forestal',
    category: 'FORESTRY',
    defaultUnit: 'HECTARE',
    verificationStrategy: 'VEGETATION_AREA',
    evidenceSources: ['SATELLITE', 'MANUAL_UPLOAD'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        especie: {
          type: 'string',
          title: 'Especie',
          enum: ['Eucalipto', 'Pino', 'Álamo', 'Sauce'],
        },
        anio_plantacion: {
          type: 'integer',
          title: 'Año de plantación',
          minimum: 1950,
          maximum: 2100,
        },
        densidad_arboles_ha: { type: 'integer', title: 'Densidad (árboles/ha)', minimum: 0 },
        plan_manejo_aprobado: { type: 'boolean', title: 'Plan de manejo aprobado' },
      },
      ['especie'],
    ),
  },
  {
    code: 'SILOBOLSAS',
    name: 'Silobolsas',
    category: 'STORAGE',
    defaultUnit: 'TONNE',
    verificationStrategy: 'EVIDENCE_REVIEW',
    evidenceSources: ['CAMERA', 'MANUAL_UPLOAD', 'SATELLITE'],
    requiredDocuments: ['ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        grano: {
          type: 'string',
          title: 'Grano',
          enum: ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo'],
        },
        cantidad_bolsas: { type: 'integer', title: 'Cantidad de bolsas', minimum: 1 },
        fecha_embolsado: {
          type: 'string',
          title: 'Fecha de embolsado',
          pattern: DATE,
          'x-widget': 'date',
        },
        humedad_pct: { type: 'number', title: 'Humedad al embolsar (%)', minimum: 0, maximum: 40 },
      },
      ['grano', 'cantidad_bolsas'],
    ),
  },
  {
    code: 'SILOS',
    name: 'Silos',
    category: 'STORAGE',
    defaultUnit: 'TONNE',
    verificationStrategy: 'EVIDENCE_REVIEW',
    evidenceSources: ['CAMERA', 'MANUAL_UPLOAD', 'SENSOR'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        cantidad_silos: { type: 'integer', title: 'Cantidad de silos', minimum: 1 },
        capacidad_total_t: { type: 'number', title: 'Capacidad total (t)', minimum: 0 },
        grano_almacenado: { type: 'string', title: 'Grano almacenado', maxLength: 40 },
      },
      ['cantidad_silos'],
    ),
  },
  {
    code: 'MAQUINARIA',
    name: 'Maquinaria',
    category: 'MACHINERY',
    defaultUnit: 'UNIT',
    verificationStrategy: 'EVIDENCE_REVIEW',
    evidenceSources: ['CAMERA', 'MANUAL_UPLOAD'],
    requiredDocuments: ['ID_CUIT'],
    mobility: 'HIGH',
    metadataSchema: schema(
      {
        tipo: {
          type: 'string',
          title: 'Tipo',
          enum: ['Cosechadora', 'Tractor', 'Pulverizadora', 'Sembradora', 'Tolva'],
        },
        marca: { type: 'string', title: 'Marca', maxLength: 40 },
        modelo: { type: 'string', title: 'Modelo', maxLength: 40 },
        anio: { type: 'integer', title: 'Año', minimum: 1960, maximum: 2100 },
        numero_serie: { type: 'string', title: 'Número de serie', maxLength: 40 },
        dominio: { type: 'string', title: 'Dominio (patente)', maxLength: 12 },
      },
      ['tipo', 'marca', 'modelo'],
    ),
  },
  {
    code: 'INFRAESTRUCTURA',
    name: 'Infraestructura',
    category: 'INFRASTRUCTURE',
    defaultUnit: 'UNIT',
    verificationStrategy: 'EVIDENCE_REVIEW',
    evidenceSources: ['CAMERA', 'MANUAL_UPLOAD', 'SATELLITE'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT', 'ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        tipo: {
          type: 'string',
          title: 'Tipo',
          enum: ['Galpón', 'Tinglado', 'Manga y corrales', 'Vivienda', 'Planta de acopio'],
        },
        superficie_m2: { type: 'number', title: 'Superficie cubierta (m²)', minimum: 0 },
        anio_construccion: {
          type: 'integer',
          title: 'Año de construcción',
          minimum: 1900,
          maximum: 2100,
        },
      },
      ['tipo'],
    ),
  },
  {
    code: 'RESERVORIOS',
    name: 'Reservorios',
    category: 'WATER',
    defaultUnit: 'CUBIC_METER',
    verificationStrategy: 'EVIDENCE_REVIEW',
    evidenceSources: ['CAMERA', 'MANUAL_UPLOAD', 'SATELLITE'],
    requiredDocuments: ['PROPERTY_DEED|LEASE_CONTRACT'],
    mobility: 'LOW',
    metadataSchema: schema(
      {
        tipo: {
          type: 'string',
          title: 'Tipo',
          enum: ['Tanque australiano', 'Represa', 'Perforación', 'Reservorio impermeabilizado'],
        },
        capacidad_m3: { type: 'number', title: 'Capacidad (m³)', minimum: 0 },
      },
      ['tipo'],
    ),
  },
  {
    code: 'OTROS',
    name: 'Otros',
    category: 'OTHER',
    defaultUnit: 'UNIT',
    verificationStrategy: 'EVIDENCE_REVIEW',
    evidenceSources: ['MANUAL_UPLOAD'],
    requiredDocuments: ['ID_CUIT'],
    mobility: 'LOW',
    metadataSchema: schema(
      { descripcion: { type: 'string', title: 'Descripción', maxLength: 500 } },
      ['descripcion'],
    ),
  },
];

export const EVIDENCE_SOURCES: {
  code: string;
  name: string;
  kind: EvidenceSourceKind;
  provider: string;
  isSimulated: boolean;
  description: string;
}[] = [
  {
    code: 'CAMERA_SIMULATED',
    name: 'Cámara de campo (simulada)',
    kind: 'CAMERA',
    provider: 'simulated-gateway',
    isSimulated: true,
    description: 'Gateway de cámaras simulado con escenas sintéticas de desarrollo',
  },
  {
    code: 'MANUAL_UPLOAD',
    name: 'Carga manual',
    kind: 'MANUAL_UPLOAD',
    provider: 'agrogarantias',
    isSimulated: false,
    description: 'Imagen cargada por un usuario de la plataforma',
  },
  {
    code: 'SATELLITE_SENTINEL2_SIMULATED',
    name: 'Sentinel-2 L2A (simulado)',
    kind: 'SATELLITE',
    provider: 'mock-sentinel2',
    isSimulated: true,
    description: 'Proveedor satelital simulado con cadencia de revisita Sentinel-2',
  },
  {
    code: 'SATELLITE_SENTINEL2_STAC',
    name: 'Sentinel-2 L2A (AWS Open Data)',
    kind: 'SATELLITE',
    provider: 'sentinel2-l2a',
    isSimulated: false,
    description:
      'Escenas Sentinel-2 L2A reales (ítems STAC y COG del bucket público sentinel-cogs); NDVI con máscara de nubes SCL',
  },
  {
    code: 'RFID_SIMULATED',
    name: 'Lector RFID (simulado)',
    kind: 'RFID',
    provider: 'simulated-gateway',
    isSimulated: true,
    description: 'Lecturas RFID simuladas para la identificación individual',
  },
];

export const AI_MODELS: {
  code: string;
  name: string;
  task:
    | 'ANIMAL_COUNTING'
    | 'IMAGE_QUALITY'
    | 'CHANGE_DETECTION'
    | 'VEGETATION_INDEX'
    | 'SCORING'
    | 'INDIVIDUAL_ID';
  provider: string;
  description: string;
  version: string;
  isSimulated: boolean;
  metrics: Record<string, unknown>;
}[] = [
  {
    code: 'classical-livestock-counter',
    name: 'Contador de bovinos (CV clásica)',
    task: 'ANIMAL_COUNTING',
    provider: 'ai-service',
    description: 'Segmentación ExG + morfología + componentes conexos (OpenCV).',
    version: '1.0.0',
    isSimulated: false,
    metrics: {
      baseConfidence: 0.86,
      calibration: 'interna sobre escenas sintéticas; recalibrar con datos de campo',
    },
  },
  {
    code: 'image-quality-metrics',
    name: 'Calidad de imagen',
    task: 'IMAGE_QUALITY',
    provider: 'ai-service',
    description: 'Nitidez, exposición, contraste y dHash.',
    version: '1.0.0',
    isSimulated: false,
    metrics: {},
  },
  {
    code: 'classical-change-detector',
    name: 'Detección de cambios',
    task: 'CHANGE_DETECTION',
    provider: 'ai-service',
    description: 'Diferencia normalizada con umbral de Otsu.',
    version: '1.0.0',
    isSimulated: false,
    metrics: {},
  },
  {
    code: 'yolox-s-coco',
    name: 'YOLOX-S (COCO) — detector de ganado',
    task: 'ANIMAL_COUNTING',
    provider: 'ai-service',
    description:
      'YOLOX-S de Megvii (Apache-2.0), pesos COCO oficiales en ONNX; clases vaca/oveja/caballo, mosaico para escenas grandes.',
    version: '0.1.1rc0-onnx',
    isSimulated: false,
    metrics: {
      benchmark:
        'Open Images V7 test (Cattle/Bull, sin group-of): ver benchmarks/cattle-openimages.json',
    },
  },
  {
    code: 'sentinel2-ndvi',
    name: 'NDVI Sentinel-2 L2A',
    task: 'VEGETATION_INDEX',
    provider: 'ai-service',
    description:
      'NDVI (B08−B04)/(B08+B04) sobre el polígono con máscara de nubes SCL y control de calidad por observación.',
    version: 'agro-ndvi/1.0.0',
    isSimulated: false,
    metrics: {},
  },
  {
    code: 'simulated-ndvi-analyzer',
    name: 'Analizador NDVI (simulado)',
    task: 'VEGETATION_INDEX',
    provider: 'mock-sentinel2',
    description: 'Simulador de serie NDVI para desarrollo.',
    version: '1.0.0',
    isSimulated: true,
    metrics: {},
  },
  {
    code: 'mock-cv',
    name: 'Visión computacional simulada',
    task: 'ANIMAL_COUNTING',
    provider: 'mock',
    description: 'Resultados determinísticos para desarrollo y tests.',
    version: '0.1.0',
    isSimulated: true,
    metrics: {},
  },
  {
    code: 'agro-score',
    name: 'Motor de scoring AgroGarantías',
    task: 'SCORING',
    provider: 'api',
    description: 'Score explicable ponderado por componentes.',
    version: '1.0.0',
    isSimulated: false,
    metrics: {},
  },
];

export const ALERT_RULES: {
  code: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  conditionType: AlertConditionType;
  parameters: Record<string, number>;
  assetTypeCodes: string[];
}[] = [
  {
    code: 'QUANTITY_BELOW_DECLARED',
    name: 'Cantidad detectada inferior a la declarada',
    description: 'Detectado < declarado × umbral',
    severity: 'WARNING',
    conditionType: 'QUANTITY_RATIO_BELOW',
    parameters: { threshold: 0.9 },
    assetTypeCodes: [],
  },
  {
    code: 'LIVESTOCK_ACTIVITY_DROP',
    name: 'Disminución de actividad ganadera',
    description: 'Caída del conteo respecto de la verificación anterior',
    severity: 'WARNING',
    conditionType: 'ACTIVITY_DROP',
    parameters: { thresholdPct: 10 },
    assetTypeCodes: ['BOVINOS'],
  },
  {
    code: 'EVIDENCE_STALE',
    name: 'Ausencia de imágenes recientes',
    description: 'La evidencia más reciente supera la antigüedad máxima',
    severity: 'INFO',
    conditionType: 'EVIDENCE_STALE',
    parameters: { maxAgeHours: 72 },
    assetTypeCodes: [
      'BOVINOS',
      'SILOBOLSAS',
      'SILOS',
      'MAQUINARIA',
      'CULTIVOS',
      'VINEDOS',
      'FRUTALES',
      'FORESTAL',
    ],
  },
  {
    code: 'LOCATION_MISMATCH',
    name: 'Evidencia fuera del establecimiento',
    description: 'Georreferencia fuera del límite declarado',
    severity: 'CRITICAL',
    conditionType: 'LOCATION_MISMATCH',
    parameters: {},
    assetTypeCodes: [],
  },
  {
    code: 'ANOMALOUS_BEHAVIOR',
    name: 'Comportamiento anómalo',
    description: 'Score de anomalías por encima del umbral',
    severity: 'WARNING',
    conditionType: 'ANOMALY_SCORE_ABOVE',
    parameters: { threshold: 0.5 },
    assetTypeCodes: [],
  },
  {
    code: 'VEGETATION_AREA_CHANGE',
    name: 'Cambio en la superficie cultivada',
    description: 'Superficie con vegetación activa inferior a la declarada',
    severity: 'WARNING',
    conditionType: 'VEGETATION_AREA_DROP',
    parameters: { thresholdPct: 8 },
    assetTypeCodes: ['CULTIVOS', 'VINEDOS', 'FRUTALES', 'FORESTAL'],
  },
  {
    code: 'VEGETATION_DECLINE',
    name: 'Disminución significativa de actividad vegetal',
    description: 'Caída del NDVI respecto de la observación anterior o de la línea base',
    severity: 'WARNING',
    conditionType: 'VEGETATION_DECLINE',
    parameters: { thresholdPct: 15 },
    assetTypeCodes: ['CULTIVOS', 'VINEDOS', 'FRUTALES', 'FORESTAL'],
  },
  {
    code: 'OBSERVATION_LOW_CONFIDENCE',
    name: 'Observación satelital de baja confianza',
    description: 'Sin escena utilizable en la ventana (nubosidad sobre el lote o sin cobertura)',
    severity: 'INFO',
    conditionType: 'OBSERVATION_LOW_CONFIDENCE',
    parameters: {},
    assetTypeCodes: ['CULTIVOS', 'VINEDOS', 'FRUTALES', 'FORESTAL'],
  },
  {
    code: 'DOCUMENT_EXPIRING',
    name: 'Documentación vencida o por vencer',
    description: 'Documentos con vencimiento dentro de la ventana configurada',
    severity: 'WARNING',
    conditionType: 'DOCUMENT_EXPIRING',
    parameters: { withinDays: 30 },
    assetTypeCodes: [],
  },
  {
    code: 'NO_RECENT_VERIFICATION',
    name: 'Activo sin verificación reciente',
    description: 'La última verificación supera la antigüedad máxima',
    severity: 'INFO',
    conditionType: 'NO_RECENT_VERIFICATION',
    parameters: { maxDays: 15 },
    assetTypeCodes: [],
  },
  {
    code: 'LOW_SCORE',
    name: 'Score bajo',
    description: 'Score de verificación por debajo del mínimo',
    severity: 'WARNING',
    conditionType: 'SCORE_BELOW',
    parameters: { threshold: 60 },
    assetTypeCodes: [],
  },
];
