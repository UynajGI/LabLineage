# Edge Collector 安装与安全操作指南

## 运行要求

- Node.js 22.15 或更高版本（离线包使用 Node 内置 Zstandard 支持）。
- 扫描账号只需要目标目录的读取权限；不要使用管理员或 root 账号。
- `.lablineage/` 只保存在科研服务器本地，其中包含路径盐、SQLite 索引和 Ed25519 私钥，不应提交到 Git。

安装依赖：

```bash
npm ci --ignore-scripts
```

## 初始化与扫描

```bash
npm run collector -- init --project phase-transition --root /srv/lab/projects/phase-transition
npm run collector -- scan --project phase-transition --root /srv/lab/projects/phase-transition --policy ./lablineage-policy.yaml
```

`init` 会生成本地路径盐和 Ed25519 密钥；对已初始化目录再次执行会拒绝覆盖。`scan` 原子写入不可变快照，失败或中断不会替换 `latest`。重新执行时会复用 SQLite 中已经完成的哈希。

默认行为：

- 忽略符号链接、Git/build/cache 目录以及常见密钥文件。
- 不导出原始路径或文件内容，只导出 HMAC 路径 Token、结构化元数据和证据。
- 小于等于 2 GiB 的文件使用流式完整 SHA-256；更大文件使用首/中/尾各 8 MiB 的采样指纹，并明确记录 `strength=sampled`。
- JSON/YAML/TOML/INI 参数中的数值和布尔值可进入 ParameterSet；秘密键和字符串值在本地脱敏。
- 可使用 `--io-delay-ms <毫秒>` 降低共享存储的 I/O 压力。

策略文件必须使用 `schema_version: lablineage.policy.v1`。`scan.exclude` 支持目录级模式；启用符号链接、导出原始路径或原始内容会被拒绝。示例见归档设计文档（`archive/LabLineage_Guardian_设计文档_v0.1.md`，第 18 节）。

## 快照、运行与离线交接

```bash
npm run collector -- diff --project phase-transition --root /srv/lab/projects/phase-transition --from snap_... --to latest
npm run collector -- run --project phase-transition --root /srv/lab/projects/phase-transition --label fig3 -- python scripts/plot.py --config configs/paper.yaml
npm run collector -- export --project phase-transition --root /srv/lab/projects/phase-transition --snapshot latest --output handoff-bundle.tar.zst
npm run collector -- verify handoff-bundle.tar.zst
```

`.tar.zst` 包内只允许一个 `bundle.json`，且必须通过 Ed25519 签名、TAR 校验和、Zstandard 解压上限和 JSON 校验。损坏、额外条目、重复条目和无效签名都会阻断导入。完全隔离环境可人工审核后单向传输；联网环境可直接上传：

```bash
npm run collector -- upload --bundle handoff-bundle.tar.zst --url https://guardian.example
```

上传使用稳定的 Bundle ID 作为幂等键；队列模式会持久化完成状态并从失败位置恢复。

## 密钥、升级和回滚

- 私钥：`.lablineage/keys/source-private.pem`，只允许扫描账号读取。
- 公钥：登记到服务端受信指纹列表后才能导入签名包。
- 怀疑私钥泄漏时，立即从服务端撤销指纹，归档旧公钥，重新初始化一个新项目目录并重新建立受信关系。不要覆盖原项目密钥后伪装为同一来源。
- 升级前备份 `.lablineage/project.json`、`keys/`、`snapshots/` 和 `collector.sqlite`；使用固定 lockfile 执行 `npm ci --ignore-scripts`。
- 回滚只替换 Collector 程序版本，不回写或删除已有快照。新版本生成的快照必须继续通过 `verify` 后再上传。

## 资源控制与大目录验收

扫描、快照以及受控运行前后的采集都接受同一组资源参数：

```bash
npm run collector -- scan \
  --project phase-transition \
  --root /srv/lab/projects/phase-transition \
  --max-files 1000000 \
  --io-mbps 40 \
  --cpu-yield-every 100 \
  --max-duration-seconds 7200
```

- `--max-files` 是文件数量硬上限，防止挂载点或排除规则配置错误导致扫描范围失控。
- `--io-mbps` 是近似读取带宽上限；Collector 会分段等待，并在等待期间继续响应取消和总时限。
- `--cpu-yield-every` 指定处理多少个文件后向事件循环让步，避免长期独占单个 Node.js 进程。
- `--max-duration-seconds` 是扫描总时限；超过时以 `SCAN_TIMEOUT` 失败，且不会发布半成品快照。
- Bundle 的 `stats.resource_policy`、`io_bytes_read`、`scheduler_yields` 和 `duration_ms` 可用于容量审计。

提交前的快速性能门禁创建 5,000 个分片测试文件，同时检查冷扫描、热缓存、目录指纹稳定性和调度让步：

```bash
npm run benchmark:ci --workspace collector
```

百万文件验收需要独占临时盘空间和较长运行时间，应在目标操作系统与同类存储上执行：

```bash
npm run benchmark:large --workspace collector
```

验收证据应记录 Node.js/操作系统版本、存储类型、冷/热 files/s、峰值 RSS、缓存命中数和目录指纹结果。CI 的 5,000 文件门禁用于防回归，不替代目标环境中的百万文件验收。

## 故障排查

- `Project is not initialized`：确认 `--root` 指向包含 `.lablineage/project.json` 的目录。
- `Project mismatch`：命令中的 `--project` 与本地配置不一致；不要绕过检查。
- `Snapshot scan aborted`：修复中断原因后重跑，SQLite 缓存会复用已完成哈希。
- `scan_warnings` 非空：路径 Token 对应的文件消失或权限不足；原始路径不会写入 Bundle。
- `signature is invalid`：不要上传或继续传递该文件，从可信快照重新导出。
