# 树懒云 Sloth Cloud

**语言 / Language:** 中文 | [English](#english)

树懒云是一套面向 VPS、托管应用和 AI 部署运维的开源云服务工作台。它把客户前台、业务 BFF、Operator 智能工作台、部署预览和上游面板适配器放在同一个产品壳里，目标是让用户可以用更自然的方式完成购买、部署、预览、排障和后续维护。

这个公开仓库只包含 Sloth Cloud 自研的产品壳和适配层：

- `apps/web`：React/Vite 客户前台、控制台和 AI 工作台界面。
- `apps/api`：Fastify BFF，用于统一上游 API，并把 provider 凭据保留在服务端。
- `docs`：产品、Operator、readiness、开源边界和部署说明。
- `deploy/sloth-cloud/env/*.example`：安全的示例配置，不包含真实密钥。

本仓库**不打包** Paymenter、Convoy、OpenClaw、CLIProxyAPI、生产数据库、运行时 workspace、生成项目、备份、截图证据或任何真实密钥。

## 开源边界

树懒云被设计成一个集成层，上游系统都是外部依赖：

- Paymenter：可选的账单 / 商品前台后端。如果你部署或修改 Paymenter，需要保留它自己的许可证和版权声明。
- Convoy：可选的 VPS / 面板后端。用户需要自行提供有授权的 Convoy 部署；本仓库只保留 Convoy API 适配器。
- OpenClaw：可选的常驻机器人 / 多渠道编排层。本仓库只暴露 connector 接口。
- CLI proxy / OpenAI-compatible APIs：可选的大模型路由层，通过环境变量配置，不内置真实服务和 key。

发布 fork 或接入生产环境前，请先阅读 [NOTICE.md](./NOTICE.md) 和 [docs/open-source-boundary.md](./docs/open-source-boundary.md)。

## 快速开始

```bash
pnpm install
pnpm build
pnpm test
```

## 客户前台预览

本仓库通过 GitHub Pages 发布了一个安全的静态客户前台预览：

- 预览地址：<https://shulaiyun.github.io/Sloth-Cloud/>
- 直达路由：<https://shulaiyun.github.io/Sloth-Cloud/preview/customer/>

Pages 构建使用 `VITE_STATIC_CUSTOMER_PREVIEW=true`，只渲染脱敏后的前端预览。它不会请求生产 API，不包含 Paymenter / Convoy / OpenClaw 源码，也不会暴露真实凭据、订单、客户数据或部署状态。

本地开发：

```bash
cp apps/api/.env.example apps/api/.env
pnpm dev
```

默认本地端口：

- Web：`http://localhost:3000`
- API：`http://localhost:4000`

## 配置

不要提交真实 `.env` 文件。请从示例配置开始：

- API：[apps/api/.env.example](./apps/api/.env.example)
- Web：[apps/web/.env.example](./apps/web/.env.example)
- 部署示例：[deploy/sloth-cloud/env](./deploy/sloth-cloud/env)

AI provider 使用 OpenAI-compatible 配置：

```env
ASSISTANT_ENABLED=true
ASSISTANT_PRIMARY_PROVIDER=openai
ASSISTANT_OPENAI_BASE_URL=
ASSISTANT_OPENAI_API_KEY=
ASSISTANT_OPENAI_MODEL=gpt-5.4
```

在公开或 runtime 模式下，不允许静默回退到 mock AI。如果 provider 不可用，界面应该明确提示“当前执行受限”。

## 仓库安全

发布或推送前，请运行：

```bash
pnpm run secret:scan
```

扫描会阻止常见高风险泄漏，例如私钥、API key、token、`.env` 文件、运行时 workspace、生成项目和被打包进来的上游面板目录。

## 社区维护

树懒云欢迎围绕公开产品壳、BFF、Operator 工作流、adapter contract、测试和文档进行社区维护。

- 提 PR 前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。
- 维护边界请阅读 [GOVERNANCE.md](./GOVERNANCE.md)。
- 公开维护优先级请阅读 [ROADMAP.md](./ROADMAP.md)。
- 接入真实生产基础设施前请阅读 [docs/public-private-deployment.md](./docs/public-private-deployment.md)。

请不要提交上游面板源码、生产凭据、客户数据或私有部署状态。

## 许可证

本仓库中 Sloth Cloud 自研代码使用 AGPL-3.0-or-later 许可证。详见 [LICENSE](./LICENSE)。

第三方系统和依赖保留它们自己的许可证，本仓库不会重新授权这些外部项目。

---

## English

# Sloth Cloud

**Language:** [中文](#树懒云-sloth-cloud) | English

Sloth Cloud is an open-source AI-assisted cloud workbench for VPS storefronts, managed applications, and deployment operations. It brings the customer frontend, BFF, Operator workbench, deployment preview flow, and upstream panel adapters into one product shell so users can purchase, deploy, preview, troubleshoot, and maintain services through a more natural workflow.

This public repository contains only Sloth Cloud-owned product shell and integration code:

- `apps/web`: React/Vite customer frontend, console, and AI workbench UI.
- `apps/api`: Fastify BFF that normalizes upstream APIs and keeps provider credentials server-side.
- `docs`: product, Operator, readiness, open-source boundary, and deployment notes.
- `deploy/sloth-cloud/env/*.example`: safe configuration examples only.

It does **not** vendor Paymenter, Convoy, OpenClaw, CLIProxyAPI, production databases, runtime workspaces, generated projects, backups, screenshots, or secrets.

## Open Source Boundary

Sloth Cloud is designed as an integration layer. Upstream systems are external dependencies:

- Paymenter: optional billing/storefront backend. If you deploy or modify Paymenter, keep its upstream license and notices.
- Convoy: optional VPS/panel backend. Users must provide their own licensed Convoy deployment; this repository only contains a Convoy API adapter.
- OpenClaw: optional always-on bot/orchestration layer. This repository only exposes connector surfaces.
- CLI proxy / OpenAI-compatible APIs: optional model routing layer configured through environment variables.

See [NOTICE.md](./NOTICE.md) and [docs/open-source-boundary.md](./docs/open-source-boundary.md) before publishing forks or production deployments.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

## Public Customer Preview

The repository publishes a safe static customer-front preview through GitHub Pages:

- Preview URL: <https://shulaiyun.github.io/Sloth-Cloud/>
- Direct route: <https://shulaiyun.github.io/Sloth-Cloud/preview/customer/>

The Pages build uses `VITE_STATIC_CUSTOMER_PREVIEW=true`, so it renders a sanitized frontend preview only. It does not call production APIs, does not include Paymenter/Convoy/OpenClaw source, and does not expose real credentials, orders, customer data, or deployment state.

For local development:

```bash
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Default local ports:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## Configuration

Never commit real `.env` files. Start from examples:

- API: [apps/api/.env.example](./apps/api/.env.example)
- Web: [apps/web/.env.example](./apps/web/.env.example)
- Deployment examples: [deploy/sloth-cloud/env](./deploy/sloth-cloud/env)

Assistant provider configuration is OpenAI-compatible:

```env
ASSISTANT_ENABLED=true
ASSISTANT_PRIMARY_PROVIDER=openai
ASSISTANT_OPENAI_BASE_URL=
ASSISTANT_OPENAI_API_KEY=
ASSISTANT_OPENAI_MODEL=gpt-5.4
```

In public/runtime mode, do not silently fall back to mock AI responses. If a provider is unavailable, the UI should state that execution is limited.

## Repository Hygiene

Before publishing or pushing changes:

```bash
pnpm run secret:scan
```

The scan blocks common high-risk leaks such as private keys, API keys, tokens, `.env` files, runtime workspaces, generated projects, and vendored upstream panel directories.

## Community Maintenance

Sloth Cloud is open to community maintenance around the public shell, BFF, Operator workflow, adapter contracts, tests, and docs.

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.
- Read [GOVERNANCE.md](./GOVERNANCE.md) to understand maintainer decisions and repository boundaries.
- Read [ROADMAP.md](./ROADMAP.md) for public maintenance priorities.
- Read [docs/public-private-deployment.md](./docs/public-private-deployment.md) before wiring real production infrastructure.

Please do not submit upstream panel source trees, production credentials, customer data, or private deployment state.

## License

Sloth Cloud-owned code in this repository is licensed under AGPL-3.0-or-later. See [LICENSE](./LICENSE).

Third-party systems and dependencies keep their own licenses and are not relicensed by this repository.
