/**
 * Lectores RFID para Manga + RFID. La caravana electrónica (ISO 11784/11785, baja frecuencia
 * 134,2 kHz) la lee un bastón o un lector chico que la transmite por Bluetooth al teléfono. Este
 * módulo define el contrato que usa la sesión de manga; hoy solo existe el lector SIMULADO.
 *
 *  - SimulatedRfidReader: lecturas deterministas (032000000000001, …002, …003…) disparadas por el
 *    operador. Todo lo que registra queda marcado SIMULADO de punta a punta (celular, servidor,
 *    evidencia, banco) y nunca cuenta como censo.
 *  - Lector físico (pendiente): un `RfidReader` con source 'READER_BRIDGE' que reciba cada lectura
 *    en el momento en que ocurre (BLE / Web Bluetooth o un puente nativo) y un lector registrado
 *    como dispositivo RFID_READER de la organización (el servidor lo exige).
 *
 * No hay lector "desde archivo": un archivo descargado del bastón trae horas de otro reloj; no se
 * puede ubicar cada lectura dentro de la ventana de cuadros con seguridad, y una lectura dudosa no
 * se asocia. Esas lecturas se cargan por la ingesta RFID existente (sin asociación visual).
 */
export type RfidSource = 'SIMULATED' | 'READER_BRIDGE';

export interface RfidRead {
  /** EID tal como lo entregó el lector (el servidor lo valida). */
  electronicId: string;
  source: RfidSource;
  readerDeviceId: string | null;
  /** performance.now() del teléfono al recibir la lectura (mismo reloj que los cuadros). */
  at: number;
}

export interface RfidReader {
  readonly source: RfidSource;
  /** Lo que ve el operador (p. ej. "SIMULADO"). */
  readonly label: string;
  readonly readerDeviceId: string | null;
  start(onRead: (read: RfidRead) => void): Promise<void>;
  stop(): void;
}

/** EID simulado n (1 → 032000000000001): país 032 + 12 dígitos. */
export function simulatedEid(n: number): string {
  return `032${String(n).padStart(12, '0')}`;
}

/**
 * Lector SIMULADO: cada `trigger()` emite la siguiente caravana de una secuencia determinista
 * (para demo y pruebas). `trigger(eid)` emite una caravana puntual (p. ej. repetir o una ilegible).
 */
export class SimulatedRfidReader implements RfidReader {
  readonly source = 'SIMULATED' as const;
  readonly label = 'SIMULADO';
  readonly readerDeviceId = null;
  private onRead: ((read: RfidRead) => void) | null = null;
  private next: number;

  constructor(first = 1) {
    this.next = first;
  }

  async start(onRead: (read: RfidRead) => void): Promise<void> {
    this.onRead = onRead;
  }

  stop(): void {
    this.onRead = null;
  }

  /** Simula pasar el bastón por la caravana. Devuelve el EID emitido. */
  trigger(electronicId?: string, at = performance.now()): string {
    const eid = electronicId ?? simulatedEid(this.next++);
    this.onRead?.({ electronicId: eid, source: this.source, readerDeviceId: null, at });
    return eid;
  }
}
