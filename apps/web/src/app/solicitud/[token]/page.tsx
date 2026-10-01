import type { Metadata } from 'next';
import { AcceptInvitation } from './AcceptInvitation';

export const metadata: Metadata = { title: 'Invitación — Solicitud de garantía' };

export default function Page() {
  return <AcceptInvitation />;
}
