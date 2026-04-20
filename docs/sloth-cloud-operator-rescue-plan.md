# Sloth Cloud Operator Rescue Plan

## Goal

把当前项目从“会生成概念页的 AI 上线演示”收拢成一条真正可成交、可迁移、可继续开发的产品链路：

用户一句话描述目标 -> AI 生成可体验的第一版应用 -> 部署共享预览环境 -> 用户觉得可用再购买托管或迁移到自己的服务器。

## 正确的产品形态

这不是一个“海报生成器”，也不是一个“插件项目”。

它应该是一个面向普通用户的 AI 应用交付系统：

- 用户端像 Codex 一样，用自然语言提出目标
- 系统先进入 `plan mode`，产出结构化方案和风险边界
- AI 生成真正可运行、可交互的第一版应用
- 平台把同一个项目胶囊部署到共享预览环境
- 用户满意后，再把同一个胶囊推进到托管、域名、监控、计费
- 如果用户有旧服务器，再走扫描、接管、迁移这条线

## 三层结构

### 1. 普通用户客户端

用户真正接触的是 `AssistantWidget` 和 `AI Launch` 页面。

它负责：

- 接收自然语言目标
- 展示计划、预览、下一步动作
- 让用户先体验，再决定是否购买

它不该暴露插件、MCP、复杂运维术语给普通用户。

### 2. Capsule / Operator API

`Capsule` 是整个系统的统一执行单元。

它负责保存：

- 用户目标
- AI 生成物
- 预览地址
- 发布状态
- 日志
- 修复动作
- 迁移动作
- 商业化上下文

这层应该是整个平台唯一的执行真相来源。

### 3. Codex 插件

`plugins/sloth-cloud-operator` 不是单独产品，而是给 Codex/MCP/管理员用的专业入口。

它的职责是：

- 让 Codex 直接调用 `sloth_*` 能力
- 打开同一个 capsule
- 执行诊断、发布、回滚、迁移

如果某个能力只存在于插件而不在 Operator API 里，说明架构已经漂移。

## 为什么现在会有“烂尾感”

当前问题不是入口没有，而是主价值链在中间断了：

- `AssistantWidget` 已经可以触发 “一句话 -> launch capsule”
- `Operator API` 已经有 `generate / preview / publish / cart / migrate`
- `Codex` 插件也已经能桥接这些接口

但是 “生成第一版应用” 这一层仍然偏模板化，导致用户打开预览时感受到的是概念展示，而不是可玩的应用原型。

这会直接打断核心转化链路：

用户表达目标 -> 打开预览 -> 觉得只是个海报 -> 不愿意继续购买或迁移

## 救火原则

### 原则 1

先把 “想法 -> 可体验预览” 做强，再谈复杂接管和高级编排。

### 原则 2

插件只做 Codex 能力桥，不承担普通用户入口职责。

### 原则 3

购买和托管应该是 “提升同一个 preview capsule”，而不是重新来一遍。

### 原则 4

旧服务器接管必须后置到扫描报告之后，不能作为主叙事入口。

## 目标架构

### A. First Run

用户在客户端输入：

- 做一个预约应用
- 做一个小游戏
- 把这个项目部署出来
- 扫描我现在的服务器

系统先返回：

- 计划摘要
- 风险说明
- 推荐技术路线
- 是否继续生成

确认后才真正生成项目胶囊。

### B. Interactive Prototype

第一版生成物必须是“可交互应用原型”，至少应具备：

- 页面切换或多区块交互
- 可编辑示例数据
- 可演示的用户流程
- 可继续开发的源码包
- 明确的运行命令和部署入口

不能再只是一张大字概念页。

### C. Shared Preview Runtime

预览环境应该跑在共享运行时上，短期可以是：

- 单个 k8s 集群的临时 namespace
- 或统一的 managed app runtime

目标不是一开始就把每个用户迁到独立服务器，而是先低成本验证体验和转化。

### D. Promotion Path

用户体验通过后：

1. 继续托管在树懒云
2. 绑定域名和监控
3. 若用户后续想独立，再购买服务器并迁移
4. 若用户已有旧服务器，再用同一套 capsule 做迁移/接管

也就是说：

先预览，后购买，再决定是否独立部署。

## 当前仓库的直接改造重点

### 第一批

- `vps/apps/api/src/lib/operator.ts`
  - 默认生成结果从海报式 scaffold 升级成可互动原型
- `vps/apps/api/src/index.ts`
  - assistant 的 idea launch 回包要强调“可体验第一版应用”，不是“生成页面”
- `vps/apps/web/src/components/AssistantWidget.tsx`
  - 逐步加上 `plan mode -> confirm -> build`
- `vps/apps/web/src/components/LaunchStudio.tsx`
  - 把“可运行骨架”改成“可交互第一版”
- `plugins/sloth-cloud-operator`
  - 明确定位为 Codex / MCP bridge

### 第二批

- 将 preview artifact 和 checkout / provisioning 串成同一个 promotion flow
- 为共享 preview runtime 补齐 runtime contract
- 将 BYOS scan / takeover / migrate 变成 preview 之后的高级路径

## Phase 1 Definition Of Done

做到下面四条，这个项目就不再像烂尾：

- 用户说 “做一个 XXX 应用”，打开的是可体验的交互原型，而不是概念海报
- capsule 页面能看到预览、源码包、后续动作和托管入口
- 同一个 capsule 能被 web 客户端和 Codex 插件同时打开与操作
- 用户可以在体验后选择 “继续托管” 或 “迁移到自己的服务器”

## 一句话判断标准

以后每做一个功能，都问自己一句：

这个改动，是不是在增强 “一句话 -> 真实应用 -> 预览 -> 托管/迁移” 这条主链？

如果不是，就先别做。
