import PDFDocument from 'pdfkit';
import type { CollateralQueryService } from './collateral-query.service.js';
import { EVIDENCE_METHOD_LABELS } from '../domain/collateral.types.js';

type Passport = Awaited<ReturnType<CollateralQueryService['passport']>>;
type Row = Record<string, unknown>;

const C = {
  navy: '#0F2A3D',
  green: '#2E7D4F',
  amber: '#B7791F',
  red: '#B42318',
  text: '#1F2933',
  muted: '#5B6670',
  line: '#D9DEE3',
  surface: '#F4F6F7',
};
const M = 44;
const W = 595.28 - M * 2;

const n = (v: unknown, d = 0) =>
  v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('es-AR', { maximumFractionDigits: d });
const dt = (v: unknown) =>
  v
    ? new Date(v as string).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      })
    : '—';
const d = (v: unknown) =>
  v ? new Date(v as string).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—';
const s = (v: unknown): string =>
  v === null || v === undefined || v === ''
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v as string | number | boolean);

const stateColor = (state: string) =>
  state === 'VERIFICADA' || state === 'EN_MONITOREO'
    ? C.green
    : state === 'REQUIERE_INSPECCION' || state === 'NO_DETERMINABLE'
      ? C.red
      : C.amber;

/**
 * "ASSET PASSPORT — GARANTÍA BOVINA" en PDF (A4). Todo dato lleva su fuente, fecha y método; se
 * cierra con las limitaciones. Una garantía DEMO lleva la banda "DATOS DE DEMOSTRACIÓN".
 */
