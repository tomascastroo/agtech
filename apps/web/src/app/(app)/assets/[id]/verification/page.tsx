import type { Metadata } from 'next';
import { VerificationView } from './VerificationView';

export const metadata: Metadata = { title: 'Verificación' };

export default function Page() {
  return <VerificationView />;
}
