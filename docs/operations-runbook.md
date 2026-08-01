# LabLineage Guardian 运行手册

## 部署模式基线

- `local` 仅绑定 loopback，使用本地对象目录和 inline worker；启动时恢复过期 lease。
- `google_cloud` 必须同时具备 PostgreSQL、OIDC、GCS、Cloud Tasks worker URL、
  服务根 audience、调用身份和项目配置。Cloud Tasks 只以 OIDC 调用私有
  `/internal/analysis-worker`，请求体只含 `runId`。
- Google Cloud 默认使用 Vertex AI application-default credentials。若例外使用
  Gemini key，只能引用既有 Secret Manager version；不得把密钥放入 tfvars、
  Terraform state、镜像、日志或部署证据。
- GitHub App 私钥同样只从 Secret Manager 注入。Terraform 创建空 secret 容器，
  运维人员在带外增加 version；App ID 和 installation ID 必须成对配置。

## 自动分析运行故障

1. 从 `GET /v1/projects/{projectId}/analysis-runs/{runId}` 记录 run、当前 step、
   attempts、safe error、lease 和事件时间线；不要查询或复制内部 object key。
2. `queued` 长时间不动：本地模式检查 inline dispatcher；云模式检查 Cloud Tasks
   queue 深度、任务 OIDC audience、worker invoker IAM 和 Cloud Run 请求日志。
3. `running` 超过 lease：先确认没有活跃 worker，再重启服务触发恢复。禁止手改
   PostgreSQL 状态。Cloud Tasks 名称含稳定幂等标识，重复调度不会重复执行终态运行。
4. 可重试失败：修复外部原因后调用 run `retry`，它只从失败阶段继续，旧事件和
   尝试记录保留。输入 checksum、GitHub SHA 和 intentVersion 不变。
5. 不可重试或用户主动终止：调用 `cancel`。终态运行不可取消；取消不会删除不可变
   输入或已有审计证据。
6. ADK 阶段单独失败时运行应为 `partial`，确定性报告仍可用。不得为了显示绿色而
   把 Agent 失败改写为成功。

告警 `Cloud Tasks attempt_count > 20/5m` 表示自动分析重试压力。先按错误码区分
GitHub `403/404/429`、GCS checksum、OIDC 和模型配额，再决定重试；不要无界扩容。

## Collector 撤销与轮换

控制台撤销项目来源后，项目限定凭据立即失效。轮换时创建新 pairing、在本机完成
一次签名同步并确认来源在线，然后撤销旧来源。短码过期只需重新生成，不要延长旧码。
泄漏事件需要保留 audit event、受影响 source ID 和时间窗，但不得保留短码、凭据、
私钥或绝对路径。

## 部署后 canary

受保护环境部署只有同时满足 readiness 与端到端 canary 才能标记成功。canary 创建
隔离项目和目标，提交签名 Collector fixture，并通过沙箱 GitHub App 只读连接
`STAGING_CANARY_GITHUB_REPOSITORY`；两条路径都必须到达终态、生成目标判定和报告
checksum。受保护环境必须配置 `STAGING_CANARY_BEARER_TOKEN`；缺少令牌、沙箱仓库或
外部权限会使部署失败并恢复上一镜像，证据不得声称 canary 已通过。迁移保持前向兼容。

## 健康、指标与追踪

- 存活检查：`GET /api/health`，无需身份令牌。
- 就绪检查：`GET /api/ready`，会实际刷新存储；数据库不可用时返回 503。
- 能力状态：`GET /v1/capabilities`，显示实际配置，不返回模拟成功。
- Prometheus 指标：`GET /v1/metrics`，要求 `admin` 角色。
- 每个响应携带 `x-request-id`。服务日志为单行 JSON，记录请求 ID、主体、路由、状态和耗时，不记录令牌或请求正文。
- 设置 `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` 后启用 OTLP/HTTP Trace；未设置时不发送任何遥测。
- Prometheus 规则位于 `deploy/prometheus-alerts.yml`。

## 部署

