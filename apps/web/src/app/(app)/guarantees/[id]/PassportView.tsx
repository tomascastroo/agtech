'use client';

import { useState } from 'react';
import styles from '@/components/domain/domain.module.css';
import { DemoBadge } from '@/components/domain/StatusBadges';
import { Badge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, EmptyState, ErrorState, Loading } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { DescriptionList, Grid, Panel } from '@/components/ui/Panel';
import { Stat, StatRow } from '@/components/ui/Stat';
import { DataTable } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { ApiError } from '@/lib/api/client';
import {
  METHOD_LABELS,
  ORIGIN_LABELS,
  RISK_LABELS,
  RISK_TONE,
  STATE_LABELS,
  useGuaranteeAction,
  usePassport,
  type CollateralState,
  type Passport,
} from '@/lib/api/collateral';
import { useCan } from '@/lib/permissions';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { StateBadge } from '../GuaranteesView';
import { PassportForm, type FormKind } from './PassportForms';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v as string));

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'identidad', label: 'Identidad y garantía' },
  { id: 'declaracion', label: 'Declaración' },
  { id: 'bovinos', label: 'Bovinos y evidencia' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'documentos', label: 'Fuentes y documentos' },
  { id: 'verificaciones', label: 'Verificaciones' },
  { id: 'score', label: 'Score' },
  { id: 'cobertura', label: 'Cobertura y riesgo' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'inspecciones', label: 'Inspecciones' },
  { id: 'historial', label: 'Historial' },
];

const TRUST_TONE: Record<string, 'success' | 'warning' | 'critical' | 'info' | 'neutral'> = {
  SI: 'success',
  SI_EN_MONITOREO: 'success',
  CON_RESERVAS: 'warning',
  NO: 'critical',
  NO_DETERMINABLE: 'critical',
  TODAVIA_NO: 'info',
  NO_APLICA: 'neutral',
};

