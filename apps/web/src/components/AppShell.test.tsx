import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    loading: false,
    logout: vi.fn(),
    user: null,
  }),
}));

vi.mock('../lib/site-context', () => ({
  resolveThemeDomain: () => 'cloud',
  useSite: () => ({
    locale: 'zh-CN',
    text: {
      nav: {
        home: '首页',
        catalog: '产品',
        login: '登录',
        register: '注册',
      },
      common: {
        hello: '你好',
      },
      footer: {
        statement: 'footer',
      },
    },
    setThemeDomain: vi.fn(),
    themeDomain: 'cloud',
  }),
}));

vi.mock('../lib/ui-text', () => ({
  getUiText: () => ({
    home: {
      heroEyebrow: 'hero',
    },
  }),
}));

vi.mock('./AssistantWidget', () => ({
  AssistantWidget: () => <div data-testid="global-assistant-widget">智能运营助手</div>,
}));

vi.mock('./LanguageToggle', () => ({
  LanguageToggle: () => <button type="button">lang</button>,
}));

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">theme</button>,
}));

describe('AppShell', () => {
  it('hides global assistant widget on /operator', () => {
    render(
      <MemoryRouter initialEntries={['/operator']}>
        <Routes>
          <Route element={<AppShell />} path="/">
            <Route element={<div>operator</div>} path="operator" />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('global-assistant-widget')).not.toBeInTheDocument();
  });

  it('keeps global assistant widget on non-operator pages', () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <Routes>
          <Route element={<AppShell />} path="/">
            <Route element={<div>catalog</div>} path="catalog" />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('global-assistant-widget')).toBeInTheDocument();
  });
});
