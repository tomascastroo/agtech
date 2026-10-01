import type { Metadata } from 'next';
import { VerificationsView } from './VerificationsView';

export const metadata: Metadata = { title: 'Verificaciones' };

export default function Page() {
  return <VerificationsView />;
}
