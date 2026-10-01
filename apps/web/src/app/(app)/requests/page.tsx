import type { Metadata } from 'next';
import { RequestsView } from './RequestsView';

export const metadata: Metadata = { title: 'Solicitudes de garantía' };

export default function Page() {
  return <RequestsView />;
}
