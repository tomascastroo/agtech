import type { GuaranteeReportData } from '../../domain/report-data.js';
import { CsvReportRenderer } from './csv-report.renderer.js';

describe('CsvReportRenderer', () => {
  it('neutraliza fórmulas y escapa comillas', () => {
    const data = {
      schemaVersion: 'x',
      reportId: 'r',
      reportVersion: 1,
      verificationId: 'v',
      generatedAt: '2026-10-01',
      organization: { name: '=HYPERLINK("http://x")' },
      establishment: { name: 'La "Esperanza"' },
      asset: {},
      result: { components: [], anomalies: [], outcome: 'VERIFIED', riskLevel: 'LOW' },
      evidence: [],
      history: [],
      simulatedSources: [],
    } as unknown as GuaranteeReportData;
    const csv = new CsvReportRenderer().render(data).toString('utf8');
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain('"La ""Esperanza"""');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
