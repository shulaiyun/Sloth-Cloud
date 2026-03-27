# Sloth Cloud API

树懒云 BFF。

## 设计目标

- 浏览器永远不直接访问 Paymenter token
- 对外暴露稳定、前端友好的 contract
- 一期支持 `mock` 与 `live` 两种模式

## 启动

```powershell
corepack pnpm --filter @sloth-cloud/api dev
```

