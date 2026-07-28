# 角色分工与 RACI

## 1. 角色定义

| 代码 | 角色 |
| --- | --- |
| PO | 产品负责人 / 项目负责人 |
| ARCH | 技术负责人 / 架构师 |
| EDGE | 边缘采集与解析开发 |
| BACKEND | 云端后端与数据开发 |
| AGENT | Gemini / ADK Agent 开发 |
| CLOUD | Google Cloud 与平台工程 |
| FRONTEND | Web 控制台与可视化 |
| QA | 测试、评测与质量负责人 |
| SEC | 安全与隐私负责人 |
| RESEARCH | 科研流程顾问 / 试点用户 |
| DOC | 文档、演示与比赛交付负责人 |

## 2. 核心事项 RACI

| 事项 | A 最终负责 | R 执行 | C 协商 | I 知会 |
|---|---|---|---|---|
| 项目范围与优先级 | PO | PO | ARCH、RESEARCH | 全员 |
| 数据模型与架构 | ARCH | BACKEND、EDGE | AGENT、SEC | PO、QA |
| 组服务器采集 | ARCH | EDGE | SEC、RESEARCH | QA |
| GitHub 连接 | ARCH | BACKEND | SEC | AGENT、QA |
| 谱系与可复现规则 | ARCH | LIN/后端角色 | RESEARCH、QA | PO |
| Gemini Agent | ARCH | AGENT | SEC、BACKEND | PO、QA |
| Runtime/Registry/Gateway | CLOUD | CLOUD | ARCH、SEC | AGENT、QA |
| Workspace 集成 | PO | BACKEND、AGENT | SEC、DOC | QA |
| 安全与隐私 | SEC | SEC、相关开发 | ARCH、RESEARCH | PO |
| 发布质量 | QA | QA | 全体开发 | PO |
| 试点与指标 | PO | QA、RESEARCH | SEC、DOC | 全员 |
| 比赛提交 | PO | DOC | ARCH、QA、CLOUD | 全员 |

## 3. 小团队合并建议

若团队只有 3–4 人，可按以下方式合并，但职责仍要在任务中显式记录：

- 成员 A：PO + RESEARCH + DOC；
- 成员 B：ARCH + EDGE + BACKEND；
- 成员 C：AGENT + CLOUD + DEVOPS；
- 成员 D：FRONTEND + QA + SEC 协调。

安全评审与验收不能由同一实现者单独完成，至少需要交叉检查。
