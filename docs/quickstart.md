# 10 分钟体验

本教程面向第一次接触 LabLineage 的使用者。它只加载演示项目，不扫描真实科研目录，不需要 Gemini、Google Workspace 或云凭据。

## 1. 启动演示环境

要求 Node.js 22.15 或更高版本。在仓库根目录执行：

macOS / Linux：

```bash
npm install --ignore-scripts
cp .env.example backend/.env.local
npm run seed
npm run dev
```

Windows PowerShell：

```powershell
npm install --ignore-scripts
Copy-Item .env.example backend/.env.local
npm run seed
npm run dev
```

预期结果：

- 终端显示 API 已在 `127.0.0.1:8788` 启动。
- 在浏览器打开 <http://localhost:5173/#/checklist>。
- 页面顶部显示 `LIVE API / 真实后端数据`。
- 当前项目为 `Phase Transition Study`。

如果页面显示 API 连接失败，打开 <http://127.0.0.1:8788/api/health>；正常响应应包含 `ok`。

## 2. 读懂一个结果

打开 **Lineage Explorer**。第一次检查不需要理解整张图，照下面点即可：

1. 在图中找到橙色的 `fig3.png`（下一行写着 `Figure`），点击圆点或文字。
2. 右侧出现 **Node Details**。先核对：
   - `Label` 是 `fig3.png`；
   - `Type` 是 `Figure`；
   - `Reproducibility` 是 `R3 (Runnable)`；
   - 节点自己的 `Evidence IDs` 是 `ev_figure_hash`。
3. 在同一右栏找到 **Connected relationships**，点击
   `generated / Incoming / plot_phase.py #019 · Run`。
4. 右栏切换为 **Relation Evidence**。这条关系应显示：
   - `Relation: generated`；
   - `From: run_plot_019`；
   - `To: figure_3`；
   - `Confidence: exact`；
   - `Evidence IDs: ev_figure_hash`。
5. 关闭右栏，在图中点击紫色的 `plot_phase.py #019`（`Run`）。
6. 在它的 **Connected relationships** 中逐条打开并核对：

| 要检查的来源 | 关系 | 方向 | 预期 evidence ID |
| --- | --- | --- | --- |
| `analysis@42f8c1d · CodeVersion` | `executed_as` | Incoming | `ev_run_log` |
| `measurements-v3.parquet · Dataset` | `used_input` | Incoming | `ev_run_log` |
| `configs/paper.yaml · ParameterSet` | `used_parameter_set` | Incoming | `ev_params` |
| `uv.lock · Environment` | `used_environment` | Incoming | `ev_env_lock` |
| `fig3.png · Figure` | `generated` | Outgoing | `ev_figure_hash` |

**Incoming** 表示“该来源进入当前节点”，**Outgoing** 表示“当前节点产生或支持下游”。
每点开一行，都应在 **Relation Evidence** 中看到 `From`、`To`、`Confidence`
和非空的 `Evidence IDs`。不要点击 **Confirm** 或 **Reject**；那是正式审核动作，
不是本次浏览练习。

完成后，你应能用一句话复述：

> `fig3.png` 由运行 `plot_phase.py #019` 生成；该运行使用 commit
> `42f8c1d`、数据集 `measurements-v3.parquet`、参数
> `configs/paper.yaml` 和环境锁文件 `uv.lock`，每条关系都有对应 evidence ID。

此时的目标不是盲目信任图，而是能区分“节点自己的证据”和“节点之间关系的证据”，
并判断关系的置信级别。

## 3. 查看审计发现

打开 **Audit Findings**，点击 **Run audit**。

每条发现包含：

- 严重级别；
- 受影响实体；
- 建议动作；
- 支持该判断的证据。

不要为了清空列表而点击 **Resolve**。只有在你已经补齐或核实证据时才解决发现；该操作会记录当前身份和不可变审计事件。

## 4. 创建交接预览

打开 **Workspace Handoff**。

1. 检查 Drive、Sheets 和 Gmail 草稿的实时预览。
2. 点击 **Create local preview**。
3. 确认页面显示 `Immutable local preview <exportId> created with 3 files.`。

本地预览包含 Markdown、CSV 和未发送的 EML 对象，但界面不会暴露服务器绝对路径。此步骤不会发送邮件，也不会写入 Google Workspace。

## 5. 可选：询问 Guardian Agent

只有配置模型密钥后才执行。打开 **Guardian Agent**，询问：

> fig3.png 是怎么生成的？现在还能复现吗？请区分事实、推断和缺失证据，并列出 evidence ID。

Agent 不可用不影响谱系、审计、快照和本地交接功能。

## 完成检查

- [ ] 页面连接真实 API，而不是 mock。
- [ ] 我能解释一个图表的主要上游证据。
- [ ] 我知道 Finding 是风险提示，不是自动删除命令。
- [ ] 我知道候选关系需要人工审核。
- [ ] 我创建了本地预览，而且没有发送邮件。

下一步使用自己的目录时，请继续[接入第一个项目](first-project.md)。
