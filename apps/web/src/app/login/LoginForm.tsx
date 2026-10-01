'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { api, ApiError } from '@/lib/api/client';
import styles from './login.module.css';

export interface DemoCredentials {
  email: string;
  password: string;
}

function Form({ demo }: { demo: DemoCredentials | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await api<{ user: { role: string } }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      queryClient.clear();
      // El productor entra a su portal; la entidad, al panel institucional.
      const home = session.user.role === 'PRODUCER' ? '/productor' : '/dashboard';
      const next = params.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      const allowed = safeNext && safeNext.startsWith('/productor') === (home === '/productor');
      router.replace(allowed ? safeNext : home);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div>
        <h2>Iniciar sesión</h2>
        <p className={styles.lead}>Ingresá con tu usuario institucional.</p>
      </div>
      {error ? <Callout tone="critical">{error}</Callout> : null}
      <Field label="Correo electrónico" required>
        {(props) => (
          <Input
            {...props}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@entidad.com.ar"
            required
          />
        )}
      </Field>
      <Field label="Contraseña" required>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
      </Field>
      <Button type="submit" variant="primary" size="lg" block loading={loading}>
        Ingresar
      </Button>
      {demo ? (
        <div className={styles.demo} data-testid="demo-credentials">
          Entorno de demostración — usuario <code>{demo.email}</code>, contraseña{' '}
          <code>{demo.password}</code>
        </div>
      ) : null}
      <p className={styles.legal}>
        Acceso restringido. Las operaciones quedan registradas en el registro de auditoría de la
        organización.
      </p>
    </form>
  );
}

export function LoginForm({ demo }: { demo: DemoCredentials | null }) {
  return (
    <Suspense>
      <Form demo={demo} />
    </Suspense>
  );
}
