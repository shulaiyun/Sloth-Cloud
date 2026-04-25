# 统一 AI 工作台交付说明（本轮）

## 1) Root Cause 分析（已验证）
- **症状：切换左侧 workspace 后中间/右侧内容不一致。**
  - 根因：线程与 UI 状态未被显式建模为“按 workspace key 隔离”的可验证单元，缺少防重复与路由归一化辅助函数。
  - 修复：新增 `operator-workbench-state` 纯函数层，统一 `workspace -> threadKey -> state` 解析、旧路由跳转归一、卡片去重。
- **症状：仓库导入有时把自然语言拼进 clone URL。**
  - 根因：输入中 URL 与自然语言虽然有解析逻辑，但缺少前端 preflight 与可测试拆分模块。
  - 修复：新增 `operator-input`（前端）与 `assistant-repo-url`（后端）模块，统一“纯 URL + 任务描述”拆分。
- **症状：右侧部署状态无法结构化展示 SSH 阻塞。**
  - 根因：后端只有文本错误，没有独立 credential readiness 模型。
  - 修复：新增 `operator-readiness` 模型与映射规则，状态包含 `missing_credentials / auth_failed / host_unreachable / host_key_untrusted / ready`。
- **症状：AI 动作来源不透明（像“秒生成”）。**
  - 根因：响应体没有 `source` 字段，前端无法标识 `llm/system/preflight/mock`。
  - 修复：`/api/v1/assistant/messages` 与 `/api/v1/assistant/actions/confirm` 增加 `source`，前端开发模式展示来源。

## 2) 新信息架构
- **大厅态（未选中 workspace）**：仅保留欢迎与快速入口。
- **工作区态（已选中 workspace）**：仅保留 header、消息流、plan/confirm、composer。
- **真相面板**：`概览 / 日志 / 工件 / 部署`，部署页优先显示 SSH readiness 与下一步动作。

## 3) 新状态机（对齐实现）
- `draft -> parsing -> llm_planning -> awaiting_confirmation -> queued/running -> partial_success/success/blocked/failed/rolled_back`
- `blocked` 已加入前后端类型，并在动作结果 code 命中 `BLOCKED` 时落态。

## 4) 数据模型变化
- `AssistantMessagesResponse.data.source`、`AssistantConfirmResponse.data.source`：
  - `llm | system | preflight | mock`
- `OperatorEnvelope.credentialReadiness`：
  - `status/headline/detail/nextAction/checkedAt/source`

## 5) 路由模型
- 统一主路由：`/operator`、`/operator/:capsuleId`
- 兼容老路由：`/workspaces/:capsuleId`、`/capsules/:capsuleId` 与 `?capsule=...` 归一到新路由。

## 6) 已完成改造（本轮）
- 状态模型：workspace 线程隔离辅助层、消息/提案/系统卡去重。
- 输入解析：前端 preflight 非法 URL 拦截，后端 URL 提取模块化。
- 执行链可追踪：assistant 响应新增 `source`；开发模式展示来源。
- 真相面板：新增 SSH readiness 结构化卡片；生产发布按钮在 readiness 非 `ready` 时阻止触发。
- 部署门禁：后端发布链在 `publish_release` 前强制检查 readiness，不满足即 `blocked`。
- 部署流水线：新增 `pipeline_preflight` 步骤（并兼容旧状态文件自动补齐）。
- 标题可读性：workspace 标题增加容错解码，避免 `%E7...` 形式的编码串直接展示到左/中/右三栏。

## 7) 客观 blocker（仍存在）
- **服务器 #19 仍缺少可用 SSH 凭据**（或鉴权失败），因此生产部署被明确阻止，不会伪造成功。
- 当前仓库链路已能把阻塞结构化显示并给下一步动作，但无法在无凭据条件下完成真实生产发布。

## 8) 下一步最小增量
- 增加显式“执行 SSH 预检”按钮（独立 API），让用户在 deploy tab 一键重试 readiness。
- 将 #19 凭据录入流程（password/ssh-key/agent）与预检绑定到同一表单流，避免在不同入口来回切换。
