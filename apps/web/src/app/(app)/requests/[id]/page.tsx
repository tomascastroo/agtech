import type { Metadata } from 'next';
import { RequestDetailView } from './RequestDetailView';

export const metadata: Metadata = { title: 'Solicitud de garantía' };

export default function Page() {
  return <RequestDetailView />;
}
