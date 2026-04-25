import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteProvider } from '../lib/site-context';
import { ServiceDetailPage } from './ServiceDetailPage';
import type {
  ProductDetailResponse,
  RuntimeMetricsResponse,
  RuntimeOverviewResponse,
  ServiceAppsResponse,
  ServiceOperationLogsResponse,
  ServiceProvisioningResponse,
  ServiceResponse,
  ServiceRuntimeResponse,
} from '../lib/types';

const apiMocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  useApiData: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    requestJson: apiMocks.requestJson,
    useApiData: apiMocks.useApiData,
  };
});

const meta = {
  generatedAt: '2026-04-22T10:00:00.000Z',
  sourceMode: 'mock',
};

const serviceResponse = {
  data: {
    service: {
      id: '19',
      label: '美国洛杉矶 BGP 2C2G #19',
      baseLabel: '美国洛杉矶 BGP 2C2G',
      status: 'active',
      price: 69,
      quantity: 1,
      currencyCode: 'CNY',
      currency: null,
      formattedPrice: 'CNY 69.00',
      expiresAt: '2026-05-16T00:00:00.000Z',
      product: {
        id: 'product-1',
        slug: 'us-vps',
        name: '美国洛杉矶 BGP 2C2G',
        category: {
          id: 'cat-vps',
          slug: 'vps',
          name: 'VPS',
        },
      },
      plan: {
        id: 'plan-1',
        name: '2C2G',
        type: null,
        billingPeriod: 1,
        billingUnit: 'month',
      },
      cancellable: true,
      upgradable: false,
      cancellation: null,
      countryCode: 'US',
      selectedOs: 'Ubuntu 22.04',
      primaryAppSlug: 'nginx',
      addonAppSlugs: [],
      runtimeKind: 'vps',
      provisioning: {
        status: 'success',
        provider: 'convoy',
        attemptCount: 1,
        errorMessage: null,
        errorCode: null,
        lastAttemptAt: '2026-04-22T10:02:00.000Z',
        completedAt: '2026-04-22T10:02:30.000Z',
      },
      properties: [
        { key: 'node', name: 'Node', value: '1' },
        { key: 'os', name: 'OS', value: 'Ubuntu 22.04' },
      ],
      configs: [],
      billingAgreement: null,
    },
    invoices: [
      {
        id: 'inv-24',
        number: 'INV-24',
        status: 'pending',
        currencyCode: 'CNY',
        currency: null,
        total: 69,
        remaining: 69,
        formattedTotal: 'CNY 69.00',
        formattedRemaining: 'CNY 69.00',
        dueAt: '2026-04-30T00:00:00.000Z',
        createdAt: '2026-04-22T10:10:00.000Z',
        userName: 'Shulai',
      },
    ],
    actions: {
      buttons: [],
      views: [],
      fields: [],
    },
  },
  meta,
} as unknown as ServiceResponse;

const productResponse = {
  data: {
    id: 'product-1',
    slug: 'us-vps',
    name: '美国洛杉矶 BGP 2C2G',
    description: 'test',
    category: {
      id: 'cat-vps',
      slug: 'vps',
      name: 'VPS',
      icon: null,
      color: null,
      productsCount: 1,
    },
    pricing: [],
    configurableOptions: [],
    stock: null,
    order: 1,
    image: null,
    metadata: {},
    highlights: [],
    vpsAppMarketplace: {
      supportedOs: [
        { value: 'Ubuntu 22.04', label: 'Ubuntu 22.04' },
      ],
      categories: [],
      primaryApps: [],
      addonApps: [],
    },
  },
  meta,
} as unknown as ProductDetailResponse;

const runtimeResponse = {
  data: {
    serviceId: '19',
    runtime: {
      kind: 'vps',
      contractVersion: 'v1',
      runtimeRef: 'srv-19',
      status: 'running',
      endpoint: null,
      lastDeployAt: null,
      managedApp: null,
      vps: {
        serverRef: 'server-19',
        convoyStatus: 'running',
      },
    },
    capabilities: {
      status: true,
      logs: true,
      env: false,
      domain: false,
      tls: false,
      scale: false,
      actions: {
        start: true,
        stop: true,
        restart: true,
        suspend: true,
        unsuspend: true,
        reinstall: true,
        revealPassword: true,
        delete: false,
      },
    },
  },
  meta,
} as unknown as ServiceRuntimeResponse;

