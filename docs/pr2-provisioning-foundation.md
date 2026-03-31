# PR2: Provisioning 基础设施 + 状态机 + 重试

## 改动文件清单
- `/E:/vps/Paymenter-master/Paymenter-master/database/migrations/2026_03_31_120000_create_provisioning_jobs_table.php`
- `/E:/vps/Paymenter-master/Paymenter-master/database/migrations/2026_03_31_120100_create_provisioning_mappings_table.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Models/ProvisioningJob.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Models/ProvisioningMapping.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Models/Service.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Services/Provisioning/ProvisioningMappingResolver.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Services/Provisioning/ProvisioningOrchestrator.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Jobs/Provisioning/ProcessProvisioningJob.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Console/Commands/ProvisioningRun.php`
- `/E:/vps/Paymenter-master/Paymenter-master/routes/console.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Http/Controllers/Api/V1/Checkout/CheckoutController.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Services/Service/RenewServiceService.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Http/Controllers/Api/V1/Concerns/SerializesHeadlessResources.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Http/Controllers/Api/V1/Services/ServiceController.php`
- `/E:/vps/Paymenter-master/Paymenter-master/routes/api.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Admin/Resources/ServiceResource.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Admin/Resources/ProvisioningMappingResource.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Admin/Resources/ProvisioningMappingResource/Pages/ListProvisioningMappings.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Admin/Resources/ProvisioningMappingResource/Pages/CreateProvisioningMapping.php`
- `/E:/vps/Paymenter-master/Paymenter-master/app/Admin/Resources/ProvisioningMappingResource/Pages/EditProvisioningMapping.php`
- `/E:/vps/Paymenter-master/Paymenter-master/config/services.php`
- `/E:/vps/apps/api/src/lib/types.ts`
- `/E:/vps/apps/api/src/lib/paymenter.ts`
- `/E:/vps/apps/api/src/index.ts`

## 数据流说明
1. 用户支付成功后，`CheckoutController` / `RenewServiceService` 会优先判断是否需要 Convoy 编排。  
2. 满足条件时不直接 `CreateJob`，而是写入 `provisioning_jobs`（`pending`）并分发 `ProcessProvisioningJob`。  
3. `ProvisioningOrchestrator` 执行时：
   - 读取 `provisioning_mappings` 做 product/plan 匹配；
   - 将模板/节点/资源策略先写入 service properties；
   - 调用 `ExtensionHelper::createServer($service)` 触发现有 server extension；
   - 成功后回写映射键：`convoy_server_uuid / convoy_server_id / convoy_server_short_id / server_uuid`；
   - 失败写入 `error_message`、`response_payload` 并按重试策略等待下一次调度。  
4. Headless Service API 会附带 `service.provisioning`，BFF 继续统一对前端暴露。  
5. 新增 BFF 路由：
   - `GET /api/v1/services/:serviceId/provisioning`
   - `POST /api/v1/services/:serviceId/provisioning/retry`

## 环境变量新增项
### Paymenter
- `PROVISIONING_ENABLED=true|false`
- `PROVISIONING_MAX_ATTEMPTS=3`
- `PROVISIONING_RETRY_BASE_MS=30000`
- `PROVISIONING_RETRY_MAX_MS=300000`
- `PROVISIONING_LOCK_TTL_MS=120000`

### apps/api（BFF）
- `CONVOY_SERVER_REF_KEYS=convoy_server_uuid,convoy_server_id,convoy_server_short_id,server_uuid`

## 部署步骤
1. 拉取代码并切换到本次提交版本。  
2. 重新构建并启动 Paymenter + API + Web：  
   - `docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml build --no-cache sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web`
   - `docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d`
3. 执行迁移：
   - `docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan migrate --force`
4. 清缓存：
   - `docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan optimize:clear`
5. 验证编排命令可用：
   - `docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan app:provisioning:run --limit=5`

## 回滚步骤
1. 回滚代码到上一个稳定 commit。  
2. 将 `PROVISIONING_ENABLED=false`，重启容器（保留数据）。  
3. 如需回滚结构：
   - `php artisan migrate:rollback --step=2 --force`
   - 仅在确认没有使用新表数据时执行。  

## 验收步骤
1. 新支付一个 Convoy 产品，检查 `provisioning_jobs` 有记录，状态从 `pending -> provisioning -> success/failed`。  
2. 在 Paymenter 服务详情 properties 中确认映射键已落库。  
3. 访问 BFF：
   - `GET /api/v1/services/:id` 包含 `provisioning`
   - `GET /api/v1/services/:id/provisioning` 返回历史与失败原因  
4. 触发失败场景（映射缺失）后，确认状态 `failed`、有错误消息、可调用 retry。  
5. 后台服务列表可看到 Provisioning 状态和最近错误摘要。  

