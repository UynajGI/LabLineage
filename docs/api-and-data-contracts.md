# API、Manifest 与数据库兼容策略

## 项目目标与自动分析契约

项目创建请求同时写入第一版目标：`objective`、`successCriteria[]`、
`keyOutputs[]` 和可选 `constraints[]`。目标更新追加版本，不原地改写；每个
`AnalysisRun` 固定 `intentVersion`，因此后续修改目标不会改变历史报告。

主要 API：

- `POST /v1/projects`：创建项目和目标 v1。
- `GET /v1/projects/{projectId}`：返回项目、当前目标和汇总状态。
- `POST /v1/projects/{projectId}/intent-versions`：携带 `expectedVersion` 追加目标版本。
- `POST /v1/projects/{projectId}/collectors/pairings`：创建短期一次性配对码。
- `POST /v1/collectors/pair`：用短码和 Collector 公钥换取项目限定凭据。
- `POST /v1/projects/{projectId}/collector-runs`：校验签名、保存不可变输入并
  自动创建分析运行。
- `POST /v1/projects/{projectId}/sources/github`：通过 GitHub App 固定 commit SHA、
  保存不可变仓库证据并自动创建分析运行。
- `POST /v1/projects/{projectId}/archives`：离线 ZIP 兜底；返回 `202` 和运行摘要，
  不再同步返回快照。
- `GET /v1/projects/{projectId}/analysis-runs` 与
  `GET /v1/projects/{projectId}/analysis-runs/{runId}`：读取运行和阶段事件。
- `POST .../{runId}/retry`、`POST .../{runId}/cancel`：只对合法状态生效。
- `GET .../{runId}/report`：读取确定性判定、证据引用和独立 ADK 摘要。

所有写路由声明并持久化 `Idempotency-Key`。运行状态为 `queued | running |
completed | partial | failed | cancelled`；步骤状态为 `pending | running |
succeeded | skipped | failed`。事件是追加式的，重试不删除旧错误和尝试记录。
终态报告仅暴露安全来源摘要、revision、证据 ID 和校验和，不暴露 GCS object key、
GitHub 安装令牌、Collector 凭据或绝对路径。

### 来源约束

- **Collector**：配对短码单次、短期有效；凭据绑定 tenant/project/source 和公钥
  指纹。Manifest 的签名、请求摘要、时钟窗口和重放均校验。撤销后所有后续提交
  返回鉴权失败。
- **GitHub App**：浏览器只提交仓库标识和可选分支。服务端读取 App 私钥 secret，
  使用最小只读权限；`403`、`404`、`429` 保持可区分，重试仍固定首次解析的 SHA。
- **ZIP**：100 MB 压缩包、200 MB 解压总量、10,000 条、单文件 50 MB；拒绝
  符号链接、路径穿越、异常压缩比和大小不一致。载荷先写不可变对象，再由隔离 worker
  解压扫描，临时目录在成功和失败路径都清理。

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

## 交接单（HandoffOrder）契约

交接事件（离任/接收/审核人、截止时间）属于可重复、可审批、可追踪的**交接单**，
不再属于全局系统设置。`/v1/setup` 只保存机构资料、项目默认值与数据策略；
`defaultRegion` 必须是 Cloud Run 区域白名单内的值（或空），不再接受自由输入。

- `GET /v1/projects/{projectId}/handoffs` — 列表，支持 `status`、`filter=needs_review|needs_accept|overdue`、`completed`
- `POST /v1/projects/{projectId}/handoffs` — 创建草稿单（人员 subject + 邮箱快照、截止时间、时区、任务）；返回 `HO-YYYYMM-NNN` 单号
- `GET/PATCH /v1/handoffs/{handoffId}` — 读取/更新（仅 draft/changes_requested，PATCH 必须携带 `expectedVersion`）
- `POST /v1/handoffs/{handoffId}/submit|reviews|accept|complete|cancel` — 状态迁移
- `POST /v1/handoffs/{handoffId}/tasks/{taskId}/status` — 任务 `pending|done|blocked`
- `GET /v1/handoffs/{handoffId}/events` — 追加式事件时间线
- `POST /v1/handoffs/{handoffId}/exports/preview|execute` — 预览/导出，执行绑定 `previewSha256`

状态机：`draft → submitted → in_review → approved → receiver_accepted → completed`，
含 `changes_requested`（退回 submitted）与 `cancelled`。约束：

