import type { Metadata } from 'next';
import { AlertsView } from './AlertsView';

export const metadata: Metadata = { title: 'Alertas' };

export default function Page() {
  return <AlertsView />;
}
