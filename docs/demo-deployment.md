# 评委演示部署：Cloud Run 最小方案（Google Cloud 免费试用额度内）

> 目标：让评委**点开一个公开链接**就能体验完整演示（Dashboard → Lineage Explorer → Guardian Agent → Handoff），不要求他们登录、不要求他们装任何东西。
> 成本：Cloud Run + Artifact Registry + Cloud Build 均在免费额度内，**无 Cloud SQL / GCS**，演示期接近零成本。
> 依据：`docs/demo-script.md` 第 11 步要求"有部署制品才能声称已部署"——本页就是这份制品的产出方法。

---

## 0. 架构：单服务，为什么够

```
评委浏览器 → https://<service>-<hash>-asia-east1.run.app
                    │  Cloud Run（1 个实例，公开访问）
                    ├── /v1 JSON API（Express，端口由 Cloud Run 注入的 PORT 决定）
                    ├── 前端静态资源（backend 直接 serve frontend/dist + SPA 回退）
                    ├── JSON store（首次启动自动生成 「相变研究」演示数据）
                    └── /app/demo-scan（镜像内置演示扫描目录，Directory Diff 用）
```

- **前端不用单独托管**：`backend/server.js` 无条件 serve `frontend/dist`（已确认），一个服务全包。
- **演示数据自动就位**：`JsonStore.init()` 在无 `state.json` 时自动写入 `makeDemoState()`（相变研究 · 9 节点 6 边）——容器第一次启动即有数据，无需手工 seed。
- **免登录**：`LABLINEAGE_AUTH_MODE=development` 显式启用开发鉴权（固定本地 actor）。
- **JSON store 硬约束**：`store-factory.js` 在 `NODE_ENV=production` 下强制要求 `DATABASE_URL`（JSON store 仅限非生产）。演示实例显式 `NODE_ENV=development` + `LABLINEAGE_HOST=0.0.0.0`（否则监听 127.0.0.1，Cloud Run 探活失败）。
- **可写数据目录**：镜像内 `/app` 原归 root（`WORKDIR /app` 所致），运行时用户写不进——Dockerfile 已加 `RUN chown lablineage:lablineage /app`；演示实例仍用 `LABLINEAGE_DATA_DIR=/tmp/lablineage`（临时盘，实例重建自动重置，与单实例演示一致）。
- **演示扫描目录**：`demo-scan/`（含假 .env 密钥等 8 个文件）已烤进镜像 `/app/demo-scan`，`LABLINEAGE_SCAN_ROOT=/app/demo-scan` 同时满足"扫描根限制"和 Directory Diff 演示。
- **状态一致性**：`--max-instances=1`——JSON store 写临时盘，多实例会互相覆盖；单实例对演示足够（实例重建后数据自动重建）。

> **文档化例外声明**（AGENTS.md 要求）：本次为竞赛演示部署，使用 JSON store（`NODE_ENV=development`）+ development 鉴权 + 单实例，**不是生产级**（生产需要 PostgreSQL/OIDC/GCS，见 §6）。对外表述用"在线演示实例"，不得称"生产部署"。

---

## 1. 前置（一次性，10 分钟）

1. **安装 gcloud CLI**（Windows）：<https://cloud.google.com/sdk/docs/install>，装完重开终端。
2. 登录并选择免费试用项目：
   ```bash
   gcloud auth login
   gcloud config set project <你的免费试用项目ID>
   gcloud auth application-default login   # 可选，Cloud Build 需要
   ```
3. 启用 API：
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
   ```
4. **Gemini API Key**（Guardian Agent 对话用；不设也能跑，但这是演示亮点，建议设）：
   - 方案 A（推荐，免费不占 GCP 额度）：<https://aistudio.google.com/apikey> 生成 API key
   - 方案 B：走 Vertex AI（`LABLINEAGE_VERTEX_EXPRESS=TRUE` + 服务账号）——较复杂，演示不必
5. 网络提示：中国大陆访问 GCP 需要代理。gcloud 用代理：
   ```bash
   gcloud config set proxy/type http
   gcloud config set proxy/address 127.0.0.1
   gcloud config set proxy/port 17890
   gcloud config set proxy/username ""   # 若代理需要认证再填
   ```

---

## 2. 部署（一条龙，约 15–30 分钟）

用仓库根目录 Dockerfile（多阶段：npm ci → `npm run build` 出 frontend/dist → 非 root 运行）。**无需本地 Docker**——用 Cloud Build 云端构建。

```bash
# ---- 变量（替换成你的值）----
PROJECT_ID=你的项目ID
REGION=asia-east1
SERVICE=lablineage-demo
GEMINI_KEY=你的GeminiApiKey
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/lablineage/lablineage-demo:latest

