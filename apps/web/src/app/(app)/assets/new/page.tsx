import type { Metadata } from 'next';
import { NewAssetWizard } from './NewAssetWizard';

export const metadata: Metadata = { title: 'Nuevo activo' };

export default function Page() {
  return <NewAssetWizard />;
}
