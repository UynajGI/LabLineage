# LabLineage Guardian 完整范围完成矩阵

本矩阵以设计文档和项目进度文档集为验收基线。状态只能在存在代码、自动化测试或外部平台验收证据时变更；演示数据和静态页面不算完成。

| 领域 | 完整范围验收目标 | 当前状态 | 证据 / 下一门禁 |
|---|---|---:|---|
| 数据契约与 PostgreSQL | Manifest/evidence 契约、稳定 ID、迁移、约束、索引、租户隔离 | 进行中 | Manifest/Bundle Schema、来源/带租约导入任务/关系审核/状态提案/版本报告/幂等记录等规范化表、9 个连续迁移、RLS/FORCE RLS、事务状态仓储、最小权限租户预配脚本和 CI PostgreSQL 隔离测试已实现；20 个 `/v1` 写路由均由持久化幂等门禁与 OpenAPI 请求头契约覆盖，42 个 `/v1` 操作全部纳入 OpenAPI；待 CI/云数据库实际执行证据 |
| 身份、RBAC 与项目隔离 | OIDC、服务身份、角色、项目授权、审计主体 | 进行中 | OIDC/JWKS、哈希服务 token、路由 RBAC、项目越权 HTTP 测试已实现；待真实 IdP 验证 |
| Edge Collector 与无 Git 快照 | CLI、目录策略、分层哈希、SQLite、解析、快照/diff、脱敏、签名 Bundle、更新追踪 | 进行中 | 设计规定的 init/scan/diff/run/export/verify、原子不可变快照、SQLite 中断续扫、稳定目录根哈希、>2 GiB 分层哈希、参数与 Slurm/Notebook 解析、策略校验、Ed25519 `.tar.zst` 离线包、幂等上传队列均已实现；服务端相邻快照支持确定性证据、显式授权且脱敏/限额的统一文本 diff、二进制元数据摘要、move/copy 候选而非事实、带校验的冷索引压缩和首次接入边界标记；Collector 新增文件数/I/O 带宽/CPU 让步/总时限控制与百万文件验收工具，5,000 文件 CI 门禁通过；待目标存储百万文件验收与首次跨平台 CI 证据 |
| Manifest 导入与证据库 | 严格 Schema、来源登记、导入任务、幂等、签名验证、批量导入、错误隔离 | 进行中 | 来源/网络模式/导出策略登记与撤权、Schema、分层指纹、签名、受信指纹、Bundle 幂等、最多 20 件批量导入和逐件错误隔离已实现；202 导入任务是 queued/processing/completed/failed 状态机，含五分钟租约、启动及周期恢复、三次指数退避、显式修正重试与错误历史；载荷先登记 reservation 再写不可变本地/GCS 对象，状态只保留私有引用、SHA-256/size/generation，worker 重读校验且 API 不暴露对象键；PostgreSQL 已投影对象引用和租约，待流式超大 HTTP Bundle 与真实 PostgreSQL/GCS 契约测试 |
| 谱系与审计引擎 | 多源证据合并、R0–R3 自动判断、R4 仅真实重跑、风险规则、人工确认 | 进行中 | orphan、失败运行/输出、重复、陈旧、手工编辑、不可复现、疑似垃圾和冲突规则均已实现，边 ID 确定；关系 confirm/reject 会保存认证主体、评论和新 evidence，确认后标记 human_verified；R4 仍只接受真实重跑；待固定黄金集指标和真实多源验收 |
| GitHub / Git 只读接入 | App/OAuth、仓库/提交/PR/Actions 元数据、Webhook/增量同步、本地 Git 兼容 | 进行中 | 提交、PR、Actions 图映射以及签名 Webhook 的 push/workflow_run/pull_request 增量同步、交付 ID 幂等和 HTTP 契约均已实现；通用仓库接口支持允许根内的本地 Git，采集有界树、提交、分支和标签且只保存路径 Token，2 项路径隔离测试通过；待 App 安装与真实沙箱/Enterprise 验证 |
| Google Workspace 与报告存储 | Drive 报告、Sheets 幂等台账、Gmail 仅草稿、撤权失败、数据策略、持久对象 | 进行中 | 真实 REST 连接器、实时预览、显式确认、Drive/Sheets 外部幂等、Gmail draft-only，以及数据库分布式步骤进度/崩溃恢复已实现；版本报告和本地 Markdown/CSV/EML 预览写入带 reservation 的不可变对象存储，本地导出只返回 `exportId`/校验和/大小而不暴露绝对路径，生产 GCS 使用 generation precondition、CRC32C/SHA-256、运行身份仅 create/read、30 天保留与默认 365 天生命周期；待真实 OAuth/GCS 沙箱与撤权验证 |
| ADK Agent | 只读工具、轨迹评测、提示注入防护、成本/超时/降级 | 进行中 | Vertex Express 经 17891 实际调用成功；谱系/发现、提示注入和秘密外泄 4 类轨迹评测通过，工具白名单、R4 规则与 token 指标已实现；待云环境持续回归与预算告警 |
| Runtime / Registry / Gateway | 部署、版本注册、工具能力/认证/数据等级、网关策略 | 进行中 | Registry、默认拒绝 Gateway policy、策略验证器、非 root 容器和已验证的 Cloud Run/Cloud SQL Terraform 已实现；待云 Runtime 注册、部署与回滚验证 |
| 控制台 | 真实 API 工作流、空/错/加载状态、确认门、无 mock 回退 | 完成（实现） | mock 与固定快照/账号数据已移除；10 个 hash 页面使用真实 API，节点详情直接列出相邻关系、方向和 evidence ID 并可打开关系证据；节点确认调用后端，关系审核生成证据，状态变更只提交待审提案，角色直达拦截、OIDC Authorization Code + PKCE、确认门、网络重试、浏览器 E2E 和 Axe serious/critical 门禁均通过 |
| 安全与隐私 | 威胁模型、秘密检测、最小权限、加密、依赖/容器扫描、事件与轮换 SOP | 进行中 | 安全头、RBAC、项目隔离、签名、秘密文件排除、威胁模型和 critical audit 通过；正式审计为 0 critical、13 high，剩余项均来自 ADK 传递依赖并登记风险；待容器扫描与真实权限审查 |
| 可观测性与运维 | 结构化日志、Trace、指标、告警、成本、备份/恢复、运行手册 | 进行中 | 请求/Trace ID、OpenTelemetry OTLP、Prometheus HTTP/Agent token 指标、告警规则、readiness、优雅停机、备份/校验恢复脚本和运行手册已实现；待真实备份恢复演练和告警投递 |
| 测试与质量 | 单元、契约、集成、安全、Agent 轨迹、性能、E2E、可用性 | 进行中 | 后端 48 项（本机 47 通过、1 项真实 PostgreSQL 门禁跳过）、Collector 17/17、6 项覆盖 10 个页面、上传、发现解决、交接预览和新用户关系证据导航的浏览器 E2E/Axe，以及 4 类 Agent 轨迹评测通过；5,000 文件性能门禁验证冷/热扫描、热缓存 100% 命中和目录指纹稳定，具体吞吐由每次 CI/本地门禁产物记录，避免把易漂移机器读数固化为产品事实；本地 Git 适配、对象 reservation/不可变性、载荷隔离、事务失败回滚、跨项目外部 ID 碰撞、具体 OpenAPI 契约和发布证据防篡改均有测试；待真实 PostgreSQL/GCS/外部平台/百万级性能/试点验收 |
| CI/CD 与部署 | 可复现构建、迁移、扫描、制品、环境部署、回滚 | 进行中 | CI 已定义 PostgreSQL service、测试、跨平台 Collector、浏览器关键写交互/E2E/Axe、迁移、critical audit、Trivy、具体 OpenAPI 请求/响应 schema、迁移函数/RLS/幂等/工作流门禁和镜像构建；第三方 Action、Node/PostgreSQL 镜像和前端依赖均固定 SHA/digest/精确版本并由 Dependabot 受审更新；主分支生成 CycloneDX、Collector 包、SHA-256 与 Sigstore 证据；CD 将 Artifact Registry 标签解析为 digest 后再更新迁移 Job/Cloud Run，readiness 失败自动回滚；待首次 CI/云执行与回滚演练 |
| 试点与交付 | 真实项目试点、指标验证、用户手册、运维交接、RC 演示 | 进行中 | 已提供按角色分流的文档入口、10 分钟演示教程、第一个项目接入教程、术语表、用户/管理员指南、运行手册、演示脚本和当前验收证据；真实课题组数据授权、试点指标、培训记录和 RC 签字仍需外部环境与负责人 |

## 关闭规则

- “完整完成”要求所有 P0 验收项通过；P1 未完成项必须有明确延期版本、负责人和风险说明。
- R4 只能由受控环境中的真实重跑证据产生，静态推断不得升级为 R4。
- GitHub、Google Workspace、Runtime/Registry/Gateway 只有真实平台调用通过才可标记完成。
- 所有写操作必须经过预览、显式确认、幂等键和审计记录。
- 不允许以 mock、硬编码成功提示或本地预览替代集成验收。
