import type { Metadata } from 'next';
import { PassportView } from './PassportView';

export const metadata: Metadata = { title: 'Asset Passport' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PassportView id={id} />;
}