- `overdue` 由 `dueAt` 动态计算，不是可写状态。
- 审核必须由指定审核人的认证 subject 完成；接收确认必须由接收成员 subject 完成；邮箱仅作快照，不是权限依据。
- 完成由确定性服务判定：已批准 + 全部必需任务 done。
- Workspace 导出仅限 `receiver_accepted`/`completed`，且必须提供与当前预览一致的 `previewSha256`。
- 所有写操作要求 `Idempotency-Key`；状态变更与更新携带 `expectedVersion`（冲突返回 409）。

## 仓库同步契约

`POST /v1/projects/{projectId}/repositories/sync` 使用 `provider` 判别联合：

- `github` 需要 `owner`、`repo`，可选 `branch` 与 `limit`。
- `local_git` 需要允许目录内的 `path`，可选 `branch`、`limit` 与
  `treeLimit`（最大 100,000）。

两种提供者都返回统一的仓库摘要和采集计数，并生成同一类 CodeVersion、
RepositorySnapshot、evidence 与 lineage edge。原始本地路径和内部允许根不在
响应或 evidence 中出现。旧的 `/github/sync` 在 v1 内保留兼容。

## 项目归档上传（zip 扫描）契约

`POST /v1/projects/{projectId}/archives` 接受 `multipart/form-data`，字段
`file`（`.zip`）。API 先完成中央目录预检并把原始包写入不可变对象存储，然后
创建 `inputKind=zip` 的持久分析运行；worker 从对象读取并校验 SHA-256，在隔离
临时目录中解压后执行统一扫描、图谱、审计、目标判定和可选 ADK 总结管线。

- **幂等**：与所有 v1 写路由一致，必须携带 `Idempotency-Key`；重放时按第一次
  响应返回，并清理本次已解析的临时归档。
- **安全上限**：zip ≤ 100 MB；解压后总字节 ≤ 200 MB；条目数 ≤ 10,000；单文件
  ≤ 50 MB（与扫描器 `maxBytes` 对齐）。超限返回 `413`。
- **条目名防御**：`..` 段、绝对路径、Windows 盘符（`C:`）、NUL 字节、反斜杠、
  符号链接、异常压缩比和声明大小不一致都会阻断载荷；非 zip 返回 `415`，空归档
  返回 `400`。
- **临时目录**：解压在系统临时目录进行，扫描完成或失败后立即递归清理，zip
  内容不落库（只保留指纹化的快照）。
- **响应 202**：`{ run, source }`，随后通过 analysis-runs API 观察真实阶段状态。
  响应不返回文件正文、绝对路径或内部 object key。

解压根通过 `allowedRoot` 传入扫描器，不依赖 `LABLINEAGE_SCAN_ROOT` 白名单——
该白名单约束的是"任意服务器路径扫描"，而解压目录是系统为本次上传创建的受控
临时目录。生产环境同样适用（`redactPaths` 与 `LABLINEAGE_PATH_SALT` 生效）。

## 谱系推断候选契约

`POST /v1/projects/{projectId}/lineage-proposals` 接收 Guardian Agent 对项目
文件推断的谱系候选（`nodes` + `edges`），由确定性服务校验后落库为**推断**
节点/边，不改变任何既有事实：

- **节点**必须引用最新扫描快照中真实存在的 `pathToken`（文件指纹即证据）；
  `kind` 限 Project / CodeVersion / Dataset / ParameterSet / Environment / Run /
  Figure / Conclusion / Script / Data / Output。
- **边**的 `relation` 限 executed_as / used_input / used_parameter_set /
  used_environment / generated / supports；`source`/`target` 必须是快照文件或
  本批节点。校验失败返回 `400`；项目尚无快照返回 `409`。
- **幂等**：复用 `Idempotency-Key` 重放；重复提交去重（同节点复用、同边跳过）。
- **落库形态**：节点 `confidence=inferred`、`status=inferred`；证据为
  `file_fingerprint` 记录，payload 只含 pathToken（相对 token，生产为 `pth_`
  哈希）与 `contentHash`，**不含绝对路径**。
- 推断边可走现有 `POST /v1/lineage-edges/{edgeId}/review` 审计流程，确认后
  升级为事实（`human_verified`）。
- `GET /v1/projects/{projectId}/lineage-proposals` 返回历史候选摘要
  （proposalId / 来源 / 节点边计数 / 时间）。

## 导入载荷对象

导入任务的原始 JSON 不再存入 `application_state` 或规范化业务表。任务只保存
`payload_object_key`、私有 storage URI、generation、SHA-256 和字节数；API
会移除这些内部引用。worker 读取对象后必须重新计算 SHA-256。成功、不可重试
失败或验证失败会从活跃任务状态移除对象引用；底层不可变对象由批准的保留与
生命周期策略清理，以便事件调查且不向运行身份授予删除权限。
