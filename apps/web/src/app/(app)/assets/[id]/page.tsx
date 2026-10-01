import type { Metadata } from 'next';
import { AssetDetailView } from './AssetDetailView';

export const metadata: Metadata = { title: 'Activo' };

export default function Page() {
  return <AssetDetailView />;
}
