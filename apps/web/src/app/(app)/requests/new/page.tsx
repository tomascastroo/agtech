import type { Metadata } from 'next';
import { NewRequestForm } from './NewRequestForm';

export const metadata: Metadata = { title: 'Nueva solicitud de garantía' };

export default function Page() {
  return <NewRequestForm />;
}
