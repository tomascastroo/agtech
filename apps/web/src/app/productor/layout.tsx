import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProducerShell } from '@/components/producer/ProducerShell';
import { Loading } from '@/components/ui/Feedback';

export const metadata: Metadata = {
  title: { default: 'Portal del productor', template: '%s · Productor' },
};

export default function ProducerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProducerShell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ProducerShell>
  );
}
