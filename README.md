# Sloth Cloud

树懒云（Sloth Cloud）一期代码与文档工作区。

## 当前目标

- 基于 `Paymenter` 管理 API 构建独立的 VPS 服务商客户端
- 新代码全部放在 `apps/` 与 `docs/` 中，不改 Paymenter 主题
- 一期只打通 Paymenter API 适配层，不接入 Proxmox 和真实 panel 控制逻辑
- 先交付可运行原型，再逐步替换为真实接口与权限体系

## 目录结构

```text
E:\vps
├─ apps
│  ├─ api               # Sloth Cloud BFF，隐藏 Paymenter token
│  └─ web               # Sloth Cloud 客户端前端
├─ docs                 # 项目说明、接口约定、实施计划
├─ Paymenter-master     # 上游源码，保留参考
└─ Convoy panel-develop # 上游源码，只读参考
```

## 技术选型

- `apps/web`: React 19 + Vite 7 + TypeScript
- `apps/api`: Fastify 5 + TypeScript
- 共享策略: 一期先以清晰的 BFF contract 为核心，等接口稳定后再抽取共享 types package
- 运行方式: `corepack pnpm`

## 快速启动

1. 安装依赖

```powershell
corepack pnpm install
```

2. 启动前端与 BFF

```powershell
corepack pnpm dev
```

3. 默认地址

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## 环境变量

- API 示例: [apps/api/.env.example](E:\vps\apps\api\.env.example)
- Web 示例: [apps/web/.env.example](E:\vps\apps\web\.env.example)

## 文档入口

- [项目说明](E:\vps\docs\project-overview.md)
- [架构设计](E:\vps\docs\architecture.md)
- [接口约定](E:\vps\docs\interface-contract.md)
- [实施计划](E:\vps\docs\implementation-plan.md)
- [Paymenter 接口缺口分析](E:\vps\docs\paymenter-gap-analysis.md)

