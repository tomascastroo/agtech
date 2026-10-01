export type ReportStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
export const REPORT_FORMATS = ['PDF', 'CSV', 'JSON'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
