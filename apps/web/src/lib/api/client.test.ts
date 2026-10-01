import { api, ApiError } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('cliente de la API', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'ag_csrf=token-123; path=/';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía el token CSRF en las mutaciones y no en las lecturas', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(202, { id: 'r1' }));
    await api('/assets');
    await api('/assets/a1/verifications', { method: 'POST', body: {} });
    const [, getInit] = fetchMock.mock.calls[0]!;
    const [postUrl, postInit] = fetchMock.mock.calls[1]!;
    expect((getInit!.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
    expect(postUrl).toBe('/api/assets/a1/verifications');
    expect((postInit!.headers as Record<string, string>)['x-csrf-token']).toBe('token-123');
    expect((postInit!.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(postInit!.credentials).toBe('same-origin');
  });

  it('renueva la sesión una vez ante un 401 y reintenta la solicitud', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'UNAUTHORIZED', message: 'Sesión vencida' }))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(200, { items: [] }));
    await expect(api('/alerts')).resolves.toEqual({ items: [] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/alerts',
      '/api/auth/refresh',
      '/api/alerts',
    ]);
  });

  it('expone el error de validación con sus campos', async () => {
    fetchMock.mockResolvedValueOnce(
      json(422, {
        error: 'VALIDATION_FAILED',
        message: 'Datos inválidos',
        details: { fields: [{ field: 'declaredQuantity', message: 'debe ser positivo' }] },
        requestId: 'req-1',
      }),
    );
    const error = await api('/assets', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).fieldErrors).toEqual([
      { field: 'declaredQuantity', message: 'debe ser positivo' },
    ]);
    expect((error as ApiError).requestId).toBe('req-1');
  });

  it('no intenta renovar la sesión para los endpoints de autenticación', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: 'UNAUTHORIZED', message: 'Credenciales inválidas' }),
    );
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toThrow(
      'Credenciales inválidas',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
