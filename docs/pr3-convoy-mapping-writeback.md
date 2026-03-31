# PR3: Convoy 创建结果校验 + Mapping 回写严格化

## 改动文件清单
- `/E:/vps/Paymenter-master/Paymenter-master/app/Services/Provisioning/ProvisioningOrchestrator.php`
- `/E:/vps/apps/api/src/index.ts`

## 数据流说明
1. 编排任务调用 `ExtensionHelper::createServer($service)` 后，不再默认视为成功。  
2. 系统会强制检查并回读以下 mapping 键是否存在有效值：
   - `convoy_server_uuid`
   - `convoy_server_id`
   - `convoy_server_short_id`
   - `server_uuid`
3. 若创建返回成功但缺失映射键，则任务标记 `failed`，并记录响应用于排障。  
4. BFF 的 `/api/v1/services/:id/server*` 在无映射时会区分返回：
   - `SERVICE_PROVISIONING_PENDING`（仍在开通）
   - `SERVICE_PROVISIONING_FAILED`（开通失败，可重试）
   - `SERVICE_CONVOY_MAPPING_MISSING`（缺失映射）

## 部署步骤
1. 拉取代码后重建 `sloth-cloud-paymenter` 与 `sloth-cloud-api`。  
2. 启动容器并清缓存：
   - `php artisan optimize:clear`
3. 触发一次开通并观察日志，确认 mapping 键已回写。  

## 回滚步骤
1. 回退到 PR2 对应 commit。  
2. 重启 `sloth-cloud-paymenter`、`sloth-cloud-api`。  

## 验收步骤
1. 新订单开通后，服务 properties 必须出现至少一个有效 Convoy mapping 键。  
2. 若强制制造映射缺失，`provisioning_jobs` 应记录 `failed` 且前台返回 `SERVICE_PROVISIONING_FAILED`。  
3. 服务详情页调用 server API 时，不再出现“无意义 409”，而是可区分“开通中/开通失败/未映射”。  

