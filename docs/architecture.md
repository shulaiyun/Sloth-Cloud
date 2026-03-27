# Sloth Cloud 一期架构设计

## 1. 总体结构

```text
Browser
  -> apps/web
  -> apps/api (BFF)
  -> Paymenter Admin API
```

说明：

- `apps/web` 只访问 `apps/api`
- `apps/api` 保存 Paymenter token，并负责数据标准化
- `Paymenter-master` 与 `Convoy panel-develop` 当前只作为参考与对接对象，不作为新项目主应用

## 2. 目录规划

```text
apps/
  api/
    src/
      index.ts
      lib/
        mock-data.ts
        normalizers.ts
        paymenter.ts
        types.ts
  web/
    src/
      components/
      lib/
      pages/
      App.tsx
      main.tsx
      styles.css
docs/
  *.md
```

## 3. 技术栈选择

### Frontend: React 19 + Vite 7 + TypeScript

选择原因：

- 与 Convoy 现有技术栈接近，便于吸收其交互设计经验
- 交付原型快，适合一期快速迭代
- 生态成熟，长期维护成本低
- 后续如果需要 SSR 或营销站点，可单独扩展，不影响当前客户端

### BFF: Fastify 5 + TypeScript

选择原因：

- 轻量、性能好、结构清晰
- 非常适合“代理 + 聚合 + 规范化”类型接口层
- 比 Nest 更轻，适合一期快速推进
- 后续可继续加鉴权、限流、审计和面板聚合逻辑

## 4. 运行模式

`apps/api` 支持两种模式：

- `mock`: 使用本地 mock 数据，保证页面演示和 UI 联调稳定
- `live`: 调用 Paymenter 管理 API，读取真实商品与服务

## 5. 一期关键原则

- 前端不依赖 Paymenter 原始响应结构
- BFF 对外 contract 稳定优先
- 所有已知上游缺口都记录在文档，不在前端硬编码假设
- 服务详情页借鉴 Convoy 的信息架构，但不复用其业务逻辑