# ---- 1. Artifact Registry 仓库 ----
gcloud artifacts repositories create lablineage \
  --repository-format=docker --location=$REGION

# ---- 2. 云端构建并推送（自动用根 Dockerfile）----
gcloud builds submit --tag $IMAGE .

# ---- 3. 部署 Cloud Run（公开、单实例）----
gcloud run deploy $SERVICE \
  --image=$IMAGE \
  --region=$REGION \
  --allow-unauthenticated \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --set-env-vars=NODE_ENV=development,LABLINEAGE_HOST=0.0.0.0,LABLINEAGE_AUTH_MODE=development,LABLINEAGE_DATA_DIR=/tmp/lablineage,LABLINEAGE_SCAN_ROOT=/app/demo-scan,LABLINEAGE_PATH_SALT=$(openssl rand -hex 16),LABLINEAGE_MCP_INTERNAL_TOKEN=$(openssl rand -hex 16) \
  --set-secrets=GOOGLE_GENAI_API_KEY=gemini-key:latest
```

环境变量说明（其余用默认）：
| 变量 | 值 | 为什么 |
|---|---|---|
| `NODE_ENV` | `development` | **JSON store 硬约束**：production 下 store-factory 强制要求 `DATABASE_URL`；演示实例显式跑演示模式 |
| `LABLINEAGE_HOST` | `0.0.0.0` | development 下默认监听 127.0.0.1，Cloud Run 探活会失败；必须全接口监听 |
| `LABLINEAGE_AUTH_MODE` | `development` | 评委免登录（文档化例外） |
| `LABLINEAGE_DATA_DIR` | `/tmp/lablineage` | 可写临时盘（镜像内 /app 由 Dockerfile chown 修复后本可写，这里让"实例重建自动重置"更显式） |
| `LABLINEAGE_SCAN_ROOT` | `/app/demo-scan` | 扫描根限制 + Directory Diff 演示目录（镜像内置） |
| `LABLINEAGE_PATH_SALT` | 随机 16B hex | 路径脱敏必需 |
| `LABLINEAGE_MCP_INTERNAL_TOKEN` | 随机 16B hex | 启用内部只读 MCP 工具集（Agent 演示更完整） |
| `LABLINEAGE_TRUST_PROXY` | `true` | **必设**：Cloud Run 会给请求加 `X-Forwarded-For`，express-rate-limit 未信任代理时直接抛 ValidationError → agent 路由 500 |
| `LABLINEAGE_VERTEX_EXPRESS` | `true` | 用 **AQ. 开头的 Vertex Express key** 时必须开；用 AIza 开发 key 则不开（走普通 Gemini 端点） |
| `GOOGLE_GENAI_API_KEY` | Secret Manager `gemini-key:latest` | Guardian Agent 对话；`--set-secrets` 引用，不进服务配置 |

> ⚠️ **Key 类型坑**（实测）：Agent 报 `Context variable not found: xxx` 且所有子代理空响应时，根因往往是**模型调用失败**——AIza 开发 key 免费额度耗尽（429）或类型不匹配。用 `AQ.` 开头的 Vertex Express key 并设 `LABLINEAGE_VERTEX_EXPRESS=true`（本地 `.env.local` 里那把 AQ. key 是已知可用的）。

---

## 3. 验证（部署完成 = 证据留档的起点）

```bash
URL=$(gcloud run services describe $SERVICE --region=$REGION --format='value(status.url)')
echo $URL                                # 这就是给评委的体验链接
curl -s $URL/api/health                  # 期望 {"status":"ok","authMode":"development","database":"json-development",...}
curl -s $URL/api/ready                   # 期望 {"status":"ready","database":"json-development"}
```

浏览器打开 `$URL`：应看到 Dashboard，含 **相变研究（Phase Transition Study）**、R0–R4 分布、Handoff 就绪度。再按 `docs/demo-script.md` 走 Guardian Agent 提问。

---

## 4. 部署证据留档（demo-script 第 11 步的"制品"）

```bash
mkdir -p output/competition/deploy
gcloud run services describe $SERVICE --region=$REGION --format=json \
  > output/competition/deploy/cloud-run-deployment-$(git rev-parse --short HEAD).json
