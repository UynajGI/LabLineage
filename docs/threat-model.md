# LabLineage Guardian 威胁模型

新增项目接入边界：Collector pairing code 必须短期、单次使用；换取的凭据绑定
tenant/project/source 与 Ed25519 公钥，并防重放、可撤销。云端永不信任客户端提供的
绝对路径。GitHub App 私钥仅从 Secret Manager 读取，安装权限保持只读，首次解析的
commit SHA 固定到重试。ZIP 仅为兜底，必须在解压前校验中央目录、符号链接、路径、
大小和压缩比，在隔离临时目录处理并从不可变对象复核 checksum。

| 威胁 | 主要控制 | 验证方式 |
|---|---|---|
| 跨租户或跨项目读取 | OIDC claims、RBAC、项目白名单、PostgreSQL RLS/FORCE RLS | 越权单测与数据库集成测试 |
| Collector Bundle 篡改 | Ed25519 签名、受信 SPKI 指纹、bundle 幂等 | 篡改与未知签名者测试 |
| 原始路径或秘密外泄 | HMAC 路径令牌、目录排除、请求/日志不记录正文 | 固定夹具秘密扫描 |
| GitHub/Workspace 过度授权 | GitHub 只读；Gmail 仅 drafts；外部写入显式确认 | 权限清单、撤权和负向契约测试 |
| Prompt injection 诱导 Agent 写入 | Agent 仅注册只读工具；写入 API 独立确认门 | Agent 轨迹评测和恶意提示集 |
| 重放或重复写入 | bundle ID、Workspace idempotency key、Sheets audit ID | 重试测试 |
| 供应链或镜像风险 | lockfile、固定版本扫描器、critical audit、非 root 容器、[依赖风险登记](dependency-risk-register.md) | CI、容器扫描与每发布周期复审 |
| DoS / 资源耗尽 | 请求体限制、Agent 限流、Collector 文件上限、集成超时 | 负载和上限测试 |

剩余外部验收：真实 OIDC/JWKS、GitHub 沙箱、Workspace 沙箱、云数据库 RLS、容器扫描和恢复演练。
