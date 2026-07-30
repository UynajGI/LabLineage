# API、Manifest 与数据库兼容策略

## 版本边界

- HTTP API 当前主版本为 `/v1`。同一主版本只允许新增可选字段、端点或枚举能力；删除字段、改变含义、收紧已公开输入或改变状态码语义必须发布新主版本。
- Manifest 当前版本为 `lablineage.manifest.v1`。JSON Schema 位于 `backend/schemas/manifest-v1.schema.json`，签名封装位于 `backend/schemas/signed-bundle-v1.schema.json`。
- `/api/version` 返回实现、API、Manifest 和 Collector 最低 Node.js 版本。
- `/api/openapi.json` 返回 OpenAPI 3.1.1 文档。`npm run validate:openapi --workspace backend` 会用规范解析器校验文档，并确认每个实现的 `/v1` 操作均有契约；CI 对漂移失败。

## 错误和追踪

普通错误响应：

```json
{
  "error": "Project access denied",
  "requestId": "request-or-trace-id"
}
```

输入校验错误额外包含 `issues`。服务端 5xx 不返回内部堆栈或秘密；使用响应头 `x-request-id` 或错误体 `requestId` 关联结构化日志和 Trace。

## 幂等和并发

- 每个 `/v1` `POST`/`PUT`/`PATCH`/`DELETE` 操作都必须提供 8–200 字符的
  `Idempotency-Key`。前端为每次用户动作生成一次，并在同一网络尝试中保持不变。
- 服务端在执行业务逻辑前持久化占位；相同主体、方法、路径、键和载荷会原样重放
  首次非 5xx 响应，并返回 `Idempotency-Replayed: true`。同一键对应不同载荷返回
  409，尚在执行的重复请求也返回带 `Retry-After` 的 409。
- 幂等记录保留 24 小时，PostgreSQL 投影使用租户 RLS 隔离。5xx 不会被缓存，
  断开的未完成请求会释放占位。
- Bundle ID 在来源内唯一；重复提交返回原导入任务，键或载荷冲突返回 409。
- Bundle 提交只持久化 `queued` 任务并返回 202；后台 worker 使用五分钟租约
  转为 `processing`，成功/失败进入终态。5xx 最多自动尝试三次并指数退避，
  进程启动会恢复 queued 和租约过期任务。
- 可查询任务响应永不包含暂存载荷；载荷在终态删除。修正验证失败时使用
  `POST /v1/ingestion-jobs/{jobId}/retry`，保留原 `bundle_id`、错误历史并重新排队。
- Workspace 使用数据库中的步骤进度和幂等键恢复，不依赖单进程内存。
- PostgreSQL `application_state` 更新在租户事务内 `FOR UPDATE`；规范化投影与状态提交属于同一事务。

## Manifest 兼容

- 未识别的非敏感扩展字段会保留在 evidence payload 中，便于 v1 的向前兼容。
- `content_hash` 始终是 SHA-256 格式；`fingerprint.strength` 明确区分 `strong`、`sampled` 和 `metadata_only`，不能把采样指纹表述成完整强哈希。
- 所有关系携带置信标签和 evidence ID。`human_verified` 只能由认证审核流程产生，Collector 不得自行宣称。
- 原始路径、原始文件、凭据、Token 和密码字段在导入前被拒绝。

## 数据库迁移与回滚

- 迁移文件使用连续、不可复用的三位序号。已应用迁移由内容校验和锁定，不允许原地修改。
- `npm run validate:migrations --workspace backend` 检查序号连续性，并要求每个租户表具有 `ENABLE RLS`、`FORCE RLS` 和策略；CI 阻止遗漏。
- `npm run validate:idempotency --workspace backend` 确认每个实现的 `/v1` 写路由
  都挂载持久化幂等中间件；OpenAPI 同时要求这些操作声明标准请求头。
- 发布流程先备份，再由独立迁移身份执行向前迁移，运行身份只获得所需 DML 权限。
- Schema 回滚采用“代码先兼容、数据库向前修复”的 expand/contract 策略；禁止在故障中直接删除列或回写旧迁移。破坏性 contract 迁移必须经过至少一个兼容发布周期和恢复演练。

## Agent 会话与执行轨迹

- `GET /v1/projects/{projectId}/agent/conversations` 列出当前认证主体在项目内的会话。
- `POST /v1/projects/{projectId}/agent/conversations` 创建新会话；`DELETE /v1/projects/{projectId}/agent/conversations/{conversationId}` 清除会话及 ADK 事件。两个写操作都要求 `Idempotency-Key`。
- `POST /v1/projects/{projectId}/agent` 必须提交 `message` 与 `conversationId`，且会话必须同时匹配租户、项目和认证主体。
- Agent 响应包含 `route`、`conversationId`、`model`、`usage`、`durationMs`、`toolCalls` 和结构化 `trace`。轨迹仅包含有界工具参数、证据 ID、R 等级和耗时，不记录凭据或原始研究路径。
- PostgreSQL 的 `agent_sessions` 与 `agent_session_events` 使用强制 RLS；迁移 010 是前向迁移，不修改已发布迁移。

内部 `/mcp/projects/{projectId}` 是 ADK 进程内使用的 MCP JSON-RPC 边界，
不属于面向客户端的 `/v1` API。它要求内部 bearer token，仅发布
`lineage_evidence` 与 `repository_evidence` 两个只读、非破坏性工具。

## 保留与删除

- 签名 Bundle、证据、审计事件和版本报告属于审计链，默认不可由普通用户物理删除。
- 来源断开只停止后续访问，历史证据继续保留并记录撤权主体和时间。
- 本地路径映射、失败导入暂存和可再生导出物可以按部署策略清理，但清理必须记录审计事件，且不得破坏已引用 evidence ID。
- 实际保留期限由机构数据政策、研究伦理和合同要求决定；生产上线前必须在部署配置中指定负责人和期限。
- 新生成的 Handoff 报告不再把 Markdown 正文放进数据库状态。开发环境使用
  不可变本地对象键；生产环境默认且必须使用 GCS，写入带
  `ifGenerationMatch=0`、CRC32C 和 SHA-256 元数据。
- 报告读取会重新计算 SHA-256；校验不一致返回 500 并进入结构化错误日志。
  API 不暴露本地内部路径，PostgreSQL 仅投影对象 URI、generation、校验和和大小。
- Terraform 运行身份只有 object creator/viewer，没有 delete 权限；桶至少保留
  30 天，默认在 365 天按生命周期删除。环境的数据保留审批可以延长该周期。

## 仓库同步契约

`POST /v1/projects/{projectId}/repositories/sync` 使用 `provider` 判别联合：

- `github` 需要 `owner`、`repo`，可选 `branch` 与 `limit`。
- `local_git` 需要允许目录内的 `path`，可选 `branch`、`limit` 与
  `treeLimit`（最大 100,000）。

两种提供者都返回统一的仓库摘要和采集计数，并生成同一类 CodeVersion、
RepositorySnapshot、evidence 与 lineage edge。原始本地路径和内部允许根不在
响应或 evidence 中出现。旧的 `/github/sync` 在 v1 内保留兼容。

## 导入载荷对象

导入任务的原始 JSON 不再存入 `application_state` 或规范化业务表。任务只保存
`payload_object_key`、私有 storage URI、generation、SHA-256 和字节数；API
会移除这些内部引用。worker 读取对象后必须重新计算 SHA-256。成功、不可重试
失败或验证失败会从活跃任务状态移除对象引用；底层不可变对象由批准的保留与
生命周期策略清理，以便事件调查且不向运行身份授予删除权限。
