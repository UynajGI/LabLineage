# LabLineage Guardian 用户指南

界面默认中文，右上角 **EN/中文** 可切换语言。开发环境使用本地身份；
Google Cloud 模式必须使用 OIDC PKCE。所有写请求都带 `Idempotency-Key`，
重复提交相同请求会安全重放，同一键配不同内容返回 `409`。
第一次接触本项目时，先阅读[从这里开始](start-here.md)并完成[10 分钟体验](quickstart.md)。需要采集自己的目录时，再执行[接入第一个项目](first-project.md)。不熟悉的概念可查阅[核心术语表](glossary.md)。

## 1. 登录与角色

## 1. 新建并自动分析项目

打开 **部署项目**（`#/deploy`），向导包含四个阶段：

1. **项目目标**：填写名称、唯一 slug、项目目的、可验证的成功标准、关键产物，
   以及可选约束。目标作为版本化事实保存，后续报告引用创建分析时锁定的版本。
2. **连接来源**：本地目录优先使用 Local Collector；云端仓库使用 GitHub App；
   ZIP 仅用于无法运行 Collector、也无法连接 GitHub 的离线兜底。
3. **自动分析**：来源接入成功后自动排队，依次执行摄取、扫描、证据建图、
   确定性审计、目标判定、Google ADK 总结。页面显示真实服务端状态、尝试次数、
   安全错误和事件时间线，不模拟进度。
4. **报告**：查看每条成功标准和关键产物的 `met / partial / unmet /
   not_assessable` 判定及其证据。ADK 总结单独标注为建议，不能覆盖确定性结论。

分析 URL 带 `project` 和 `run` 参数；刷新或复制链接后可恢复到同一运行。运行失败时
只重试失败阶段；排队或运行中的任务可取消。报告缺少证据时必须显示
`not_assessable`，不得把未知写成通过。

## 2. 本地目录：Local Collector

本地项目不需要制作或上传 ZIP。选择 **Local Collector** 后：

1. 在控制台生成一次性配对码，注意过期时间和隐私摘要。
2. 在项目所在电脑执行页面给出的 `pair` 命令，再执行 `sync`。
3. Collector 只读授权目录，默认不上传文件正文，也不导出绝对路径；服务端接收
   HMAC 路径 token、文件指纹、结构化元数据和 Ed25519 签名 Manifest。
4. 首次同步自动创建分析运行；后续同步产生不可变快照和差异。

页面会显示 Collector 在线、离线、已撤销或过期状态。怀疑凭据泄漏时立即撤销配对，
重新配对生成新密钥；不要覆盖旧来源身份。完整命令和资源限制见
[Collector 指南](collector-guide.md)。
- 点击节点后，先在 **Connected relationships** 核对相邻节点、方向和 evidence
  ID；打开一条关系后，再在 **Relation Evidence** 核对 `From`、`To`、
  `Relation` 和 `Confidence`。
- 实线事实来自精确哈希、签名 Manifest 或已确认的平台证据。
- 候选关系、移动候选和历史推断必须显示为“推断”，不能冒充事实。
- 只有审计员能够确认或拒绝候选边；每次决定都保留评论、操作者和版本历史。
- “影响范围”用于查看某个数据或代码版本变更后可能失效的下游结果。

## 3. GitHub 仓库

选择 **GitHub**，输入 `github.com/owner/repo` 或 `owner/repo` 以及可选分支。
服务端通过预先安装的只读 GitHub App 获取分支 HEAD、递归树、提交、分支、标签、
Pull Request 和 Actions 元数据，将不可变 commit SHA 固定到分析输入。浏览器不接收
私钥或安装令牌，系统也不会要求个人访问令牌。

- `403`：GitHub App 未获该仓库授权或权限不足。
- `404`：仓库不存在，或安装对调用身份不可见。
- `429`：GitHub 限流；遵照页面的重试提示，避免反复点击。

## 4. ZIP 离线兜底

ZIP 不是本地连接方式。仅在 Collector 和 GitHub 都不可用、且数据策略允许上传时使用。
服务端限制压缩包 100 MB、解压总量 200 MB、10,000 个条目、单文件 50 MB，拒绝
符号链接、路径穿越、高压缩比炸弹和声明大小不一致。原始包进入不可变对象存储，
运行状态和 API 响应不暴露内部 object key；临时解压目录始终清理。

## 5. 证据、审计与 Guardian Agent

- 事实、推断、冲突和缺失证据始终分开；移动候选不是确认移动。
- R0–R3 由确定性规则判定；只有受控重跑且输出哈希匹配才能产生 R4。
- Guardian Agent 通过 Google ADK 的分层 Agent、只读工具、会话状态和结构化追踪
  解释证据并生成目标摘要。模型不可用时，摄取、图谱、审计和确定性报告仍然完成，
  运行状态为 `partial` 而不是伪造成功。
- Agent 不转换交接单状态，也不执行外部写入；所有外部动作仍需预览、显式确认、
  幂等键和审计记录。

## 6. 交接单

离任、接收、审核人和截止日期属于每一张 **HandoffOrder**，不是一次性全局设置。
流程为 `draft → submitted → in_review → approved → receiver_accepted → completed`，
并支持 `changes_requested` 与 `cancelled`。角色判断使用认证 subject，邮箱只作快照。
完成条件为已批准且全部必需任务已完成；Workspace 导出必须绑定当前预览哈希。

## 7. 常见问题

- 页面短暂显示 API 不可用：确认 API 最终监听 `127.0.0.1:8788`，并检查
  `/api/health`；Vite 的 `ECONNREFUSED` 常发生在 API 热重启窗口。
- Collector 不同步：检查配对是否过期/撤销、系统时钟、授权目录和签名错误。
- GitHub 连接失败：按 `403/404/429` 区分授权、可见性和限流，不要改用个人 token。
- 分析停滞：查看阶段事件；管理员按[运行手册](operations-runbook.md)处理 lease、
  Cloud Tasks 和重试压力。
- Agent 不可用：检查能力页、Vertex ADC 或本地密钥；不要把密钥写入仓库。
