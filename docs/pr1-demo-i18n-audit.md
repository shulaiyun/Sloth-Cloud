# PR1 审计报告：去演示化与 i18n 清理

## 1. 发现的问题

### 1.1 词条和品牌文件损坏
- `/E:/vps/apps/web/src/lib/content.ts`
  - 出现编码污染（mojibake），语言标签和文案异常。
  - 多页面文案无法稳定随语言切换。
- `/E:/vps/apps/web/src/lib/brand.ts`
  - 品牌名和口号出现乱码，影响首页与导航展示。
- `/E:/vps/apps/web/src/lib/error-messages.ts`
  - 用户可见错误提示文本存在乱码，无法作为生产提示使用。

### 1.2 前台页面硬编码/半成品表达
- `/E:/vps/apps/web/src/pages/HomePage.tsx`
  - 残留偏“演示/技术说明”表达，缺少生产级空状态。
- `/E:/vps/apps/web/src/pages/ServicesPage.tsx`
  - 状态与筛选文案混用硬编码，不易统一多语言。
- `/E:/vps/apps/web/src/pages/InvoicesPage.tsx`
  - 账单状态与筛选排序文案存在硬编码。
- `/E:/vps/apps/web/src/pages/InvoiceDetailPage.tsx`
  - 支付提示、网关提示、按钮文案未完全词条化。
- `/E:/vps/apps/web/src/pages/ServiceDetailPage.tsx`
  - 服务操作与错误提示未统一归一化本地化。

### 1.3 BFF 用户可见文案不专业
- `/E:/vps/apps/api/src/lib/paymenter.ts`
  - live 场景下仍有 “mock/demo” 风格提示分支，影响产品可信度。

## 2. 已完成替换清单

### 2.1 词条体系重建
- 重建 `/E:/vps/apps/web/src/lib/content.ts`
  - 覆盖现有全部语言键：`zh-CN / zh-TW / en-US / ja-JP / ko-KR / de-DE / fr-FR / es-ES / ru-RU / pt-BR`
  - 统一页面级文案键：导航、首页、商店、商品详情、结算、服务、账单、服务详情、认证、页脚

### 2.2 品牌与错误提示修复
- 重建 `/E:/vps/apps/web/src/lib/brand.ts`
  - 统一品牌为：`树懒云 Sloth Cloud`
  - 统一口号为：`树懒云——一切皆服务`
- 重建 `/E:/vps/apps/web/src/lib/error-messages.ts`
  - 实现前端错误归一化映射（401/409/500 + 业务错误码）
  - 避免第三方原始错误直接暴露给用户

### 2.3 页面去演示化
- 已词条化并改为生产空状态：
  - `/E:/vps/apps/web/src/components/LanguageToggle.tsx`
  - `/E:/vps/apps/web/src/pages/HomePage.tsx`
  - `/E:/vps/apps/web/src/pages/ServicesPage.tsx`
  - `/E:/vps/apps/web/src/pages/InvoicesPage.tsx`
  - `/E:/vps/apps/web/src/pages/InvoiceDetailPage.tsx`
  - `/E:/vps/apps/web/src/pages/ServiceDetailPage.tsx`
  - `/E:/vps/apps/web/src/pages/ProductPage.tsx`
  - `/E:/vps/apps/web/src/pages/CheckoutPage.tsx`
  - `/E:/vps/apps/web/src/pages/LoginPage.tsx`
  - `/E:/vps/apps/web/src/pages/RegisterPage.tsx`

### 2.4 BFF 文案去演示化
- 更新 `/E:/vps/apps/api/src/lib/paymenter.ts`
  - 去除 live 用户可见响应中的 mock/demo 话术
  - mock 分支仅保留开发兼容逻辑，不向用户展示“半成品”提示

## 3. 验证结果
- `corepack pnpm --filter @sloth-cloud/web typecheck`：通过
- `corepack pnpm --filter @sloth-cloud/web build`：通过
- `corepack pnpm --filter @sloth-cloud/api typecheck`：通过
- `corepack pnpm --filter @sloth-cloud/api build`：通过

## 4. PR1 边界说明
- 本 PR 只覆盖：
  - 前台去演示化
  - i18n 基础清理
  - 前端错误归一化显示
- 不触碰：
  - 登录链路
  - Passport 初始化
  - Paymenter admin 可用性修复逻辑
  - Provisioning/Convoy 开通编排（将进入 PR2+）
