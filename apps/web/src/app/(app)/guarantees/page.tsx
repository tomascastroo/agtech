import type { Metadata } from 'next';
import { GuaranteesView } from './GuaranteesView';

export const metadata: Metadata = { title: 'Garantías bovinas' };

export default function Page() {
  return <GuaranteesView />;
}
