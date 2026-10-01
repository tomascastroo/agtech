import PDFDocument from 'pdfkit';

/**
 * Genera documentos PDF de DEMOSTRACIÓN (sin validez legal) para poblar la documentación de
 * los establecimientos demo. Cada documento lleva una marca visible.
 */
export function demoDocumentPdf(input: {
  title: string;
  issuer: string;
  fields: [string, string][];
}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    info: { Title: input.title, Author: input.issuer },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );

  doc
    .fillColor('#B42318')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('DOCUMENTO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL', { align: 'center' });
  doc.moveDown(1.5);
  doc.fillColor('#0F2A3D').fontSize(16).text(input.title);
  doc.fillColor('#5B6670').font('Helvetica').fontSize(10).text(input.issuer);
  doc.moveDown(1.2);
  for (const [key, value] of input.fields) {
    doc.fillColor('#5B6670').font('Helvetica').fontSize(9).text(key);
    doc.fillColor('#1F2933').font('Helvetica-Bold').fontSize(11).text(value);
    doc.moveDown(0.5);
  }
  doc.moveDown(2);
  doc
    .fillColor('#5B6670')
    .font('Helvetica-Oblique')
    .fontSize(8)
    .text(
      'Generado automáticamente por el entorno de desarrollo de AgroGarantías a partir de datos ficticios.',
    );
  doc.end();
  return done;
}
