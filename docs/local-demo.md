# 本地旧项目分析 Demo

这是比赛演示的默认路径。目标不是把源码上传到云端，而是在一台电脑上启动
LabLineage Guardian，用 Local Collector 只读扫描一个已有项目目录，并自动形成可审计
的项目沉淀报告。

## 演示验收目标

一次演示应证明：

1. 能为旧项目声明目标、成功标准和关键产物。
2. Collector 能扫描旧目录中的代码、配置、数据、运行记录和结果文件。
3. Manifest 不包含原始文件内容和绝对路径，只提交签名、路径脱敏的结构化证据。
4. 提交后自动完成扫描、证据建图、审计、目标覆盖评估和报告固化。
5. 未配置 Gemini 时确定性报告仍能完成；配置 Google ADK 后追加可引用证据的解释摘要。

Google Cloud、GitHub App 和 ZIP 导入均不属于这条比赛 Demo 的完成条件。

## 1. 启动本地应用

要求 Node.js 22.15 或更高版本。在 LabLineage Guardian 仓库根目录执行：

```powershell
npm install --ignore-scripts
Copy-Item .env.example backend/.env.local
npm run seed
npm run dev
```

浏览器打开 <http://localhost:5173/#/deploy>。API 固定监听
`http://127.0.0.1:8788`，Vite 页面监听 `http://127.0.0.1:5173`。

## 2. 描述旧项目

点击“部署项目”，填写：

- 项目目标：旧项目最终想解决什么问题；
- 成功标准：评委可以据证据判断的完成条件，每行一条；
- 关键产物：名称和预期相对路径，例如 `最终报告 | reports/final.pdf`；
- 约束：例如“不得上传原始数据”或“只接受可复现运行”。

创建后选择 **Local directory**，再点击“生成配对码”。

## 3. 连接已有目录

页面会生成两条命令。把其中的 `<本地目录>` 替换为旧项目绝对路径，并在
LabLineage Guardian 仓库根目录依次运行。Windows 示例：

```powershell
npm run collector -- init --project "legacy-project" --root "D:\research\legacy-project"
npm run collector -- pair --project "legacy-project" --root "D:\research\legacy-project" --url "http://localhost:5173" --pairing "<pairing-id>" --code "<one-time-code>"
```

`init` 只在目标目录创建本机私有的 `.lablineage/` 状态；它不修改项目文件。
如果旧项目本身使用 Git，应把 `.lablineage/` 加入该项目的忽略规则，绝不能提交
其中的路径盐、索引或 Ed25519 私钥。

`pair` 会立即执行首次 `sync`，所以无需再点击“运行审计”或进入 Agent 对话。
以后重新分析只需执行：

```powershell
npm run collector -- sync --project "legacy-project" --root "D:\research\legacy-project"
```

## 4. 向评委展示结果

回到部署页，页面会依次显示：

`ingest → scan → graph → audit → goal_coverage → agent_summary → finalize`

最终报告应包含成功标准和关键产物逐项状态、引用的 evidence ID、缺失证据、限制、
报告 SHA-256，以及 ADK 可用或不可用状态。没有 Gemini 凭据时
`agent_summary` 会明确降级，但扫描、图谱、审计和目标判断不会失败。

推荐演示一个有真实历史痕迹的旧项目：源代码、配置、README、历史结果和最终报告
至少各一项。不要使用含真实密钥、隐私数据或未授权研究数据的目录。

## 5. 快速排错

- 页面报 API 连接失败：等待终端出现
  `LabLineage Guardian API listening on http://127.0.0.1:8788` 后刷新。
- `Project is not initialized`：先执行页面显示的 `init` 命令。
- 配对码过期：在页面重新生成，旧码不能复用。
- 分析为 `partial`：通常表示 ADK 未配置或目标证据不足；打开报告查看
  `missingEvidence` 和各阶段状态，而不是把它当作扫描失败。
- 重新演示：新建一个项目并重新配对；不要复制旧项目中的 `.lablineage/` 私钥。
