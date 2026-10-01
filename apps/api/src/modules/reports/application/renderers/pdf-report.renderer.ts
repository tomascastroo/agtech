import PDFDocument from 'pdfkit';
import { LABELS, type GuaranteeReportData } from '../../domain/report-data.js';

type Doc = InstanceType<typeof PDFDocument>;

const COLORS = {
  navy: '#0F2A3D',
  green: '#2E7D4F',
  amber: '#B7791F',
  red: '#B42318',
  text: '#1F2933',
  muted: '#5B6670',
  line: '#D9DEE3',
  surface: '#F4F6F7',
  white: '#FFFFFF',
};
const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 48;

const number = (value: number | null | undefined, decimals = 0) =>
  value === null || value === undefined
    ? '—'
    : value.toLocaleString('es-AR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      })
    : '—';

const outcomeColor = (outcome: string) =>
  outcome === 'VERIFIED' ? COLORS.green : outcome === 'REJECTED' ? COLORS.red : COLORS.amber;

/** Informe de verificación de garantía en PDF (A4), pensado para ser recibido por un banco. */
export class PdfReportRenderer {
  render(data: GuaranteeReportData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: `Informe de verificación — ${data.establishment.name}`,
        Author: 'AgroGarantías',
        Subject: `Verificación ${data.verificationId}`,
        Keywords: 'garantía, verificación, agro',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.header(doc, data);
    this.title(doc, data);
    this.kpis(doc, data);
    this.summary(doc, data);
    this.details(doc, data);
    this.scoreTable(doc, data);
    this.evidenceGallery(doc, data);
    this.evidenceTable(doc, data);
    this.crossChecks(doc, data);
    this.history(doc, data);
    this.anomalies(doc, data);
    this.methodology(doc, data);
    this.footers(doc, data);
    doc.end();
    return done;
  }

  private header(doc: Doc, data: GuaranteeReportData) {
    doc.rect(0, 0, PAGE_WIDTH, 78).fill(COLORS.navy);
    doc
      .fillColor(COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text('AGROGARANTÍAS', MARGIN, 24, {
        characterSpacing: 2,
      });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#C9D6DF')
      .text('Informe de Verificación de Garantía', MARGIN, 45);
    doc.fontSize(8).fillColor('#C9D6DF');
    doc.text(`ID de verificación: ${data.verificationId}`, MARGIN, 26, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
    doc.text(`Emitido para: ${data.organization.name}`, MARGIN, 38, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
    doc.text(`Generado: ${date(data.generatedAt)}  ·  Versión ${data.reportVersion}`, MARGIN, 50, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
    doc.y = 100;
  }

  private title(doc: Doc, data: GuaranteeReportData) {
    doc
      .fillColor(COLORS.text)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(data.establishment.name, MARGIN, doc.y);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(
        `${data.asset.typeName} · ${data.asset.name} · Titular: ${data.establishment.holderName} (CUIT ${data.establishment.holderTaxId})`,
      );
    doc.moveDown(0.9);
  }

  private kpis(doc: Doc, data: GuaranteeReportData) {
    const r = data.result;
    const items: [string, string, string][] = [
      ['DECLARADO', number(r.declaredQuantity, 2), data.asset.unitLabel],
      [
        'VERIFICADO',
        number(r.detectedQuantity, 2),
        r.detectedQuantity === null ? 'sin cuantificación' : data.asset.unitLabel,
      ],
      [
        'COINCIDENCIA',
        r.matchPercentage === null ? '—' : `${number(r.matchPercentage, 0)} %`,
        r.matchPercentage === null ? '' : `${number(r.matchPercentage, 1)} % exacto`,
      ],
      ['SCORE', `${r.finalScore}/100`, LABELS.outcome[r.outcome] ?? r.outcome],
    ];
    const gap = 8;
    const width = (CONTENT_WIDTH - gap * 3) / 4;
    const top = doc.y;
    items.forEach(([label, value, caption], i) => {
      const x = MARGIN + i * (width + gap);
      doc.rect(x, top, width, 64).fill(COLORS.surface);
      doc.rect(x, top, 3, 64).fill(i === 3 ? outcomeColor(r.outcome) : COLORS.navy);
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(label, x + 12, top + 10, { characterSpacing: 1 });
      doc
        .fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(value, x + 12, top + 23, { width: width - 16 });
      doc
        .fillColor(i === 3 ? outcomeColor(r.outcome) : COLORS.muted)
        .font('Helvetica')
        .fontSize(8)
        .text(caption, x + 12, top + 47, { width: width - 16 });
    });
    doc.y = top + 78;
  }

  private summary(doc: Doc, data: GuaranteeReportData) {
    doc
      .fillColor(COLORS.text)
      .font('Helvetica')
      .fontSize(9.5)
      .text(data.result.summary, MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: 2,
      });
    doc.moveDown(0.6);
    doc
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(
        `Nivel de riesgo: ${LABELS.risk[data.result.riskLevel]}  ·  Confianza: ${number(data.result.confidence * 100, 0)} %  ·  Ubicación verificada: ${
          data.result.locationVerified === null
            ? 'sin georreferencia'
            : data.result.locationVerified
              ? 'sí'
              : 'no'
        }  ·  Modelo de scoring: ${data.result.scoringModelVersion}`,
      );
    doc.moveDown(1);
  }

  private details(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Establecimiento y activo');
    const e = data.establishment;
    const coords = e.coordinates
      ? `${e.coordinates[1].toFixed(5)}, ${e.coordinates[0].toFixed(5)}`
      : '—';
    this.keyValues(doc, [
      ['Establecimiento', e.name],
      ['Ubicación', [e.locality, e.province].filter(Boolean).join(', ')],
      ['Coordenadas (lat, lon)', coords],
      ['RENSPA', e.renspa ?? '—'],
      ['Tipo de explotación', LABELS.establishmentType[e.establishmentType] ?? e.establishmentType],
      ['Tenencia', LABELS.tenure[e.tenure] ?? e.tenure],
      ['Superficie total', e.totalAreaHa ? `${number(e.totalAreaHa, 1)} ha` : '—'],
      ['Activo', `${data.asset.typeName} — ${data.asset.name}`],
      [
        'Valor declarado',
        data.asset.declaredValue === null
          ? '—'
          : `${data.asset.currency} ${number(data.asset.declaredValue)}`,
      ],
      [
        'Solicitada por',
        `${data.verification.requestedBy} (${LABELS.trigger[data.verification.trigger] ?? data.verification.trigger})`,
      ],
      ['Fecha de verificación', date(data.verification.completedAt)],
      ['Versión del pipeline', data.verification.pipelineVersion],
    ]);
  }

  private scoreTable(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Componentes del score');
    const rows = data.result.components.map((c) => [
      c.label,
      `${c.score}`,
      `${number(c.weight * 100, 0)} %`,
      number(c.contribution, 2),
      c.explanation,
    ]);
    rows.push([
      'Penalización por anomalías',
      '',
      '',
      data.result.riskPenalty > 0 ? `-${number(data.result.riskPenalty, 2)}` : '0',
      data.result.anomalies.map((a) => a.message).join(' '),
    ]);
    rows.push(['Score final', `${data.result.finalScore}`, '', '', '']);
    this.table(
      doc,
      ['Componente', 'Puntaje', 'Peso', 'Aporte', 'Fundamento'],
      rows,
      [110, 45, 40, 45, CONTENT_WIDTH - 240],
      {
        boldLastRow: true,
      },
    );
  }

  private evidenceGallery(doc: Doc, data: GuaranteeReportData) {
    const withImages = data.evidence.filter((e) => e.image);
    if (withImages.length === 0) return;
    const columns = 3;
    const gap = 10;
    const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    const height = width * 0.62;
    this.ensureSpace(doc, height + 100);
    this.section(doc, 'Evidencia fotográfica');
    for (let i = 0; i < withImages.length; i += columns) {
      this.ensureSpace(doc, height + 42);
      const top = doc.y;
      withImages.slice(i, i + columns).forEach((item, j) => {
        const x = MARGIN + j * (width + gap);
        try {
          doc.image(item.image!.bytes, x, top, { width, height, cover: [width, height] });
        } catch {
          doc.rect(x, top, width, height).fill(COLORS.surface);
        }
        doc.rect(x, top, width, height).lineWidth(0.5).stroke(COLORS.line);
        doc
          .fillColor(COLORS.text)
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .text(item.label ?? item.sourceName, x, top + height + 4, { width });
        const detail = [
          date(item.capturedAt),
          item.detectedCount !== null ? `${number(item.detectedCount)} detectados` : null,
          item.confidence !== null ? `conf. ${number(item.confidence * 100, 0)} %` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        doc
          .fillColor(COLORS.muted)
          .font('Helvetica')
          .fontSize(7)
          .text(detail, x, top + height + 14, { width });
      });
      doc.y = top + height + 34;
    }
    doc.moveDown(0.4);
  }

  private evidenceTable(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Registro de evidencias');
    this.table(
      doc,
      ['Fuente', 'Captura', 'Rol', 'Resultado', 'Modelo', 'SHA-256'],
      data.evidence.map((e) => [
        `${e.label ?? e.sourceName}${e.simulated ? ' (simulada)' : ''}`,
        date(e.capturedAt),
        LABELS.role[e.role] ?? e.role,
        e.exclusionReason ??
          (e.detectedCount !== null
            ? `${number(e.detectedCount)} · ${number((e.confidence ?? 0) * 100, 0)} %`
            : e.qualityScore !== null
              ? `Calidad ${number(e.qualityScore * 100, 0)} %`
              : '—'),
        e.model ?? '—',
        e.sha256 ? `${e.sha256.slice(0, 16)}…` : '—',
      ]),
      [105, 82, 50, 75, 95, CONTENT_WIDTH - 407],
    );
  }

  private crossChecks(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Cruce con información y documentación');
    if (data.externalData.length) {
      this.table(
        doc,
        ['Fuente', 'Proveedor', 'Estado', 'Detalle'],
        data.externalData.map((x) => [
          x.source,
          `${x.provider}${x.simulated ? ' (simulado)' : ''}`,
          x.status,
          x.detail,
        ]),
        [90, 100, 60, CONTENT_WIDTH - 250],
      );
    }
    this.table(
      doc,
      ['Documento', 'Estado', 'Vencimiento', 'SHA-256'],
      data.documents.map((d) => [
        d.title,
        LABELS.documentStatus[d.status] ?? d.status,
        d.expiresAt ?? '—',
        `${d.sha256.slice(0, 16)}…`,
      ]),
      [200, 95, 75, CONTENT_WIDTH - 370],
    );
  }

  private history(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Historial de verificaciones');
    this.table(
      doc,
      ['Fecha', 'Declarado', 'Verificado', 'Score', 'Resultado'],
      data.history.map((h) => [
        date(h.completedAt),
        number(h.declaredQuantity, 2),
        number(h.detectedQuantity, 2),
        `${h.finalScore}`,
        LABELS.outcome[h.outcome] ?? h.outcome,
      ]),
      [130, 90, 90, 60, CONTENT_WIDTH - 370],
    );
  }

  private anomalies(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Anomalías');
    if (data.result.anomalies.length === 0) {
      this.paragraph(doc, 'No se detectaron anomalías en esta verificación.');
      return;
    }
    for (const anomaly of data.result.anomalies) {
      this.paragraph(doc, `[${anomaly.severity}] ${anomaly.message}`);
    }
  }

  private methodology(doc: Doc, data: GuaranteeReportData) {
    this.section(doc, 'Nivel de confianza y metodología');
    this.paragraph(
      doc,
      `Confianza global de la verificación: ${number(data.result.confidence * 100, 0)} %. Modelos utilizados: ${
        data.models
          .map((m) => `${m.code} ${m.version}${m.simulated ? ' (simulado)' : ''}`)
          .join(', ') || 'no aplica'
      }.`,
    );
    for (const line of data.methodology) this.paragraph(doc, `•  ${line}`);
    if (data.simulatedSources.length > 0) {
      doc.moveDown(0.3);
      this.ensureSpace(doc, 40);
      doc
        .fillColor(COLORS.amber)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text('Fuentes simuladas de desarrollo: ', { continued: true })
        .font('Helvetica')
        .fillColor(COLORS.text)
        .text(
          `${data.simulatedSources.join('; ')}. Los resultados derivados de estas fuentes no constituyen observaciones de campo reales.`,
          { width: CONTENT_WIDTH },
        );
    }
  }

  private footers(doc: Doc, data: GuaranteeReportData) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Escribir por debajo del margen inferior provoca saltos de página en pdfkit.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 34;
      doc.save();
      doc
        .moveTo(MARGIN, y - 6)
        .lineTo(PAGE_WIDTH - MARGIN, y - 6)
        .lineWidth(0.5)
        .stroke(COLORS.line);
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(7)
        .text(
          `AgroGarantías · Informe ${data.reportId.slice(0, 8)} · Verificación ${data.verificationId}`,
          MARGIN,
          y,
          {
            width: CONTENT_WIDTH,
            lineBreak: false,
          },
        );
      doc.text(`Página ${i + 1} de ${range.count}`, MARGIN, y, {
        width: CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      });
      doc.restore();
      doc.page.margins.bottom = bottomMargin;
    }
  }

  private section(doc: Doc, title: string) {
    this.ensureSpace(doc, 60);
    doc.moveDown(0.5);
    doc
      .fillColor(COLORS.navy)
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(title.toUpperCase(), MARGIN, doc.y, {
        characterSpacing: 0.6,
      });
    const y = doc.y + 3;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_WIDTH - MARGIN, y)
      .lineWidth(1)
      .stroke(COLORS.green);
    doc.y = y + 8;
  }

  private paragraph(doc: Doc, text: string) {
    this.ensureSpace(doc, 24);
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.5).text(text, MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      lineGap: 1.5,
    });
    doc.moveDown(0.35);
  }

  private keyValues(doc: Doc, pairs: [string, string][]) {
    const colWidth = CONTENT_WIDTH / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      this.ensureSpace(doc, 18);
      const top = doc.y;
      let maxHeight = 0;
      pairs.slice(i, i + 2).forEach(([key, value], j) => {
        const x = MARGIN + j * colWidth;
        doc
          .fillColor(COLORS.muted)
          .font('Helvetica')
          .fontSize(7.5)
          .text(key, x, top, { width: 110 });
        doc
          .fillColor(COLORS.text)
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(value || '—', x + 112, top, { width: colWidth - 120 });
        maxHeight = Math.max(maxHeight, doc.y - top);
      });
      doc.y = top + Math.max(maxHeight, 12) + 4;
    }
    doc.moveDown(0.5);
  }

  private table(
    doc: Doc,
    headers: string[],
    rows: string[][],
    widths: number[],
    options: { boldLastRow?: boolean } = {},
  ) {
    const draw = (cells: string[], y: number, header: boolean, bold: boolean) => {
      const heights = cells.map((cell, i) =>
        doc
          .font(header || bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(header ? 7.5 : 8)
          .heightOfString(cell, { width: widths[i]! - 8 }),
      );
      const height = Math.max(...heights) + 8;
      if (header) doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill(COLORS.surface);
      let x = MARGIN;
      cells.forEach((cell, i) => {
        doc
          .fillColor(header ? COLORS.muted : COLORS.text)
          .font(header || bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(header ? 7.5 : 8)
          .text(cell, x + 4, y + 4, { width: widths[i]! - 8 });
        x += widths[i]!;
      });
      doc
        .moveTo(MARGIN, y + height)
        .lineTo(MARGIN + CONTENT_WIDTH, y + height)
        .lineWidth(0.4)
        .stroke(COLORS.line);
      return height;
    };
    this.ensureSpace(doc, 40);
    let y = doc.y;
    y += draw(headers, y, true, false);
    rows.forEach((row, index) => {
      const bold = Boolean(options.boldLastRow && index === rows.length - 1);
      const estimate = 26;
      if (y + estimate > doc.page.height - MARGIN - FOOTER_SPACE) {
        doc.addPage();
        y = MARGIN;
        y += draw(headers, y, true, false);
      }
      y += draw(row, y, false, bold);
    });
    doc.y = y + 10;
    doc.x = MARGIN;
  }

  private ensureSpace(doc: Doc, height: number) {
    if (doc.y + height > doc.page.height - MARGIN - FOOTER_SPACE) {
      doc.addPage();
      doc.y = MARGIN;
    }
  }
}
