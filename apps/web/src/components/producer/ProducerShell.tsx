'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/components/ui/Feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/api/queries';
import type { ProducerOverview } from '@/lib/api/types';
import { producerKeys } from './data';
import { registerServiceWorker } from '@/lib/scanner/offline';
import { startAutoSync } from '@/lib/scanner/sync';
import styles from './producer.module.css';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/productor', label: 'Inicio', icon: 'dashboard' },
  { href: '/productor/solicitudes', label: 'Solicitudes', icon: 'file' },
  { href: '/productor/establecimientos', label: 'Campos', icon: 'building' },
  { href: '/productor/activos', label: 'Activos', icon: 'layers' },
  { href: '/productor/documentacion', label: 'Documentos', icon: 'document' },
];

/** Marco del portal del productor: barra superior y navegación inferior (tipo app). */
export function ProducerShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const role = session.data?.role;
  // Cuenta de demostración: la marca queda visible en todas las pantallas del portal.
  const overview = useQuery({
    queryKey: producerKeys.overview,
    queryFn: () => api<ProducerOverview>('/producer/me'),
    enabled: role === 'PRODUCER',
  });
  const demo = overview.data?.requests.some((r) => r.dataSource === 'DEMO') ?? false;

  // Escáner de bovinos: escaneos guardados sin señal se sincronizan solos al volver la conexión.
  useEffect(() => {
    registerServiceWorker();
    return startAutoSync();
  }, []);

  useEffect(() => {
    // Los usuarios de la entidad usan el portal institucional.
    if (role && role !== 'PRODUCER') router.replace('/dashboard');
  }, [role, router]);

  if (session.isPending || (role && role !== 'PRODUCER')) return <Loading />;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    client.clear();
    router.replace('/login');
  };
  const active = (href: string) =>
    href === '/productor' ? pathname === href : pathname.startsWith(href);

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <strong>
            AgroGarantías
            {demo ? (
              <mark className={styles.demoTag} data-testid="producer-demo-tag">
                DEMO
              </mark>
            ) : null}
          </strong>
          <span>Portal del productor · {session.data?.fullName}</span>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={logout}
          aria-label="Cerrar sesión"
        >
          <Icon name="logout" size="md" />
        </button>
      </header>
      <nav className={styles.tabbar} aria-label="Navegación del productor">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.tab} ${active(item.href) ? styles.tabActive : ''}`}
            aria-current={active(item.href) ? 'page' : undefined}
          >
            <Icon name={item.icon} size="lg" />
            {item.label}
          </Link>
        ))}
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
