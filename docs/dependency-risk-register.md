# 依赖风险登记

复审节奏：每次依赖升级、发布前安全门禁或上游风险状态变化时复审。

| 依赖 | 当前状态 | 暴露面与控制 | 退出条件 |
| --- | --- | --- | --- |
| `@google/adk@1.4.0` 传递依赖 | `npm audit --omit=dev` 报告 13 high；当前上游没有不降级 ADK 的自动修复路径 | Agent 工具为只读白名单，Gateway 默认拒绝，安装使用 `--ignore-scripts`，容器非 root；生产 runtime 删除不需要的 npm/corepack/yarn 全局工具链，构建时只升级已知存在 fixed release 的关键 OS 包；CI 对 critical 立即失败并扫描最终镜像，不使用漏洞忽略项绕过 | ADK 发布兼容的安全升级后升级并清零；在此之前每个发布周期复审 |
| `@google-cloud/storage@7.21.0` / `retry-request` / `teeny-request` | 审计报告 moderate，最终落到 `uuid` 的带调用方 buffer 的 v3/v5/v6 边界检查问题；该依赖原已由 ADK 引入，改为直接依赖后总数仍为 0 critical、13 high、17 moderate、2 low | 本实现不调用 UUID v3/v5/v6 或传入 UUID buffer；对象键由服务端 UUID/受控段组成并再次做路径校验；桶禁止公开访问，写入使用 generation precondition 和 CRC32C/SHA-256，运行身份无 delete 权限 | Google Storage 上游升级到不受影响的 `uuid`/请求链后立即升级；禁止为消除报告而倒退到 npm 建议的旧主版本 5.18.3 |

本登记不是安全豁免。生产放行仍需安全负责人确认、镜像扫描证据和真实权限审查；任何 critical 都阻断发布。