1. 为 PostgreSQL 迁移和应用运行分别创建身份；应用身份不得拥有 DDL 权限。
2. 设置 `DATABASE_URL`，用迁移身份运行 `npm run migrate`。
3. 用迁移身份预置租户；为应用设置 `LABLINEAGE_TENANT_ID`、slug、OIDC issuer、audience 和 JWKS URL。生产运行身份不得启用 `LABLINEAGE_ALLOW_TENANT_BOOTSTRAP`。
4. 配置受信 Collector SPKI 指纹，并在生产启用签名 Manifest。
5. 部署不可变镜像，执行健康、认证、项目隔离和 Manifest 幂等检查。
6. 验证 Agent 只暴露只读工具，并执行静态轨迹评测。

## 备份与恢复

- PostgreSQL 每日基础备份并开启 WAL 归档，至少保留 30 天。
- 每月在隔离环境执行计时恢复演练，核对项目、artifact version、evidence 和最新 audit event 数量。
- `.lablineage` JSON 只用于开发，不属于生产恢复目标。
- Collector SQLite 是可重建缓存；签名 Bundle 是必须保留的交换证据。
- 目标：RPO 24 小时，RTO 4 小时。试点前必须用真实云数据库完成一次恢复演练。

创建带 SHA-256 校验文件的备份：

```powershell
.\scripts\backup-postgres.ps1 -OutputDirectory D:\lablineage-backups
```

恢复脚本会执行 `--clean`，必须显式输入目标数据库名以防误操作：

```powershell
.\scripts\restore-postgres.ps1 -BackupFile D:\lablineage-backups\lablineage-20260101-010101.dump -ConfirmDatabase lablineage
```

## 回滚

1. 停止写流量，或将 Gateway 切换为只读。
2. 回滚到上一个不可变镜像版本。
3. 数据库迁移默认只前进；破坏性变更必须附独立回滚脚本并先通过恢复演练。
4. 重新检查健康、认证、项目隔离、Manifest 幂等和 Agent 只读工具。

## API unavailable

1. 检查 `GET /api/health`、进程状态和 8788 端口。
2. 检查 PostgreSQL 连接池、已应用迁移和磁盘空间。
3. 若刚发生热重启，确认日志出现 `API listening`；前端 GET 会在短暂窗口内自动退避重试。
4. 超过两分钟仍未恢复时，回滚上一镜像并保留相关 Trace 和日志。

## Elevated error rate

1. 按 `traceId`、`requestId`、route 和 status 聚合 5xx。
2. 检查数据库超时、OIDC/JWKS 失败、外部连接器限流和 Manifest 验证错误。
3. 外部平台故障时关闭对应能力，不得伪造成功；核心谱系查询保持可用。

## Elevated latency

1. 区分 API、PostgreSQL、Vertex、GitHub 和 Workspace spans。
2. 检查连接池饱和、慢查询和外部 API 429。
3. 必要时暂停同步/Agent 非关键流量，优先保证只读谱系和审计查询。

## Agent token spike

1. 检查 `lablineage_agent_tokens_total` 的 model 和 input/output 方向。
2. 按审计事件识别异常主体；必要时撤销其 token 或降级 Agent 能力。
3. 保留请求元数据但不得记录完整提示词中的秘密。

## Ingestion queue stalled

1. Query `/v1/metrics` and confirm
   `lablineage_ingestion_oldest_queued_seconds` and the queued/processing
   gauges.
2. Query `/v1/ingestion-jobs/{jobId}`. The response never exposes the durable
   payload; inspect `attempts`, `nextAttemptAt`, `leaseExpiresAt`, and the safe
   error object.
3. If the owning process died, restart the API. Startup recovery requeues jobs
   whose processing lease expired and resumes queued jobs from the durable
   application state.
4. If multiple instances are running, confirm their clocks and PostgreSQL
   connectivity before intervening. Do not edit a live lease by hand.
5. Escalate if a valid job remains queued for ten minutes after recovery.

## Ingestion job failed

1. Read the job's safe error and correlate its request/audit records. Raw
   payloads are removed on terminal success or failure.
