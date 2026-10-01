import type { Metadata } from 'next';
import { ReportsView } from './ReportsView';

export const metadata: Metadata = { title: 'Informes' };

export default function Page() {
  return <ReportsView />;
}
