/**
 * Lecturas RFID de caravanas electrónicas (ISO 11784/11785, FDX-B / HDX). El identificador
 * electrónico (EID) se representa en decimal: 3 dígitos de país (032 = Argentina) + 12 dígitos
 * nacionales. Los lectores lo emiten con o sin separadores ("032 0000 1245 5678",
 * "032000012455678"): se normaliza a 15 dígitos.
 *
 * Flujo: lector → puente móvil/Android (Bluetooth/serie, fuera del navegador) → API →
 * rfid_observations → animal (animal_identifications RFID) → establecimiento/activo → verificación.
 */

export const RFID_SOURCES = ['READER_BRIDGE', 'SIMULATED'] as const;
export type RfidSource = (typeof RFID_SOURCES)[number];

export const RFID_STATUSES = ['IDENTIFIED', 'UNKNOWN_TAG', 'OTHER_ESTABLISHMENT'] as const;
export type RfidStatus = (typeof RFID_STATUSES)[number];

export function normalizeEid(raw: string): string | null {
  const digits = raw.replace(/[\s.-]/g, '');
  return /^\d{15}$/.test(digits) ? digits : null;
}

/** "032000012455678" → "032 0000 1245 5678" (formato habitual de los lectores). */
export function formatEid(eid: string): string {
  return `${eid.slice(0, 3)} ${eid.slice(3, 7)} ${eid.slice(7, 11)} ${eid.slice(11)}`;
}

export function classifyReading(
  animal: { establishmentId: string } | null,
  establishmentId: string,
): RfidStatus {
  if (!animal) return 'UNKNOWN_TAG';
  return animal.establishmentId === establishmentId ? 'IDENTIFIED' : 'OTHER_ESTABLISHMENT';
}