/** Asset Passport de una garantía bovina. Cada dato muestra su fuente, fecha, método y confianza. */
export function PassportView({ id }: { id: string }) {
  const query = usePassport(id);
  const [tab, setTab] = useState('resumen');
  const [form, setForm] = useState<{
    kind: FormKind;
    inspectionId?: string;
    documentType?: string;
  } | null>(null);
  const recalc = useGuaranteeAction<{ state: string }>(id);
  const can = useCan();
  const manage = can('monitoring:manage');
  const run = can('verifications:run');

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const p = query.data;
  const h = p.header;
  const active = h.state !== 'FINALIZADA';
  const declared = p.declaration.current !== null;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: '/guarantees', label: 'Garantías bovinas' }]}
        title={<span data-testid="passport-code">GARANTÍA #{h.code}</span>}
        badge={
          <>
            <StateBadge state={h.state} />
            {h.dataSource === 'DEMO' ? <DemoBadge /> : null}
          </>
        }
        description={`${p.identity.producerName} · ${p.identity.establishment?.name ?? 'Establecimiento pendiente'} · ${p.identity.productionLabel}`}
        actions={
          <div className={styles.inline}>
            <LinkButton external icon="download" href={`/api/bovine-guarantees/${id}/passport.pdf`}>
              Passport PDF
            </LinkButton>
            {manage && declared && active ? (
              <Button
                icon="refresh"
                loading={recalc.isPending}
                onClick={() => recalc.mutate({ path: '/recalculate' })}
              >
                Recalcular
              </Button>
            ) : null}
          </div>
        }
      />
      <div className={styles.stack}>
        {h.dataSource === 'DEMO' ? (
          <Callout tone="warning" title="DATOS DE DEMOSTRACIÓN">
            Garantía ficticia: no tiene valor como respaldo y no cuenta en los indicadores.
          </Callout>
        ) : null}
        <Callout
          tone={TRUST_TONE[h.trust.verdict] ?? 'info'}
          title="¿Puedo confiar hoy en esta garantía?"
        >
          <span data-testid="trust-answer">{h.trust.text}</span>
          {h.stateReason ? <div className={styles.small}>Motivo: {h.stateReason}</div> : null}
        </Callout>
        <StatRow>
          <Stat testId="passport-state" label="Estado" value={STATE_LABELS[h.state]} small />
          <Stat
            testId="passport-score"
            label="Score"
            value={h.score === null ? '—' : `${h.score}/100`}
            small
          />
          <Stat
            testId="passport-coverage"
            label="Cobertura"
            value={
              h.coverage.status === 'DETERMINADA' && h.coverage.ratio !== null
                ? `${formatNumber(h.coverage.ratio, 2)}×`
                : 'No determinable'
            }
            caption={
              h.coverage.verifiableValue !== null
                ? `Valor verificable ${formatMoney(h.coverage.verifiableValue, h.coverage.currency)}`
                : undefined
            }
            small
          />
          <Stat
            label="Riesgo"
            value={
              h.riskLevel ? (
                <Badge tone={RISK_TONE[h.riskLevel]}>{RISK_LABELS[h.riskLevel]}</Badge>
              ) : (
                '—'
              )
            }
            small
          />
          <Stat label="Última verificación" value={formatDate(h.lastVerificationAt)} small />
          <Stat
            label="Próxima"
            value={formatDate(h.nextVerificationAt)}
            caption={p.schedule?.recommendedMethodLabel}
            small
          />
        </StatRow>
        {active ? (
          <div className={styles.inline} data-testid="passport-actions">
            {manage && declared ? (
              <Button icon="plus" onClick={() => setForm({ kind: 'movement' })}>
                Movimiento
              </Button>
            ) : null}
            {run && declared ? (
              <Button icon="camera" onClick={() => setForm({ kind: 'evidence' })}>
                Evidencia
              </Button>
            ) : null}
            {manage && declared ? (
              <Button icon="upload" onClick={() => setForm({ kind: 'document' })}>
                Documento oficial
              </Button>
            ) : null}
            {manage && declared ? (
              <Button icon="user" onClick={() => setForm({ kind: 'requestInspection' })}>
                Solicitar inspección
              </Button>
            ) : null}
            {run && declared ? (
              <Button icon="shield" onClick={() => setForm({ kind: 'inspection' })}>
                Registrar inspección
              </Button>
            ) : null}
            {manage ? (
              <Button icon="file" onClick={() => setForm({ kind: 'legal' })}>
                Datos legales
              </Button>
            ) : null}
            {manage ? (
              <Button icon="scale" onClick={() => setForm({ kind: 'valuation' })}>
                Valuación
              </Button>
            ) : null}
            {manage && declared ? (
              <Button variant="ghost" onClick={() => setForm({ kind: 'correction' })}>
                Corregir declaración
              </Button>
            ) : null}
            {manage ? (
              <Button variant="ghost" onClick={() => setForm({ kind: 'finalize' })}>
                Finalizar
              </Button>
            ) : null}
          </div>
        ) : null}
        {recalc.isError ? (
          <Callout tone="critical">
            {recalc.error instanceof ApiError ? recalc.error.message : 'No se pudo recalcular'}
          </Callout>
        ) : null}
        <Tabs
          items={TABS.map((t) => ({
            ...t,
            count:
              t.id === 'alertas'
                ? p.alerts.filter((a) => a.status !== 'RESOLVED' && a.status !== 'DISMISSED').length
                : undefined,
          }))}
          active={tab}
          onChange={setTab}
        />
        <Section tab={tab} p={p} onForm={setForm} canRecord={run} />
      </div>
      {form ? (
        <PassportForm
          kind={form.kind}
          passport={p}
          inspectionId={form.inspectionId}
          documentType={form.documentType}
          onClose={() => setForm(null)}
        />
      ) : null}
    </>
  );
}

