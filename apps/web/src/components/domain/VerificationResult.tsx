'use client';

import { useState } from 'react';
import { LineChart } from '@/components/charts/LineChart';
import { ScoreBreakdown } from '@/components/charts/ScoreBreakdown';
import { ScoreMeter } from '@/components/charts/ScoreMeter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout, Loading } from '@/components/ui/Feedback';
import { Field, FormRow, Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { DescriptionList, Grid, Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { DataTable } from '@/components/ui/Table';
import { api, ApiError } from '@/lib/api/client';
import { keys, useApiMutation, useVerificationEvidence } from '@/lib/api/queries';
import type {
  AssetDetail,
  VerificationDetail,
  VerificationResult as Result,
} from '@/lib/api/types';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatQuantity,
  unitLabel,
} from '@/lib/format';
import { EXTERNAL_SOURCE_LABELS, METRIC_LABELS, SOURCE_LABELS, TRIGGER_LABELS } from '@/lib/labels';
import { useCan } from '@/lib/permissions';
import { EvidenceGallery, fromVerificationEvidence, type GalleryItem } from './EvidenceGallery';
import { ReportActions } from './ReportActions';
import { OutcomeBadge, RiskBadge, SeverityBadge, SimulatedBadge } from './StatusBadges';
import styles from './domain.module.css';

const toneFor = (outcome: Result['outcome']) =>
  outcome === 'VERIFIED' ? 'success' : outcome === 'REJECTED' ? 'critical' : 'warning';

const metric = (run: VerificationDetail, key: string) =>
  run.metrics.find((m) => m.key === key)?.value ?? null;

function formatMetric(key: string, value: number, unit: string | null): string {
  if (key === 'location_verified') return value === 1 ? 'Sí' : 'No';
  if (key.endsWith('_score') || key === 'final_score' || key === 'weighted_score')
    return formatNumber(value, 1);
  if (key === 'match_percentage' || key === 'cloud_cover_pct' || key === 'area_change_pct')
    return formatPercent(value, 1);
  if (key === 'coverage_ratio') return formatPercent(value * 100, 1);
  if (key === 'detection_confidence' || key === 'image_quality_avg')
    return formatPercent(value * 100, 0);
  if (key === 'ndvi_mean') return formatNumber(value, 2);
  if (
    unit === 'HEAD' ||
    unit === 'HECTARE' ||
    unit === 'TONNE' ||
    unit === 'UNIT' ||
    unit === 'CUBIC_METER'
  ) {
    return formatQuantity(value, unit);
  }
  return formatNumber(value, 2);
}

function GuaranteeDialog({
  run,
  asset,
  onClose,
}: {
  run: VerificationDetail;
  asset: AssetDetail;
  onClose: () => void;
}) {
  const result = run.result!;
  const covered = Math.min(
    result.detectedQuantity ?? result.declaredQuantity,
    result.declaredQuantity,
  );
  const [quantity, setQuantity] = useState(String(covered));
  const [valuation, setValuation] = useState(
    asset.declaredValue !== null
      ? String(Math.round((asset.declaredValue * covered) / result.declaredQuantity))
      : '',
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirm = useApiMutation(
    (body: object) => api(`/verifications/${run.id}/guarantee`, { method: 'POST', body }),
    [keys.asset(asset.id), keys.portfolio, keys.dashboard, keys.assets({})],
  );

  const submit = async () => {
    setError(null);
    try {
      await confirm.mutateAsync({
        coveredQuantity: Number(quantity),
        valuation: valuation ? Number(valuation) : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible confirmar la garantía.');
    }
  };

  return (
    <Modal
      open
      title="Confirmar como garantía"
      description={`${asset.name} · verificación del ${formatDateTime(run.completedAt)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="shield"
            loading={confirm.isPending}
            onClick={() => void submit()}
            data-testid="confirm-guarantee-submit"
          >
            Confirmar garantía
          </Button>
        </>
      }
    >
      <div className={styles.stackTight}>
        <p className={styles.muted}>
          La garantía queda vinculada a esta verificación (score {result.finalScore}/100) y el
          activo pasa a monitoreo continuo.
        </p>
        <FormRow columns={2}>
          <Field
            label={`Cantidad en garantía (${unitLabel(result.unit)})`}
            hint={`Máximo ${formatQuantity(result.declaredQuantity, result.unit)}`}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            )}
          </Field>
          <Field label={`Valuación (${asset.currency})`}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={valuation}
                onChange={(e) => setValuation(e.target.value)}
              />
            )}
          </Field>
        </FormRow>
        <Field label="Observaciones">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {error ? <Callout tone="critical">{error}</Callout> : null}
      </div>
    </Modal>
  );
}

function CrossChecks({ run }: { run: VerificationDetail }) {
  const result = run.result!;
  const registry = run.externalData[0];
  const registered =
    typeof registry?.payload.registeredHeads === 'number' ? registry.payload.registeredHeads : null;
  const camerasExpected = metric(run, 'cameras_expected');
  const camerasReporting = metric(run, 'cameras_reporting');
  const rows: { label: string; ok: boolean | null; detail: string; simulated?: boolean }[] = [];

  rows.push({
    label: 'Ubicación de la evidencia',
    ok: result.locationVerified,
    detail:
      result.locationVerified === null
        ? 'Sin evidencia georreferenciada para contrastar.'
        : result.locationVerified
          ? 'Dentro del establecimiento declarado.'
          : `A ${formatNumber(result.locationDistanceM)} m del límite declarado.`,
  });
  if (registry) {
    rows.push({
      label: EXTERNAL_SOURCE_LABELS[registry.source] ?? registry.source,
      ok:
        registry.status === 'OK' && registered !== null
          ? Math.abs(registered - result.declaredQuantity) / result.declaredQuantity <= 0.05
          : false,
      detail:
        registry.status === 'OK' && registered !== null
          ? `${formatNumber(registered)} cabezas registradas (RENSPA ${registry.subjectRef}).`
          : registry.status === 'NOT_FOUND'
            ? 'Sin registro para el RENSPA informado.'
            : 'Consulta no disponible.',
      simulated: registry.simulated,
    });
  }
  if (camerasExpected !== null && camerasExpected > 0) {
    rows.push({
      label: 'Cámaras que reportaron',
      ok: camerasReporting === camerasExpected,
      detail: `${formatNumber(camerasReporting)} de ${formatNumber(camerasExpected)} instaladas.`,
    });
  }
  return (
    <ul className={styles.requirements}>
      {rows.map((row) => (
        <li key={row.label} className={styles.requirement}>
          <span className={styles.stackTight} style={{ gap: 2 }}>
            <span
              className={`${styles.requirementName} ${row.ok === false ? styles.requirementMissing : row.ok ? styles.requirementOk : ''}`}
            >
              <Icon name={row.ok === null ? 'info' : row.ok ? 'check' : 'warning'} size={16} />
              <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
              {row.simulated ? <SimulatedBadge /> : null}
            </span>
            <span className={styles.muted}>{row.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Resultado completo de una verificación: score explicable, evidencia, cruces e historial. */
export function VerificationResultView({
  run,
  asset,
}: {
  run: VerificationDetail;
  asset: AssetDetail;
}) {
  const can = useCan();
  const [confirming, setConfirming] = useState(false);
  const evidence = useVerificationEvidence(run.id, run.status === 'COMPLETED');
  const result = run.result;
  if (!result) return null;

  const unit = result.unit;
  const isCount = result.detectedQuantity !== null;
  const confidence = metric(run, 'detection_confidence') ?? result.confidence;
  const gallery: GalleryItem[] = (evidence.data ?? [])
    .map((link) => fromVerificationEvidence(link, unitLabel(unit)))
    .filter((item): item is GalleryItem => item !== null)
    .sort((a, b) => (a.role === 'EXCLUDED' ? 1 : 0) - (b.role === 'EXCLUDED' ? 1 : 0));
  const history = [
    ...run.history,
    {
      verificationId: run.id,
      completedAt: run.completedAt!,
      finalScore: result.finalScore,
      declaredQuantity: result.declaredQuantity,
      detectedQuantity: result.detectedQuantity,
      outcome: result.outcome,
    },
  ]
    .filter((h, i, all) => all.findIndex((x) => x.verificationId === h.verificationId) === i)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const isLatest = asset.lastVerificationRunId === run.id;
  const guaranteeForRun = asset.guarantee && asset.guarantee.status === 'ACTIVE';
  const canConfirm =
    can('guarantees:confirm') && result.outcome === 'VERIFIED' && isLatest && !guaranteeForRun;

  return (
    <div className={styles.stack} data-testid="verification-result">
      <Panel
        title="Resultado de la verificación"
        subtitle={`${formatDateTime(run.completedAt)} · ${TRIGGER_LABELS[run.trigger] ?? run.trigger}`}
        actions={
          <span className={styles.inline}>
            <ReportActions verificationId={run.id} assetId={run.assetId} />
            {canConfirm ? (
              <Button
                variant="primary"
                icon="shield"
                onClick={() => setConfirming(true)}
                data-testid="confirm-guarantee"
              >
                Confirmar como garantía
              </Button>
            ) : null}
          </span>
        }
      >
        <div className={styles.resultHead}>
          <div className={styles.stackTight}>
            <ScoreMeter score={result.finalScore} tone={toneFor(result.outcome)} />
            <div className={styles.inline}>
              <OutcomeBadge outcome={result.outcome} />
              <RiskBadge level={result.riskLevel} />
            </div>
          </div>
          <div className={styles.stackTight}>
            <StatRow>
              <Stat
                label="Declarado"
                value={formatNumber(result.declaredQuantity, unit === 'HECTARE' ? 1 : 0)}
                caption={unitLabel(unit, result.declaredQuantity)}
                testId="stat-declared"
              />
              {isCount ? (
                <>
                  <Stat
                    label={unit === 'HECTARE' ? 'Con vegetación activa' : 'Detectado'}
                    value={formatNumber(result.detectedQuantity, unit === 'HECTARE' ? 1 : 0)}
                    caption={`${unitLabel(unit, result.detectedQuantity ?? 0)} · dif. ${formatNumber(result.difference, unit === 'HECTARE' ? 1 : 0)}`}
                    testId="stat-detected"
                  />
                  <Stat
                    label="Coincidencia"
                    value={formatPercent(result.matchPercentage, 0)}
                    caption={`${formatPercent(result.matchPercentage, 1)} exacto`}
                    testId="stat-match"
                  />
                </>
              ) : (
                <Stat
                  label="Evidencias válidas"
                  value={formatNumber(metric(run, 'evidence_primary_count'))}
                  caption="imágenes utilizadas"
                />
              )}
              <Stat
                label="Confianza"
                value={formatPercent(confidence * 100, 0)}
                caption={isCount ? 'del conteo' : 'de la evidencia'}
              />
            </StatRow>
            <p className={styles.summaryText}>{result.summary}</p>
            {asset.guarantee && asset.guarantee.verificationRunId === run.id ? (
              <Callout tone="success" title="Confirmado como garantía">
                {formatQuantity(asset.guarantee.coveredQuantity, unit)} · valuación{' '}
                {formatMoney(asset.guarantee.valuation, asset.guarantee.currency)} · desde{' '}
                {formatDate(asset.guarantee.confirmedAt)}
              </Callout>
            ) : null}
            {result.outcome === 'VERIFIED' && !isLatest ? (
              <Callout tone="neutral">Existe una verificación más reciente de este activo.</Callout>
            ) : null}
          </div>
        </div>
      </Panel>

      <Grid columns="main-side">
        <Panel
          title="Composición del score"
          subtitle={`Modelo ${result.scoringModelVersion} · suma ponderada de cinco componentes`}
          footer={
            result.riskPenalty > 0
              ? `Penalización por anomalías: −${formatNumber(result.riskPenalty, 1)} puntos.`
              : 'Sin penalización por anomalías.'
          }
        >
          <ScoreBreakdown components={result.components} showFactors />
        </Panel>
        <div className={styles.stack}>
          <Panel title="Controles cruzados">
            <CrossChecks run={run} />
          </Panel>
          <Panel title="Anomalías">
            {result.anomalies.length === 0 ? (
              <p className={styles.muted}>No se detectaron anomalías.</p>
            ) : (
              <ul className={styles.requirements}>
                {result.anomalies.map((a) => (
                  <li
                    key={a.code}
                    className={styles.requirement}
                    style={{ alignItems: 'flex-start' }}
                  >
                    <span>{a.message}</span>
                    <SeverityBadge severity={a.severity} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Grid>

      <Panel
        title="Evidencia analizada"
        subtitle="Cada imagen con su conteo, modelo, confianza, ubicación y hora de captura."
      >
        {evidence.isPending ? <Loading /> : <EvidenceGallery items={gallery} />}
      </Panel>

      <Grid columns="2">
        <Panel title="Historial de score" subtitle={`${history.length} verificaciones`}>
          {history.length > 1 ? (
            <LineChart
              label="Evolución del score de verificación"
              points={history.map((h) => ({
                x: new Date(h.completedAt),
                y: h.finalScore,
                label: `${formatDate(h.completedAt)} · ${formatQuantity(h.detectedQuantity, unit)}`,
              }))}
              formatY={(v) => formatNumber(v)}
              formatX={(d) => formatDate(d)}
              yDomain={[0, 100]}
            />
          ) : (
            <p className={styles.muted}>Primera verificación del activo.</p>
          )}
          <DataTable
            caption="Verificaciones anteriores"
            rows={[...history].reverse().slice(0, 6)}
            rowKey={(h) => h.verificationId}
            columns={[
              { key: 'date', header: 'Fecha', render: (h) => formatDate(h.completedAt) },
              {
                key: 'detected',
                header: 'Detectado',
                numeric: true,
                render: (h) => formatQuantity(h.detectedQuantity, unit),
              },
              { key: 'score', header: 'Score', numeric: true, render: (h) => h.finalScore },
              {
                key: 'outcome',
                header: 'Resultado',
                render: (h) => <OutcomeBadge outcome={h.outcome} />,
              },
            ]}
          />
        </Panel>
        <Panel title="Trazabilidad">
          <DescriptionList
            items={[
              [
                'Verificación',
                <span key="id" className={styles.mono}>
                  {run.id}
                </span>,
              ],
              ['Solicitada', formatDateTime(run.queuedAt)],
              [
                'Procesada',
                `${formatDateTime(run.startedAt)} → ${formatDateTime(run.completedAt)}`,
              ],
              ['Intentos', formatNumber(run.attempts)],
              ['Pipeline', run.pipelineVersion],
              ['Modelo de scoring', result.scoringModelVersion],
              [
                'Pesos',
                result.components
                  .map((c) => `${c.label} ${formatNumber(c.weight * 100)} %`)
                  .join(' · '),
              ],
              [
                'Modelos de análisis',
                Array.from(new Set(gallery.map((g) => g.model).filter(Boolean))).join(', ') || '—',
              ],
            ]}
          />
          {gallery.some((g) => g.simulated) || run.externalData.some((e) => e.simulated) ? (
            <div style={{ marginTop: 12 }}>
              <Callout tone="neutral" title="Fuentes simuladas">
                Parte de la evidencia proviene de fuentes simuladas de desarrollo (identificadas con
                la etiqueta “Simulado”). No constituye una observación real.
              </Callout>
            </div>
          ) : null}
        </Panel>
      </Grid>

      <Panel title="Métricas registradas" flush>
        <DataTable
          caption="Métricas de la verificación"
          rows={run.metrics}
          rowKey={(m) => m.key}
          columns={[
            { key: 'name', header: 'Métrica', render: (m) => METRIC_LABELS[m.key] ?? m.key },
            {
              key: 'value',
              header: 'Valor',
              numeric: true,
              render: (m) => formatMetric(m.key, m.value, m.unit),
            },
            {
              key: 'source',
              header: 'Fuente',
              render: (m) => <Badge tone="neutral">{SOURCE_LABELS[m.source] ?? m.source}</Badge>,
            },
          ]}
        />
      </Panel>

      {confirming ? (
        <GuaranteeDialog run={run} asset={asset} onClose={() => setConfirming(false)} />
      ) : null}
    </div>
  );
}