const runtimeOverviewResponse = {
  data: {
    status: 'ready',
    reason: null,
    mapped: true,
    runtimeKind: 'vps',
    overview: {
      powerState: 'running',
      cpuUsed: 0.5,
      memoryUsed: 886 * 1024 * 1024,
      memoryTotal: 2 * 1024 * 1024 * 1024,
      uptime: 3600,
      node: '1',
      hostname: 'shu',
      primaryIp: '192.168.16.235',
      operatingSystem: 'Ubuntu 22.04',
    },
    provisioning: {
      status: 'success',
      provider: 'convoy',
      attemptCount: 1,
      errorMessage: null,
      errorCode: null,
      lastAttemptAt: '2026-04-22T10:02:00.000Z',
      completedAt: '2026-04-22T10:02:30.000Z',
    },
    capabilities: {
      status: true,
      logs: true,
      env: false,
      domain: false,
      tls: false,
      scale: false,
      actions: {
        start: true,
        stop: true,
        restart: true,
        suspend: true,
        unsuspend: true,
        reinstall: true,
        revealPassword: true,
        delete: false,
      },
    },
  },
  meta,
} as unknown as RuntimeOverviewResponse;

const runtimeMetricsResponse = {
  data: {
    status: 'ready',
    reason: null,
    mapped: true,
    runtimeKind: 'vps',
    metrics: {
      diskUsed: 0,
      diskTotal: 40 * 1024 * 1024 * 1024,
      rxBytes: 23 * 1024 * 1024,
      txBytes: 565 * 1024,
      bandwidthUsage: 388 * 1024 * 1024,
      bandwidthLimit: 2 * 1024 * 1024 * 1024 * 1024,
      sampledAt: '2026-04-22T10:10:00.000Z',
    },
    provisioning: {
      status: 'success',
      provider: 'convoy',
      attemptCount: 1,
      errorMessage: null,
      errorCode: null,
      lastAttemptAt: '2026-04-22T10:02:00.000Z',
      completedAt: '2026-04-22T10:02:30.000Z',
    },
  },
  meta,
} as unknown as RuntimeMetricsResponse;

const serverResponse = {
  data: {
    service: {
      id: '19',
      label: 'srv',
      baseLabel: 'srv',
    },
    mapping: {
      serverRef: 'server-19',
      expectedKeys: [],
    },
    capabilities: {
      application: {
        read: true,
        console: true,
        patch: true,
        build: true,
        firewall: true,
        suspend: true,
        unsuspend: true,
        destroy: true,
      },
      actionBridge: {
        power: true,
        reinstall: true,
        revealPassword: true,
      },
    },
    convoy: {
      hostname: 'shu',
      limits: {
        addresses: {
          ipv4: [{ address: '192.168.16.235' }],
        },
      },
      status: 'running',
      state: 'running',
      locked: false,
    },
  },
  meta,
} as const;

const firewallResponse = {
  data: {
    mapped: true,
    serverRef: 'server-19',
    capabilities: {
      read: true,
      update: true,
    },
    options: {
      enabled: true,
      ipfilter: false,
      policyIn: 'ACCEPT',
      policyOut: 'ACCEPT',
      logLevelIn: null,
      logLevelOut: null,
    },
    rules: [
      {
        position: 1,
        enabled: true,
        type: 'in',
        action: 'ACCEPT',
        protocol: 'tcp',
        source: null,
        destination: null,
        destinationPort: '22',
        sourcePort: null,
        interface: null,
        comment: 'Allow SSH',
        logLevel: null,
      },
    ],
  },
  meta,
} as const;

const provisioningResponse = {
  data: {
    serviceId: '19',
    latest: {
      id: 'job-1',
      status: 'success',
      provider: 'convoy',
      attemptCount: 1,
      errorMessage: null,
      errorCode: null,
      lastAttemptAt: '2026-04-22T10:02:00.000Z',
      completedAt: '2026-04-22T10:02:30.000Z',
      createdAt: '2026-04-22T10:00:00.000Z',
    },
    history: [],
  },
  meta,
} as unknown as ServiceProvisioningResponse;

