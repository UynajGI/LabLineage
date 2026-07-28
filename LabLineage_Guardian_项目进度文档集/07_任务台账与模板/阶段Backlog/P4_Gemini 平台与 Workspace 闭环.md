# P4｜Gemini 平台与 Workspace 闭环 Backlog

- **计划窗口**：第13–16周
- **阶段目标**：ADK Agent、Runtime、Registry、Gateway、Drive/Sheets/Gmail 跑通
- **任务数**：48
- **估算**：228 人日

| 任务ID | 工作包 | 任务 | 优先级 | 负责人 | 人日 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-005 | 项目管理与治理 | 维护里程碑和关键路径 | P0 | PO | 12 | PM-003 | 未开始 |
| PM-006 | 项目管理与治理 | 维护 RAID 登记册 | P0 | PO | 10 | PM-001 | 未开始 |
| PM-008 | 项目管理与治理 | 执行阶段 Gate 评审 | P0 | PO | 8 | PM-005 | 未开始 |
| PM-009 | 项目管理与治理 | 建立外部依赖与比赛通知跟踪 | P0 | PO | 4 | PM-006 | 未开始 |
| PLAT-012 | 比赛资源与 Google 平台上手 | 建立平台兼容性与变更核验机制 | P1 | CLOUD | 6 | PLAT-005 | 未开始 |
| PROD-012 | 产品需求与科研交接流程 | 每阶段执行需求回归 | P1 | PO | 8 | PROD-011 | 未开始 |
| SNAP-009 | 无 Git 快照与更新记录追寻 | 设计更新记录 UI 与报告章节 | P1 | FRONTEND | 4 | SNAP-003,UI-003 | 未开始 |
| LIN-008 | 科研谱系解析与多模组关联引擎 | 实现文档结论和图表引用提取 | P0 | AGENT | 6 | AGENT-004,LIN-006 | 未开始 |
| LIN-010 | 科研谱系解析与多模组关联引擎 | 实现人工确认与边版本历史 | P0 | BACKEND | 4 | ING-007 | 未开始 |
| AUD-008 | 可复现性审计与结果筛选 | 实现结果状态提案与人工确认 | P0 | BACKEND | 4 | PROD-006,LIN-010 | 未开始 |
| AUD-009 | 可复现性审计与结果筛选 | 实现整改建议生成规则 | P1 | AGENT | 4 | AUD-007,AGENT-005 | 未开始 |
| AGENT-003 | ADK Agent 与 Gemini 推理工作流 | 实现单入口 Orchestrator | P0 | AGENT | 5 | PLAT-007,AGENT-002 | 未开始 |
| AGENT-004 | ADK Agent 与 Gemini 推理工作流 | 实现结论/图注语义提取工作流 | P0 | AGENT | 5 | LIN-006,AGENT-003 | 未开始 |
| AGENT-005 | ADK Agent 与 Gemini 推理工作流 | 实现证据解释与整改建议工作流 | P0 | AGENT | 5 | AUD-007,AGENT-003 | 未开始 |
| AGENT-006 | ADK Agent 与 Gemini 推理工作流 | 实现数据模组关系解释工作流 | P1 | AGENT | 4 | LIN-007,AGENT-003 | 未开始 |
| AGENT-007 | ADK Agent 与 Gemini 推理工作流 | 实现人工确认对话和预览 | P0 | AGENT | 4 | LIN-010,AUD-008 | 未开始 |
| AGENT-008 | ADK Agent 与 Gemini 推理工作流 | 实现结构化报告生成 | P0 | AGENT | 4 | PROD-008,AGENT-005 | 未开始 |
| AGENT-009 | ADK Agent 与 Gemini 推理工作流 | 建立模型路由和降级 | P1 | AGENT | 4 | PLAT-013 | 未开始 |
| AGENT-010 | ADK Agent 与 Gemini 推理工作流 | 建立会话状态与项目上下文隔离 | P0 | AGENT | 3 | AGENT-003,SEC-005 | 未开始 |
| RT-002 | Agent Runtime 部署与生命周期 | 建立 Agent Runtime 部署清单 | P0 | CLOUD | 3 | PLAT-008,AGENT-003 | 未开始 |
| RT-003 | Agent Runtime 部署与生命周期 | 部署 staging Agent | P0 | CLOUD | 3 | RT-002 | 未开始 |
| RT-004 | Agent Runtime 部署与生命周期 | 配置 Agent Identity / 服务身份 | P0 | CLOUD | 3 | PLAT-004,RT-003 | 未开始 |
| RT-005 | Agent Runtime 部署与生命周期 | 配置会话、超时、重试和并发 | P1 | CLOUD | 3 | RT-003 | 未开始 |
| GOV-002 | Agent Registry、Agent Gateway 与治理 | 注册 Guardian Agent 与后端 Endpoint | P0 | CLOUD | 2 | RT-003,ING-007 | 未开始 |
| GOV-003 | Agent Registry、Agent Gateway 与治理 | 注册 GitHub、Edge 和 Workspace MCP | P0 | CLOUD | 3 | GH-002,WS-002,EDGE-011 | 未开始 |
| GOV-005 | Agent Registry、Agent Gateway 与治理 | 创建 Gateway 并绑定 Registry | P0 | CLOUD | 3 | PLAT-010,GOV-002,GOV-003 | 未开始 |
| GOV-006 | Agent Registry、Agent Gateway 与治理 | 配置 Agent-to-Anywhere 受控出站 | P0 | CLOUD | 4 | GOV-005 | 未开始 |
| GOV-007 | Agent Registry、Agent Gateway 与治理 | 实现只读与写入预览的授权策略 | P0 | SEC | 4 | GOV-004,GOV-006 | 未开始 |
| GOV-008 | Agent Registry、Agent Gateway 与治理 | 验证私有 VPC / 离线模式边界 | P1 | ARCH | 3 | GOV-006 | 未开始 |
| WS-002 | Google Workspace 交接协作集成 | 建立 Workspace OAuth / 服务账号授权 | P0 | CLOUD | 3 | PLAT-004 | 未开始 |
| WS-003 | Google Workspace 交接协作集成 | 实现 Sheets 交接台账写入 | P0 | BACKEND | 4 | WS-002,PROD-008 | 未开始 |
| WS-004 | Google Workspace 交接协作集成 | 实现 Drive 报告目录与文件写入 | P0 | BACKEND | 4 | WS-002,AGENT-008 | 未开始 |
| WS-005 | Google Workspace 交接协作集成 | 实现 Gmail 草稿创建 | P0 | BACKEND | 3 | WS-002,AUD-009 | 未开始 |
| WS-006 | Google Workspace 交接协作集成 | 实现 Docs/Markdown 报告模板渲染 | P1 | DOC | 3 | PROD-008 | 未开始 |
| WS-007 | Google Workspace 交接协作集成 | 实现 Drive revisions/permissions 可选审计 | P2 | BACKEND | 4 | WS-002 | 未开始 |
| WS-008 | Google Workspace 交接协作集成 | 实现 Workspace 写操作人工确认 | P0 | AGENT | 3 | AGENT-007,WS-003..WS-005 | 未开始 |
| UI-002 | Web 控制台与谱系可视化 | 实现项目与审计总览 | P1 | FRONTEND | 5 | ING-007 | 未开始 |
| UI-003 | Web 控制台与谱系可视化 | 实现谱系图与证据侧栏 | P0 | FRONTEND | 7 | LIN-006 | 未开始 |
| UI-004 | Web 控制台与谱系可视化 | 实现 Finding 列表与筛选 | P0 | FRONTEND | 4 | AUD-007 | 未开始 |
| UI-005 | Web 控制台与谱系可视化 | 实现人工确认和状态提案页面 | P0 | FRONTEND | 5 | LIN-010,AUD-008 | 未开始 |
| UI-006 | Web 控制台与谱系可视化 | 实现快照 diff 与更新记录 | P1 | FRONTEND | 5 | SNAP-009 | 未开始 |
| UI-007 | Web 控制台与谱系可视化 | 实现离线 Bundle 导入页面 | P1 | FRONTEND | 4 | ING-003 | 未开始 |
| QA-006 | 测试、Agent 评测与质量门禁 | 建立 Agent 轨迹评测框架 | P0 | QA | 5 | AGENT-002 | 未开始 |
| QA-012 | 测试、Agent 评测与质量门禁 | 维护质量趋势与缺陷逃逸分析 | P1 | QA | 8 | QA-002 | 未开始 |
| OBS-002 | 可观测性、成本与运行维护 | 接入 Cloud Logging 与 Trace | P0 | CLOUD | 4 | RT-003 | 未开始 |
| DEVOPS-005 | 代码仓库、CI/CD 与发布工程 | 建立基础设施即代码 | P1 | CLOUD | 6 | PLAT-002,RT-001 | 未开始 |
| DOC-001 | 工程文档、用户文档与培训 | 维护架构与数据流文档 | P0 | ARCH | 8 | PM-007 | 未开始 |
| DOC-002 | 工程文档、用户文档与培训 | 维护 Manifest、API 和 MCP 契约 | P0 | BACKEND | 8 | DATA-003,AGENT-002 | 未开始 |

## 阶段启动检查

- [ ] 上一阶段 Gate 已通过
- [ ] P0 任务负责人已确定
- [ ] 外部账号、数据和环境依赖已确认
- [ ] 阶段演示目标已定义
- [ ] 风险登记册已复查

## 阶段结束检查

- [ ] 阶段目标有可运行证据
- [ ] P0 任务全部验收
- [ ] 关键路径和后续依赖已更新
- [ ] 测试、文档和安全项同步完成
- [ ] Gate 评审记录已归档
