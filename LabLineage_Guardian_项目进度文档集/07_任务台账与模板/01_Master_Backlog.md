# Master Backlog

> 总任务数：235  
> 总估算：863 人日  
> 初始状态：除设计文档外，工程任务默认未开始。

| 任务ID | 工作包 | 阶段 | 优先级 | 负责人 | 人日 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEVOPS-001 | 代码仓库、CI/CD 与发布工程 | P0 | P0 | DEVOPS | 2 | PM-002 | 未开始 |
| PLAT-001 | 比赛资源与 Google 平台上手 | P0 | P0 | CLOUD | 1 | PM-009 | 未开始 |
| PLAT-002 | 比赛资源与 Google 平台上手 | P0 | P0 | CLOUD | 1 | PLAT-001 | 未开始 |
| PLAT-003 | 比赛资源与 Google 平台上手 | P0 | P0 | CLOUD | 1 | PLAT-002 | 未开始 |
| PLAT-004 | 比赛资源与 Google 平台上手 | P0 | P0 | CLOUD | 2 | PLAT-002 | 未开始 |
| PLAT-005 | 比赛资源与 Google 平台上手 | P0 | P0 | CLOUD | 1 | PLAT-002 | 未开始 |
| PLAT-006 | 比赛资源与 Google 平台上手 | P0 | P0 | AGENT | 1 | PLAT-001 | 未开始 |
| PM-001 | 项目管理与治理 | P0 | P0 | PO | 2 | — | 未开始 |
| PM-002 | 项目管理与治理 | P0 | P1 | PO | 1 | PM-001 | 未开始 |
| PM-003 | 项目管理与治理 | P0 | P1 | PO | 1 | PM-001 | 未开始 |
| PM-004 | 项目管理与治理 | P0 | P1 | PO | 1 | PM-003 | 未开始 |
| PM-007 | 项目管理与治理 | P0 | P1 | ARCH | 2 | PM-002 | 未开始 |
| PM-005 | 项目管理与治理 | P0-P7 | P0 | PO | 12 | PM-003 | 未开始 |
| PM-006 | 项目管理与治理 | P0-P7 | P0 | PO | 10 | PM-001 | 未开始 |
| PM-009 | 项目管理与治理 | P0-P7 | P0 | PO | 4 | PM-006 | 未开始 |
| AGENT-001 | ADK Agent 与 Gemini 推理工作流 | P1 | P0 | AGENT | 3 | PROD-009,SEC-006 | 未开始 |
| DATA-001 | 数据契约、Schema 与迁移 | P1 | P0 | ARCH | 3 | PROD-002 | 未开始 |
| DATA-002 | 数据契约、Schema 与迁移 | P1 | P0 | BACKEND | 2 | DATA-001 | 未开始 |
| DATA-003 | 数据契约、Schema 与迁移 | P1 | P0 | BACKEND | 4 | DATA-001,DATA-002 | 未开始 |
| DATA-004 | 数据契约、Schema 与迁移 | P1 | P0 | BACKEND | 3 | DATA-001 | 未开始 |
| GH-001 | GitHub / Git 仓库连接器 | P1 | P0 | SEC | 2 | SEC-002 | 未开始 |
| GOV-001 | Agent Registry、Agent Gateway 与治理 | P1 | P0 | CLOUD | 2 | PLAT-009 | 未开始 |
| GOV-004 | Agent Registry、Agent Gateway 与治理 | P1 | P0 | SEC | 3 | SEC-002,AGENT-002 | 未开始 |
| LIN-001 | 科研谱系解析与多模组关联引擎 | P1 | P0 | ARCH | 3 | DATA-004,PROD-007 | 未开始 |
| PLAT-007 | 比赛资源与 Google 平台上手 | P1 | P0 | AGENT | 2 | PLAT-006 | 未开始 |
| PLAT-008 | 比赛资源与 Google 平台上手 | P1 | P0 | CLOUD | 3 | PLAT-005,PLAT-007 | 未开始 |
| PLAT-009 | 比赛资源与 Google 平台上手 | P1 | P0 | CLOUD | 2 | PLAT-008 | 未开始 |
| PLAT-010 | 比赛资源与 Google 平台上手 | P1 | P0 | CLOUD | 4 | PLAT-009 | 未开始 |
| PLAT-011 | 比赛资源与 Google 平台上手 | P1 | P0 | CLOUD | 3 | PLAT-008,PLAT-010 | 未开始 |
| PLAT-013 | 比赛资源与 Google 平台上手 | P1 | P1 | AGENT | 3 | PLAT-006 | 未开始 |
| PLAT-014 | 比赛资源与 Google 平台上手 | P1 | P0 | ARCH | 2 | PLAT-008,PLAT-010 | 未开始 |
| PROD-001 | 产品需求与科研交接流程 | P1 | P0 | PO | 6 | PM-001 | 未开始 |
| PROD-002 | 产品需求与科研交接流程 | P1 | P0 | PO | 2 | PROD-001 | 未开始 |
| PROD-003 | 产品需求与科研交接流程 | P1 | P0 | PO | 3 | PROD-001 | 未开始 |
| PROD-004 | 产品需求与科研交接流程 | P1 | P0 | PO | 2 | PROD-003 | 未开始 |
| PROD-005 | 产品需求与科研交接流程 | P1 | P0 | PO | 2 | PROD-002 | 未开始 |
| PROD-006 | 产品需求与科研交接流程 | P1 | P0 | PO | 2 | PROD-002 | 未开始 |
| PROD-007 | 产品需求与科研交接流程 | P1 | P0 | RESEARCH | 3 | PROD-002 | 未开始 |
| PROD-008 | 产品需求与科研交接流程 | P1 | P1 | DOC | 3 | PROD-003 | 未开始 |
| PROD-009 | 产品需求与科研交接流程 | P1 | P0 | PO | 2 | PROD-005,PROD-006 | 未开始 |
| PROD-010 | 产品需求与科研交接流程 | P1 | P0 | QA | 3 | PROD-001 | 未开始 |
| PROD-011 | 产品需求与科研交接流程 | P1 | P0 | PO | 2 | PROD-004..PROD-010 | 未开始 |
| QA-001 | 测试、Agent 评测与质量门禁 | P1 | P0 | QA | 3 | PROD-011 | 未开始 |
| RT-001 | Agent Runtime 部署与生命周期 | P1 | P0 | CLOUD | 2 | PLAT-002 | 未开始 |
| SEC-001 | 安全、隐私与威胁建模 | P1 | P0 | SEC | 3 | PROD-002 | 未开始 |
| SEC-002 | 安全、隐私与威胁建模 | P1 | P0 | SEC | 5 | ARCH | 未开始 |
| SEC-003 | 安全、隐私与威胁建模 | P1 | P0 | SEC | 3 | SEC-001 | 未开始 |
| SEC-004 | 安全、隐私与威胁建模 | P1 | P0 | SEC | 3 | SEC-001 | 未开始 |
| SEC-005 | 安全、隐私与威胁建模 | P1 | P0 | SEC | 4 | PLAT-004 | 未开始 |
| SEC-006 | 安全、隐私与威胁建模 | P1 | P0 | SEC | 4 | AGENT-001 | 未开始 |
| SNAP-001 | 无 Git 快照与更新记录追寻 | P1 | P0 | ARCH | 2 | DATA-001 | 未开始 |
| UI-001 | Web 控制台与谱系可视化 | P1 | P1 | FRONTEND | 4 | PROD-003 | 未开始 |
| WS-001 | Google Workspace 交接协作集成 | P1 | P0 | PO | 2 | PROD-008,SEC-003 | 未开始 |
| DOC-001 | 工程文档、用户文档与培训 | P1-P7 | P0 | ARCH | 8 | PM-007 | 未开始 |
| DOC-002 | 工程文档、用户文档与培训 | P1-P7 | P0 | BACKEND | 8 | DATA-003,AGENT-002 | 未开始 |
| PLAT-012 | 比赛资源与 Google 平台上手 | P1-P7 | P1 | CLOUD | 6 | PLAT-005 | 未开始 |
| PM-008 | 项目管理与治理 | P1-P7 | P0 | PO | 8 | PM-005 | 未开始 |
| DATA-005 | 数据契约、Schema 与迁移 | P2 | P0 | BACKEND | 4 | DATA-003,DATA-004 | 未开始 |
| DATA-006 | 数据契约、Schema 与迁移 | P2 | P0 | BACKEND | 2 | DATA-005 | 未开始 |
| DATA-007 | 数据契约、Schema 与迁移 | P2 | P1 | ARCH | 2 | DATA-003 | 未开始 |
| DATA-008 | 数据契约、Schema 与迁移 | P2 | P0 | QA | 5 | DATA-003 | 未开始 |
| DATA-009 | 数据契约、Schema 与迁移 | P2 | P0 | BACKEND | 3 | DATA-005 | 未开始 |
| DEVOPS-002 | 代码仓库、CI/CD 与发布工程 | P2 | P0 | DEVOPS | 3 | DEVOPS-001 | 未开始 |
| DEVOPS-003 | 代码仓库、CI/CD 与发布工程 | P2 | P0 | DEVOPS | 4 | DATA-006 | 未开始 |
| EDGE-001 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 2 | DATA-003 | 未开始 |
| EDGE-002 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 4 | EDGE-001 | 未开始 |
| EDGE-003 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 4 | EDGE-002 | 未开始 |
| EDGE-004 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 4 | EDGE-002,DATA-002 | 未开始 |
| EDGE-005 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 4 | EDGE-003,EDGE-004 | 未开始 |
| EDGE-006 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 6 | EDGE-003 | 未开始 |
| EDGE-007 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 5 | EDGE-003 | 未开始 |
| EDGE-008 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 4 | EDGE-003 | 未开始 |
| EDGE-010 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 5 | SEC-004 | 未开始 |
| EDGE-011 | Edge Collector 与本地资产盘点 | P2 | P0 | EDGE | 4 | EDGE-005,EDGE-010 | 未开始 |
| EDGE-012 | Edge Collector 与本地资产盘点 | P2 | P1 | EDGE | 4 | EDGE-005 | 未开始 |
| ING-001 | Manifest Ingestion API 与云端服务 | P2 | P0 | BACKEND | 2 | DATA-003 | 未开始 |
| ING-002 | Manifest Ingestion API 与云端服务 | P2 | P0 | BACKEND | 3 | ING-001,DATA-005 | 未开始 |
| ING-003 | Manifest Ingestion API 与云端服务 | P2 | P0 | BACKEND | 5 | ING-001,EDGE-011 | 未开始 |
| ING-004 | Manifest Ingestion API 与云端服务 | P2 | P0 | BACKEND | 5 | ING-003,DATA-003 | 未开始 |
| ING-005 | Manifest Ingestion API 与云端服务 | P2 | P0 | BACKEND | 5 | ING-004,DATA-005 | 未开始 |
| ING-006 | Manifest Ingestion API 与云端服务 | P2 | P1 | BACKEND | 3 | ING-005 | 未开始 |
| OBS-001 | 可观测性、成本与运行维护 | P2 | P0 | ARCH | 2 | DATA-002 | 未开始 |
| QA-002 | 测试、Agent 评测与质量门禁 | P2 | P0 | QA | 3 | DEVOPS-002 | 未开始 |
| QA-003 | 测试、Agent 评测与质量门禁 | P2 | P0 | QA | 4 | DATA-003 | 未开始 |
| QA-004 | 测试、Agent 评测与质量门禁 | P2 | P0 | QA | 5 | EDGE-002..EDGE-011 | 未开始 |
| QA-011 | 测试、Agent 评测与质量门禁 | P2 | P0 | QA | 2 | QA-001 | 未开始 |
| SNAP-002 | 无 Git 快照与更新记录追寻 | P2 | P0 | EDGE | 4 | EDGE-004 | 未开始 |
| SNAP-003 | 无 Git 快照与更新记录追寻 | P2 | P0 | EDGE | 4 | EDGE-005,SNAP-002 | 未开始 |
| SNAP-004 | 无 Git 快照与更新记录追寻 | P2 | P1 | EDGE | 4 | SNAP-003 | 未开始 |
| SNAP-005 | 无 Git 快照与更新记录追寻 | P2 | P0 | EDGE | 4 | SNAP-003 | 未开始 |
| SNAP-006 | 无 Git 快照与更新记录追寻 | P2 | P1 | EDGE | 3 | SNAP-003 | 未开始 |
| SNAP-007 | 无 Git 快照与更新记录追寻 | P2 | P1 | EDGE | 3 | SNAP-003,DATA-010 | 未开始 |
| EDGE-009 | Edge Collector 与本地资产盘点 | P2-P3 | P1 | EDGE | 5 | EDGE-003 | 未开始 |
| PROD-012 | 产品需求与科研交接流程 | P2-P7 | P1 | PO | 8 | PROD-011 | 未开始 |
| QA-012 | 测试、Agent 评测与质量门禁 | P2-P7 | P1 | QA | 8 | QA-002 | 未开始 |
| AGENT-002 | ADK Agent 与 Gemini 推理工作流 | P3 | P0 | AGENT | 4 | ING-007 | 未开始 |
| AUD-001 | 可复现性审计与结果筛选 | P3 | P0 | LIN | 4 | PROD-007,LIN-006 | 未开始 |
| AUD-002 | 可复现性审计与结果筛选 | P3 | P0 | LIN | 3 | EDGE-004 | 未开始 |
| AUD-003 | 可复现性审计与结果筛选 | P3 | P0 | LIN | 3 | LIN-006 | 未开始 |
| AUD-004 | 可复现性审计与结果筛选 | P3 | P0 | LIN | 3 | EDGE-009,LIN-002 | 未开始 |
| AUD-005 | 可复现性审计与结果筛选 | P3 | P0 | LIN | 4 | LIN-009 | 未开始 |
| AUD-006 | 可复现性审计与结果筛选 | P3 | P1 | LIN | 3 | EDGE-003,LIN-004 | 未开始 |
| AUD-007 | 可复现性审计与结果筛选 | P3 | P0 | LIN | 4 | PROD-005,AUD-001..AUD-006 | 未开始 |
| GH-002 | GitHub / Git 仓库连接器 | P3 | P0 | BACKEND | 4 | GH-001 | 未开始 |
| GH-003 | GitHub / Git 仓库连接器 | P3 | P0 | BACKEND | 4 | GH-002 | 未开始 |
| GH-004 | GitHub / Git 仓库连接器 | P3 | P0 | LIN | 5 | GH-003,EDGE-004 | 未开始 |
| GH-005 | GitHub / Git 仓库连接器 | P3 | P0 | LIN | 4 | GH-004,SNAP-005 | 未开始 |
| GH-006 | GitHub / Git 仓库连接器 | P3 | P1 | BACKEND | 3 | GH-002 | 未开始 |
| GH-007 | GitHub / Git 仓库连接器 | P3 | P1 | BACKEND | 3 | GH-002 | 未开始 |
| ING-007 | Manifest Ingestion API 与云端服务 | P3 | P0 | BACKEND | 6 | LIN-006,AUD-007 | 未开始 |
| LIN-002 | 科研谱系解析与多模组关联引擎 | P3 | P0 | LIN | 6 | EDGE-006..EDGE-009,DATA-004 | 未开始 |
| LIN-003 | 科研谱系解析与多模组关联引擎 | P3 | P0 | LIN | 5 | DATA-004 | 未开始 |
| LIN-004 | 科研谱系解析与多模组关联引擎 | P3 | P0 | LIN | 5 | LIN-002,GH-004,SNAP-003 | 未开始 |
| LIN-005 | 科研谱系解析与多模组关联引擎 | P3 | P0 | LIN | 5 | GH-004,EDGE-004 | 未开始 |
| LIN-006 | 科研谱系解析与多模组关联引擎 | P3 | P0 | BACKEND | 5 | DATA-005,LIN-002 | 未开始 |
| LIN-007 | 科研谱系解析与多模组关联引擎 | P3 | P1 | LIN | 5 | LIN-005 | 未开始 |
| LIN-009 | 科研谱系解析与多模组关联引擎 | P3 | P0 | LIN | 4 | LIN-004,LIN-006 | 未开始 |
| QA-005 | 测试、Agent 评测与质量门禁 | P3 | P0 | QA | 5 | LIN-011 | 未开始 |
| SNAP-008 | 无 Git 快照与更新记录追寻 | P3 | P0 | LIN | 3 | SNAP-003,LIN-005 | 未开始 |
| LIN-008 | 科研谱系解析与多模组关联引擎 | P3-P4 | P0 | AGENT | 6 | AGENT-004,LIN-006 | 未开始 |
| AGENT-003 | ADK Agent 与 Gemini 推理工作流 | P4 | P0 | AGENT | 5 | PLAT-007,AGENT-002 | 未开始 |
| AGENT-004 | ADK Agent 与 Gemini 推理工作流 | P4 | P0 | AGENT | 5 | LIN-006,AGENT-003 | 未开始 |
| AGENT-005 | ADK Agent 与 Gemini 推理工作流 | P4 | P0 | AGENT | 5 | AUD-007,AGENT-003 | 未开始 |
| AGENT-006 | ADK Agent 与 Gemini 推理工作流 | P4 | P1 | AGENT | 4 | LIN-007,AGENT-003 | 未开始 |
| AGENT-007 | ADK Agent 与 Gemini 推理工作流 | P4 | P0 | AGENT | 4 | LIN-010,AUD-008 | 未开始 |
| AGENT-008 | ADK Agent 与 Gemini 推理工作流 | P4 | P0 | AGENT | 4 | PROD-008,AGENT-005 | 未开始 |
| AGENT-009 | ADK Agent 与 Gemini 推理工作流 | P4 | P1 | AGENT | 4 | PLAT-013 | 未开始 |
| AGENT-010 | ADK Agent 与 Gemini 推理工作流 | P4 | P0 | AGENT | 3 | AGENT-003,SEC-005 | 未开始 |
| AUD-008 | 可复现性审计与结果筛选 | P4 | P0 | BACKEND | 4 | PROD-006,LIN-010 | 未开始 |
| AUD-009 | 可复现性审计与结果筛选 | P4 | P1 | AGENT | 4 | AUD-007,AGENT-005 | 未开始 |
| DEVOPS-005 | 代码仓库、CI/CD 与发布工程 | P4 | P1 | CLOUD | 6 | PLAT-002,RT-001 | 未开始 |
| GOV-002 | Agent Registry、Agent Gateway 与治理 | P4 | P0 | CLOUD | 2 | RT-003,ING-007 | 未开始 |
| GOV-003 | Agent Registry、Agent Gateway 与治理 | P4 | P0 | CLOUD | 3 | GH-002,WS-002,EDGE-011 | 未开始 |
| GOV-005 | Agent Registry、Agent Gateway 与治理 | P4 | P0 | CLOUD | 3 | PLAT-010,GOV-002,GOV-003 | 未开始 |
| GOV-006 | Agent Registry、Agent Gateway 与治理 | P4 | P0 | CLOUD | 4 | GOV-005 | 未开始 |
| GOV-007 | Agent Registry、Agent Gateway 与治理 | P4 | P0 | SEC | 4 | GOV-004,GOV-006 | 未开始 |
| GOV-008 | Agent Registry、Agent Gateway 与治理 | P4 | P1 | ARCH | 3 | GOV-006 | 未开始 |
| LIN-010 | 科研谱系解析与多模组关联引擎 | P4 | P0 | BACKEND | 4 | ING-007 | 未开始 |
| OBS-002 | 可观测性、成本与运行维护 | P4 | P0 | CLOUD | 4 | RT-003 | 未开始 |
| QA-006 | 测试、Agent 评测与质量门禁 | P4 | P0 | QA | 5 | AGENT-002 | 未开始 |
| RT-002 | Agent Runtime 部署与生命周期 | P4 | P0 | CLOUD | 3 | PLAT-008,AGENT-003 | 未开始 |
| RT-003 | Agent Runtime 部署与生命周期 | P4 | P0 | CLOUD | 3 | RT-002 | 未开始 |
| RT-004 | Agent Runtime 部署与生命周期 | P4 | P0 | CLOUD | 3 | PLAT-004,RT-003 | 未开始 |
| RT-005 | Agent Runtime 部署与生命周期 | P4 | P1 | CLOUD | 3 | RT-003 | 未开始 |
| SNAP-009 | 无 Git 快照与更新记录追寻 | P4 | P1 | FRONTEND | 4 | SNAP-003,UI-003 | 未开始 |
| UI-002 | Web 控制台与谱系可视化 | P4 | P1 | FRONTEND | 5 | ING-007 | 未开始 |
| UI-003 | Web 控制台与谱系可视化 | P4 | P0 | FRONTEND | 7 | LIN-006 | 未开始 |
| UI-004 | Web 控制台与谱系可视化 | P4 | P0 | FRONTEND | 4 | AUD-007 | 未开始 |
| UI-005 | Web 控制台与谱系可视化 | P4 | P0 | FRONTEND | 5 | LIN-010,AUD-008 | 未开始 |
| UI-006 | Web 控制台与谱系可视化 | P4 | P1 | FRONTEND | 5 | SNAP-009 | 未开始 |
| UI-007 | Web 控制台与谱系可视化 | P4 | P1 | FRONTEND | 4 | ING-003 | 未开始 |
| WS-002 | Google Workspace 交接协作集成 | P4 | P0 | CLOUD | 3 | PLAT-004 | 未开始 |
| WS-003 | Google Workspace 交接协作集成 | P4 | P0 | BACKEND | 4 | WS-002,PROD-008 | 未开始 |
| WS-004 | Google Workspace 交接协作集成 | P4 | P0 | BACKEND | 4 | WS-002,AGENT-008 | 未开始 |
| WS-005 | Google Workspace 交接协作集成 | P4 | P0 | BACKEND | 3 | WS-002,AUD-009 | 未开始 |
| WS-006 | Google Workspace 交接协作集成 | P4 | P1 | DOC | 3 | PROD-008 | 未开始 |
| WS-008 | Google Workspace 交接协作集成 | P4 | P0 | AGENT | 3 | AGENT-007,WS-003..WS-005 | 未开始 |
| WS-007 | Google Workspace 交接协作集成 | P4-P6 | P2 | BACKEND | 4 | WS-002 | 未开始 |
| AGENT-011 | ADK Agent 与 Gemini 推理工作流 | P5 | P0 | QA | 5 | QA-006 | 未开始 |
| AGENT-012 | ADK Agent 与 Gemini 推理工作流 | P5 | P0 | SEC | 5 | SEC-006,AGENT-011 | 未开始 |
| AUD-010 | 可复现性审计与结果筛选 | P5 | P1 | QA | 3 | AUD-008 | 未开始 |
| AUD-011 | 可复现性审计与结果筛选 | P5 | P0 | RESEARCH | 2 | PROD-006,AUD-002..AUD-006 | 未开始 |
| DATA-010 | 数据契约、Schema 与迁移 | P5 | P1 | SEC | 2 | SEC-003 | 未开始 |
| DATA-011 | 数据契约、Schema 与迁移 | P5 | P1 | BACKEND | 3 | DATA-005,ING-010 | 未开始 |
| DEVOPS-004 | 代码仓库、CI/CD 与发布工程 | P5 | P1 | DEVOPS | 4 | DEVOPS-002 | 未开始 |
| DEVOPS-006 | 代码仓库、CI/CD 与发布工程 | P5 | P1 | DEVOPS | 3 | DATA-010 | 未开始 |
| DEVOPS-007 | 代码仓库、CI/CD 与发布工程 | P5 | P0 | DEVOPS | 3 | DEVOPS-004 | 未开始 |
| DEVOPS-008 | 代码仓库、CI/CD 与发布工程 | P5 | P0 | DEVOPS | 5 | RT-006,QA-009 | 未开始 |
| DOC-003 | 工程文档、用户文档与培训 | P5 | P0 | DOC | 4 | EDGE-013,SEC-004 | 未开始 |
| DOC-004 | 工程文档、用户文档与培训 | P5 | P0 | DOC | 5 | RT-006,GOV-011 | 未开始 |
| DOC-006 | 工程文档、用户文档与培训 | P5 | P1 | DOC | 4 | OBS-004 | 未开始 |
| DOC-008 | 工程文档、用户文档与培训 | P5 | P1 | DOC | 4 | DEVOPS-003 | 未开始 |
| EDGE-013 | Edge Collector 与本地资产盘点 | P5 | P1 | DEVOPS | 4 | EDGE-001..EDGE-012 | 未开始 |
| EDGE-014 | Edge Collector 与本地资产盘点 | P5 | P1 | QA | 4 | EDGE-012 | 未开始 |
| GH-008 | GitHub / Git 仓库连接器 | P5 | P1 | SEC | 2 | GH-001,DATA-010 | 未开始 |
| GH-010 | GitHub / Git 仓库连接器 | P5 | P0 | QA | 4 | GH-002..GH-007 | 未开始 |
| GOV-009 | Agent Registry、Agent Gateway 与治理 | P5 | P0 | CLOUD | 3 | OBS-003,GOV-007 | 未开始 |
| GOV-010 | Agent Registry、Agent Gateway 与治理 | P5 | P0 | SEC | 5 | GOV-007,SEC-007 | 未开始 |
| GOV-011 | Agent Registry、Agent Gateway 与治理 | P5 | P1 | CLOUD | 2 | GOV-001 | 未开始 |
| ING-008 | Manifest Ingestion API 与云端服务 | P5 | P0 | BACKEND | 5 | SEC-005 | 未开始 |
| ING-009 | Manifest Ingestion API 与云端服务 | P5 | P1 | BACKEND | 3 | DATA-010 | 未开始 |
| ING-010 | Manifest Ingestion API 与云端服务 | P5 | P1 | QA | 5 | ING-001..ING-009 | 未开始 |
| LIN-011 | 科研谱系解析与多模组关联引擎 | P5 | P0 | QA | 5 | DATA-008 | 未开始 |
| LIN-012 | 科研谱系解析与多模组关联引擎 | P5 | P1 | BACKEND | 4 | LIN-006,DATA-011 | 未开始 |
| OBS-003 | 可观测性、成本与运行维护 | P5 | P0 | CLOUD | 4 | OBS-002 | 未开始 |
| OBS-004 | 可观测性、成本与运行维护 | P5 | P0 | DEVOPS | 4 | OBS-003 | 未开始 |
| OBS-005 | 可观测性、成本与运行维护 | P5 | P1 | CLOUD | 3 | PLAT-013,OBS-003 | 未开始 |
| OBS-006 | 可观测性、成本与运行维护 | P5 | P0 | SEC | 3 | SEC-003,OBS-002 | 未开始 |
| OBS-007 | 可观测性、成本与运行维护 | P5 | P1 | DEVOPS | 4 | DEVOPS-006 | 未开始 |
| QA-007 | 测试、Agent 评测与质量门禁 | P5 | P0 | QA | 5 | GH-010,WS-009,RT-003 | 未开始 |
| QA-008 | 测试、Agent 评测与质量门禁 | P5 | P1 | QA | 5 | ING-010,EDGE-014,RT-008 | 未开始 |
| RT-006 | Agent Runtime 部署与生命周期 | P5 | P0 | DEVOPS | 4 | RT-003 | 未开始 |
| RT-007 | Agent Runtime 部署与生命周期 | P5 | P0 | CLOUD | 3 | OBS-002 | 未开始 |
| RT-008 | Agent Runtime 部署与生命周期 | P5 | P1 | QA | 4 | RT-005,QA-008 | 未开始 |
| SEC-007 | 安全、隐私与威胁建模 | P5 | P0 | SEC | 5 | SEC-002..SEC-006 | 未开始 |
| SEC-008 | 安全、隐私与威胁建模 | P5 | P1 | DEVOPS | 3 | DEVOPS-004 | 未开始 |
| SEC-009 | 安全、隐私与威胁建模 | P5 | P0 | SEC | 4 | GOV-010,AGENT-012 | 未开始 |
| SEC-010 | 安全、隐私与威胁建模 | P5 | P1 | SEC | 3 | SEC-005 | 未开始 |
| SNAP-010 | 无 Git 快照与更新记录追寻 | P5 | P0 | QA | 4 | DATA-008,SNAP-004 | 未开始 |
| UI-008 | Web 控制台与谱系可视化 | P5 | P1 | FRONTEND | 4 | UI-002..UI-007 | 未开始 |
| WS-009 | Google Workspace 交接协作集成 | P5 | P0 | QA | 3 | WS-002 | 未开始 |
| WS-010 | Google Workspace 交接协作集成 | P5 | P1 | QA | 4 | WS-003..WS-009 | 未开始 |
| QA-009 | 测试、Agent 评测与质量门禁 | P5-P7 | P0 | QA | 8 | M4 | 未开始 |
| DEMO-001 | 比赛演示、叙事与提交物 | P6 | P0 | DOC | 2 | PILOT-007 | 未开始 |
| DEMO-002 | 比赛演示、叙事与提交物 | P6 | P0 | DOC | 4 | DATA-008 | 未开始 |
| DEMO-003 | 比赛演示、叙事与提交物 | P6 | P0 | DOC | 3 | M5,DEMO-002 | 未开始 |
| DOC-005 | 工程文档、用户文档与培训 | P6 | P0 | DOC | 4 | UI-009 | 未开始 |
| DOC-007 | 工程文档、用户文档与培训 | P6 | P0 | SEC | 3 | SEC-009 | 未开始 |
| DOC-009 | 工程文档、用户文档与培训 | P6 | P1 | DOC | 3 | DOC-003..DOC-006 | 未开始 |
| GH-009 | GitHub / Git 仓库连接器 | P6 | P2 | ARCH | 4 | GH-004 | 未开始 |
| OBS-008 | 可观测性、成本与运行维护 | P6 | P1 | PO | 2 | OBS-004 | 未开始 |
| PILOT-001 | 课题组试点与量化验证 | P6 | P0 | PO | 2 | M5,SEC-011 | 未开始 |
| PILOT-002 | 课题组试点与量化验证 | P6 | P0 | SEC | 2 | PILOT-001,SEC-011 | 未开始 |
| PILOT-003 | 课题组试点与量化验证 | P6 | P0 | QA | 3 | PROD-010 | 未开始 |
| PILOT-004 | 课题组试点与量化验证 | P6 | P0 | RESEARCH | 4 | PILOT-002 | 未开始 |
| PILOT-005 | 课题组试点与量化验证 | P6 | P0 | PO | 3 | PILOT-004 | 未开始 |
| PILOT-006 | 课题组试点与量化验证 | P6 | P0 | RESEARCH | 4 | PILOT-005 | 未开始 |
| PILOT-007 | 课题组试点与量化验证 | P6 | P0 | QA | 3 | PILOT-003,PILOT-006 | 未开始 |
| PILOT-008 | 课题组试点与量化验证 | P6 | P0 | PO | 2 | PILOT-005 | 未开始 |
| PILOT-009 | 课题组试点与量化验证 | P6 | P1 | DOC | 3 | PILOT-007 | 未开始 |
| QA-010 | 测试、Agent 评测与质量门禁 | P6 | P0 | QA | 4 | UI-009 | 未开始 |
| SEC-011 | 安全、隐私与威胁建模 | P6 | P0 | SEC | 2 | SEC-003 | 未开始 |
| UI-009 | Web 控制台与谱系可视化 | P6 | P0 | QA | 4 | UI-002..UI-008 | 未开始 |
| DEMO-004 | 比赛演示、叙事与提交物 | P7 | P0 | DEVOPS | 3 | DEVOPS-010 | 未开始 |
| DEMO-005 | 比赛演示、叙事与提交物 | P7 | P0 | DOC | 5 | PILOT-007 | 未开始 |
| DEMO-006 | 比赛演示、叙事与提交物 | P7 | P0 | DOC | 5 | M6 | 未开始 |
| DEMO-007 | 比赛演示、叙事与提交物 | P7 | P1 | DOC | 4 | DEMO-003..DEMO-005 | 未开始 |
| DEMO-008 | 比赛演示、叙事与提交物 | P7 | P0 | PO | 3 | SEC-009,PILOT-007 | 未开始 |
| DEMO-009 | 比赛演示、叙事与提交物 | P7 | P0 | PO | 3 | DEMO-003,DEMO-008 | 未开始 |
| DEMO-010 | 比赛演示、叙事与提交物 | P7 | P0 | DOC | 2 | DEMO-006,DEMO-007 | 未开始 |
| DEVOPS-009 | 代码仓库、CI/CD 与发布工程 | P7 | P0 | DEVOPS | 3 | DEVOPS-008 | 未开始 |
| DEVOPS-010 | 代码仓库、CI/CD 与发布工程 | P7 | P1 | DEVOPS | 4 | EDGE-013,DEVOPS-007 | 未开始 |
| DOC-010 | 工程文档、用户文档与培训 | P7 | P0 | DOC | 2 | M7 | 未开始 |
| PM-010 | 项目管理与治理 | P7 | P2 | PO | 2 | M7 | 未开始 |
| RT-009 | Agent Runtime 部署与生命周期 | P7 | P0 | CLOUD | 3 | M6,RT-006 | 未开始 |

## 使用规则

- 本表是汇总视图，详细验收见各任务包；
- 任何进行中任务必须有负责人、开始日期和下一检查点；
- 阻塞任务必须填写阻塞对象和最晚解决时间；
- 完成任务必须附 PR、测试、文档或评审证据；
- 不直接删除任务，取消任务需保留变更记录。