const operationLogsResponse = {
  data: {
    serviceId: '19',
    logs: [
      {
        id: 'log-1',
        operationId: 'op-1',
        action: 'start',
        source: 'service-page',
        success: true,
        code: 'SERVICE_POWER_SUBMITTED',
        message: 'Server power action submitted.',
        detail: null,
        requestPayload: null,
        responsePayload: null,
        actor: null,
        createdAt: '2026-04-22T10:11:00.000Z',
        updatedAt: '2026-04-22T10:11:00.000Z',
      },
      {
        id: 'log-2',
        operationId: 'op-2',
        action: 'stop',
        source: 'service-page',
        success: true,
        code: 'SERVICE_POWER_SUBMITTED',
        message: 'Server power action submitted.',
        detail: null,
        requestPayload: null,
        responsePayload: null,
        actor: null,
        createdAt: '2026-04-22T10:10:00.000Z',
        updatedAt: '2026-04-22T10:10:00.000Z',
      },
      {
        id: 'log-3',
        operationId: 'op-failed',
        action: 'assistant-execute-service-playbook',
        source: 'assistant',
        success: false,
        code: 'ASSISTANT_REMOTE_EXEC_FAILED',
        message: 'connect ECONNREFUSED 0.0.0.1:22',
        detail: 'connect ECONNREFUSED 0.0.0.1:22',
        requestPayload: null,
        responsePayload: null,
        actor: null,
        createdAt: '2026-04-22T10:12:00.000Z',
        updatedAt: '2026-04-22T10:12:00.000Z',
      },
      {
        id: 'log-4',
        operationId: 'op-4',
        action: 'restart',
        source: 'service-page',
        success: true,
        code: 'SERVICE_POWER_SUBMITTED',
        message: 'Server power action submitted.',
        detail: null,
        requestPayload: null,
        responsePayload: null,
        actor: null,
        createdAt: '2026-04-22T10:09:00.000Z',
        updatedAt: '2026-04-22T10:09:00.000Z',
      },
      {
        id: 'log-5',
        operationId: 'op-last',
        action: 'start',
        source: 'service-page',
        success: true,
        code: 'SERVICE_POWER_SUBMITTED',
        message: 'Server power action submitted.',
        detail: null,
        requestPayload: null,
        responsePayload: null,
        actor: null,
        createdAt: '2026-04-22T10:08:00.000Z',
        updatedAt: '2026-04-22T10:08:00.000Z',
      },
    ],
  },
  meta,
} as unknown as ServiceOperationLogsResponse;

const serviceAppsResponse = {
  data: {
    serviceId: '19',
    selectedOs: 'Ubuntu 22.04',
    primaryAppSlug: 'nginx',
    addonAppSlugs: [],
    panelUrl: 'http://192.168.16.235:80',
    panelLabel: 'Nginx',
    panelHost: '192.168.16.235',
    panelPort: 80,
    panelPath: null,
    panelUsername: null,
    panelPassword: null,
    installs: [],
    catalog: {
      supportedOs: [{ value: 'Ubuntu 22.04', label: 'Ubuntu 22.04' }],
      categories: [],
      primaryApps: [],
      addonApps: [],
    },
  },
  meta,
} as unknown as ServiceAppsResponse;

const reinstallMarketplaceResponse = {
  data: {
    supportedOs: [{ value: 'Ubuntu 22.04', label: 'Ubuntu 22.04' }],
    categories: [],
    primaryApps: [],
    addonApps: [],
  },
  meta,
};

function createUseApiDataResult(data: unknown) {
  return {
    data,
    error: null,
    loading: false,
    setData: vi.fn(),
  };
}

function createLoadingUseApiDataResult() {
  return {
    data: null,
    error: null,
    loading: true,
    setData: vi.fn(),
  };
}

function renderPage() {
  return render(
    <SiteProvider>
      <MemoryRouter initialEntries={['/services/19']}>
        <Routes>
          <Route element={<ServiceDetailPage />} path="/services/:serviceId" />
        </Routes>
      </MemoryRouter>
    </SiteProvider>,
  );
}

