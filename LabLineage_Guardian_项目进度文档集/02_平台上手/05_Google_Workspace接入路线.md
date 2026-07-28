# Google Workspace 接入路线

## 1. 只接三类能力

1. **Drive**：存放交接报告和机器可读导出；
2. **Sheets**：维护项目交接台账；
3. **Gmail**：创建整改提醒草稿。

不把 Workspace 当作所有科研原始数据的强制存储。

## 2. 资源准备

```text
Shared Drive: LabLineage Demo
├── Handoffs/
├── Reports/
└── Templates/

Sheet: LabLineage Handoff Registry
Gmail: 比赛测试账号，只允许创建草稿
```

## 3. 接口顺序

1. 先用测试账号手工创建固定资源；
2. 配置最小 OAuth scope；
3. 实现只读探测；
4. 实现写入预览；
5. 实现用户确认；
6. 写入/创建草稿；
7. 记录 resource ID、版本和 trace；
8. 测试权限撤销、文件移动、重复调用和 API 限流。

## 4. 验收

- 相同审计重复执行不会重复插入 Sheet 行；
- Drive 报告有项目、版本、时间和审计 ID；
- Gmail 只产生草稿；
- 账号撤销后系统显示明确失败而不是“成功”；
- 不向 Workspace 上传策略禁止的原始内容。
