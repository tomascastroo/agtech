import type { Metadata } from 'next';
import { InspectorForm } from './InspectorForm';

export const metadata: Metadata = { title: 'Inspección presencial' };

export default function Page() {
  return <InspectorForm />;
}
