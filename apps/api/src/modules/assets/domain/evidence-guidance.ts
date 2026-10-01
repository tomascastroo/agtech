/**
 * Instrucciones de captura de evidencia por tipo de activo (las ve el productor al cargar fotos).
 * Se guardan en asset_types.evidence_guidance; este mapa es la fuente del catálogo y del seed.
 */
export const EVIDENCE_GUIDANCE: Record<string, string> = {
  BOVINOS:
    'Mostrá el rodeo desde distintos ángulos y sectores del campo. Cuantos más animales se vean, mejor.',
  CULTIVOS: 'Agregá la evidencia disponible del lote: vista general, cultivo y estado.',
  VINEDOS: 'Fotografiá las hileras, el sistema de conducción y el estado del viñedo.',
  FRUTALES: 'Fotografiá los montes frutales, la malla antigranizo y el estado de las plantas.',
  FORESTAL: 'Fotografiá los lotes forestales desde distintos puntos.',
  SILOBOLSAS: 'Fotografiá cada silobolsa completa y su identificación.',
  SILOS: 'Fotografiá el silo y sus instalaciones.',
  MAQUINARIA: 'Fotografiá la maquinaria, su identificación (chapa, número de serie) y su estado.',
  INFRAESTRUCTURA: 'Fotografiá la instalación por fuera y por dentro.',
  RESERVORIOS: 'Fotografiá el reservorio y su entorno.',
  OTROS: 'Agregá fotos que muestren el activo y su estado.',
};
