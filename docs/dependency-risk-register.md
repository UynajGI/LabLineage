# 依赖风险登记

更新时间：2026-07-28

| 依赖 | 当前状态 | 暴露面与控制 | 退出条件 |
| --- | --- | --- | --- |
| `@google/adk@1.4.0` 传递依赖 | 生产范围 `npm audit --omit=dev --omit=optional` 报告 6 high、18 moderate、0 critical；当前最新 ADK 仍固定旧 OpenTelemetry/Google Cloud 依赖范围，npm 只给出不兼容降级建议 | Agent 工具为只读白名单，Gateway 默认拒绝，安装使用 `--ignore-scripts`；生产镜像 prune 未使用的 optional 数据库驱动，容器非 root，关键 `tar`/`adm-zip` 已强制到修复版本，CI 对 critical 立即失败并扫描最终镜像 | ADK 发布兼容安全范围后升级并清零；在此之前每个发布周期复审，禁止用跨主版本 override 制造无效依赖树 |
| `@google-cloud/storage@7.21.0` / `retry-request` / `teeny-request` | 审计报告 moderate/high 传递链，最终包含 `uuid` buffer 边界及旧构建工具 DoS；上游当前最新 Storage 仍依赖该范围，npm 建议降级到 5.18.3 | 本实现不调用 UUID v3/v5/v6 或传入 UUID buffer；对象键由服务端 UUID/受控段组成并再次做路径校验；桶禁止公开访问，写入使用 generation precondition 和 CRC32C/SHA-256，运行身份无 delete 权限 | Google Storage 上游升级到不受影响的请求链后立即升级；禁止为消除报告而倒退到过期主版本 |

本登记不是安全豁免。生产放行仍需安全负责人确认、镜像扫描证据和真实权限审查；任何 critical 都阻断发布。