curl -s $URL/api/health >> output/competition/deploy/health-$(git rev-parse --short HEAD).txt
curl -s $URL/api/ready  >> output/competition/deploy/health-$(git rev-parse --short HEAD).txt
```

留档后对照 demo-script 第 11 步核对：✅ 同提交镜像（image digest 在 describe 输出里）✅ ready revision（conditions READY=True）✅ 健康检查 200 ⚠️ **OIDC 身份 → N/A**（演示例外，development 鉴权，如实说明）⚠️ **回滚状态 → 单服务可 `gcloud run services update --image=<旧镜像>` 手动回滚**，演示不演练。**只有这些证据齐了（且 READY=True），才在演示里说"已部署"**。

---

## 5. 成本与清理

- **成本**：Cloud Run 免费额度（每月 2M 请求 / 180K vCPU-秒 / 360K GiB-秒）远覆盖演示期流量；Cloud Build 免费 120 分钟/天；AR 存储几乎为 0。**整个演示期不花钱**（除非把实例开成持续运行多天——`--min-instances=0` 空闲即缩零，已默认）。
- **提交时**：体验链接填到提交表单；PPT/README 可放 `$URL`（提交后链接才稳定，建议提交前 1–2 天部署并验证）。
- **赛后清理**：
  ```bash
  gcloud run services delete $SERVICE --region=$REGION
  gcloud artifacts repositories delete lablineage --location=$REGION
  ```

---

## 6. 生产版指路（赛后需要再接，演示不阻塞）

完整生产（PostgreSQL + GCS + OIDC + WIF 自动部署）基建已在仓库：`frontend/deploy/terraform/main.tf`（Cloud SQL/GCS/AR/Secret Manager/Workload Identity）+ `.github/workflows/deploy.yml`（CI 迁移→部署→健康→回滚）。步骤：
1. `terraform apply`（需要：GCP 项目、GitHub App key、Workspace OAuth、模型 key 四个 secret 参数）
2. 仓库 Secrets/Variables 填 GCP_PROJECT_ID / REGION / GAR_REPOSITORY / CLOUD_RUN_SERVICE / MIGRATION_JOB
3. push 触发 deploy.yml；留档 `cloud-run-deployment-<commit>-<attempt>` 制品
演示阶段跳过这套，避免免费试用额度花在 Cloud SQL 上。

---

## 7. 常见问题

| 问题 | 处理 |
|---|---|
| `/api/health` 404 或超时 | 确认 region 与 `--allow-unauthenticated`；`gcloud run services describe` 看 conditions |
| 首页白屏 | 镜像里没有 frontend/dist？本地先跑 `npm run build` 确认 vite build 通过再提交构建 |
| 503 提到 LABLINEAGE_PATH_SALT / SCAN_ROOT | PATH_SALT 未设（必填）；SCAN_ROOT 未设时**服务器端扫描路由不可用**（Directory Diff 演示可跳过或把演示目录打进镜像并设 `LABLINEAGE_SCAN_ROOT=/app/demo-scan`）——Lineage/Agent/Handoff 不受影响 |
| 实例重启后数据没了 | 正常：JSON store 在临时盘；演示数据下次启动自动重建。要持久 → §6 生产版 |
| 评委在海外/国内访问慢 | 换离评委近的区域重建（`--region=` 重部署一次即可） |
| gcloud 连不上 | §1 第 5 步配代理；或 `gcloud auth login --no-launch-browser` |
