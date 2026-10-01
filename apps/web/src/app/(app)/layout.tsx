import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Loading } from '@/components/ui/Feedback';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </AppShell>
  );
}
