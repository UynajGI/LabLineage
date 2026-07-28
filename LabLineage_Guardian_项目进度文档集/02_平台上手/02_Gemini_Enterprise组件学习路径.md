# Gemini Enterprise Agent Platform 学习路径

## 1. 学习目标

不追求先学完所有 Google 产品，而按项目关键路径掌握最小能力。

## 2. 四级学习路线

### Level 0：模型调用

完成：

- Google AI Studio 或 Gemini API 最小调用；
- 结构化 JSON 输出；
- 错误、速率限制和成本记录；
- 使用 ADC 与 API key 的差异实验。

产出：`hello_gemini.py` 和一页调用记录。

### Level 1：ADK Agent

完成：

- 定义一个 Agent；
- 添加一个只读 Python 工具；
- 管理会话或状态；
- 编写一个 Agent 测试；
- 将最终回答和工具调用轨迹分开验证。

产出：`hello_guardian_agent/`。

### Level 2：Agent Runtime

完成：

- 创建 Cloud 项目和服务身份；
- 部署 ADK Agent；
- 调用部署后的 Agent；
- 查看 Logging/Trace；
- 更新、回滚、删除测试部署。

产出：`runtime-spike.md`。

### Level 3：Registry 与 Gateway

完成：

- 创建或识别 Registry；
- 注册 Agent、MCP server 或 endpoint；
- 创建 Gateway；
- 绑定 Registry；
- 配置 allow/deny；
- 将 Runtime 流量经 Gateway 路由；
- 验证被拒绝调用和审计日志。

产出：`governance-spike.md`。

## 3. 对本项目的映射

| 平台组件 | 本项目职责 | 不应该做什么 |
|---|---|---|
| ADK | 编排查询、谱系解释、人工确认、报告生成 | 逐文件计算哈希、直接执行科研脚本 |
| Runtime | 托管 Agent、会话、日志、扩缩容 | 承担组服务器大规模扫描 |
| Registry | 登记 Agent、MCP、Endpoint、版本与 owner | 当业务数据库 |
| Gateway | 路由、身份、策略、允许/拒绝和审计 | 替代完全离线 Bundle |
| Gemini API | 语义提取、冲突归纳、解释和报告 | 代替确定性哈希和 Git diff |

## 4. 学习完成标准

能够独立解释并现场演示：

```text
ADK 写 Agent
→ Runtime 部署 Agent
→ Registry 登记 Agent/工具
→ Gateway 控制 Agent 到工具的调用
→ Gemini 负责语义推理
```

不能只展示 Console 截图或架构图。
