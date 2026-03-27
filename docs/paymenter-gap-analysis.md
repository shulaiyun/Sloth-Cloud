# Paymenter 一期接口缺口分析

基于 [api-1.json](E:\vps\Paymenter-master\api-1.json) 与源码初步确认：

## 已确认可用

- `/api/v1/admin/categories`
- `/api/v1/admin/products`
- `/api/v1/admin/products/{product}`
- `/api/v1/admin/services`
- `/api/v1/admin/services/{service}`
- `/api/v1/admin/orders`

这些接口可以支撑：

- 商品分类列表
- 产品基础详情
- 服务基础详情

## 已确认缺口

### 1. CategoryResource 未暴露 slug/description/image

源码中 `categories` 表有：

- `slug`
- `description`
- `image`
- `full_slug`

但 `CategoryResource` 当前仅暴露：

- `id`
- `name`
- `parent_id`
- `permissions`

影响：

- 商店分类页无法直接用真实 slug 做路由
- 分类描述与封面无法直接从公开 API 获取

一期处理策略：

- BFF 先为分类生成稳定 slug
- live 模式下分类描述先降级为运营文案模板

### 2. Product API 未暴露 configOptions

前台购买流程依赖：

- `configOptions`
- `checkoutConfig`

但当前 OpenAPI 与 admin 路由未提供对应接口。

影响：

- 购买配置页无法完整还原真实可配项

一期处理策略：

- 产品详情页保留配置器 contract
- mock 模式返回完整示例配置
- live 模式允许配置项为空，并给出“即将接入”的提示

### 3. ServiceResource 未暴露 plan / label / cancellable

当前 `ServiceResource` 缺少前台常用字段：

- `plan`
- `label`
- `cancellable`
- `upgradable`

影响：

- 客户服务详情页的续费周期、标签、动作区无法完全真实化

一期处理策略：

- label 由 BFF 根据 `productName + #id` 降级生成
- billing cycle 使用占位说明
- 动作区只保留信息性按钮，不接真实控制逻辑

## 结论

一期完全可做成一个高质量原型并接入部分真实 Paymenter 数据，但若要把购买配置页和服务详情页做成强可用生产版本，仍建议后续为 Paymenter 增补专用客户端 API 或扩展 admin API 暴露字段。
