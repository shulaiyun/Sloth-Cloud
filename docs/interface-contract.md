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

## 5. 一期接口策略

- 商品与分类：优先真实读取 Paymenter
- 服务详情：优先真实读取 Paymenter，缺失字段采用 BFF 降级
- 购买配置：一期先支持原型 contract，live 模式允许为空数组

