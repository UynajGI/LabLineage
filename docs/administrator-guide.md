# LabLineage Guardian 管理员指南

## 环境基线

- Node.js 22.15 或更高版本；CI 固定为 22.22.0。
- 生产使用 PostgreSQL 17、OIDC/JWKS、GCS 不可变对象存储和独立迁移/运行身份。
- JSON 状态、本地对象存储和本地身份只允许开发环境；生产例外必须显式开启并记录风险。
- `.env.local`、Terraform state、`.lablineage/`、测试输出和私钥均被 Git 忽略并由 `pre-commit` 再次阻断。

## 开发启动

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
- `post-commit`：把最近提交的校验记录写入 `.git/lablineage-last-commit.json`。

## CI/CD

`ci.yml` 运行 PostgreSQL RLS、跨平台 Collector、浏览器 E2E/Axe、OpenAPI/迁移/幂等门禁、镜像扫描、SBOM 和 Sigstore 签名。`deploy.yml` 只在 CI 成功且 `ENABLE_STAGING_DEPLOY=true` 时自动部署 staging；production 只能手动选择受保护环境。

Terraform 可创建 Artifact Registry、GitHub OIDC Workload Identity Pool 和最小权限部署身份。把 Terraform 输出映射到 GitHub environment 变量：

- `GCP_PROJECT_ID`, `GCP_REGION`, `GAR_REPOSITORY`, `CLOUD_RUN_SERVICE`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`
- `MIGRATION_JOB`（推荐设为 `lablineage-provision`）

Dockerfile 与 PostgreSQL service 均固定完整镜像 digest，Dependabot 每周提出受审更新。部署先推送提交标签，再从 Artifact Registry 解析 digest；迁移 Job 和 Cloud Run 只接收该 digest。100 秒内 readiness 未通过会自动恢复上一个镜像。

## 上线检查

1. `node scripts/git-hooks.mjs full` 全部通过。
2. Terraform plan 经双人审核，远端 state 已加密和锁定。
3. OIDC、项目隔离、RLS、签名 Manifest、GitHub/Workspace 撤权均在沙箱验证。
4. 备份恢复和 Cloud Run 回滚演练有时间戳、操作者和结果记录。
5. 真实试点数据已取得授权，指标、问题和退出方案已确认。
