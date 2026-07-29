# 接入第一个项目

本教程使用一个非敏感科研目录副本，完成：

```text
创建服务端项目 → 初始化 Collector → 扫描 → 验证 → 导入 → 检查谱系
```

不要第一次就扫描生产共享盘或敏感数据。先选择一个你熟悉、规模较小、包含数据、代码、配置和输出的副本。

## 1. 准备目录

示例结构：

```text
my-first-project/
├── data/measurements.csv
├── configs/paper.yaml
├── scripts/plot.py
└── outputs/figure.png
```

Collector 会忽略常见密钥、Git/build/cache 目录和符号链接，不会把绝对路径或原始文件内容写入 Manifest。

## 2. 启动服务并创建项目

按[10 分钟体验](quickstart.md)启动服务。当前控制台尚未提供创建项目表单，因此开发环境需要通过 API 创建一次：

macOS / Linux：

```bash
curl -fsS -X POST http://127.0.0.1:8788/v1/projects \
  -H 'Content-Type: application/json' \
  -H 'X-LabLineage-Role: admin' \
  -H 'Idempotency-Key: create-my-first-project-v1' \
  --data '{"name":"My First Project","slug":"my-first-project"}'
```

Windows PowerShell：

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "X-LabLineage-Role" = "admin"
  "Idempotency-Key" = "create-my-first-project-v1"
}
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8788/v1/projects `
  -Headers $headers `
  -Body '{"name":"My First Project","slug":"my-first-project"}'
```

刷新控制台，在左侧 **Current Project** 中选择 `My First Project`。Collector 的 `--project` 必须与这里的 slug `my-first-project` 完全一致，否则导入会被拒绝。

## 3. 初始化并扫描

把 `/path/to/my-first-project` 或 `C:\research\my-first-project` 替换为你的目录。

macOS / Linux：

```bash
npm run collector -- init --project my-first-project --root /path/to/my-first-project
npm run collector -- scan --project my-first-project --root /path/to/my-first-project --out /tmp/my-first-project-manifest.json
npm run collector -- verify /tmp/my-first-project-manifest.json
```

Windows PowerShell：

```powershell
npm run collector -- init --project my-first-project --root C:\research\my-first-project
npm run collector -- scan --project my-first-project --root C:\research\my-first-project --out $env:TEMP\my-first-project-manifest.json
npm run collector -- verify $env:TEMP\my-first-project-manifest.json
```

预期结果：

- `init` 显示 `Initialized my-first-project`。
- `.lablineage/` 只出现在被扫描目录本地；不要提交它。
- `scan` 报告 bundle ID、采集的资产数量和 Manifest 文件位置。
- `verify` 显示 Bundle 签名有效。

如果再次执行 `init`，工具会拒绝覆盖已有项目密钥；这是正确的安全行为。

## 4. 导入 Manifest

在控制台选择 `My First Project`，打开 **Upload Center**：

1. 拖入 `my-first-project-manifest.json`。
2. 点击 **Upload & Validate**。
3. 等待进度达到 100%。
4. 确认日志显示 bundle ID，以及导入的 node、edge 和 evidence 数量。

开发环境接受初始化 Collector 生成的签名 Manifest。生产环境还必须把 Collector 公钥指纹加入受信列表。

## 5. 验证导入是否“语义正确”

打开 **Lineage Explorer**，不要只检查节点数量。抽查你知道答案的结果：

1. 点击一个你亲自生成过的输出节点，核对右栏的 `Label`、`Type` 和节点
   `Evidence IDs`。
2. 在 **Connected relationships** 中打开它与 Run 的关系，核对
   `From`、`To`、`Relation`、`Confidence` 和关系 `Evidence IDs`。
3. 返回图中点击该 Run，在 **Connected relationships** 中检查它是否有预期的
   CodeVersion、Dataset、ParameterSet、Environment 和输出。
4. 对照真实命令和文件回答：
   - Python/Notebook/日志解析出的读写关系是否符合事实？
   - 配置中的数值和布尔参数是否出现，敏感字符串是否被排除？
   - Git commit、运行和输出是否连接正确？
   - 推断关系是否仍标记为候选，而不是事实？

节点右栏中的 `Evidence IDs` 证明“这个节点为何存在”；打开关系后看到的
`Evidence IDs` 证明“为什么认为两个节点存在这条连接”。两者不要混为一谈。

打开 **Audit Findings** 并运行审计。把每条发现标为“真问题、合理提醒、误报或证据不足”；这比单纯清空发现更有价值。

## 6. 验证变更追踪

先保留初始 Manifest。修改一个非敏感测试文件后，再生成第二个 Manifest 并比较：

```bash
npm run collector -- scan --project my-first-project --root /path/to/my-first-project --out /tmp/my-first-project-after.json
npm run collector -- diff --before /tmp/my-first-project-manifest.json --after /tmp/my-first-project-after.json
```

Windows PowerShell：

```powershell
npm run collector -- scan --project my-first-project --root C:\research\my-first-project --out $env:TEMP\my-first-project-after.json
npm run collector -- diff --before $env:TEMP\my-first-project-manifest.json --after $env:TEMP\my-first-project-after.json
```

检查新增、修改、删除、移动候选和复制候选是否符合实际操作。候选移动只有在人工核实后才能视为事实。

## 成功标准

- [ ] Manifest 不含绝对路径、密钥或原始文件内容。
- [ ] 服务端项目与 Collector project key 匹配。
- [ ] 至少一个真实结果的上游证据符合领域事实。
- [ ] 推断和事实没有混淆。
- [ ] 第二次扫描能解释一个已知变更。
- [ ] 本地交接预览能概括当前风险和缺失证据。

更大目录、资源限制、离线 `.tar.zst` 和上传队列见[Collector 指南](collector-guide.md)。
