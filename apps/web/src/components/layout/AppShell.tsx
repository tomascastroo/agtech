'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { api } from '@/lib/api/client';
import { useDashboard, useSession } from '@/lib/api/queries';
import styles from './shell.module.css';

const NAV: { href: string; label: string; icon: IconName; section?: string }[] = [
  { href: '/dashboard', label: 'Panel', icon: 'dashboard', section: 'Cartera' },
  { href: '/requests', label: 'Solicitudes de garantía', icon: 'file' },
  { href: '/assets', label: 'Activos y garantías', icon: 'layers' },
  { href: '/monitoring', label: 'Monitoreo', icon: 'map' },
  { href: '/alerts', label: 'Alertas', icon: 'bell' },
  { href: '/verifications', label: 'Verificaciones', icon: 'shield', section: 'Evidencia' },
  { href: '/reports', label: 'Informes', icon: 'file' },
  { href: '/settings', label: 'Configuración', icon: 'sliders', section: 'Organización' },
];

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const role = session.data?.role;
  useEffect(() => {
    // El productor usa su propio portal.
    if (role === 'PRODUCER') router.replace('/productor');
  }, [role, router]);
  const dashboard = useDashboard();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const openAlerts = dashboard.data?.kpis.openAlerts ?? 0;
  const user = session.data;

  const logout = async () => {
    setLeaving(true);
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    router.replace('/login');
  };

  return (
    <div className={styles.shell}>
      {open ? <div className={styles.overlay} onClick={() => setOpen(false)} aria-hidden /> : null}
      <aside
        className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}
        aria-label="Navegación principal"
      >
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="leaf" size={16} />
          </span>
          AGROGARANTÍAS
        </Link>
        <nav className={styles.nav}>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <div key={item.href}>
                {item.section ? <div className={styles.navSection}>{item.section}</div> : null}
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                  {item.href === '/alerts' && openAlerts > 0 ? (
                    <span className={styles.navCount} aria-label={`${openAlerts} alertas activas`}>
                      {openAlerts}
                    </span>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>Verificación remota de activos agropecuarios</div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <span className={styles.menuButton}>
            <Button
              variant="ghost"
              size="sm"
              icon="menu"
              aria-label="Abrir menú"
              onClick={() => setOpen(true)}
            />
          </span>
          <div className={styles.org}>
            <Icon name="building" size={18} />
            {user?.organizationName ?? ' '}
            <span className={styles.orgKind}>· Entidad financiera</span>
          </div>
          <div className={styles.spacer} />
          {user ? (
            <div className={styles.user}>
              <span className={styles.avatar} aria-hidden>
                {initials(user.fullName)}
              </span>
              <span className={styles.userText}>
                <div className={styles.userName} data-testid="current-user">
                  {user.fullName}
                </div>
                <div className={styles.userRole}>{user.roleName}</div>
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon="logout"
                onClick={logout}
                loading={leaving}
                aria-label="Cerrar sesión"
              />
            </div>
          ) : null}
        </header>
        <main className={styles.content} id="contenido">
          {children}
        </main>
      </div>
    </div>
  );
}
