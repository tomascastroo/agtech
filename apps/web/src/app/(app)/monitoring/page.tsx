import type { Metadata } from 'next';
import { MonitoringView } from './MonitoringView';

export const metadata: Metadata = { title: 'Mis garantías' };

export default function Page() {
  return <MonitoringView />;
}
