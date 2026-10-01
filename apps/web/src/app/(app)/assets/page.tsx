import type { Metadata } from 'next';
import { AssetsView } from './AssetsView';

export const metadata: Metadata = { title: 'Activos y garantías' };

export default function Page() {
  return <AssetsView />;
}