function Section({
  tab,
  p,
  onForm,
  canRecord,
}: {
  tab: string;
  p: Passport;
  onForm: (f: { kind: FormKind; inspectionId?: string; documentType?: string }) => void;
  canRecord: boolean;
}) {
  const b = p.bovines;
  switch (tab) {
    case 'resumen':
      return (
        <Grid columns="main-side">
          <Panel title="Declarado, esperado, observado, verificado" id="bovines-summary">
            <StatRow>
              <Stat
                testId="heads-declared"
                label="Declarado"
                value={formatNumber(b.declared)}
                small
              />
              <Stat
                label="Movimientos"
                value={`−${formatNumber(b.exits)} / +${formatNumber(b.entries)}`}
                small
              />
              <Stat
                testId="heads-expected"
                label="Esperado"
                value={formatNumber(b.expected)}
                small
              />
              <Stat
                testId="heads-observed"
                label="Observado"
                value={formatNumber(b.observed)}
                caption={
                  b.observedBasis
                    ? `${b.observedBasis === 'CENSO' ? 'Conteo completo' : 'Parcial (cota inferior)'} · ${METHOD_LABELS[b.observedMethod ?? ''] ?? ''}`
                    : 'Sin observación'
                }
                small
              />
              <Stat
                testId="heads-verified"
                label="Verificable"
                value={formatNumber(b.verifiable)}
                small
              />
            </StatRow>
            <ul className={styles.factors} data-testid="reconciliation-narrative">
              {b.narrative.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {b.observationChoice ? <p className={styles.small}>{b.observationChoice}</p> : null}
          </Panel>
          <Panel title="Agenda de verificación">
            {p.schedule ? (
              <DescriptionList
                items={[
                  [
                    'Frecuencia',
                    `cada ${p.schedule.frequencyDays} días (riesgo ${p.schedule.riskLevel})`,
                  ],
                  ['Método recomendado', p.schedule.recommendedMethodLabel],
                  ['Evidencia válida hasta', `${p.schedule.maxEvidenceAgeDays} días`],
                  ['Próxima', formatDateTime(p.schedule.nextVerificationAt)],
                  [
                    'Inspección',
                    p.schedule.requiresInspection ? 'Exigida por el riesgo' : 'Por excepción',
                  ],
                ]}
              />
            ) : (
              <p className={styles.muted}>Se programa después de la verificación inicial.</p>
            )}
            <p className={styles.small}>{p.identity.strategy}</p>
          </Panel>
        </Grid>
      );
    case 'identidad':
      return (
        <Grid>
          <Panel title="Identidad">
            <DescriptionList
              items={[
                ['Productor', `${p.identity.producerName} (CUIT ${p.identity.producerTaxId})`],
                ['Establecimiento', p.identity.establishment?.name],
                ['RENSPA (declarado)', p.identity.establishment?.renspa],
                [
                  'Ubicación',
                  p.identity.establishment
                    ? `${s(p.identity.establishment.locality)}, ${p.identity.establishment.province}`
                    : null,
                ],
                ['Rodeo', p.identity.asset?.name],
                ['Tipo de producción', p.identity.productionLabel],
              ]}
            />
          </Panel>
          <Panel title="Garantía legal" subtitle={p.legal.note}>
            <DescriptionList
              items={[
                [
                  'Instrumento',
                  `${p.legal.instrument.replace('_', ' ')}${p.legal.identifier ? ` · ${p.legal.identifier}` : ''}`,
                ],
                ['Estado registral', p.legal.status.replace('_', ' ')],
                ['Prioridad', p.legal.lienPriority],
                [
                  'Inmovilización',
                  `${p.legal.immobilizationStatus.replace('_', ' ')}${p.legal.immobilizationReference ? ` · ${p.legal.immobilizationReference}` : ''}`,
                ],
                ['Monto', formatMoney(p.legal.amount, p.legal.currency)],
                ['Deuda vigente', formatMoney(p.legal.debtAmount, p.legal.currency)],
                [
                  'Otorgamiento / vencimiento',
                  `${formatDate(p.legal.grantedAt)} / ${formatDate(p.legal.expiresAt)}`,
                ],
              ]}
            />
            {p.legal.notInformed.length ? (
              <Callout tone="warning">No informado: {p.legal.notInformed.join(', ')}.</Callout>
            ) : null}
          </Panel>
        </Grid>
      );
    case 'declaracion':
      return (
        <Panel
          title="Declaración del productor"
          subtitle="Inmutable: cada corrección crea una versión nueva con motivo, fecha y usuario."
        >
          <DataTable<Row>
            caption="Versiones de la declaración"
            rows={p.declaration.versions as unknown as Row[]}
            rowKey={(r) => String(r.version)}
            empty={
              <EmptyState title="Sin declaración">
                El productor todavía no envió su declaración.
              </EmptyState>
            }
            columns={[
              {
                key: 'v',
                header: 'Versión',
                render: (r) =>
                  r === (p.declaration.versions[0] as unknown) ? (
                    <strong>v{s(r.version)} (vigente)</strong>
                  ) : (
                    `v${s(r.version)}`
                  ),
              },
              {
                key: 'h',
                header: 'Cabezas',
                numeric: true,
                render: (r) => formatNumber(r.heads as number),
              },
              {
                key: 'c',
                header: 'Categorías',
                render: (r) =>
                  ((r.categories as { category: string; heads: number }[]) ?? [])
                    .map((c) => `${c.category}: ${c.heads}`)
                    .join(', ') || '—',
              },
              { key: 'src', header: 'Fuente', render: (r) => s(r.source) },
              { key: 'by', header: 'Declarado por', render: (r) => s(r.declaredBy) },
              { key: 'at', header: 'Fecha', render: (r) => formatDateTime(r.declaredAt as string) },
              { key: 'reason', header: 'Motivo', render: (r) => s(r.reason) },
            ]}
          />
        </Panel>
      );
    case 'bovinos':
      return (
        <div className={styles.stack}>
          <Panel
            title="Evidencia física"
            subtitle="Origen, fecha, GPS, dispositivo, usuario, hash y calidad de cada captura."
          >
            <DataTable<Row>
              caption="Evidencia"
              rows={p.evidence}
              rowKey={(r) => String(r.id)}
              empty={<EmptyState title="Sin evidencia física" />}
              columns={[
                {
                  key: 'at',
                  header: 'Captura',
                  render: (r) => formatDateTime(r.capturedAt as string),
                },
                {
                  key: 't',
                  header: 'Tipo',
                  render: (r) => `${s(r.type)}${r.scanMode ? ` · ${s(r.scanMode)}` : ''}`,
                },
                {
                  key: 'o',
                  header: 'Origen',
                  render: (r) => (
                    <Badge
                      tone={
                        r.captureOrigin === 'CAPTURA_EN_CAMPO' ||
                        r.captureOrigin === 'DISPOSITIVO_FIJO'
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {ORIGIN_LABELS[String(r.captureOrigin)] ?? s(r.captureOrigin)}
                    </Badge>
                  ),
                },
                {
                  key: 'g',
                  header: 'GPS',
                  render: (r) =>
                    r.location
                      ? `${s(r.locationSource)}${r.accuracyM ? ` ±${formatNumber(r.accuracyM as number)} m` : ''}`
                      : 'Sin GPS',
                },
                {
                  key: 'c',
                  header: 'Detectados',
                  numeric: true,
                  render: (r) => formatNumber(r.detectedCount as number | null),
                },
                {
                  key: 'st',
                  header: 'Estado',
                  render: (r) =>
                    r.simulated ? <Badge tone="warning">SIMULADA</Badge> : s(r.evidenceStatus),
                },
                {
                  key: 'u',
                  header: 'Dispositivo / usuario',
                  render: (r) => s(r.deviceName ?? r.uploadedBy),
                },
                {
                  key: 'h',
                  header: 'SHA-256',
                  render: (r) => <span className={styles.mono}>{s(r.sha256).slice(0, 12)}</span>,
                },
                { key: 'ch', header: 'Desafío', render: (r) => s(r.challengeCode) },
              ]}
            />
          </Panel>
          <Panel
            title="Identificación individual (Manga + RFID)"
            subtitle="Una caravana solo cuenta si el paso por la manga la asoció a un único animal en cámara."
          >
            <StatRow>
              <Stat
                testId="rfid-identified"
                label="Caravanas identificadas"
                value={formatNumber(p.rfid.identified)}
                small
              />
              <Stat
                label="Pasos ambiguos (rechazados)"
                value={formatNumber(p.rfid.ambiguous)}
                small
              />
              <Stat
                label="Evidencia insuficiente"
                value={formatNumber(p.rfid.insufficient)}
                small
              />
              <Stat
                label="Lecturas simuladas excluidas"
                value={formatNumber(p.rfid.simulatedExcluded)}
                small
              />
            </StatRow>
          </Panel>
        </div>
      );
    case 'movimientos':
      return (
        <Panel
          title="Movimientos"
          subtitle="OFICIAL (fuente conectada, hoy ninguna) · DOCUMENTADO (DT-e cargado) · DECLARADO (sin respaldo)."
        >
          <DataTable<Row>
            caption="Movimientos"
            rows={p.movements}
            rowKey={(r) => String(r.id)}
            empty={<EmptyState title="Sin movimientos registrados" />}
            columns={[
              { key: 'at', header: 'Fecha', render: (r) => formatDate(r.occurredAt as string) },
              {
                key: 'd',
                header: 'Tipo',
                render: (r) =>
                  `${r.direction === 'EGRESO' ? 'Egreso' : 'Ingreso'} · ${s(r.kind).toLowerCase()}`,
              },
              {
                key: 'h',
                header: 'Cabezas',
                numeric: true,
                render: (r) => formatNumber(r.heads as number),
              },
              {
                key: 'od',
                header: 'Origen → destino',
                render: (r) => `${s(r.origin)} → ${s(r.destination)}`,
              },
              {
                key: 'src',
                header: 'Fuente',
                render: (r) => (
                  <Badge tone={r.sourceLevel === 'DECLARADO' ? 'warning' : 'info'}>
                    {s(r.sourceLevel)}
                  </Badge>
                ),
              },
              { key: 'doc', header: 'Respaldo', render: (r) => s(r.sourceLabel) },
              { key: 'v', header: 'Verificación', render: (r) => s(r.verificationState) },
            ]}
          />
        </Panel>
      );
    case 'documentos':
      return (
        <div className={styles.stack}>
          <Panel
            title="Fuentes oficiales"
            subtitle="Ninguna fuente oficial está conectada. Se puede trabajar con documentos oficiales cargados."
          >
            <div className={styles.stackTight} data-testid="official-sources">
              {p.officialSources.map((o) => (
                <div key={o.code} className={styles.spread} data-testid={`source-${o.code}`}>
                  <div>
                    <strong>{o.name}</strong>
                    <div className={styles.small}>
                      {o.scope} · {o.detail}
                    </div>
                    {o.documents.map((d) => (
                      <div key={d.id} className={styles.small}>
                        {d.title} · {formatDate(d.uploadedAt)} · OCR {s(d.analysis)}
                      </div>
                    ))}
                  </div>
                  <div className={styles.inline}>
                    <Badge
                      tone={
                        o.status === 'DOCUMENTO_CARGADO'
                          ? 'info'
                          : o.status === 'CONECTADA'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {o.statusLabel.toUpperCase()}
                    </Badge>
                    {o.action ? (
                      <Button
                        size="sm"
                        icon="upload"
                        onClick={() =>
                          onForm({ kind: 'document', documentType: o.documentTypes[0] })
                        }
                      >
                        {o.action}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Documentos cargados">
            <DataTable<Row>
              caption="Documentos"
              rows={p.documents}
              rowKey={(r) => String(r.id)}
              empty={<EmptyState title="Sin documentos" />}
              columns={[
                { key: 't', header: 'Tipo', render: (r) => s(r.type) },
                { key: 'n', header: 'Título', render: (r) => s(r.title) },
                { key: 'at', header: 'Cargado', render: (r) => formatDate(r.createdAt as string) },
                { key: 'a', header: 'Lectura OCR', render: (r) => s(r.analysisStatus) },
                {
                  key: 'h',
                  header: 'SHA-256',
                  render: (r) => <span className={styles.mono}>{s(r.sha256).slice(0, 12)}</span>,
                },
              ]}
            />
          </Panel>
        </div>
      );
    case 'verificaciones':
      return (
        <Panel
          title="Verificaciones"
          subtitle="Cada verificación con su método, lo declarado, esperado, observado y verificado."
        >
          <DataTable<Row>
            caption="Verificaciones"
            rows={p.verifications}
            rowKey={(r) => String(r.id)}
            empty={<EmptyState title="Sin verificaciones" />}
            columns={[
              { key: 'at', header: 'Fecha', render: (r) => formatDateTime(r.verifiedAt as string) },
              {
                key: 'm',
                header: 'Método',
                render: (r) => METHOD_LABELS[String(r.method)] ?? s(r.method),
              },
              {
                key: 'n',
                header: 'Decl. / Esp. / Obs. / Verif.',
                render: (r) =>
                  `${formatNumber(r.declared as number)} / ${formatNumber(r.expected as number)} / ${formatNumber(r.observed as number)} / ${formatNumber(r.verified as number | null)}`,
              },
              {
                key: 'b',
                header: 'Base',
                render: (r) => (r.countBasis === 'CENSO' ? 'Completo' : 'Parcial'),
              },
              {
                key: 'q',
                header: 'Calidad',
                render: (r) => (
                  <span title={((r.qualityReasons as string[]) ?? []).join(' ')}>
                    {s(r.quality)}
                  </span>
                ),
              },
              {
                key: 'o',
                header: 'Origen',
                render: (r) => ORIGIN_LABELS[String(r.captureOrigin)] ?? s(r.captureOrigin),
              },
              {
                key: 'r',
                header: 'Estado resultante',
                render: (r) => <StateBadge state={r.resultState as CollateralState} />,
              },
              {
                key: 'e',
                header: 'Explicación',
                render: (r) => <span className={styles.small}>{s(r.explanation)}</span>,
              },
            ]}
          />
        </Panel>
      );
    case 'score':
      return p.score ? (
        <Panel
          title={`Collateral Effectiveness Score: ${p.score.value ?? '—'}/100`}
          subtitle={`Determinista y explicable (sin modelos estadísticos). Promedio ponderado ${p.score.weighted ?? '—'}, limitado por el eslabón más débil. Motor ${p.score.engineVersion}, evaluado ${formatDateTime(p.score.evaluatedAt)}.`}
        >
          {p.score.gates.length ? (
            <Callout tone="warning" title="Compuertas activas">
              <ul>
                {p.score.gates.map((g) => (
                  <li key={g.code} data-testid={`gate-${g.code}`}>
                    {g.code.replaceAll('_', ' ')} →{' '}
                    {STATE_LABELS[g.state as CollateralState] ?? g.state}: {g.explanation}
                  </li>
                ))}
              </ul>
            </Callout>
          ) : null}
          <DataTable
            caption="Componentes del score"
            rows={p.score.components}
            rowKey={(c) => c.code}
            columns={[
              { key: 'l', header: 'Componente', render: (c) => c.label },
              {
                key: 'v',
                header: 'Valor',
                numeric: true,
                render: (c) => (c.value === null ? 'sin datos' : c.value),
              },
              {
                key: 'w',
                header: 'Peso',
                numeric: true,
                render: (c) => formatNumber(c.weight * 100, 0) + ' %',
              },
              { key: 'e', header: 'Explicación', render: (c) => c.explanation },
            ]}
          />
        </Panel>
      ) : (
        <EmptyState title="Sin evaluación">Se calcula con la verificación inicial.</EmptyState>
      );
    case 'cobertura':
      return (
        <Grid>
          <Panel
            title="Cobertura monetaria"
            subtitle="Animales verificables × peso × precio de referencia × factor de calidad, contra la deuda."
          >
            {p.coverage?.status === 'DETERMINADA' ? (
              <DescriptionList
                items={[
                  ['Fórmula', p.coverage.formula],
                  [
                    'Valor verificable',
                    formatMoney(p.coverage.verifiableValue, p.coverage.currency),
                  ],
                  [
                    'Cobertura',
                    `${formatNumber(p.coverage.ratio, 2)}× sobre ${p.coverage.ratioBasis === 'DEUDA' ? 'la deuda' : 'el monto de la garantía'}`,
                  ],
                  [
                    'Sobre el monto',
                    p.coverage.guaranteeRatio === null
                      ? '—'
                      : `${formatNumber(p.coverage.guaranteeRatio, 2)}×`,
                  ],
                ]}
              />
            ) : (
              <Callout tone="warning" title="COBERTURA NO DETERMINABLE">
                Falta: {(p.coverage?.missing ?? ['evaluación']).join(', ')}. No se estiman pesos,
                precios ni valuaciones.
              </Callout>
            )}
            {(p.coverage?.warnings ?? []).map((w) => (
              <Callout key={w} tone="warning">
                {w}
              </Callout>
            ))}
            <DescriptionList
              items={[
                [
                  'Peso promedio',
                  p.valuation.averageWeightKg === null
                    ? null
                    : `${formatNumber(p.valuation.averageWeightKg, 1)} kg · ${s(p.valuation.weightSource)}`,
                ],
                [
                  'Precio',
                  p.valuation.pricePerKg === null
                    ? null
                    : `${formatNumber(p.valuation.pricePerKg, 4)} ${s(p.valuation.priceCurrency)}/kg · ${s(p.valuation.priceSource)} · ${formatDate(p.valuation.priceDate)}`,
                ],
                [
                  'Factor de calidad',
                  p.valuation.qualityFactor === null
                    ? null
                    : formatNumber(p.valuation.qualityFactor, 3),
                ],
              ]}
            />
          </Panel>
          <Panel
            title={`Riesgo ${p.risk ? RISK_LABELS[p.risk.level] : '—'}`}
            subtitle="Suma de factores explicados (0-1 bajo, 2-3 medio, 4-6 alto, 7+ crítico)."
          >
            {p.risk?.factors.length ? (
              <ul className={styles.factors}>
                {p.risk.factors.map((f) => (
                  <li key={f.code}>
                    +{f.points} · {f.explanation}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Sin factores de riesgo.</p>
            )}
          </Panel>
        </Grid>
      );
    case 'alertas':
      return (
        <Panel
          title="Alertas"
          subtitle="Qué pasó, por qué, con qué evidencia y qué acción se recomienda. Se gestionan en Alertas."
        >
          <div className={styles.stackTight}>
            {p.alerts.length === 0 ? <EmptyState title="Sin alertas" /> : null}
            {p.alerts.map((a) => {
              const c = (a.context ?? {}) as {
                what?: string;
                why?: string;
                evidence?: string[];
                action?: string;
              };
              return (
                <Callout
                  key={String(a.id)}
                  tone={
                    a.status === 'RESOLVED' || a.status === 'DISMISSED'
                      ? 'neutral'
                      : a.severity === 'CRITICAL'
                        ? 'critical'
                        : 'warning'
                  }
                  title={`${s(a.title)} · ${s(a.status)}`}
                >
                  <div data-testid={`alert-${s(a.type)}`}>
                    <div>
                      <strong>Qué pasó:</strong> {c.what ?? s(a.description)}
                    </div>
                    {c.why ? (
                      <div>
                        <strong>Por qué:</strong> {c.why}
                      </div>
                    ) : null}
                    {c.evidence?.length ? (
                      <div>
                        <strong>Evidencia:</strong> {c.evidence.join(' · ')}
                      </div>
                    ) : null}
                    <div>
                      <strong>Acción:</strong> {s(a.recommendedAction ?? c.action)}
                    </div>
                    <div className={styles.small}>
                      {formatDateTime(a.createdAt as string)}
                      {a.ownerName ? ` · Responsable: ${s(a.ownerName)}` : ''}
                      {a.resolutionNote ? ` · ${s(a.resolutionNote)}` : ''}
                    </div>
                  </div>
                </Callout>
              );
            })}
          </div>
        </Panel>
      );
    case 'inspecciones':
      return (
        <Panel
          title="Inspecciones presenciales"
          subtitle="Escalamiento: no reemplaza el monitoreo. El acta firmada no se puede modificar."
        >
          <DataTable<Row>
            caption="Inspecciones"
            rows={p.inspections}
            rowKey={(r) => String(r.id)}
            empty={<EmptyState title="Sin inspecciones" />}
            columns={[
              {
                key: 'rq',
                header: 'Solicitada',
                render: (r) => `${formatDate(r.requestedAt as string)} · ${s(r.reason)}`,
              },
              { key: 'st', header: 'Estado', render: (r) => s(r.status) },
              {
                key: 'pf',
                header: 'Realizada',
                render: (r) => formatDateTime(r.performedAt as string | null),
              },
              { key: 'in', header: 'Inspector', render: (r) => s(r.inspectorName) },
              {
                key: 'ob',
                header: 'Observados',
                numeric: true,
                render: (r) =>
                  r.observedHeads === null
                    ? '—'
                    : `${formatNumber(r.observedHeads as number)}${r.fullCount ? '' : ' (parcial)'}`,
              },
              { key: 'rs', header: 'Resultado', render: (r) => s(r.result) },
              {
                key: 'sg',
                header: 'Firma',
                render: (r) =>
                  r.signatureHash ? (
                    <span className={styles.mono}>
                      {s(r.signatureName)} · {s(r.signatureHash).slice(0, 10)}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'ac',
                header: '',
                render: (r) =>
                  r.status === 'SOLICITADA' && canRecord ? (
                    <Button
                      size="sm"
                      onClick={() => onForm({ kind: 'inspection', inspectionId: String(r.id) })}
                    >
                      Registrar resultado
                    </Button>
                  ) : null,
              },
            ]}
          />
        </Panel>
      );
    case 'historial':
      return (
        <Panel
          title="Historial"
          subtitle="Inmutable. Cada evento con fecha, fuente, actor, método, evidencia y resultado."
        >
          <ol className={styles.timeline} data-testid="passport-timeline">
            {p.history.map((e) => (
              <li key={String(e.id)}>
                <div className={styles.small}>
                  {formatDateTime(e.occurredAt as string)} · {s(e.source)} · {s(e.actor)}
                  {e.method ? ` · ${s(e.method)}` : ''}
                  {e.result ? ` · ${s(e.result)}` : ''}
                </div>
                <div>{s(e.summary)}</div>
              </li>
            ))}
          </ol>
          <Callout tone="neutral" title="Limitaciones">
            <ul>
              {p.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Callout>
        </Panel>
      );
    default:
      return null;
  }
}
