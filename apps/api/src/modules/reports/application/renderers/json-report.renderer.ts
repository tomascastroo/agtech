import type { GuaranteeReportData } from '../../domain/report-data.js';

export class JsonReportRenderer {
  render(data: GuaranteeReportData): Buffer {
    const serializable = {
      ...data,
      evidence: data.evidence.map(({ image: _image, ...rest }) => rest),
    };
    return Buffer.from(JSON.stringify(serializable, null, 2), 'utf8');
  }
}
