'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styles from '@/components/producer/producer.module.css';
import { Callout, ErrorState, Loading } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { api, ApiError } from '@/lib/api/client';
import type { GuaranteeRequest } from '@/lib/api/types';
import { formatNumber } from '@/lib/format';

/**
 * Invitación del productor (primer acceso). El link identifica la solicitud; el productor crea
 * su acceso (email y contraseña) y desde entonces entra a su portal con su cuenta.
 */
export function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<GuaranteeRequest>(`/producer/requests/${token}`),
    retry: false,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <main className={styles.main}>
        <ErrorState error={query.error} />
      </main>
    );
  const r = query.data;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      const accepted = await api<{ email: string; requestId: string }>(
        `/producer/requests/${token}/accept`,
        {
          method: 'POST',
          body: { email: email.trim(), password, fullName: r.producer.name },
        },
      );
      await api('/auth/login', { method: 'POST', body: { email: accepted.email, password } });
      client.clear();
      router.replace(`/productor/solicitudes/${accepted.requestId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No fue posible aceptar la invitación.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.app} style={{ paddingBottom: 32 }}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <strong>AgroGarantías</strong>
          <span>Invitación para productores</span>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.card}>
          <span className={styles.chip}>
            <Icon name="shield" size={12} /> {r.requester.name} te invitó
          </span>
          <h1 className={styles.hello}>Solicitud de garantía</h1>
          <p className={styles.lead}>
            {r.guaranteeType.name ?? r.guaranteeType.code}
            {r.requestedAmount != null ? ` · ${r.currency} ${formatNumber(r.requestedAmount)}` : ''}
          </p>
          <p className={styles.muted}>
            Para {r.producer.name} (CUIT {r.producer.taxId}). Vas a declarar tu establecimiento y tu
            activo, y aportar fotos y documentación. AgroGarantías verifica y {r.requester.name}{' '}
            recibe el resultado.
          </p>
        </section>

        {r.acceptedAt ? (
          <section className={styles.card}>
            <p className={styles.cardTitle}>Ya aceptaste esta invitación</p>
            <p className={styles.muted}>Ingresá con tu email y contraseña para continuar.</p>
            <Link href={`/login?next=/productor/solicitudes/${r.id}`} className={styles.bigButton}>
              Ingresar al portal
            </Link>
          </section>
        ) : (
          <form onSubmit={submit} className={styles.card} aria-label="Crear acceso">
            <p className={styles.cardTitle}>Creá tu acceso</p>
            <p className={styles.muted}>
              Con tu email y contraseña vas a poder volver cuando quieras y seguir donde dejaste.
            </p>
            <Field label="Email" required>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label="Contraseña" hint="Al menos 10 caracteres" required>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            <Field label="Repetí la contraseña" required>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              )}
            </Field>
            {error ? <Callout tone="critical">{error}</Callout> : null}
            <button type="submit" className={styles.bigButton} disabled={busy}>
              {busy ? 'Creando acceso…' : 'Aceptar invitación'}
            </button>
            <p className={styles.muted}>
              ¿Ya tenés cuenta de productor? <Link href={`/login?next=/productor`}>Ingresá</Link> o
              usá el mismo email y contraseña para sumar esta solicitud.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
