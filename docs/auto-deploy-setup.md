# 自动部署配置（一次性，约 10 分钟）

配置完成后，**push 到 main 且改动了运行时代码**（backend / frontend / collector /
Dockerfile）时，GitHub Actions 会自动构建不可变镜像并部署到评委演示实例
`lablineage-demo`（asia-east1）。

**不持续扣钱**：Cloud Run 使用 `min-instances=0`（非常驻）——空闲时实例缩到 0，
只有被访问时才启动并计费；无人访问时费用为 0。文档类提交（只改 docs/）不触发部署。

## 1. 创建部署专用服务账号并授权（本地 gcloud）

```bash
PROJECT=gen-lang-client-0580915119
SA=github-deploy@${PROJECT}.iam.gserviceaccount.com

gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Actions demo deploy" --project=${PROJECT}

for ROLE in roles/run.admin roles/artifactregistry.writer \
            roles/iam.serviceAccountUser roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding ${PROJECT} \
    --member="serviceAccount:${SA}" --role="${ROLE}" --condition=None --quiet
done

# 下载密钥（该文件已被 .gitignore 忽略，切勿提交）
gcloud iam service-accounts keys create github-deploy-key.json \
  --iam-account=${SA} --project=${PROJECT}
```

角色说明（最小权限）：
- `run.admin`：部署/更新 Cloud Run 服务
- `artifactregistry.writer`：推送构建镜像
- `iam.serviceAccountUser`：让 Cloud Run 以默认计算服务账号运行
- `secretmanager.secretAccessor`：读取 `gemini-key`（模型密钥，仍在 Secret Manager，不落 workflow）

## 2. 配置 GitHub Secrets

仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加 3 个：

| Secret 名 | 值 |
|---|---|
| `GCP_SA_KEY` | `github-deploy-key.json` 文件的**全部内容** |
| `LABLINEAGE_PATH_SALT` | 当前演示实例的路径盐 |
| `LABLINEAGE_MCP_INTERNAL_TOKEN` | 当前演示实例的内部令牌 |

后两个值取自现有部署证据 `output/competition/deploy/cloud-run-deployment-*.json`
里对应环境变量（或本地 `backend/.env.local`）。

或用 gh CLI 一次配好：

```bash
gh secret set GCP_SA_KEY < github-deploy-key.json
gh secret set LABLINEAGE_PATH_SALT --body "<路径盐值>"
gh secret set LABLINEAGE_MCP_INTERNAL_TOKEN --body "<内部令牌值>"
```

## 3. 验证

push 一个改动 backend 或 frontend 的提交，到仓库 **Actions** 页看 **Deploy Demo**
运行。成功后 <https://lablineage-demo-521812027851.asia-east1.run.app> 即为最新代码。

部署失败会自动回滚到上一个镜像（readiness 120 秒内未通过即回滚）。

## 安全说明

- SA key 只存 GitHub secret，`.gitignore` 已忽略 `github-deploy-key.json` 等密钥文件
- `gemini-key` 仍在 GCP Secret Manager，workflow 通过 `--set-secrets` 引用，不写入 workflow 文件
- workflow 里第三方 Action 均固定到 40 位 commit SHA（符合仓库规范）

## 与生产级 deploy.yml 的关系

仓库另有一套生产级 `deploy.yml`（CI 成功触发、Workload Identity 无密钥认证、
数据库迁移 job、analysis canary、OIDC 验证）。本 `deploy-demo.yml` 是面向评委演示
的轻量版（development 模式、非常驻、无迁移 job），两者独立，互不影响。
