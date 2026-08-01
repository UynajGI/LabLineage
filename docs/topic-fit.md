# 命题契合度自查与对照表

> 命题：**Gemini Enterprise for Higher Education**（火鸟黑客松 · Google 命题）
> 提交截止：2026-08-03 23:59（UTC+8）
> 用途：契合度自查 + 评委 PPT 对照表素材（评分维度「命题契合度」占 25%，由命题企业直接评定）

---

## 1. 命题要求拆解

命题方原文要点（官网为准）：

| 编号 | 要求 | 原文关键句 |
|---|---|---|
| R1 | **应用创新性** | 创造高度原创、独特的 AI 解决方案，而不是基本的、通用的聊天机器人模板 |
| R2 | **实际可行性** | 设计能够无缝融入大学实际基础设施和日常校园工作流程的现实可部署工具 |
| R3 | **可量化影响** | 在学习、研究或管理方面带来清晰、可衡量的改进（效率 / 绩效 / 节省时间） |
| R4 | **生态系统执行** | 充分利用 Gemini Enterprise 组件：Agent Development Kit、Agent Runtime、Agent Registry、Agent Gateway |
| R5 | **场景纵深** | 覆盖高等教育学习 / 研究 / 管理；例：LMS 连接器、文献发现代理、Workspace 24/7 后台任务、AlphaEvolve 进化编码 |

命题三个 Example 的共性：**自定义 Agent + 安全摄取异构机构数据 + 通过原生连接器 / API / BYO-MCP 打通 + 可量化的业务产出**。

---

## 2. 逐条对照表（命题要求 → 我们的对应解法）

| # | 命题要求 | 我们的对应解法 | 证据（仓库位置） | 状态 |
|---|---|---|---|---|
| R1 | 原创应用，非聊天模板 | **可复现性优先的研究溯源代理**：模型只负责解释与交互，确定性服务拥有事实、哈希、证据与 R0–R4 等级；"疑似移动候选"永远不会被呈现为"已确认事实" | `README.md`、`docs/architecture.md` | ✅ |
| R2 | 安全摄取异构数据 | 签名 Edge Collector bundle + 只读 Git / GitHub / Google Workspace 连接器；扫描根限制（`LABLINEAGE_SCAN_ROOT`）、secret 形文件跳过、只存相对路径 token；证据内容一律视为不可信数据（防提示注入） | `collector/`、`backend/lib/integrations/*`、`docs/architecture.md` | ✅ |
| R2 | 融入大学真实基础设施 | PostgreSQL 租户隔离（`ENABLE RLS` / `FORCE RLS` + 租户策略）、OIDC/JWKS 认证、GCS 不可变对象存储、Cloud Run 交付（迁移→部署→健康检查→失败回滚） | `docs/architecture.md`、`docs/operations-runbook.md` | ✅ |
| R3 | 可量化影响 | 24 个版本化评估场景，硬性门禁：**路由准确率 ≥90%、工具选择准确率 ≥85%、证据引用率 ≥95%、敏感信息泄漏率 =0%**，并报告 P95 延迟、token 消耗与成本；R0–R4 复现得分（R4 仅授予"受控重跑 + 哈希匹配"） | `backend/evals/agent-cases.json`、`docs/agent-evaluation.md` | ✅ |
| R4 | Agent Development Kit | `@google/adk` v1.4：`Runner`、`RoutedAgent`、`ParallelAgent`（双路并行取证）、`SequentialAgent`（并行取证→证据补全→综合）、`LoopAgent`（`EvidenceCompletionLoop`，最多 2–3 轮）、`MCPToolset`、`FunctionTool`；全局 `GuardianLifecyclePlugin`（调用预算、token 上限、secret 形参数脱敏、`traceId` 关联） | `backend/lib/agent.js`、`backend/lib/agent-lifecycle-plugin.js` | ✅ |
| R4 | BYO-MCP 连接机构环境 | 认证只读 MCP server，暴露 `mcp_lineage_evidence`、`mcp_repository_evidence` 两个工具集（`x-lablineage-mcp-token` 鉴权，只读） | `backend/lib/mcp-server.js` | ✅ |
| R4 | Google Workspace 集成 | Gmail 仅创建草稿；Drive/Sheets 写入外部幂等；所有外部动作走"预览 + 显式确认"门禁 | `backend/lib/integrations/workspace.js` | ✅ |
| R4 | Agent Runtime / Registry / Gateway | ⚠️ 未直接调用。当前用 ADK `Runner` + 自建 `GuardianSessionService`（`projectId + actorId + conversationId` 会话边界，PostgreSQL 追加式事件表）承担 Runtime 职责 | `backend/lib/agent-session-service.js` | ⚠️ 取舍见 §4 |
| R5 | 研究侧：文献发现（arXiv × 资助目标） | 未做文献库连接器。**取舍**：聚焦"研究可复现性审计"——文献综述是提速，可复现性是信任链根基 | — | ⚠️ 取舍见 §4 |
| R5 | 学习侧：LMS（Canvas/Moodle/Blackboard） | 未做。**取舍**同上；学习侧对应物是"交接/交接审计"（Handoff 预览 + 确认），覆盖师生交接场景 | `frontend/`、`docs/user-guide.md` | ⚠️ 取舍见 §4 |
| R5 | 管理侧：24/7 后台任务 | 定时/手动 live 评估流水线（`npm run eval:agent:live` 保留 workflow artifact）、CI 门禁、跨提交制品比对（`lablineage.agent-eval.v2`） | `docs/agent-evaluation.md`、`.github/` | ✅ 部分 |

---

## 3. 差异化角度（创新性，20%）

