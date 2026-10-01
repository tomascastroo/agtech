import type { Metadata } from 'next';
import { ProducerRequestFlow } from './ProducerRequestFlow';

export const metadata: Metadata = { title: 'Solicitud de garantía — Productor' };

export default function Page() {
  return <ProducerRequestFlow />;
}
