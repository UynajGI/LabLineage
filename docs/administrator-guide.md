# LabLineage Guardian 管理员指南

## 两种正式运行模式

用 `LABLINEAGE_DEPLOYMENT_MODE=local|google_cloud` 显式选择，不依赖 `NODE_ENV`
猜测后端：

- `local`：loopback API、本地 JSON/可选 PostgreSQL、本地不可变对象目录、inline
  worker。适合单机开发和本地数据不离机的使用。
- `google_cloud`：Cloud Run、Cloud SQL、GCS、Cloud Tasks OIDC、OIDC/JWKS 和
  Vertex AI ADC。Collector 仍在用户电脑运行，云端不直接访问本地路径。

启动校验会拒绝模式与存储/调度/身份的危险组合。`GET /v1/capabilities` 和健康信息
显示真实模式与依赖状态，不提供模拟成功。

Google Cloud 由 `frontend/deploy/terraform` 配置。GitHub App 私钥和例外的 Gemini
key 只引用 Secret Manager version；Terraform 只创建必要的空容器，不接收明文。
默认启用 Vertex AI，由 Cloud Run runtime service account 通过 ADC 调用。Cloud Tasks
使用专用 invoker service account 调用私有 worker 路由，runtime 仅获 queue enqueuer。

项目本地目录的推荐接入是控制台生成短期 pairing 后在本机运行 Collector。不要让
用户制作 ZIP；ZIP 只作为数据策略允许时的离线兜底。项目级来源可单独撤销，新的配对
身份应先完成同步再撤销旧身份。

权限矩阵保持前后端一致：`admin` 创建项目和撤销 Collector；`editor` 与 `admin`
可以配对/连接来源、上传备用 ZIP、重试或取消分析；`viewer`/`auditor` 只读运行和
报告。更高角色继承较低角色权限，项目成员范围仍需单独满足。

## 环境基线

- Node.js 22.15 或更高版本；CI 固定为 22.22.0。
- 生产使用 PostgreSQL 17、OIDC/JWKS、GCS 不可变对象存储和独立迁移/运行身份。
- JSON 状态、本地对象存储和本地身份只允许开发环境；生产例外必须显式开启并记录风险。
- `.env.local`、Terraform state、`.lablineage/`、测试输出和私钥均被 Git 忽略并由 `pre-commit` 再次阻断。

## 开发启动

macOS / Linux：

```bash
npm install --ignore-scripts
cp .env.example backend/.env.local
node scripts/install-git-hooks.mjs
npm run seed
npm run dev
```

Windows PowerShell：

```powershell
npm install --ignore-scripts
Copy-Item .env.example backend/.env.local
node scripts/install-git-hooks.mjs
npm run seed
npm run dev
```

打开 `http://localhost:5173/#/checklist`。健康检查是 `/api/health`，依赖就绪检查是 `/api/ready`。

## 身份与权限

生产设置 `LABLINEAGE_AUTH_MODE=oidc`，配置 issuer、audience、JWKS、客户端和 PKCE 端点。运行身份只拥有 Cloud SQL client、GCS object create/read 和所需 Secret Manager 访问；迁移身份持有 DDL 权限。浏览器角色、服务主体与项目范围必须在上线前逐项验证。

## 数据与对象存储

按顺序执行 10 个迁移。导入任务载荷与交接报告写入不可变对象；应用状态和规范化表只保留私有对象引用、SHA-256、大小和生成版本。GCS Bucket 启用 30 天保留，生命周期默认 365 天；运行身份没有删除权限。
按顺序执行 9 个迁移。迁移静态门禁还会拒绝 RLS 策略引用未声明的租户函数。导入任务载荷、交接报告和本地交接预览写入不可变对象；对象写入前先建立可恢复 reservation。应用状态和规范化表只保留私有对象引用、SHA-256、大小和生成版本。GCS Bucket 启用 30 天保留，生命周期默认 365 天；运行身份没有删除权限。

## Git 与仓库连接器

GitHub 使用只读 App 安装或最小权限 Token。Webhook 必须配置 HMAC secret、交付 ID 去重和仓库映射。本地 Git 使用：

```env
LABLINEAGE_LOCAL_GIT_ROOTS=C:\research\repos;D:\verified
```

路径在读取前会解析为真实路径并再次检查允许根；文件树最多采集 100,000 项，默认 10,000 项，原始文件路径不会进入证据。

## Git hooks

安装一次：

```powershell
node scripts/install-git-hooks.mjs
```

- `pre-commit`：阻止密钥、私有状态和生成物；按改动范围运行契约、迁移、类型或 Collector 检查。
- `commit-msg`：要求 Conventional Commits。
- `pre-push`：执行后端/Collector 测试、前端构建、Agent 评测、契约门禁、性能门禁和浏览器 E2E/Axe。
- `post-commit`：把当前提交的校验记录写入 `.git/lablineage-last-commit.json`。
- `post-commit`：把当前 `HEAD` 提交的校验记录写入 `.git/lablineage-last-commit.json`。

## CI/CD

`ci.yml` 运行 PostgreSQL RLS、跨平台 Collector、浏览器 E2E/Axe、OpenAPI/迁移/幂等门禁、镜像扫描、SBOM 和 Sigstore 签名。`deploy.yml` 只在 CI 成功且 `ENABLE_STAGING_DEPLOY=true` 时自动部署 staging；production 只能手动选择受保护环境。

`live-agent-eval.yml` 每日定时或手动运行真实 Gemini 轨迹评测。只在 GitHub
Actions Secret 中配置 `GOOGLE_GENAI_API_KEY`；证据制品保留模型、提交、
路由、响应、工具轨迹、token 与延迟。控制台会话由 PostgreSQL 按
`projectId + actorId + conversationId` 隔离，管理员不应绕过 API 直接清表。

Terraform 可创建 Artifact Registry、GitHub OIDC Workload Identity Pool 和最小权限部署身份。把 Terraform 输出映射到 GitHub environment 变量：

- `GCP_PROJECT_ID`, `GCP_REGION`, `GAR_REPOSITORY`, `CLOUD_RUN_SERVICE`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`
- `MIGRATION_JOB`（推荐设为 `lablineage-provision`）
- `STAGING_CANARY_GITHUB_REPOSITORY`（受 GitHub App 授权的沙箱 `owner/repo`）

受保护环境 Secret `STAGING_CANARY_BEARER_TOKEN` 必须能以管理员身份创建隔离 canary
项目。部署门禁固定同时执行 Collector 和 GitHub 两条自动分析路径，不允许把 GitHub
canary 配置为可选。

部署先推送不可变提交镜像，更新并执行迁移 Job，再更新 Cloud Run。100 秒内 readiness
未通过，或任一分析 canary 失败，都会自动恢复上一个镜像。
Dockerfile 与 PostgreSQL service 均固定完整镜像 digest，Dependabot 每周提出受审更新。部署先推送提交标签，再从 Artifact Registry 解析 digest；迁移 Job 和 Cloud Run 只接收该 digest。100 秒内 readiness 未通过会自动恢复上一个镜像。

## 上线检查

1. `node scripts/git-hooks.mjs full` 全部通过。
2. Terraform plan 经双人审核，远端 state 已加密和锁定。
3. OIDC、项目隔离、RLS、签名 Manifest、GitHub/Workspace 撤权均在沙箱验证。
4. 备份恢复和 Cloud Run 回滚演练有时间戳、操作者和结果记录。
5. 真实试点数据已取得授权，指标、问题和退出方案已确认。
