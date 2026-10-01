export const DOCUMENT_TYPES = [
  'RENSPA',
  'PROPERTY_DEED',
  'LEASE_CONTRACT',
  'ID_CUIT',
  'SANITARY_CERTIFICATE',
  'INSURANCE_POLICY',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Nombres de cada tipo de documento para textos explicativos (score, informes). */
export const DOCUMENT_TYPE_NAMES: Record<DocumentType, string> = {
  RENSPA: 'RENSPA',
  PROPERTY_DEED: 'Escritura',
  LEASE_CONTRACT: 'Contrato de tenencia',
  ID_CUIT: 'DNI / CUIT del titular',
  SANITARY_CERTIFICATE: 'Certificado sanitario',
  INSURANCE_POLICY: 'Póliza de seguro',
  OTHER: 'Documentación adicional',
};

export const requirementLabel = (requirement: string): string =>
  requirementAlternatives(requirement)
    .map((type) => DOCUMENT_TYPE_NAMES[type] ?? type)
    .join(' o ');

export const DOCUMENT_STATUSES = ['PENDING_REVIEW', 'VALID', 'EXPIRED', 'REJECTED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * Requisito documental de un tipo de activo. "PROPERTY_DEED|LEASE_CONTRACT" significa que
 * cualquiera de los dos satisface el requisito (título o contrato de tenencia).
 */
export function requirementAlternatives(requirement: string): DocumentType[] {
  return requirement.split('|') as DocumentType[];
}
