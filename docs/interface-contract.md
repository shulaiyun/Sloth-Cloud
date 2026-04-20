# Sloth Cloud 一期接口约定

## 1. BFF 前缀

统一前缀：

```text
/api/v1
```

## 2. 一期接口清单

### `GET /api/v1/health`

返回服务状态与当前数据源模式。

### `GET /api/v1/catalog/home`

返回首页聚合数据：

- 品牌文案
- 统计卡片
- 推荐产品
- 分类导航

### `GET /api/v1/catalog/categories`

返回分类列表与分类下产品摘要。

### `GET /api/v1/catalog/categories/:categorySlug`

返回单个分类详情：

- 分类信息
- 分类内产品列表
- 节点/卖点标签

### `GET /api/v1/catalog/products/:productSlug`

返回产品详情：

- 产品基本信息
- 计划与价格
- 购买配置项
- 交付说明
- 当前数据源模式

### `GET /api/v1/client/services/:serviceId`

返回服务详情：

- 服务状态
- 产品信息
- 价格与续费信息
- 网络/属性信息
- 建议动作区

## 3. BFF 返回原则

- 不直接返回 Paymenter JSON:API 原始结构给前端
- 所有列表尽量返回前端可直接渲染的扁平结构
- 对 Paymenter 缺失字段，明确返回降级字段或占位字段

## 4. 关键 contract 说明

### ProductDetail

核心字段：

- `slug`
- `name`
- `tagline`
- `description`
- `startingPrice`
- `currency`
- `billingLabel`
- `plans[]`
- `configurableOptions[]`
- `purchaseNotes[]`
- `features[]`
- `sourceMode`

### ServiceDetail

核心字段：

- `id`
- `label`
- `status`
- `productName`
- `billingCycleLabel`
- `renewalAt`
- `price`
- `currency`
- `location`
- `network`
- `properties[]`
- `actions[]`
- `sourceMode`

### `POST /api/v1/operator/projects/analyze`

输入项目来源，返回统一的 Operator `capsule + plan + infra + logs + nextActions`。

### `POST /api/v1/operator/projects/generate`

输入自然语言想法，返回生成后的项目胶囊与预览路径。

### `POST /api/v1/operator/servers/scan`

输入旧服务器连接信息，返回只读体检结果、接管/迁移计划与后续动作。

### `POST /api/v1/operator/deployments/*`

统一处理预览与正式发布动作：

- `/preview`
- `/publish`

### `POST /api/v1/operator/services/*`

统一处理运行中的诊断、自动修复与回滚：

- `/diagnose`
- `/repair`
- `/rollback`

### `POST /api/v1/operator/domains/bind`

为胶囊绑定真实域名（Cloudflare DNS / Tunnel），并回写生产地址、TLS 状态和基础设施摘要。

### `POST /api/v1/operator/monitoring/enable`

为胶囊启用真实监控（Cloudflare Health Check）与告警策略，可联动 Email 与告警 Relay（飞书 / Telegram）。

### `POST /api/v1/operator/servers/*`

统一处理旧服务器接管与迁移：

- `/takeover`
- `/migrate`

### `GET /api/v1/operator/capsules`

返回最近的项目胶囊列表，前台可直接用来展示“最近上线 / 最近迁移 / 最近诊断”的入口卡片。

本地开发默认持久化到 `runtime/data/operator/capsules.json`，可通过 `OPERATOR_STATE_FILE` 覆盖。该文件保存 `capsule / plan / infraSummary / logsSummary`，确保 API 重启后仍能恢复项目胶囊与操作历史。

### `GET /api/v1/operator/capsules/:capsuleId`

返回项目胶囊详情：

- `capsule`
- `plan`
- `requiredConfirmation`
- `previewUrl`
- `productionUrl`
- `healthScore`
- `infraSummary`
- `logsSummary`
- `generatedProject`，当入口是 `generate-from-idea` 时返回真实源码包元数据，包含 `archiveUrl / manifestUrl / entryFile / runCommands / files`
- `nextActions`

### `POST /api/v1/operator/capsules/:capsuleId/cart`

把项目胶囊转入真实商业流程。接口要求登录态，会根据胶囊入口自动选择推荐商品：

- `upload-project` / `generate-from-idea`：优先选择 `managed-app` / `app-hosting` 商品
- `scan-server`：优先选择 `vps` / server migration 商品

可选输入：

- `productSlug`：手动指定商品
- `planId`：手动指定计费周期
- `quantity`
- `configOptions`
- `checkoutConfig`

返回：

- `capsule`
- `cart`
- `product`
- `plan`
- `selection.intent`
- `selection.reason`
- `redirect.path`，前台通常直接跳 `/checkout`
- `checkoutConfig`，包含 `operator_capsule_id / operator_capsule_name / operator_entry_kind / operator_preview_url` 等 AI 胶囊上下文，以及 `operator_project_bundle_url / operator_project_manifest_url / operator_project_entry_file` 等源码物料字段

如果同一个胶囊已经在购物车里，接口不会重复添加，会直接返回当前购物车并给出 `/checkout` 跳转。

### `GET /api/v1/operator/previews/:capsuleRef`

返回可直接打开的 HTML 预览页。`previewUrl` 在本地开发默认指向该端点，可通过 `OPERATOR_PREVIEW_BASE_URL` 调整公开访问前缀。

### `GET /api/v1/operator/generated-projects/:capsuleRef`

返回 AI 物料化后的源码包元数据，用于前台展示、管理员检查、后续部署流水线接力。

### `GET /api/v1/operator/generated-projects/:capsuleRef/archive`

返回 `tar.gz` 源码包下载流。要让“想法 -> 下单 -> 托管部署”真正闭环，需要把 `OPERATOR_ARTIFACT_BASE_URL` 配置成浏览器和构建节点都能访问的 API 地址。

## 5. 一期接口策略

- 商品与分类：优先真实读取 Paymenter
- 服务详情：优先真实读取 Paymenter，缺失字段采用 BFF 降级
- 购买配置：一期先支持原型 contract，live 模式允许为空数组