export function renderPassportPdf(p: Passport, generatedBy: string): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M, bottom: M, left: M, right: M },
    bufferPages: true,
    info: {
      Title: `Asset Passport — Garantía bovina ${p.header.code}`,
      Author: 'AgroGarantías',
      Subject: 'Verificación continua de garantía bovina',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const demo = p.header.dataSource === 'DEMO';

  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - M - 30) doc.addPage();
  };
  const section = (title: string) => {
    ensure(60);
    doc.moveDown(0.6);
    doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), M, doc.y);
    doc
      .moveTo(M, doc.y + 2)
      .lineTo(M + W, doc.y + 2)
      .strokeColor(C.line)
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.5);
  };
  const kv = (pairs: [string, string][]) => {
    for (const [k, v] of pairs) {
      ensure(16);
      const y = doc.y;
      doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(k, M, y, { width: 150 });
      doc
        .fillColor(C.text)
        .font('Helvetica')
        .fontSize(9)
        .text(v, M + 155, y, { width: W - 155 });
      doc.moveDown(0.15);
    }
  };
  const para = (text: string, color = C.text, size = 9) => {
    ensure(20);
    doc.fillColor(color).font('Helvetica').fontSize(size).text(text, M, doc.y, { width: W });
    doc.moveDown(0.2);
  };
  const table = (headers: string[], widths: number[], rows: string[][]) => {
    const draw = (cells: string[], bold: boolean, fill?: string) => {
      const h =
        Math.max(
          ...cells.map((c, i) =>
            doc
              .font(bold ? 'Helvetica-Bold' : 'Helvetica')
              .fontSize(7.5)
              .heightOfString(c, { width: widths[i]! - 6 }),
          ),
        ) + 6;
      ensure(h);
      const y = doc.y;
      if (fill) doc.rect(M, y, W, h).fill(fill);
      let x = M;
      cells.forEach((c, i) => {
        doc
          .fillColor(bold ? C.navy : C.text)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(7.5)
          .text(c, x + 3, y + 3, { width: widths[i]! - 6 });
        x += widths[i]!;
      });
      doc.y = y + h;
    };
    draw(headers, true, C.surface);
    if (!rows.length) para('Sin registros.', C.muted, 8);
    for (const r of rows) draw(r, false);
    doc.moveDown(0.3);
  };

  // ---------------------------------------------------------------- portada
  if (demo) {
    doc.rect(0, 0, doc.page.width, 22).fill(C.red);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('DATOS DE DEMOSTRACIÓN – INFORME SIN VALOR', 0, 7, {
        align: 'center',
        width: doc.page.width,
      });
    doc.y = M;
  }
  doc
    .fillColor(C.navy)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text('ASSET PASSPORT — GARANTÍA BOVINA', M, doc.y);
  doc
    .fillColor(C.muted)
    .font('Helvetica')
    .fontSize(9)
    .text(
      `Garantía #${p.header.code} · generado ${dt(new Date().toISOString())} por ${generatedBy}`,
    );
  doc.moveDown(0.6);
  const boxY = doc.y;
  doc.rect(M, boxY, W, 70).fill(C.surface);
  doc
    .fillColor(stateColor(p.header.state))
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(p.header.stateLabel.toUpperCase(), M + 12, boxY + 10, { width: W / 2 });
  doc
    .fillColor(C.text)
    .font('Helvetica')
    .fontSize(8.5)
    .text(s(p.header.stateReason), M + 12, boxY + 30, { width: W / 2 - 12 });
  const right = M + W / 2 + 10;
  doc.fillColor(C.text).font('Helvetica').fontSize(9);
  doc.text(`Score: ${s(p.header.score)}/100`, right, boxY + 10);
  doc.text(`Riesgo: ${s(p.header.riskLevel)}`, right, boxY + 23);
  doc.text(
    `Cobertura: ${p.header.coverage.status === 'DETERMINADA' ? n(p.header.coverage.ratio, 2) : 'NO DETERMINABLE'}`,
    right,
    boxY + 36,
  );
  doc.text(`Última verificación: ${dt(p.header.lastVerificationAt)}`, right, boxY + 49);
  doc.text(`Próxima: ${dt(p.header.nextVerificationAt)}`, right, boxY + 60);
  doc.y = boxY + 80;
  para(`¿Puedo confiar hoy en esta garantía? ${p.header.trust.text}`, C.navy, 10);

  section('Identidad');
  kv([
    ['Productor', `${s(p.identity.producerName)} (CUIT ${s(p.identity.producerTaxId)})`],
    [
      'Establecimiento',
      p.identity.establishment
        ? `${s(p.identity.establishment.name)} · RENSPA ${s(p.identity.establishment.renspa)} (declarado)`
        : '—',
    ],
    [
      'Ubicación',
      p.identity.establishment
        ? `${s(p.identity.establishment.locality)}, ${s(p.identity.establishment.province)}`
        : '—',
    ],
    ['Tipo de producción', `${p.identity.productionLabel}. ${p.identity.strategy}`],
  ]);

  section('Garantía legal (informada por la entidad)');
  kv([
    [
      'Instrumento',
      `${s(p.legal.instrument)}${p.legal.identifier ? ` · ${s(p.legal.identifier)}` : ''}`,
    ],
    ['Estado registral', s(p.legal.status)],
    ['Prioridad', s(p.legal.lienPriority)],
    [
      'Inmovilización',
      `${s(p.legal.immobilizationStatus)}${p.legal.immobilizationReference ? ` · ${s(p.legal.immobilizationReference)}` : ''}`,
    ],
    [
      'Monto / deuda',
      `${n(p.legal.amount, 2)} / ${n(p.legal.debtAmount, 2)} ${s(p.legal.currency)}`,
    ],
    ['Otorgamiento / vencimiento', `${d(p.legal.grantedAt)} / ${d(p.legal.expiresAt)}`],
  ]);
  if (p.legal.notInformed.length)
    para(`No informado: ${p.legal.notInformed.join(', ')}.`, C.amber, 8.5);
  para(p.legal.note, C.muted, 8);

  section('Declaración (inmutable; cada corrección es una versión)');
  table(
    ['Versión', 'Cabezas', 'Fuente', 'Declarado por', 'Fecha', 'Motivo'],
    [45, 55, 70, 110, 90, W - 370],
    p.declaration.versions.map((v: Row) => [
      s(v.version),
      n(v.heads),
      s(v.source),
      s(v.declaredBy),
      dt(v.declaredAt),
      s(v.reason),
    ]),
  );

  section('Bovinos: declarado, esperado, observado, verificado');
  kv([
    ['Declarado', n(p.bovines.declared)],
    ['Movimientos', `${n(p.bovines.exits)} salidas · ${n(p.bovines.entries)} ingresos`],
    ['Esperado', n(p.bovines.expected)],
    [
      'Observado',
      `${n(p.bovines.observed)} (${p.bovines.observedBasis === 'CENSO' ? 'conteo completo' : p.bovines.observedBasis ? 'parcial / cota inferior' : 'sin observación'}${p.bovines.observedMethod ? `, ${EVIDENCE_METHOD_LABELS[p.bovines.observedMethod as keyof typeof EVIDENCE_METHOD_LABELS]}` : ''})`,
    ],
    ['Verificable', n(p.bovines.verifiable)],
    ['Consistencia', s(p.bovines.consistency)],
  ]);
  for (const line of p.bovines.narrative as string[]) para(`· ${line}`, C.text, 8.5);

  section('Evidencia');
  table(
    ['Fecha', 'Tipo', 'Origen', 'GPS', 'Dispositivo / usuario', 'SHA-256'],
    [70, 50, 80, 85, 95, W - 380],
    (p.evidence as Row[])
      .slice(0, 25)
      .map((e) => [
        dt(e.capturedAt),
        `${s(e.type)}${e.scanMode ? ` ${s(e.scanMode)}` : ''}${e.simulated ? ' (SIMULADA)' : ''}`,
        s(e.captureOrigin).replace('_', ' '),
        e.location
          ? `${s(e.locationSource)}${e.accuracyM ? ` ±${n(e.accuracyM)} m` : ''}`
          : 'Sin GPS',
        s(e.deviceName ?? e.uploadedBy),
        s(e.sha256).slice(0, 16),
      ]),
  );

  section('Identificación individual (Manga + RFID)');
  kv([
    ['Caravanas identificadas', n(p.rfid.identified)],
    ['Pasos ambiguos (rechazados)', n(p.rfid.ambiguous)],
    ['Evidencia insuficiente', n(p.rfid.insufficient)],
    ['Lecturas simuladas excluidas', n(p.rfid.simulatedExcluded)],
  ]);

  section('Fuentes oficiales');
  table(
    ['Fuente', 'Estado', 'Detalle'],
    [150, 100, W - 250],
    p.officialSources.map((o) => [o.name, o.statusLabel.toUpperCase(), o.detail]),
  );

  section('Movimientos');
  table(
    ['Fecha', 'Tipo', 'Cabezas', 'Fuente', 'Respaldo', 'Estado'],
    [70, 80, 50, 70, W - 340, 70],
    (p.movements as Row[]).map((m) => [
      d(m.occurredAt),
      `${s(m.direction)} ${s(m.kind)}`,
      n(m.heads),
      s(m.sourceLevel),
      s(m.sourceLabel),
      s(m.verificationState),
    ]),
  );

  section('Documentos');
  table(
    ['Tipo', 'Título', 'Cargado', 'Lectura OCR'],
    [100, W - 280, 90, 90],
    (p.documents as Row[]).map((x) => [s(x.type), s(x.title), d(x.createdAt), s(x.analysisStatus)]),
  );

  section('Verificaciones');
  table(
    ['Fecha', 'Método', 'Decl.', 'Esper.', 'Obs.', 'Verif.', 'Calidad', 'Resultado'],
    [70, 90, 40, 40, 40, 40, 60, W - 380],
    (p.verifications as Row[]).map((v) => [
      dt(v.verifiedAt),
      s(EVIDENCE_METHOD_LABELS[v.method as keyof typeof EVIDENCE_METHOD_LABELS] ?? v.method),
      n(v.declared),
      n(v.expected),
      n(v.observed),
      n(v.verified),
      s(v.quality),
      s(v.resultState),
    ]),
  );

  section('Collateral Effectiveness Score');
  if (p.score) {
    para(
      `Score ${s(p.score.value)}/100 (promedio ponderado ${s(p.score.weighted)}) · motor ${s(p.score.engineVersion)} · evaluado ${dt(p.score.evaluatedAt)}`,
    );
    table(
      ['Componente', 'Valor', 'Peso', 'Explicación'],
      [90, 40, 40, W - 170],
      (p.score.components as Row[]).map((c) => [
        s(c.label),
        c.value === null ? 'sin datos' : s(c.value),
        n(c.weight, 2),
        s(c.explanation),
      ]),
    );
    for (const g of p.score.gates as Row[])
      para(`Compuerta ${s(g.code)} → ${s(g.state)}: ${s(g.explanation)}`, C.amber, 8.5);
  } else para('Sin evaluación todavía.', C.muted);

  section('Cobertura monetaria');
  const cov = p.coverage as Row | null;
  if (cov && cov.status === 'DETERMINADA') {
    kv([
      ['Fórmula', s(cov.formula)],
      ['Valor verificable', `${n(cov.verifiableValue, 2)} ${s(cov.currency)}`],
      [
        'Cobertura',
        `${n(cov.ratio, 2)} (sobre ${cov.ratioBasis === 'DEUDA' ? 'la deuda' : 'el monto de la garantía'})`,
      ],
    ]);
    for (const w of (cov.warnings as string[]) ?? []) para(`Advertencia: ${w}`, C.amber, 8.5);
  } else
    para(
      `COBERTURA NO DETERMINABLE. Falta: ${((cov?.missing as string[]) ?? ['evaluación']).join(', ')}.`,
      C.amber,
    );
  kv([
    [
      'Peso promedio',
      `${n(p.valuation.averageWeightKg, 1)} kg (fuente: ${s(p.valuation.weightSource)})`,
    ],
    [
      'Precio de referencia',
      `${n(p.valuation.pricePerKg, 4)} ${s(p.valuation.priceCurrency)}/kg (fuente: ${s(p.valuation.priceSource)}, ${d(p.valuation.priceDate)})`,
    ],
    ['Factor de calidad', n(p.valuation.qualityFactor, 3)],
  ]);

  section('Riesgo y agenda');
  if (p.risk) {
    para(`Nivel ${s(p.risk.level)} (${s(p.risk.points)} puntos).`);
    for (const f of p.risk.factors as Row[])
      para(`· +${s(f.points)} ${s(f.explanation)}`, C.text, 8.5);
  }
  if (p.schedule)
    para(`${p.schedule.explanation} Próxima verificación: ${dt(p.schedule.nextVerificationAt)}.`);

  section('Alertas');
  table(
    ['Fecha', 'Severidad', 'Estado', 'Qué pasó', 'Acción'],
    [70, 55, 65, W - 330, 140],
    (p.alerts as Row[]).map((a) => [
      dt(a.createdAt),
      s(a.severity),
      s(a.status),
      s(a.title),
      s(a.recommendedAction),
    ]),
  );

  section('Inspecciones');
  table(
    ['Solicitada', 'Realizada', 'Inspector', 'Observados', 'Resultado', 'Firma (SHA-256)'],
    [65, 65, 90, 60, 80, W - 360],
    (p.inspections as Row[]).map((i) => [
      d(i.requestedAt),
      dt(i.performedAt),
      s(i.inspectorName),
      i.observedHeads === null
        ? '—'
        : `${n(i.observedHeads)}${i.fullCount ? ' (completo)' : ' (parcial)'}`,
      s(i.result ?? i.status),
      i.signatureHash ? `${s(i.signatureName)} · ${s(i.signatureHash).slice(0, 16)}` : '—',
    ]),
  );

  section('Historial');
  table(
    ['Fecha', 'Fuente', 'Actor', 'Evento'],
    [75, 65, 95, W - 235],
    (p.history as Row[])
      .slice(0, 40)
      .map((h) => [dt(h.occurredAt), s(h.source), s(h.actor), s(h.summary)]),
  );

  section('Fuentes, fechas y métodos');
  para(
    'Cada verificación indica su método (foto, video/barrido, escáner fijo, manga + RFID, inspección), la base del conteo (completo o parcial) y la calidad de la evidencia. Las fechas corresponden a la captura de la evidencia; los conteos por visión los procesa el servidor (YOLOX-S + ByteTrack) y son la referencia; la detección en el teléfono es solo una guía.',
    C.text,
    8.5,
  );

  section('Limitaciones');
  for (const l of p.limitations) para(`· ${l}`, C.text, 8.5);

  // Pie en todas las páginas.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(C.muted)
      .font('Helvetica')
      .fontSize(7)
      .text(
        `${demo ? 'DATOS DE DEMOSTRACIÓN · ' : ''}AgroGarantías verifica y monitorea; no presta, no custodia ni emite títulos. Garantía ${p.header.code} · página ${i + 1} de ${range.count}`,
        M,
        doc.page.height - M + 10,
        { width: W, align: 'center' },
      );
  }
  doc.end();
  return done;
}
