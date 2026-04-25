import { describe, expect, it } from 'vitest';

import { createGateway } from './paymenter.js';

describe('paymenter mock auth', () => {
  it('keeps the login email when running in mock mode', async () => {
    const gateway = createGateway({
      mode: 'mock',
      timeoutMs: 1_000,
    });

    const login = await gateway.login({
      email: '3185912695@qq.com',
      password: 'local-dev-password',
    });

    expect(login.data.user.email).toBe('3185912695@qq.com');

    const me = await gateway.me(login.data.accessToken);
    expect(me.data.user.email).toBe('3185912695@qq.com');
  });

  it('preserves registered name and email in mock mode', async () => {
    const gateway = createGateway({
      mode: 'mock',
      timeoutMs: 1_000,
    });

    const register = await gateway.register({
      firstName: 'Shu',
      lastName: 'Lai',
      email: 'shulai@example.com',
      password: 'local-dev-password',
      passwordConfirmation: 'local-dev-password',
    });

    expect(register.data.user.name).toBe('Shu Lai');

    const me = await gateway.me(register.data.accessToken);
    expect(me.data.user.name).toBe('Shu Lai');
    expect(me.data.user.email).toBe('shulai@example.com');
  });
});
