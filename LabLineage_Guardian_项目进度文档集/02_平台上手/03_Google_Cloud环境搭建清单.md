# Google Cloud 环境搭建清单

## 1. 项目结构

建议至少：

```text
lablineage-dev
lablineage-staging
lablineage-prod-or-competition
```

若额度或权限不足，可使用单项目、不同命名空间，但服务账号和数据仍需隔离。

## 2. 身份

| 身份 | 用途 | 禁止 |
|---|---|---|
| 人类管理员 | 创建项目、IAM、恢复 | 日常开发使用高权账号 |
| 开发者 | 部署 dev/staging | 修改生产 IAM |
| CI 服务账号 | 构建和部署 | 读取科研数据 |
| Agent 身份 | 调用已授权 API/MCP | 任意 Cloud 管理操作 |
| Collector 来源身份 | 上传 Bundle | 查询其他项目数据 |
| Workspace 身份 | 指定 Drive/Sheets/Gmail | 访问个人全部 Workspace |

## 3. 基础资源

- Agent Platform 相关 API；
- Cloud Storage：Bundle 和报告；
- PostgreSQL：Cloud SQL 或比赛阶段受控实例；
- Cloud Logging、Monitoring、Trace；
- Secret Manager；
- 可选 Cloud Run：Ingestion API；
- 预算与成本告警。

## 4. 配置原则

- 区域在 P1 冻结；
- Runtime、Registry、Gateway 的区域关系在 Spike 中验证；
- 敏感配置只进入 Secret Manager 或本地密钥库；
- Terraform 或脚本记录资源，不依赖手工记忆；
- 所有临时测试资源标记 owner 和到期日；
- 比赛结束前导出配置和清理计划。