describe('ServiceDetailPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('sloth-service-telemetry-refresh-seconds', '3');
    apiMocks.requestJson.mockReset();
    apiMocks.useApiData.mockImplementation((url: string | null) => {
      if (!url) {
        return createUseApiDataResult(null);
      }
      if (url.startsWith('/api/v1/services/19?')) {
        return createUseApiDataResult(serviceResponse);
      }
      if (url.startsWith('/api/v1/catalog/products/us-vps?')) {
        return createUseApiDataResult(productResponse);
      }
      if (url.startsWith('/api/v1/services/19/runtime?')) {
        return createUseApiDataResult(runtimeResponse);
      }
      if (url.startsWith('/api/v1/services/19/runtime/overview?')) {
        return createUseApiDataResult(runtimeOverviewResponse);
      }
      if (url.startsWith('/api/v1/services/19/runtime/metrics?')) {
        return createUseApiDataResult(runtimeMetricsResponse);
      }
      if (url.startsWith('/api/v1/services/19/server?')) {
        return createUseApiDataResult(serverResponse);
      }
      if (url.startsWith('/api/v1/services/19/server/firewall?')) {
        return createUseApiDataResult(firewallResponse);
      }
      if (url.startsWith('/api/v1/services/19/provisioning?')) {
        return createUseApiDataResult(provisioningResponse);
      }
      if (url.startsWith('/api/v1/services/19/operation-logs?')) {
        return createUseApiDataResult(operationLogsResponse);
      }
      if (url.startsWith('/api/v1/services/19/apps?')) {
        return createUseApiDataResult(serviceAppsResponse);
      }
      if (url.startsWith('/api/v1/catalog/products/us-vps/vps-app-market?')) {
        return createUseApiDataResult(reinstallMarketplaceResponse);
      }
      return createUseApiDataResult(null);
    });
  });

  it('renders summary plus control center and keeps IP information in a single visible summary block', async () => {
    const { container } = renderPage();
    const commandCenter = container.querySelector('.service-command-center') as HTMLElement;
    const summaryPanel = container.querySelector('.service-summary-panel') as HTMLElement;

    await waitFor(() => {
      expect(within(commandCenter).getByRole('heading', { name: '操作中心' })).toBeInTheDocument();
    });

    expect(screen.getByText('状态摘要')).toBeInTheDocument();
    expect(summaryPanel.querySelectorAll('.service-meta-card').length).toBeGreaterThan(0);
    expect(screen.queryByText('主 IP')).not.toBeInTheDocument();
    expect(within(summaryPanel).getByText('IP 地址')).toBeInTheDocument();
  });

  it('keeps hook order stable when the page switches from loading state to resolved service data', async () => {
    let phase: 'loading' | 'ready' = 'loading';

    apiMocks.useApiData.mockImplementation((url: string | null) => {
      if (!url) {
        return createUseApiDataResult(null);
      }

      if (url.startsWith('/api/v1/services/19?')) {
        return phase === 'loading'
          ? createLoadingUseApiDataResult()
          : createUseApiDataResult(serviceResponse);
      }

      if (phase === 'loading') {
        return createUseApiDataResult(null);
      }

      if (url.startsWith('/api/v1/catalog/products/us-vps?')) {
        return createUseApiDataResult(productResponse);
      }
      if (url.startsWith('/api/v1/services/19/runtime?')) {
        return createUseApiDataResult(runtimeResponse);
      }
      if (url.startsWith('/api/v1/services/19/runtime/overview?')) {
        return createUseApiDataResult(runtimeOverviewResponse);
      }
      if (url.startsWith('/api/v1/services/19/runtime/metrics?')) {
        return createUseApiDataResult(runtimeMetricsResponse);
      }
      if (url.startsWith('/api/v1/services/19/server?')) {
        return createUseApiDataResult(serverResponse);
      }
      if (url.startsWith('/api/v1/services/19/server/firewall?')) {
        return createUseApiDataResult(firewallResponse);
      }
      if (url.startsWith('/api/v1/services/19/provisioning?')) {
        return createUseApiDataResult(provisioningResponse);
      }
      if (url.startsWith('/api/v1/services/19/operation-logs?')) {
        return createUseApiDataResult(operationLogsResponse);
      }
      if (url.startsWith('/api/v1/services/19/apps?')) {
        return createUseApiDataResult(serviceAppsResponse);
      }
      if (url.startsWith('/api/v1/catalog/products/us-vps/vps-app-market?')) {
        return createUseApiDataResult(reinstallMarketplaceResponse);
      }

      return createUseApiDataResult(null);
    });

    const view = renderPage();
    expect(view.container.querySelector('.loading-card')).toBeTruthy();

    phase = 'ready';
    view.rerender(
      <SiteProvider>
        <MemoryRouter initialEntries={['/services/19']}>
          <Routes>
            <Route element={<ServiceDetailPage />} path="/services/:serviceId" />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('状态摘要')).toBeInTheDocument();
    });

    expect(screen.queryByText('页面发生错误')).not.toBeInTheDocument();
  });

  it('keeps firewall visible in control center and exposes the rule editor inline', async () => {
    const { container } = renderPage();
    const commandCenter = container.querySelector('.service-command-center') as HTMLElement;

    await waitFor(() => {
      expect(within(commandCenter).getByText(/防火墙 · 已启用 · 1 条规则/)).toBeInTheDocument();
    });

    expect(screen.queryByText('进入高级操作')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '打开控制台' })).toHaveLength(1);

    fireEvent.click(within(commandCenter).getByText(/防火墙 · 已启用 · 1 条规则/));
    expect(await within(commandCenter).findByText('保存防火墙设置')).toBeInTheDocument();
    expect(screen.getByText('深度操作（重装 / 密码 / 暂停 / 销毁）')).toBeInTheDocument();
  });

  it('shows only three highlighted operation cards by default and expands full history on demand', async () => {
    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText(/最近操作记录 · 5 条/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/最近操作记录 · 5 条/));
    const topLevelCards = container.querySelectorAll('.service-history-panel > .service-history-list > .operation-log');
    expect(topLevelCards.length).toBe(3);
    expect(screen.queryByText('SERVICE_POWER_SUBMITTED')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('展开全部 5 条记录'));
    const fullCards = container.querySelectorAll('.service-history-panel details .service-history-list .operation-log');
    expect(fullCards.length).toBe(5);
    expect(screen.getByText(/op-last/)).toBeInTheDocument();
  });

  it('keeps billing drawer collapsed by default and exposes renewal controls after expand', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('账务与配置').length).toBeGreaterThan(0);
    });

    const billingSummary = screen.getAllByText('账务与配置')
      .find((node) => node.tagName.toLowerCase() === 'summary');
    expect(billingSummary).toBeTruthy();
    const billingDrawer = (billingSummary as HTMLElement).closest('details') as HTMLDetailsElement;
    expect(billingDrawer.open).toBe(false);
    fireEvent.click(billingSummary as HTMLElement);
    expect(billingDrawer.open).toBe(true);
    expect(await within(billingDrawer).findByRole('button', { name: '续费服务' })).toBeInTheDocument();
  });

  it('organizes deep controls and billing content into grouped subpanels', async () => {
    renderPage();

    const deepControlsSummary = screen.getByText('深度操作（重装 / 密码 / 暂停 / 销毁）');
    fireEvent.click(deepControlsSummary);
    const deepControlsDrawer = deepControlsSummary.closest('details') as HTMLDetailsElement;
    expect(await within(deepControlsDrawer).findByText('密码与访问')).toBeInTheDocument();
    expect(within(deepControlsDrawer).getByText('系统重装')).toBeInTheDocument();
    expect(within(deepControlsDrawer).getByText('暂停 / 恢复 / 销毁')).toBeInTheDocument();

    const billingSummary = screen.getAllByText('账务与配置')
      .find((node) => node.tagName.toLowerCase() === 'summary');
    fireEvent.click(billingSummary as HTMLElement);
    const billingDrawer = (billingSummary as HTMLElement).closest('details') as HTMLDetailsElement;
    expect(await within(billingDrawer).findByText('续费与取消')).toBeInTheDocument();
    expect(within(billingDrawer).getByText('标签与展示信息')).toBeInTheDocument();
    expect(within(billingDrawer).getByText('账单记录')).toBeInTheDocument();
  });

  it('keeps telemetry refresh range at 1-15 seconds with default 3 seconds and updates only telemetry controls', async () => {
    renderPage();

    const refreshInput = await screen.findByLabelText('输入监控刷新秒数');
    expect(refreshInput).toHaveAttribute('min', '1');
    expect(refreshInput).toHaveAttribute('max', '15');
    expect(refreshInput).toHaveValue(3);

    fireEvent.change(refreshInput, { target: { value: '1' } });
    expect(refreshInput).toHaveValue(1);
    expect(screen.getByText('美国洛杉矶 BGP 2C2G #19')).toBeInTheDocument();
  });
});
