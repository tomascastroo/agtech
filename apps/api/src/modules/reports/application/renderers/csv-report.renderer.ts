import { LABELS, type GuaranteeReportData } from '../../domain/report-data.js';

const escape = (value: unknown): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value as string | number | boolean);
  // Prevención de inyección de fórmulas al abrir en planillas de cálculo.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV en formato largo (sección, campo, valor): estable y fácil de procesar. */
export class CsvReportRenderer {
  render(data: GuaranteeReportData): Buffer {
    const rows: unknown[][] = [['seccion', 'campo', 'valor']];
    const add = (section: string, field: string, value: unknown) =>
      rows.push([section, field, value]);

    add('informe', 'id', data.reportId);
    add('informe', 'version', data.reportVersion);
    add('informe', 'esquema', data.schemaVersion);
    add('informe', 'generado', data.generatedAt);
    add('informe', 'datos_demostracion', data.demo ? 'SI' : 'NO');
    add('informe', 'verificacion_id', data.verificationId);
    add('informe', 'organizacion', data.organization.name);
    for (const [key, value] of Object.entries(data.establishment))
      add('establecimiento', key, Array.isArray(value) ? value.join(' ') : value);
    for (const [key, value] of Object.entries(data.asset)) add('activo', key, value);
    add('resultado', 'resultado', LABELS.outcome[data.result.outcome] ?? data.result.outcome);
    add('resultado', 'declarado', data.result.declaredQuantity);
    add('resultado', 'verificado', data.result.detectedQuantity);
    add('resultado', 'coincidencia_pct', data.result.matchPercentage);
    add('resultado', 'diferencia', data.result.difference);
    add('resultado', 'score', data.result.finalScore);
    add('resultado', 'confianza', data.result.confidence);
    add('resultado', 'riesgo', LABELS.risk[data.result.riskLevel] ?? data.result.riskLevel);
    add('resultado', 'ubicacion_verificada', data.result.locationVerified);
    add('resultado', 'modelo_scoring', data.result.scoringModelVersion);
    add('resultado', 'penalizacion', data.result.riskPenalty);
    for (const c of data.result.components) {
      add('score', `${c.key}.puntaje`, c.score);
      add('score', `${c.key}.peso`, c.weight);
      add('score', `${c.key}.aporte`, c.contribution);
    }
    data.evidence.forEach((e, i) => {
      const p = `evidencia_${i + 1}`;
      add(p, 'id', e.id);
      add(p, 'fuente', e.sourceName);
      add(p, 'simulada', e.simulated);
      add(p, 'captura', e.capturedAt);
      add(p, 'rol', e.role);
      add(p, 'detectados', e.detectedCount);
      add(p, 'confianza', e.confidence);
      add(p, 'modelo', e.model);
      add(p, 'sha256', e.sha256);
    });
    data.history.forEach((h, i) => {
      add(`historial_${i + 1}`, 'fecha', h.completedAt);
      add(`historial_${i + 1}`, 'verificado', h.detectedQuantity);
      add(`historial_${i + 1}`, 'score', h.finalScore);
    });
    data.result.anomalies.forEach((a, i) =>
      add(`anomalia_${i + 1}`, a.code, `${a.severity}: ${a.message}`),
    );
    data.simulatedSources.forEach((s, i) => add('fuentes_simuladas', String(i + 1), s));

    const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
    return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(csv, 'utf8')]);
  }
}