**我们做的是"研究可复现性审计代理"，而不是"文献发现/文献综述代理"，因为：**

1. 命题三个 Example 里文献发现、工单分诊、课程对齐是**最容易撞车**的通用路线（所有队伍起点相同，这是题目给的）。可复现性审计是高校科研信任链上**没人做的一环**——论文结果无法复现是真实的学术危机（reproducibility crisis），且 Google 命题强调"研究"维度，可复现性天然可量化。
2. 可复现性自带量化指标（R0–R4、输出哈希匹配），直接回应 R3"可量化影响"——不需要额外发明 KPI。

**三个"哦，还能这样"的设计点（讲创新性时必讲）：**

- **模型与确定性的边界**：模型只解释、只交互；事实、哈希、证据、R0–R4 由确定性服务定案。"AI 说可以复现"不算数，"受控重跑 + 哈希匹配"才算。
- **证据完整性循环**：`EvidenceCompletionLoop` 不无限追问——证据不足时显式标记 `missing evidence` 并退出，预算受硬上限约束。
- **未知优于误报**：文件移动候选 ≠ 已确认移动；事实 / 推断 / 冲突 / 缺失四态永远可区分。

---

## 4. 取舍与理由（PPT 里明说，坦诚的取舍不扣分）

| 取舍 | 理由 | 风险 |
|---|---|---|
| 不做 LMS / 文献库连接器 | 三天窗口内"一条完整走通的主流程远胜五个 60% 功能"（评分说明原话）；实验室数据生态（Git、本地数据、Workspace）已是"disparate institutional data ecosystems"的一种真实形态 | 命题企业若执念于 Example 1 的文献场景，需要 §3 的差异化叙事兜底 |
| Agent Gateway/Registry 标注为生产化路线图，而非假装已用 | 诚实优先；当前 ADK Runner + 会话服务在单机构部署下足够 | 若评委深挖 R4 生态执行，需在 PPT 给 1 页路线图：Runtime(已有) → Registry(注册/版本化 agent) → Gateway(统一入口/治理) |
| 量化数字需跑真实评估 | ✅ 已实跑：`output/live-agent-eval-e930909.json`（HEAD 提交上的真实 Gemini 在线评测，24 场景） | 门禁未全绿：tool 66.7% / citation 56.3% 公开列为迭代路线图；Cloud Run 部署证据仍缺（需 GCP 凭据） |

---

## 5. 提交前行动清单（截止 2026-08-03 23:59 UTC+8，按性价比排序）

**P0 — 完成度 + 契合度命脉：**
- [x] 线上体验实例：**https://lablineage-demo-521812027851.asia-east1.run.app**（中文界面，已部署并验证，提交表单直接填此链接）
- [x] 跑通 `npm install --ignore-scripts && npm run seed && npm run dev`，按 `docs/demo-script.md` 11 步走一遍（找没参与开发的人做一次冷启动测试；完整 5 人流程见 `output/competition/usability-test-kit.md`）
- [ ] 录 3 分钟演示视频（逐字稿已备好：`output/competition/video-script.md`）：前 30 秒"是什么 / 给谁用 / 解决什么"，先演示后讲技术；手机检查文字可读性
- [x] PPT ≤10 页：`output/competition/ppt/index.html`（含对照表页 / ADK 编排页 / 真实评测指标页，10 页渲染验证通过）

**P1 — 契合度加分：**
- [x] 跑 live eval：已完成（`output/live-agent-eval-e930909.json`），实测 route 91.7% / tool 66.7% / citation 56.3% / leakage 0% / P95 57.6s / $0.155（24 场景），数字已写入 PPT 指标页
- [x] 部署公开实例并留存 Cloud Run 部署制品（immutable image / revision / health / rollback）：**已上线** https://lablineage-demo-521812027851.asia-east1.run.app（中文界面，revision 00008-cmg，8/8 冒烟通过，证据在 `output/competition/deploy/`）——步骤见 `docs/demo-deployment.md`，一键脚本 `output/competition/deploy-demo.sh`
- [x] README 增加"命题映射"小节（已加，链接本文件）
- [ ] 确认 GitHub 仓库 **public**，README 写清运行方式与技术栈（评委要验证）

**P2 — 有余力再补：**
- [ ] 可选：arXiv 只读连接器的最小 demo（命题 Example 1 的字面对应，哪怕只接 arXiv 一个源，配合"文献发现"提及）
- [ ] 表达呈现页补充：录屏放大界面、统一字体字号

---

## 6. 评委可能提问与标准回答

| 提问 | 回答要点 |
|---|---|
| "这和 Gemini 普通对话有什么区别？" | 普通对话没有事实边界；我们让确定性服务持有事实与哈希，模型只解释与交互，R4 只授予受控重跑成功 |
| "你的量化影响数字呢？" | 真实在线评测（24 场景 @ e930909）：路由准确率 91.7%、泄漏率 0%、单场景成本 ≈$0.0065、P95 57.6s；工具选择 66.7% 与证据引用 56.3% 公开列为迭代目标（≥85% / ≥95%）|
| "数据安全怎么保证？" | RLS/FORCE RLS 租户隔离、签名 bundle、只读工具与 MCP、secret 形文件跳过、扫描根限制、泄漏率 0% 门禁 |
| "为什么不接 Canvas / arXiv？" | 三天窗口内选择把一条主流程做到 100%；可复现性是研究信任链缺失的一环，且天然可量化（见 §3） |
| "Gateway / Registry 用了吗？" | 当前用 ADK Runner + 会话服务承担 Runtime 职责；Registry/Gateway 在生产化路线图中（1 页路线图说明） |
