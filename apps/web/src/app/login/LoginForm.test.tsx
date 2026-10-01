import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('next=/assets'),
}));

const renderForm = (demo: { email: string; password: string } | null = null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LoginForm demo={demo} />
    </QueryClientProvider>,
  );

describe('LoginForm', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    replace.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('inicia sesión y redirige al destino solicitado', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ user: {} }), { status: 200 }));
    renderForm();
    await userEvent.type(
      screen.getByLabelText(/Correo electrónico/),
      'maria.lopez@bancodelcampo.com.ar',
    );
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'una-contraseña');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/assets'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(init!.body as string)).toEqual({
      email: 'maria.lopez@bancodelcampo.com.ar',
      password: 'una-contraseña',
    });
  });

  it('muestra el error de credenciales sin redirigir', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Correo o contraseña incorrectos' }),
        { status: 401 },
      ),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'x@y.com');
    await userEvent.type(screen.getByLabelText(/Contraseña/), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(replace).not.toHaveBeenCalled();
  });

  it('muestra credenciales demo solo si el entorno las provee', () => {
    const { unmount } = renderForm();
    expect(screen.queryByTestId('demo-credentials')).not.toBeInTheDocument();
    unmount();
    renderForm({ email: 'demo@entidad.com.ar', password: 'valor-de-entorno' });
    expect(screen.getByTestId('demo-credentials')).toHaveTextContent('valor-de-entorno');
  });
});
