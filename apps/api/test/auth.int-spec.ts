import {
  as,
  DEMO_PASSWORD,
  login,
  resetAndSeed,
  startTestApp,
  USERS,
  type TestContext,
} from './helpers/test-environment.js';

describe('Autenticación y sesión', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    await resetAndSeed();
    ctx = await startTestApp({ withWorker: false });
  });
  afterAll(() => ctx.close());

  it('inicia sesión con cookies httpOnly, SameSite y devuelve el perfil con permisos', async () => {
    const response = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: USERS.maria, password: DEMO_PASSWORD })
      .expect(200);
    expect(response.body.user).toMatchObject({
      fullName: 'María López',
      organizationName: 'Banco del Campo',
      role: 'ADMIN',
    });
    expect(response.body.user.permissions).toContain('verifications:run');
    const cookies = ([] as string[]).concat(response.headers['set-cookie']);
    expect(cookies.find((c) => c.startsWith('ag_at='))).toMatch(/HttpOnly/);
    expect(cookies.find((c) => c.startsWith('ag_rt='))).toMatch(
      /Path=\/api\/auth.*HttpOnly.*SameSite=Strict/,
    );
    expect(cookies.find((c) => c.startsWith('ag_csrf='))).not.toMatch(/HttpOnly/);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rechaza credenciales inválidas sin revelar si el usuario existe', async () => {
    const unknown = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'nadie@banco.com', password: 'Incorrecta123' })
      .expect(401);
    const wrong = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: USERS.viewer, password: 'Incorrecta123' })
      .expect(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('valida el cuerpo de la solicitud', async () => {
    await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'no-es-email', password: 'x' })
      .expect(400);
    await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: USERS.maria, password: DEMO_PASSWORD, extra: true })
      .expect(400);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: USERS.analyst, password: 'Incorrecta123' })
        .expect(401);
    }
    const blocked = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: USERS.analyst, password: DEMO_PASSWORD })
      .expect(401);
    expect(blocked.body.message).toContain('bloqueada');
  });

  it('exige autenticación en endpoints protegidos', async () => {
    await ctx.http().get('/api/assets').expect(401);
    await ctx.http().get('/api/assets').set('Authorization', 'Bearer token.invalido.x').expect(401);
  });

  it('exige token CSRF en mutaciones autenticadas por cookie, pero no con Bearer', async () => {
    const session = await login(ctx, USERS.maria);
    const asset = (await as(ctx, session).get('/api/assets?search=Esperanza').expect(200)).body
      .items[0].id;
    await ctx
      .http()
      .post(`/api/assets/${asset}/verifications`)
      .set('Cookie', session.cookies)
      .send({})
      .expect(403);
    await ctx
      .http()
      .post(`/api/assets/${asset}/verifications`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(202);
  });

  it('rota el refresh token y revoca la familia ante reutilización', async () => {
    const session = await login(ctx, USERS.auditor);
    const first = await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .expect(200);
    const rotated = ([] as string[])
      .concat(first.headers['set-cookie'])
      .map((c) => c.split(';')[0]!);
    // Reutilizar el refresh token original (ya rotado) se considera robo de sesión.
    await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .expect(401);
    const newCsrf = rotated.find((c) => c.startsWith('ag_csrf='))!.split('=')[1]!;
    await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', rotated)
      .set('x-csrf-token', newCsrf)
      .expect(401);
  });

  it('cierra la sesión revocando el refresh token', async () => {
    const session = await login(ctx, USERS.viewer);
    await as(ctx, session).post('/api/auth/logout').expect(204);
    await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', session.cookies)
      .set('x-csrf-token', session.csrf)
      .expect(401);
  });

  it('registra los inicios de sesión en la auditoría', async () => {
    const session = await login(ctx, USERS.maria);
    const audit = await as(ctx, session).get('/api/audit-logs?resourceType=user').expect(200);
    expect(audit.body.items.some((i: { action: string }) => i.action === 'USER_LOGGED_IN')).toBe(
      true,
    );
    expect(audit.body.items.some((i: { action: string }) => i.action === 'USER_LOGIN_FAILED')).toBe(
      true,
    );
  });

  it('limita la tasa de intentos de inicio de sesión por IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i++) {
      const response = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'limite@banco.com', password: 'Incorrecta123' });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });
});
