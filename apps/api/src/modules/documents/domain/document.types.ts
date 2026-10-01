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

export const DOCUMENT_STATUSES = ['PENDING_REVIEW', 'VALID', 'EXPIRED', 'REJECTED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * Requisito documental de un tipo de activo. "PROPERTY_DEED|LEASE_CONTRACT" significa que
 * cualquiera de los dos satisface el requisito (título o contrato de tenencia).
 */
export function requirementAlternatives(requirement: string): DocumentType[] {
  return requirement.split('|') as DocumentType[];
}
