export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export const ALERT_CONDITION_TYPES = [
  'QUANTITY_RATIO_BELOW',
  'ACTIVITY_DROP',
  'EVIDENCE_STALE',
  'LOCATION_MISMATCH',
  'ANOMALY_SCORE_ABOVE',
  'VEGETATION_AREA_DROP',
  'DOCUMENT_EXPIRING',
  'NO_RECENT_VERIFICATION',
  'SCORE_BELOW',
] as const;
export type AlertConditionType = (typeof ALERT_CONDITION_TYPES)[number];
