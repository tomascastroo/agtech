'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { api, ApiError } from '@/lib/api/client';
import styles from './login.module.css';

function Form({ showDemo }: { showDemo: boolean }) {
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
      await api('/auth/login', { method: 'POST', body: { email, password } });
      queryClient.clear();
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
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
      {showDemo ? (
        <div className={styles.demo}>
          Entorno de demostración — usuaria <code>maria.lopez@bancodelcampo.com.ar</code>,
          contraseña <code>AgroDemo2026!</code>
        </div>
      ) : null}
      <p className={styles.legal}>
        Acceso restringido. Las operaciones quedan registradas en el registro de auditoría de la
        organización.
      </p>
    </form>
  );
}

export function LoginForm({ showDemo }: { showDemo: boolean }) {
  return (
    <Suspense>
      <Form showDemo={showDemo} />
    </Suspense>
  );
}
