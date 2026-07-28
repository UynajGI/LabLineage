# P5｜Beta、质量与安全 Backlog

- **计划窗口**：第17–19周
- **阶段目标**：端到端 Beta、Agent 评测、安全测试、可观测性与发布流程完成
- **任务数**：55
- **估算**：251 人日

| 任务ID | 工作包 | 任务 | 优先级 | 负责人 | 人日 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PM-005 | 项目管理与治理 | 维护里程碑和关键路径 | P0 | PO | 12 | PM-003 | 未开始 |
| PM-006 | 项目管理与治理 | 维护 RAID 登记册 | P0 | PO | 10 | PM-001 | 未开始 |
| PM-008 | 项目管理与治理 | 执行阶段 Gate 评审 | P0 | PO | 8 | PM-005 | 未开始 |
| PM-009 | 项目管理与治理 | 建立外部依赖与比赛通知跟踪 | P0 | PO | 4 | PM-006 | 未开始 |
| PLAT-012 | 比赛资源与 Google 平台上手 | 建立平台兼容性与变更核验机制 | P1 | CLOUD | 6 | PLAT-005 | 未开始 |
| PROD-012 | 产品需求与科研交接流程 | 每阶段执行需求回归 | P1 | PO | 8 | PROD-011 | 未开始 |
| DATA-010 | 数据契约、Schema 与迁移 | 建立数据保留和删除策略 | P1 | SEC | 2 | SEC-003 | 未开始 |
| DATA-011 | 数据契约、Schema 与迁移 | 进行 Schema 性能基准 | P1 | BACKEND | 3 | DATA-005,ING-010 | 未开始 |
| EDGE-013 | Edge Collector 与本地资产盘点 | 构建多平台安装包与版本信息 | P1 | DEVOPS | 4 | EDGE-001..EDGE-012 | 未开始 |
| EDGE-014 | Edge Collector 与本地资产盘点 | 执行真实大目录性能测试 | P1 | QA | 4 | EDGE-012 | 未开始 |
| SNAP-010 | 无 Git 快照与更新记录追寻 | 建立无 Git 追踪准确率测试集 | P0 | QA | 4 | DATA-008,SNAP-004 | 未开始 |
| GH-008 | GitHub / Git 仓库连接器 | 实现仓库断开与数据撤销流程 | P1 | SEC | 2 | GH-001,DATA-010 | 未开始 |
| GH-010 | GitHub / Git 仓库连接器 | 建立仓库连接端到端测试 | P0 | QA | 4 | GH-002..GH-007 | 未开始 |
| ING-008 | Manifest Ingestion API 与云端服务 | 实现鉴权、租户隔离和审计日志 | P0 | BACKEND | 5 | SEC-005 | 未开始 |
| ING-009 | Manifest Ingestion API 与云端服务 | 实现对象存储报告与 Bundle 生命周期 | P1 | BACKEND | 3 | DATA-010 | 未开始 |
| ING-010 | Manifest Ingestion API 与云端服务 | 执行 API 负载和故障测试 | P1 | QA | 5 | ING-001..ING-009 | 未开始 |
| LIN-011 | 科研谱系解析与多模组关联引擎 | 构建谱系黄金测试集 | P0 | QA | 5 | DATA-008 | 未开始 |
| LIN-012 | 科研谱系解析与多模组关联引擎 | 优化大图查询与缓存 | P1 | BACKEND | 4 | LIN-006,DATA-011 | 未开始 |
| AUD-010 | 可复现性审计与结果筛选 | 建立误报/漏报反馈闭环 | P1 | QA | 3 | AUD-008 | 未开始 |
| AUD-011 | 可复现性审计与结果筛选 | 验证科学探索结果不被错误等同垃圾 | P0 | RESEARCH | 2 | PROD-006,AUD-002..AUD-006 | 未开始 |
| AGENT-011 | ADK Agent 与 Gemini 推理工作流 | 实现 Agent 轨迹测试与回放 | P0 | QA | 5 | QA-006 | 未开始 |
| AGENT-012 | ADK Agent 与 Gemini 推理工作流 | 执行提示注入与幻觉红队测试 | P0 | SEC | 5 | SEC-006,AGENT-011 | 未开始 |
| RT-006 | Agent Runtime 部署与生命周期 | 建立部署、回滚和删除脚本 | P0 | DEVOPS | 4 | RT-003 | 未开始 |
| RT-007 | Agent Runtime 部署与生命周期 | 配置日志、Trace 和自定义指标 | P0 | CLOUD | 3 | OBS-002 | 未开始 |
| RT-008 | Agent Runtime 部署与生命周期 | 进行冷启动、并发和故障测试 | P1 | QA | 4 | RT-005,QA-008 | 未开始 |
| GOV-009 | Agent Registry、Agent Gateway 与治理 | 建立 Gateway 拒绝和审计监控 | P0 | CLOUD | 3 | OBS-003,GOV-007 | 未开始 |
| GOV-010 | Agent Registry、Agent Gateway 与治理 | 执行越权、绕过和身份混淆测试 | P0 | SEC | 5 | GOV-007,SEC-007 | 未开始 |
| GOV-011 | Agent Registry、Agent Gateway 与治理 | 建立注册资源版本与退役流程 | P1 | CLOUD | 2 | GOV-001 | 未开始 |
| WS-007 | Google Workspace 交接协作集成 | 实现 Drive revisions/permissions 可选审计 | P2 | BACKEND | 4 | WS-002 | 未开始 |
| WS-009 | Google Workspace 交接协作集成 | 建立 Workspace 端到端测试账号与夹具 | P0 | QA | 3 | WS-002 | 未开始 |
| WS-010 | Google Workspace 交接协作集成 | 执行权限撤销、文件移动和 API 故障测试 | P1 | QA | 4 | WS-003..WS-009 | 未开始 |
| UI-008 | Web 控制台与谱系可视化 | 实现可访问性和响应式基础 | P1 | FRONTEND | 4 | UI-002..UI-007 | 未开始 |
| SEC-007 | 安全、隐私与威胁建模 | 建立安全测试用例 | P0 | SEC | 5 | SEC-002..SEC-006 | 未开始 |
| SEC-008 | 安全、隐私与威胁建模 | 执行依赖和容器供应链扫描 | P1 | DEVOPS | 3 | DEVOPS-004 | 未开始 |
| SEC-009 | 安全、隐私与威胁建模 | 进行权限与数据泄漏评审 | P0 | SEC | 4 | GOV-010,AGENT-012 | 未开始 |
| SEC-010 | 安全、隐私与威胁建模 | 建立安全事件响应与密钥轮换 SOP | P1 | SEC | 3 | SEC-005 | 未开始 |
| QA-007 | 测试、Agent 评测与质量门禁 | 建立 Workspace/GitHub/Runtime 集成测试 | P0 | QA | 5 | GH-010,WS-009,RT-003 | 未开始 |
| QA-008 | 测试、Agent 评测与质量门禁 | 执行性能、容量和稳定性测试 | P1 | QA | 5 | ING-010,EDGE-014,RT-008 | 未开始 |
| QA-009 | 测试、Agent 评测与质量门禁 | 执行端到端回归和发布验收 | P0 | QA | 8 | M4 | 未开始 |
| QA-012 | 测试、Agent 评测与质量门禁 | 维护质量趋势与缺陷逃逸分析 | P1 | QA | 8 | QA-002 | 未开始 |
| OBS-003 | 可观测性、成本与运行维护 | 建立导入、Agent、Gateway 和 Workspace 指标 | P0 | CLOUD | 4 | OBS-002 | 未开始 |
| OBS-004 | 可观测性、成本与运行维护 | 建立告警和运行手册 | P0 | DEVOPS | 4 | OBS-003 | 未开始 |
| OBS-005 | 可观测性、成本与运行维护 | 建立模型调用成本归因 | P1 | CLOUD | 3 | PLAT-013,OBS-003 | 未开始 |
| OBS-006 | 可观测性、成本与运行维护 | 建立隐私安全日志审查 | P0 | SEC | 3 | SEC-003,OBS-002 | 未开始 |
| OBS-007 | 可观测性、成本与运行维护 | 执行备份、恢复和灾难演练 | P1 | DEVOPS | 4 | DEVOPS-006 | 未开始 |
| DEVOPS-004 | 代码仓库、CI/CD 与发布工程 | 建立容器构建与 SBOM | P1 | DEVOPS | 4 | DEVOPS-002 | 未开始 |
| DEVOPS-006 | 代码仓库、CI/CD 与发布工程 | 配置数据库备份和对象生命周期 | P1 | DEVOPS | 3 | DATA-010 | 未开始 |
| DEVOPS-007 | 代码仓库、CI/CD 与发布工程 | 建立版本号、Changelog 和制品签名 | P0 | DEVOPS | 3 | DEVOPS-004 | 未开始 |
| DEVOPS-008 | 代码仓库、CI/CD 与发布工程 | 建立 staging 自动部署与 smoke test | P0 | DEVOPS | 5 | RT-006,QA-009 | 未开始 |
| DOC-001 | 工程文档、用户文档与培训 | 维护架构与数据流文档 | P0 | ARCH | 8 | PM-007 | 未开始 |
| DOC-002 | 工程文档、用户文档与培训 | 维护 Manifest、API 和 MCP 契约 | P0 | BACKEND | 8 | DATA-003,AGENT-002 | 未开始 |
| DOC-003 | 工程文档、用户文档与培训 | 编写 Collector 安装和安全配置指南 | P0 | DOC | 4 | EDGE-013,SEC-004 | 未开始 |
| DOC-004 | 工程文档、用户文档与培训 | 编写平台部署和账号配置指南 | P0 | DOC | 5 | RT-006,GOV-011 | 未开始 |
| DOC-006 | 工程文档、用户文档与培训 | 编写故障排查和运维手册 | P1 | DOC | 4 | OBS-004 | 未开始 |
| DOC-008 | 工程文档、用户文档与培训 | 制作开发者快速上手示例 | P1 | DOC | 4 | DEVOPS-003 | 未开始 |

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
