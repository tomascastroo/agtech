import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <EmptyState
        icon="search"
        title="No encontramos esta página"
        action={
          <LinkButton href="/" variant="primary">
            Volver al inicio
          </LinkButton>
        }
      >
        El link puede estar mal escrito o el recurso ya no existe.
      </EmptyState>
    </main>
  );
}
