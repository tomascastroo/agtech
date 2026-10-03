'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DemoBanner } from '@/components/domain/DataLayersPanel';
import { DemoBadge } from '@/components/domain/StatusBadges';
import styles from '@/components/domain/domain.module.css';
import { Badge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Checkbox, Field, FormRow, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { api, ApiError } from '@/lib/api/client';
import { useApiMutation, useAssetTypes } from '@/lib/api/queries';
import type {
  DemoCreated,
  DemoScenarioOption,
  GuaranteeRequest,
  RequestCreationOptions,
} from '@/lib/api/types';
import form from './new-request.module.css';

type Mode = 'create' | 'demo';
const NEW_PRODUCER = '__new__';

/**
 * Nueva solicitud de garantía. Dos caminos:
 *  - Crear: productor (existente o nuevo) → establecimiento (si ya está registrado) → garantía →
 *    documentación requerida (producto de crédito) → invitación.
 *  - Simular: crea una solicitud completa con datos FICTICIOS (marcados DEMO) usando los mismos
 *    servicios que una real, para probar y presentar sin cargar formularios.
 */
export function NewRequestForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'demo' ? 'demo' : 'create');
  return (
    <>
      <PageHeader
        title="Nueva solicitud de garantía"
        description="La entidad define qué necesita; el productor declara y aporta; AgroGarantías verifica."
        breadcrumb={[{ href: '/requests', label: 'Solicitudes de garantía' }]}
      />
      <div className={styles.stack}>
        <div className={`${styles.optionGrid} ${styles.optionWide}`} role="radiogroup">
          <ModeCard
            active={mode === 'create'}
            onClick={() => setMode('create')}
            title="Crear solicitud"
            text="Para un productor real. Se genera un link de invitación personal."
          />
          <ModeCard
            active={mode === 'demo'}
            onClick={() => setMode('demo')}
            title="Simular solicitud"
            text="Datos ficticios precargados para probar o presentar el sistema."
            badge={<DemoBadge />}
          />
        </div>
        {mode === 'create' ? <CreateRequest /> : <SimulateRequest />}
      </div>
    </>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  text,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  text: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`${styles.option} ${active ? styles.optionSelected : ''}`}
      onClick={onClick}
    >
      <span className={styles.optionTitle}>
        {title} {badge}
      </span>
      <span className={styles.optionText}>{text}</span>
      {active ? (
        <span className={styles.optionCheck}>
          <Icon name="check" size={18} />
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------

function CreateRequest() {
  const types = useAssetTypes();
  const [assetTypeCode, setAssetTypeCode] = useState('BOVINOS');
  const options = useQuery({
    queryKey: ['request-options', assetTypeCode],
    queryFn: () =>
      api<RequestCreationOptions>(`/guarantee-requests/new/options?assetTypeCode=${assetTypeCode}`),
  });
  const [producerKey, setProducerKey] = useState(NEW_PRODUCER);
  const [producer, setProducer] = useState({ name: '', taxId: '', email: '' });
  const [establishmentId, setEstablishmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [chosenProduct, setProductCode] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GuaranteeRequest | null>(null);
  const create = useApiMutation(
    (body: object) => api<GuaranteeRequest>('/guarantee-requests', { method: 'POST', body }),
    [['guarantee-requests']],
  );

  const data = options.data;
  // Sin elección explícita, el producto por defecto del tipo de garantía.
  const productCode = chosenProduct ?? data?.defaultProductCode ?? data?.products[0]?.code ?? null;
  const existing = data?.producers.find((p) => p.taxId === producerKey) ?? null;
  const product = data?.products.find((p) => p.code === productCode) ?? null;

  if (types.isPending) return <Loading />;
  if (types.isError) return <ErrorState error={types.error} />;
  if (created?.invitation) return <InvitationCreated request={created} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = existing ? existing.name : producer.name.trim();
    const taxId = existing ? existing.taxId : producer.taxId.trim();
    if (name.length < 2) return setError('Ingresá el nombre o razón social del productor.');
    if (!/^\d{2}-\d{8}-\d$/.test(taxId))
      return setError('El CUIT debe tener el formato NN-NNNNNNNN-N.');
    try {
      setCreated(
        await create.mutateAsync({
          producerName: name,
          producerTaxId: taxId,
          producerEmail: (existing ? existing.email : producer.email.trim()) || undefined,
          assetTypeCode,
          requestedAmount: amount ? Number(amount) : undefined,
          currency: 'USD',
          notes: notes.trim() || undefined,
          establishmentId: establishmentId || undefined,
          ...(product
            ? { creditProductCode: product.code, notApplicableRequirements: [...excluded] }
            : {}),
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible crear la solicitud.');
    }
  };

  return (
    <form onSubmit={submit} className={styles.stack} aria-label="Nueva solicitud de garantía">
      <Section
        number={1}
        title="Productor"
        hint="Si ya trabajaste con él, no hace falta volver a cargar sus datos."
      >
        <Field label="Productor">
          {(p) => (
            <Select
              {...p}
              value={producerKey}
              onChange={(e) => {
                setProducerKey(e.target.value);
                setEstablishmentId('');
              }}
            >
              <option value={NEW_PRODUCER}>Nuevo productor…</option>
              {data?.producers.map((x) => (
                <option key={x.taxId} value={x.taxId}>
                  {x.name} · CUIT {x.taxId}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {existing ? (
          <p className={form.summary}>
            {existing.name} · CUIT {existing.taxId}
            {existing.email ? ` · ${existing.email}` : ''}
          </p>
        ) : (
          <FormRow columns={3}>
            <Field label="Nombre o razón social" required>
              {(p) => (
                <Input
                  {...p}
                  value={producer.name}
                  onChange={(e) => setProducer((x) => ({ ...x, name: e.target.value }))}
                />
              )}
            </Field>
            <Field label="CUIT" hint="NN-NNNNNNNN-N" required>
              {(p) => (
                <Input
                  {...p}
                  value={producer.taxId}
                  placeholder="30-71548963-1"
                  onChange={(e) => setProducer((x) => ({ ...x, taxId: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Email" hint="Opcional">
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  value={producer.email}
                  onChange={(e) => setProducer((x) => ({ ...x, email: e.target.value }))}
                />
              )}
            </Field>
          </FormRow>
        )}
      </Section>

      <Section
        number={2}
        title="Establecimiento"
        hint="Si ya está registrado, el productor no lo vuelve a declarar."
      >
        {existing?.establishments.length ? (
          <Field label="Establecimiento">
            {(p) => (
              <Select
                {...p}
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
              >
                <option value="">Lo declara el productor</option>
                {existing.establishments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.locality ? `${e.locality}, ` : ''}
                    {e.province}
                    {e.renspa ? ` · RENSPA ${e.renspa}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <p className={form.summary}>El productor lo declara al aceptar la invitación.</p>
        )}
      </Section>

      <Section number={3} title="Garantía">
        <FormRow columns={2}>
          <Field label="Tipo de garantía" required>
            {(p) => (
              <Select
                {...p}
                value={assetTypeCode}
                onChange={(e) => {
                  setAssetTypeCode(e.target.value);
                  setProductCode(null);
                  setExcluded(new Set());
                }}
              >
                {types.data.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Monto solicitado (USD)">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
        </FormRow>
        <Field label="Observaciones">
          {(p) => (
            <Input
              {...p}
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      </Section>

      <Section
        number={4}
        title="Documentación requerida"
        hint="Elegí el producto de crédito. Destildá lo que no aplica a esta solicitud."
      >
        {options.isPending ? (
          <Loading />
        ) : !data?.products.length ? (
          <p className={form.summary}>
            Este tipo de garantía usa la documentación estándar del catálogo de activos.
          </p>
        ) : (
          <>
            <div className={`${styles.optionGrid} ${styles.optionWide}`} role="radiogroup">
              {data.products.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  role="radio"
                  aria-checked={p.code === productCode}
                  className={`${styles.option} ${p.code === productCode ? styles.optionSelected : ''}`}
                  onClick={() => {
                    setProductCode(p.code);
                    setExcluded(new Set());
                  }}
                >
                  <span className={styles.optionTitle}>{p.name}</span>
                  <span className={styles.optionText}>{p.description}</span>
                  {p.kind === 'REFERENCE' ? (
                    <span className={styles.optionText}>
                      <Badge tone="outline">Referencia pública</Badge>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {product ? (
              <ul className={form.requirements} aria-label="Requisitos del producto">
                {product.requirements.map((r) => (
                  <li key={r.code}>
                    <Checkbox
                      label={
                        <span>
                          <strong>{r.name}</strong>{' '}
                          <span className={form.muted}>
                            · {r.obligationLabel}
                            {r.condition ? ` · ${r.condition}` : ''}
                          </span>
                        </span>
                      }
                      checked={!excluded.has(r.code)}
                      onChange={(e) =>
                        setExcluded((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.delete(r.code);
                          else next.add(r.code);
                          return next;
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Section>

      {error ? <Callout tone="critical">{error}</Callout> : null}
      <div className={styles.wizardFooter}>
        <span className={form.muted}>
          El productor recibe un link personal para completar su parte.
        </span>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Crear y generar invitación
        </Button>
      </div>
    </form>
  );
}

function Section({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Panel title={`${number} · ${title}`} subtitle={hint}>
      <div className={styles.stackTight}>{children}</div>
    </Panel>
  );
}

function InvitationCreated({ request }: { request: GuaranteeRequest }) {
  const [copied, setCopied] = useState(false);
  const url = request.invitation!.url;
  return (
    <Panel title="Solicitud creada · link de invitación">
      <div className={styles.stack}>
        <p>
          Compartí este link con <strong>{request.producer.name}</strong> para que complete su
          parte. Vence el {new Date(request.invitation!.expiresAt).toLocaleDateString('es-AR')}.
        </p>
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link de invitación"
        />
        <div className={styles.inline}>
          <Button
            icon="file"
            onClick={async () => {
              await navigator.clipboard?.writeText(url).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? 'Link copiado' : 'Copiar link'}
          </Button>
          <LinkButton href={url} external variant="secondary">
            Abrir como productor
          </LinkButton>
          <LinkButton href={`/requests/${request.id}`} variant="ghost">
            Ver solicitud
          </LinkButton>
        </div>
        <Callout tone="info">
          El link es personal: se guarda solo su huella (hash) y se puede regenerar desde la
          solicitud. No se envían emails en esta versión.
        </Callout>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------

function SimulateRequest() {
  const router = useRouter();
  const scenarios = useQuery({
    queryKey: ['demo-scenarios'],
    queryFn: () =>
      api<{
        enabled: boolean;
        producer: { name: string; taxId: string; establishment: string; province: string };
        scenarios: DemoScenarioOption[];
      }>('/demo/scenarios'),
  });
  const [selected, setSelected] = useState('COMPLETE');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DemoCreated | null>(null);
  const create = useApiMutation(
    (scenario: string) =>
      api<DemoCreated>('/demo/guarantee-requests', { method: 'POST', body: { scenario } }),
    [['guarantee-requests']],
  );
  const chosen = useMemo(
    () => scenarios.data?.scenarios.find((s) => s.code === selected),
    [scenarios.data, selected],
  );
  if (scenarios.isPending) return <Loading />;
  if (scenarios.isError) return <ErrorState error={scenarios.error} />;
  if (!scenarios.data.enabled)
    return <Callout tone="info">El modo demostración está desactivado en este entorno.</Callout>;

  if (created) {
    return (
      <div className={styles.stack} data-testid="demo-created">
        <DemoBanner scenario={created.scenario.name} />
        <Panel title="Solicitud de demostración creada">
          <div className={styles.stack}>
            <p>
              Se creó con los mismos servicios que una solicitud real: productor, establecimiento,
              activo, documentos de demostración (leídos por OCR) y fotos de ejemplo.
            </p>
            <div className={form.credentials}>
              <span>Acceso del productor ficticio</span>
              <code data-testid="demo-producer-email">{created.producerAccess.email}</code>
              <code data-testid="demo-producer-password">{created.producerAccess.password}</code>
            </div>
            <p className={form.muted}>
              Para mostrar su portal, ingresá con este usuario en otra ventana privada.
            </p>
            <div className={styles.inline}>
              <Button
                variant="primary"
                onClick={() => router.push(`/requests/${created.requestId}`)}
              >
                Abrir solicitud
              </Button>
              <Button variant="secondary" onClick={() => setCreated(null)}>
                Crear otra
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  const p = scenarios.data.producer;
  return (
    <Panel
      title="Escenario de demostración"
      subtitle={`Productor ficticio ${p.name} (CUIT ${p.taxId}) · establecimiento “${p.establishment}”, ${p.province} · 1.500 bovinos.`}
    >
      <div className={styles.stack}>
        <div
          className={`${styles.optionGrid} ${styles.optionWide}`}
          role="radiogroup"
          aria-label="Escenarios"
        >
          {scenarios.data.scenarios.map((s) => (
            <button
              key={s.code}
              type="button"
              role="radio"
              aria-checked={s.code === selected}
              className={`${styles.option} ${s.code === selected ? styles.optionSelected : ''}`}
              onClick={() => setSelected(s.code)}
              data-testid={`demo-scenario-${s.code}`}
            >
              <span className={styles.optionTitle}>{s.name}</span>
              <span className={styles.optionText}>{s.description}</span>
            </button>
          ))}
        </div>
        {chosen ? <p className={form.muted}>Muestra: {chosen.shows}</p> : null}
        <Callout tone="warning" title="Datos de demostración">
          Todos los datos y documentos son ficticios y quedan marcados como DEMO. Los documentos
          dicen “Documento de demostración – sin valor” y no imitan a ningún organismo.
        </Callout>
        {error ? <Callout tone="critical">{error}</Callout> : null}
        <div className={styles.wizardFooter}>
          <span />
          <Button
            variant="primary"
            loading={create.isPending}
            onClick={async () => {
              setError(null);
              try {
                setCreated(await create.mutateAsync(selected));
              } catch (e) {
                setError(e instanceof ApiError ? e.message : 'No fue posible crear la demo.');
              }
            }}
          >
            Crear demo
          </Button>
        </div>
      </div>
    </Panel>
  );
}