2. Correct the manifest locally while preserving the original `bundle_id`.
3. Call `POST /v1/ingestion-jobs/{jobId}/retry` with a new
   `Idempotency-Key`, `confirmation: RETRY_INGESTION_JOB`, and the corrected
   manifest.
4. Poll the job until `completed` or `failed`. The previous safe error remains
   in `errorHistory`; repeated server errors use bounded exponential retry and
   a maximum of three automatic attempts.
5. Disconnect the source if validation failures indicate a compromised or
   misconfigured collector.

## 凭据轮换与撤销

- Google、GitHub、OIDC 和 Collector 凭据不得写入仓库或应用日志。
- 轮换服务 token 时先加入新 SHA-256 摘要，再切换 Collector，最后删除旧摘要。
- 撤销 Workspace 权限后，能力检查和实际调用必须明确失败，禁止伪造成功。
- 发生泄漏时立即撤销凭据、保存审计日志、评估访问范围并生成事件报告。

## 对象载荷故障

1. 检查任务的 `payloadSha256`、对象存储可用性和 worker 结构化日志；API 不会
   返回私有 object key。
2. checksum mismatch 视为完整性事件，暂停该来源和自动重试，保留对象与审计
   日志，检查 GCS generation/CRC32C。
3. 本地开发对象位于 `LABLINEAGE_DATA_DIR/objects`，不得手工覆盖。生产运行
   身份没有删除权限；清理由 Bucket retention/lifecycle 执行。
4. 验证失败的 Bundle 只能通过显式 `RETRY_INGESTION_JOB` 和原 `bundle_id`
   提交修正内容，新载荷使用新的不可变对象键。

## 本地 Git 连接器

- 设置以操作系统路径分隔符连接的 `LABLINEAGE_LOCAL_GIT_ROOTS`。
- `403` 表示真实路径解析后不在允许根；不要通过放宽到磁盘根目录解决。
- `422` 表示仓库、revision 或 Git 对象不可读取；使用扫描身份在命令行执行
  `git -C <repo> rev-parse --verify HEAD` 验证。
- 默认树上限 10,000，最大 100,000；`treeTruncated=true` 时缩小仓库范围或在
  审批后提高该次请求上限。

## GitHub Actions 部署

1. Terraform 开启 `enable_github_deploy`，并把输出映射到受保护 GitHub
   environment；不得创建长期 GCP JSON key。
2. staging 自动部署还需设置 `ENABLE_STAGING_DEPLOY=true`；production 只允许
   手动触发并经过 environment 审批。
3. 工作流先更新/执行迁移 Job，再更新 Cloud Run。readiness 100 秒内不成功会
   自动恢复上一个镜像。
4. 回滚后核对迁移是否为向前兼容；数据库只能通过新的修复迁移前进，禁止回写
   或删除已应用迁移。

## ADK 会话与受控在线评测

- 生产必须使用 PostgreSQL 保存 `agent_sessions` 和
  `agent_session_events`；不得以 JSON 状态作为生产会话存储。
- 会话隔离键为 `projectId + actorId + conversationId`。清理会话应调用
  `DELETE /v1/projects/{projectId}/agent/conversations/{conversationId}`，
  并保留对应审计事件，不要直接删表。
- 可选设置 `LABLINEAGE_MCP_INTERNAL_TOKEN`；未设置时进程会生成随机内部
  token。该值不得进入浏览器、日志、报告或仓库。
- GitHub 仓库 Secret `GOOGLE_GENAI_API_KEY` 仅供
  `Live Agent Evaluation` 工作流使用。工作流每天 02:00（Asia/Shanghai）
  以及手动触发时运行，并上传 `live-agent-eval-evidence`，保留 30 天。
- 证据 JSON 必须包含提交 SHA、模型、每个用例的隔离 conversationId、
  route、response、结构化 trace、toolCalls、token usage 和 latency。未配置
  Secret 时工作流明确产出 `skipped` 证据，不得伪称在线评测通过。
- 手动执行：GitHub Actions → **Live Agent Evaluation** → **Run workflow**。
  评测失败时先下载证据，检查路由、工具轨迹、超时和 token 使用；不要把
  响应全文复制到公开 issue，除非已完成科研数据审查。
