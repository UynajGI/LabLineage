import React, { createContext, useContext, useEffect, useState } from 'react';

export type Locale = 'en' | 'zh';

const STORAGE_KEY = 'lablineage.locale';

/**
 * UI 文案词典：key 为代码中的英文字面量，zh 为中文翻译。
 * t(text) 在 zh 语言下返回中文，en 下返回英文原串（或未收录时的原串）。
 */
const translations: Record<string, { en: string; zh: string }> = {
  // ---- 导航 / 页面标题 ----
  'Implementation Status': { en: 'Implementation Status', zh: '实现状态' },
  'Dashboard': { en: 'Dashboard', zh: '仪表盘' },
  'Lineage Explorer': { en: 'Lineage Explorer', zh: '溯源图谱' },
  'Directory Diff': { en: 'Directory Diff', zh: '目录差异' },
  'Change details': { en: 'Change details', zh: '变更详情' },
  'Audit Findings': { en: 'Audit Findings', zh: '审计发现' },
  'Guardian Agent': { en: 'Guardian Agent', zh: '守护代理' },
  'Workspace Handoff': { en: 'Workspace Handoff', zh: '交接工作区' },
  'Upload Center': { en: 'Upload Center', zh: '上传中心' },
  'System Setup': { en: 'System Setup', zh: '系统设置' },
  'Security & Audit': { en: 'Security & Audit', zh: '安全与审计' },
  'Administration': { en: 'Administration', zh: '管理' },
  'Handoff Audit Mode': { en: 'Handoff Audit Mode', zh: '交接审计模式' },
  'Current Project': { en: 'Current Project', zh: '当前项目' },
  'no role': { en: 'no role', zh: '无角色' },

  // ---- App 通用 ----
  'Access denied': { en: 'Access denied', zh: '访问被拒绝' },
  'Your current role does not permit this administration page.': { en: 'Your current role does not permit this administration page.', zh: '当前角色无权访问该管理页面。' },
  'Visualizing dependencies for key conclusions and figures. Review and confirm inferred relationships.': { en: 'Visualizing dependencies for key conclusions and figures. Review and confirm inferred relationships.', zh: '展示关键结论与图表的依赖关系，可审查并确认推断出的关系。' },
  'Ask the Gemini-powered agent to analyze lineage, explain conflicts, or draft handoff emails.': { en: 'Ask the Gemini-powered agent to analyze lineage, explain conflicts, or draft handoff emails.', zh: '让 Gemini 代理分析溯源、解释冲突，或起草交接邮件。' },
  'Sign in': { en: 'Sign in', zh: '登录' },
  'Sign out': { en: 'Sign out', zh: '退出登录' },
  'Unable to start sign-in': { en: 'Unable to start sign-in', zh: '无法开始登录' },
  'Connected': { en: 'Connected', zh: '已连接' },
  'Collapse navigation': { en: 'Collapse navigation', zh: '收起导航' },
  'Expand navigation': { en: 'Expand navigation', zh: '展开导航' },
  'Loading page…': { en: 'Loading page…', zh: '页面加载中…' },
  'Page content': { en: 'Page content', zh: '页面内容' },
  'Backend request failed': { en: 'Backend request failed', zh: '后端请求失败' },
  'Authentication initialization failed': { en: 'Authentication initialization failed', zh: '认证初始化失败' },
  'No project exists. Create a project in the API first.': { en: 'No project exists. Create a project in the API first.', zh: '尚无项目，请先在 API 中创建项目。' },

  // ---- Dashboard ----
  'Project Overview:': { en: 'Project Overview:', zh: '项目概览：' },
  'Last scanned:': { en: 'Last scanned:', zh: '上次扫描：' },
  'Total Assets': { en: 'Total Assets', zh: '资产总数' },
  'R4 (Verified)': { en: 'R4 (Verified)', zh: 'R4（已验证）' },
  'R2 (Traceable)': { en: 'R2 (Traceable)', zh: 'R2（可追溯）' },
  'Open Findings': { en: 'Open Findings', zh: '未解决发现' },
  'Reproducibility Distribution': { en: 'Reproducibility Distribution', zh: '可复现性分布' },
  'R4: Verified | R3: Runnable | R2: Traceable | R1: Locatable | R0: Unknown': { en: 'R4: Verified | R3: Runnable | R2: Traceable | R1: Locatable | R0: Unknown', zh: 'R4：已验证 | R3：可运行 | R2：可追溯 | R1：可定位 | R0：未知' },
  'Handoff Readiness': { en: 'Handoff Readiness', zh: '交接就绪度' },
  'Handoff readiness has': { en: 'Handoff readiness has', zh: '交接就绪度有' },
  'open findings': { en: 'open findings', zh: '个未解决发现' },
  'Resolve P0 and P1 issues to proceed.': { en: 'Resolve P0 and P1 issues to proceed.', zh: '请先解决 P0 与 P1 问题再继续。' },

  // ---- FindingsList ----
  'P0 Critical': { en: 'P0 Critical', zh: 'P0 严重' },
  'P1 High': { en: 'P1 High', zh: 'P1 高' },
  'P2 Medium': { en: 'P2 Medium', zh: 'P2 中' },
  'P3 Low': { en: 'P3 Low', zh: 'P3 低' },
  'Total:': { en: 'Total:', zh: '总计：' },
  'Run audit': { en: 'Run audit', zh: '运行审计' },
  'All Clear!': { en: 'All Clear!', zh: '全部通过！' },
  'No open findings found in the current snapshot.': { en: 'No open findings found in the current snapshot.', zh: '当前快照中没有未解决的发现。' },
  'Affected Entities': { en: 'Affected Entities', zh: '影响实体' },
  'Proposed Action': { en: 'Proposed Action', zh: '建议操作' },
  'Resolve': { en: 'Resolve', zh: '处理' },
  'Resolving…': { en: 'Resolving…', zh: '处理中…' },
  'Unable to resolve finding': { en: 'Unable to resolve finding', zh: '无法处理该发现' },
  'Resolve “{title}”? This records your identity and an immutable audit event.': { en: 'Resolve “{title}”? This records your identity and an immutable audit event.', zh: '确定处理“{title}”？此操作将记录您的身份并生成不可变审计事件。' },

  // ---- ImplementationChecklist ----
  'Unable to load capability status': { en: 'Unable to load capability status', zh: '无法加载能力状态' },
  'No items in this category.': { en: 'No items in this category.', zh: '此类别暂无条目。' },
  'Live capability status reported by the backend. Mock completion states are not used.': { en: 'Live capability status reported by the backend. Mock completion states are not used.', zh: '由后端上报的实时能力状态，不使用模拟完成状态。' },
  'Loading live status…': { en: 'Loading live status…', zh: '正在加载实时状态…' },
  'Implemented / Configured': { en: 'Implemented / Configured', zh: '已实现 / 已配置' },
  'Development Mode': { en: 'Development Mode', zh: '开发模式' },
  'Requires Configuration or External Validation': { en: 'Requires Configuration or External Validation', zh: '需要配置或外部验证' },
  'Implementation status details': { en: 'Implementation status details', zh: '实现状态详情' },

  // ---- HandoffView ----
  'Unable to build handoff preview': { en: 'Unable to build handoff preview', zh: '无法生成交接预览' },
  'Local preview created:': { en: 'Local preview created:', zh: '本地预览已创建：' },
  'Local preview failed': { en: 'Local preview failed', zh: '本地预览失败' },
  'Drive file': { en: 'Drive file', zh: '已创建 Drive 文件' },
  'Sheets ledger updated': { en: 'Sheets ledger updated', zh: '更新 Sheets 台账' },
  'Gmail draft': { en: 'Gmail draft', zh: '生成 Gmail 草稿' },
  'No email was sent.': { en: 'No email was sent.', zh: '未发送任何邮件。' },
  'Workspace export failed': { en: 'Workspace export failed', zh: '工作区导出失败' },
  'Live preview first; external writes require explicit confirmation and an idempotency key.': { en: 'Live preview first; external writes require explicit confirmation and an idempotency key.', zh: '先出实时预览；外部写入需显式确认与幂等键。' },
  'Google Drive report': { en: 'Google Drive report', zh: 'Google Drive 报告' },
  'Create {name} ({bytes} bytes).': { en: 'Create {name} ({bytes} bytes).', zh: '创建 {name}（{bytes} 字节）。' },
  'Google Sheets ledger': { en: 'Google Sheets ledger', zh: 'Google Sheets 台账' },
  'Append audit {auditId} once; retries do not duplicate the row.': { en: 'Append audit {auditId} once; retries do not duplicate the row.', zh: '追加审计 {auditId} 一次；重试不会产生重复行。' },
  'Create an unsent draft to {to} with subject “{subject}”.': { en: 'Create an unsent draft to {to} with subject “{subject}”.', zh: '创建一封未发送的草稿，收件人 {to}，主题“{subject}”。' },
  'Google Workspace OAuth is not configured. You can create accurate local Markdown/CSV/EML previews; external export remains disabled.': { en: 'Google Workspace OAuth is not configured. You can create accurate local Markdown/CSV/EML previews; external export remains disabled.', zh: 'Google Workspace OAuth 未配置。您可以生成准确的本地 Markdown/CSV/EML 预览；外部导出保持禁用。' },
  'I reviewed the preview and authorize Drive creation, one idempotent Sheets append, and an unsent Gmail draft. No email may be sent.': { en: 'I reviewed the preview and authorize Drive creation, one idempotent Sheets append, and an unsent Gmail draft. No email may be sent.', zh: '我已审阅预览，并授权创建 Drive 文件、执行一次幂等的 Sheets 追加及生成未发送的 Gmail 草稿。不会发送任何邮件。' },
  'Create local preview': { en: 'Create local preview', zh: '创建本地预览' },
  'Working…': { en: 'Working…', zh: '处理中…' },
  'Confirm Workspace export': { en: 'Confirm Workspace export', zh: '确认工作区导出' },

  // ---- SystemSetup ----
  'Unable to load setup': { en: 'Unable to load setup', zh: '无法加载设置' },
  'Organization and handoff settings saved.': { en: 'Organization and handoff settings saved.', zh: '机构与交接设置已保存。' },
  'Unable to save setup': { en: 'Unable to save setup', zh: '无法保存设置' },
  'Institution': { en: 'Institution', zh: '机构' },
  'Lab': { en: 'Lab', zh: '实验室' },
  'Administrator name': { en: 'Administrator name', zh: '管理员姓名' },
  'Administrator email': { en: 'Administrator email', zh: '管理员邮箱' },
  'Default project name': { en: 'Default project name', zh: '默认项目名称' },
  'Default project slug': { en: 'Default project slug', zh: '默认项目标识' },
  'Departing member': { en: 'Departing member', zh: '离任成员' },
  'Receiving member': { en: 'Receiving member', zh: '接收成员' },
  'Reviewer': { en: 'Reviewer', zh: '审核人' },
  'Handoff due date': { en: 'Handoff due date', zh: '交接截止日期' },
  'Editable application settings and live integration readiness. Secrets are configured on the server, never in this browser form.': { en: 'Editable application settings and live integration readiness. Secrets are configured on the server, never in this browser form.', zh: '可编辑的应用设置与实时集成就绪状态。密钥在服务端配置，绝不在此浏览器表单中。' },
  'Organization and handoff': { en: 'Organization and handoff', zh: '机构与交接' },
  'Default region': { en: 'Default region', zh: '默认区域' },
  'Default timezone': { en: 'Default timezone', zh: '默认时区' },
  'Save settings': { en: 'Save settings', zh: '保存设置' },
  'Live integration readiness': { en: 'Live integration readiness', zh: '实时集成就绪状态' },

  // ---- UploadCenter ----
  'Manifest exceeds the 5 MB API limit.': { en: 'Manifest exceeds the 5 MB API limit.', zh: '清单超过 5 MB API 限制。' },
  'Reading manifest without executing embedded content...': { en: 'Reading manifest without executing embedded content...', zh: '正在读取清单，不执行嵌入内容…' },
  'Validating lablineage.manifest.v1 schema on the backend...': { en: 'Validating lablineage.manifest.v1 schema on the backend...', zh: '正在后端校验 lablineage.manifest.v1 结构…' },
  'Imported {nodes} nodes, {edges} edges and {evidence} evidence records from {bundleId}.': { en: 'Imported {nodes} nodes, {edges} edges and {evidence} evidence records from {bundleId}.', zh: '已从 {bundleId} 导入 {nodes} 个节点、{edges} 条边和 {evidence} 条证据记录。' },
  'Manifest import failed.': { en: 'Manifest import failed.', zh: '清单导入失败。' },
  'Import a validated lablineage.manifest.v1 JSON file generated by the Edge Collector.': { en: 'Import a validated lablineage.manifest.v1 JSON file generated by the Edge Collector.', zh: '导入 Edge Collector 生成的已校验 lablineage.manifest.v1 JSON 文件。' },
  'Click or drag a LabLineage manifest.json here': { en: 'Click or drag a LabLineage manifest.json here', zh: '点击或拖拽 LabLineage manifest.json 到此处' },
  'Maximum file size: 5 MB': { en: 'Maximum file size: 5 MB', zh: '最大文件大小：5 MB' },
  'The backend validates schema, bundle ID and Ed25519 signature policy before import.': { en: 'The backend validates schema, bundle ID and Ed25519 signature policy before import.', zh: '导入前，后端会校验结构、bundle ID 与 Ed25519 签名策略。' },
  'Upload & Validate': { en: 'Upload & Validate', zh: '上传并校验' },
  'Upload Another': { en: 'Upload Another', zh: '再传一个' },
  'Try Again': { en: 'Try Again', zh: '重试' },
  'Import a project archive (.zip) or a validated manifest JSON.': { en: 'Import a project archive (.zip) or a validated manifest JSON.', zh: '导入项目压缩包（.zip）或已校验的清单 JSON。' },
  'Click or drag a project.zip or manifest.json here': { en: 'Click or drag a project.zip or manifest.json here', zh: '点击或拖拽项目 .zip 或 manifest.json 到此处' },
  'Project archive': { en: 'Project archive', zh: '项目压缩包' },
  'Manifest JSON': { en: 'Manifest JSON', zh: '清单 JSON' },
  'Maximum archive size: 100 MB': { en: 'Maximum archive size: 100 MB', zh: '压缩包上限：100 MB' },
  'Archives are extracted, scanned and fingerprinted on the server before import.': { en: 'Archives are extracted, scanned and fingerprinted on the server before import.', zh: '压缩包会在服务端解压、扫描并计算指纹后再导入。' },
  'Uploading archive, extracting and scanning...': { en: 'Uploading archive, extracting and scanning...', zh: '正在上传压缩包、解压并扫描…' },
  'Scanned {fileCount} files from {filename} ({extractedFiles} extracted).': { en: 'Scanned {fileCount} files from {filename} ({extractedFiles} extracted).', zh: '已从 {filename} 扫描 {fileCount} 个文件（解压 {extractedFiles} 个）。' },
  'Archive scan failed.': { en: 'Archive scan failed.', zh: '压缩包扫描失败。' },
  'Archives are limited to 100 MB.': { en: 'Archives are limited to 100 MB.', zh: '压缩包上限为 100 MB。' },
  'Skipped {count} unsafe archive entries.': { en: 'Skipped {count} unsafe archive entries.', zh: '已跳过 {count} 个不安全的压缩包条目。' },
  'Lineage candidates': { en: 'Lineage candidates', zh: '谱系推断候选' },
  'Adopt inferred lineage': { en: 'Adopt inferred lineage', zh: '采纳为推断谱系' },
  'Adopting…': { en: 'Adopting…', zh: '采纳中…' },
  'Adopted': { en: 'Adopted', zh: '已采纳' },
  'Adopted {nodes} nodes, {edges} edges as inferred lineage (requires human review).': { en: 'Adopted {nodes} nodes, {edges} edges as inferred lineage (requires human review).', zh: '已采纳 {nodes} 个节点、{edges} 条边为推断谱系（需人工确认）。' },
  'Appears in Lineage Explorer as inferred; confirm there to make it fact.': { en: 'Appears in Lineage Explorer as inferred; confirm there to make it fact.', zh: '已显示在溯源图谱中（推断样式），可在图谱中确认后成为事实。' },

  // ---- SecurityAudit ----
  'Security summary unavailable': { en: 'Security summary unavailable', zh: '安全摘要不可用' },
  'Review system access, service accounts, and immutable audit logs.': { en: 'Review system access, service accounts, and immutable audit logs.', zh: '查看系统访问、服务账号与不可变审计日志。' },
  'Current Actor Roles': { en: 'Current Actor Roles', zh: '当前身份角色' },
  'Loading…': { en: 'Loading…', zh: '加载中…' },
  'Configured Service Tokens': { en: 'Configured Service Tokens', zh: '已配置服务令牌' },
  'No service tokens configured.': { en: 'No service tokens configured.', zh: '未配置服务令牌。' },
  'Gateway Denials': { en: 'Gateway Denials', zh: '网关拒绝' },
  'Denied or failed events in last 24h': { en: 'Denied or failed events in last 24h', zh: '近 24 小时被拒绝或失败的事件' },
  'Immutable Audit Log': { en: 'Immutable Audit Log', zh: '不可变审计日志' },
  'Export CSV': { en: 'Export CSV', zh: '导出 CSV' },
  'Audit event table': { en: 'Audit event table', zh: '审计事件表' },
  'Timestamp': { en: 'Timestamp', zh: '时间戳' },
  'Trace ID': { en: 'Trace ID', zh: '追踪 ID' },
  'User / Subject': { en: 'User / Subject', zh: '用户 / 主体' },
  'Action': { en: 'Action', zh: '操作' },
  'Resource': { en: 'Resource', zh: '资源' },
  'Status': { en: 'Status', zh: '状态' },
  'Success': { en: 'Success', zh: '成功' },
  'Denied': { en: 'Denied', zh: '拒绝' },

  // ---- SnapshotDiffView ----
  'Snapshot scan failed.': { en: 'Snapshot scan failed.', zh: '快照扫描失败。' },
  'Added': { en: 'Added', zh: '新增' },
  'Modified': { en: 'Modified', zh: '修改' },
  'Deleted': { en: 'Deleted', zh: '删除' },
  'Move candidate': { en: 'Move candidate', zh: '移动候选' },
  'Non-Git Directory Tracking': { en: 'Non-Git Directory Tracking', zh: '非 Git 目录追踪' },
  'Comparing snapshots to track changes in raw data, results, and uncommitted scripts.': { en: 'Comparing snapshots to track changes in raw data, results, and uncommitted scripts.', zh: '对比快照，追踪原始数据、结果与未提交脚本的变化。' },
  'Absolute local directory path': { en: 'Absolute local directory path', zh: '本地绝对目录路径' },
  'Capture snapshot': { en: 'Capture snapshot', zh: '捕获快照' },
  'Authorize bounded text/code diff capture. Content is limited to 256 KiB, secret-shaped values are redacted, and production policy may still deny it.': { en: 'Authorize bounded text/code diff capture. Content is limited to 256 KiB, secret-shaped values are redacted, and production policy may still deny it.', zh: '授权受限的文本/代码差异捕获。内容限制为 256 KiB，密钥形态值会被脱敏，生产策略仍可能拒绝。' },
  '(Latest)': { en: '(Latest)', zh: '（最新）' },
  'files': { en: 'files', zh: '个文件' },
  'Found': { en: 'Found', zh: '发现' },
  'changes': { en: 'changes', zh: '处变更' },
  'No snapshots captured for this project. Enter an allowed local directory above to create the baseline.': { en: 'No snapshots captured for this project. Enter an allowed local directory above to create the baseline.', zh: '此项目尚未捕获快照。请在上方输入允许的本地目录以创建基线。' },
  'Changed Files': { en: 'Changed Files', zh: '变更文件' },
  'Size:': { en: 'Size:', zh: '大小：' },
  'Old Hash ({snapshot})': { en: 'Old Hash ({snapshot})', zh: '旧哈希（{snapshot}）' },
  'New Hash ({snapshot})': { en: 'New Hash ({snapshot})', zh: '新哈希（{snapshot}）' },
  'previous snapshot': { en: 'previous snapshot', zh: '先前快照' },
  'latest snapshot': { en: 'latest snapshot', zh: '最新快照' },
  'Old size': { en: 'Old size', zh: '旧大小' },
  'New size': { en: 'New size', zh: '新大小' },
  'Inferred {kind} ({confidence})': { en: 'Inferred {kind} ({confidence})', zh: '推断：{kind}（{confidence}）' },
  'Evidence: {basis}. This is a candidate, not a confirmed fact.': { en: 'Evidence: {basis}. This is a candidate, not a confirmed fact.', zh: '证据：{basis}。这是候选，而非已确认事实。' },
  'Content Diff (Text Excerpt)': { en: 'Content Diff (Text Excerpt)', zh: '内容差异（文本摘录）' },
  'No text diff available for this file type.': { en: 'No text diff available for this file type.', zh: '该文件类型无文本差异。' },
  'Binary file or diff generation disabled by policy.': { en: 'Binary file or diff generation disabled by policy.', zh: '二进制文件或按策略禁用差异生成。' },
  'Select a file to view changes': { en: 'Select a file to view changes', zh: '选择文件查看变更' },

  // ---- AgentChat ----
  'New conversation': { en: 'New conversation', zh: '新会话' },
  'Evidence-first': { en: 'Evidence-first', zh: '证据优先' },
  'Agent execution trace': { en: 'Agent execution trace', zh: '代理执行轨迹' },
  'Unable to initialize persistent Agent session.': { en: 'Unable to initialize persistent Agent session.', zh: '无法初始化持久化代理会话。' },

  // ---- LineageGraph ----
  'Click on any node to view its lineage details and evidence.': { en: 'Click on any node to view its lineage details and evidence.', zh: '点击任意节点查看其溯源详情与证据。' },
  'Node Details': { en: 'Node Details', zh: '节点详情' },
  'Close node details': { en: 'Close node details', zh: '关闭节点详情' },
  'Label': { en: 'Label', zh: '标签' },
  'Type': { en: 'Type', zh: '类型' },
  'unknown': { en: 'unknown', zh: '未知' },
  'Human Review': { en: 'Human Review', zh: '人工审查' },
  'Verified by human': { en: 'Verified by human', zh: '已人工核实' },
  "This node's role in the lineage is inferred. Please confirm if it is correct.": { en: "This node's role in the lineage is inferred. Please confirm if it is correct.", zh: '该节点在溯源中的角色为推断所得，请确认是否正确。' },
  'Recording…': { en: 'Recording…', zh: '记录中…' },
  'Confirm & Accept': { en: 'Confirm & Accept', zh: '确认并接受' },
  'Propose a status': { en: 'Propose a status', zh: '提议状态' },
  'Candidate': { en: 'Candidate', zh: '候选' },
  'Accepted': { en: 'Accepted', zh: '已接受' },
  'Superseded': { en: 'Superseded', zh: '已取代' },
  'Quarantined': { en: 'Quarantined', zh: '已隔离' },
  'Duplicate': { en: 'Duplicate', zh: '重复' },
  'Reason': { en: 'Reason', zh: '原因' },
  'Evidence and replacement details': { en: 'Evidence and replacement details', zh: '证据与替代详情' },
  'Submit proposal': { en: 'Submit proposal', zh: '提交提议' },
  'Reproducibility': { en: 'Reproducibility', zh: '可复现性' },
  '(Verified)': { en: '(Verified)', zh: '（已验证）' },
  '(Runnable)': { en: '(Runnable)', zh: '（可运行）' },
  '(Traceable)': { en: '(Traceable)', zh: '（可追溯）' },
  '(Locatable)': { en: '(Locatable)', zh: '（可定位）' },
  '(Unknown)': { en: '(Unknown)', zh: '（未知）' },
  'Evidence IDs': { en: 'Evidence IDs', zh: '证据编号' },
  'Metadata': { en: 'Metadata', zh: '元数据' },
  'This node has an active finding. Please check the Audit Findings tab for resolution steps.': { en: 'This node has an active finding. Please check the Audit Findings tab for resolution steps.', zh: '该节点存在未解决发现，请到“审计发现”页查看处理步骤。' },
  'Relation Evidence': { en: 'Relation Evidence', zh: '关系证据' },
  'Close relation details': { en: 'Close relation details', zh: '关闭关系详情' },
  'Relation:': { en: 'Relation:', zh: '关系：' },
  'From:': { en: 'From:', zh: '来源：' },
  'To:': { en: 'To:', zh: '去向：' },
  'Confidence:': { en: 'Confidence:', zh: '置信度：' },
  'Review:': { en: 'Review:', zh: '审查：' },
  'not reviewed': { en: 'not reviewed', zh: '未审查' },
  'Review comment': { en: 'Review comment', zh: '审查意见' },
  'Describe the evidence used for this decision': { en: 'Describe the evidence used for this decision', zh: '描述该决定所依据的证据' },
  'Confirm': { en: 'Confirm', zh: '确认' },
  'Reject': { en: 'Reject', zh: '拒绝' },
  'Human confirmation recorded in the audit log.': { en: 'Human confirmation recorded in the audit log.', zh: '人工确认已记录到审计日志。' },
  'Unable to confirm this node.': { en: 'Unable to confirm this node.', zh: '无法确认该节点。' },
  'Explain why this status should change.': { en: 'Explain why this status should change.', zh: '请说明状态变更的理由。' },
  'Status proposal “{status}” submitted for review. The formal status is unchanged.': { en: 'Status proposal “{status}” submitted for review. The formal status is unchanged.', zh: '状态提议“{status}”已提交审查。正式状态保持不变。' },
  'Unable to submit the status proposal.': { en: 'Unable to submit the status proposal.', zh: '无法提交状态提议。' },
  'Add a review comment that explains the evidence.': { en: 'Add a review comment that explains the evidence.', zh: '请添加说明证据的审查意见。' },
  'Relation confirmed and recorded as review evidence.': { en: 'Relation confirmed and recorded as review evidence.', zh: '关系已确认并记录为审查证据。' },
  'Relation rejected and recorded as review evidence.': { en: 'Relation rejected and recorded as review evidence.', zh: '关系已拒绝并记录为审查证据。' },
  'Unable to review this relation.': { en: 'Unable to review this relation.', zh: '无法审查该关系。' },

  // ---- 后端能力列表（/api/capabilities 的 title / detail）----
  'Guardian API': { en: 'Guardian API', zh: '守护 API' },
  'PostgreSQL evidence store': { en: 'PostgreSQL evidence store', zh: 'PostgreSQL 证据存储' },
  'OIDC and project RBAC': { en: 'OIDC and project RBAC', zh: 'OIDC 与项目 RBAC' },
  'Signed Edge Collector': { en: 'Signed Edge Collector', zh: '签名 Edge Collector' },
  'GitHub read-only connector': { en: 'GitHub read-only connector', zh: 'GitHub 只读连接器' },
  'Google Workspace handoff': { en: 'Google Workspace handoff', zh: 'Google Workspace 交接' },
  'Immutable report object storage': { en: 'Immutable report object storage', zh: '不可变报告对象存储' },
  'Google ADK Guardian Agent': { en: 'Google ADK Guardian Agent', zh: 'Google ADK 守护代理' },
  'Runtime / Registry / Gateway': { en: 'Runtime / Registry / Gateway', zh: '运行时 / 注册表 / 网关' },
  'Evidence, lineage, audit, agent and handoff routes are running.': { en: 'Evidence, lineage, audit, agent and handoff routes are running.', zh: '证据、溯源、审计、代理与交接路由均在运行。' },
  'DATABASE_URL is configured; run migrations before production use.': { en: 'DATABASE_URL is configured; run migrations before production use.', zh: '已配置 DATABASE_URL；生产使用前请运行迁移。' },
  'Local JSON development store is active.': { en: 'Local JSON development store is active.', zh: '本地 JSON 开发存储已启用。' },
  'Authentication mode: {mode}.': { en: 'Authentication mode: {mode}.', zh: '鉴权模式：{mode}。' },
  'CLI, SQLite incremental index, static parsers, path tokens and Ed25519 bundles are implemented.': { en: 'CLI, SQLite incremental index, static parsers, path tokens and Ed25519 bundles are implemented.', zh: 'CLI、SQLite 增量索引、静态解析器、路径令牌与 Ed25519 包均已实现。' },
  'Uses a read-only GitHub App installation token or GITHUB_TOKEN.': { en: 'Uses a read-only GitHub App installation token or GITHUB_TOKEN.', zh: '使用只读 GitHub App 安装令牌或 GITHUB_TOKEN。' },
  'Drive report, idempotent Sheets row and Gmail draft only.': { en: 'Drive report, idempotent Sheets row and Gmail draft only.', zh: '仅创建 Drive 报告、幂等 Sheets 行与 Gmail 草稿。' },
  'Atomic local object store is active.': { en: 'Atomic local object store is active.', zh: '原子本地对象存储已启用。' },
  'Google Cloud Storage with generation preconditions is required.': { en: 'Google Cloud Storage with generation preconditions is required.', zh: '需要带世代前置条件的 Google Cloud Storage。' },
  'Model: {model}.': { en: 'Model: {model}.', zh: '模型：{model}。' },
  'Cloud deployment and registry validation are still required.': { en: 'Cloud deployment and registry validation are still required.', zh: '仍需云端部署与注册表校验。' },

  // ---- 能力状态（/api/capabilities 的 state 值展示）----
  'state.ready': { en: 'ready', zh: '就绪' },
  'state.configured': { en: 'configured', zh: '已配置' },
  'state.development': { en: 'development', zh: '开发模式' },
  'state.not_configured': { en: 'not_configured', zh: '未配置' },

  // ---- 交接单（HandoffOrder）----
  'Handoff Orders': { en: 'Handoff Orders', zh: '交接单' },
  'New Handoff Order': { en: 'New Handoff Order', zh: '新建交接单' },
  'Order Number': { en: 'Order Number', zh: '单号' },
  'Departing Member': { en: 'Departing Member', zh: '离任成员' },
  'Receiving Member': { en: 'Receiving Member', zh: '接收成员' },
  'Due Date': { en: 'Due Date', zh: '截止时间' },
  'Updated': { en: 'Updated', zh: '更新时间' },
  'Overdue': { en: 'Overdue', zh: '逾期' },
  'No handoff orders yet. Create one to start.': { en: 'No handoff orders yet. Create one to start.', zh: '暂无交接单，先创建一张。' },
  'All': { en: 'All', zh: '全部' },
  'Needs my review': { en: 'Needs my review', zh: '待我审核' },
  'Needs my acceptance': { en: 'Needs my acceptance', zh: '待我接收' },
  'Completed': { en: 'Completed', zh: '已完成' },
  'Departing subject': { en: 'Departing subject', zh: '离任成员标识' },
  'Departing email': { en: 'Departing email', zh: '离任邮箱' },
  'Receiving subject': { en: 'Receiving subject', zh: '接收成员标识' },
  'Receiving email': { en: 'Receiving email', zh: '接收邮箱' },
  'Reviewer subject': { en: 'Reviewer subject', zh: '审核人标识' },
  'Reviewer email': { en: 'Reviewer email', zh: '审核人邮箱' },
  'Due at': { en: 'Due at', zh: '截止时间' },
  'Timezone': { en: 'Timezone', zh: '时区' },
  'Tasks': { en: 'Tasks', zh: '任务' },
  'Task title': { en: 'Task title', zh: '任务标题' },
  'Task description': { en: 'Task description', zh: '任务描述' },
  'Add task': { en: 'Add task', zh: '添加任务' },
  'Create': { en: 'Create', zh: '创建' },
  'Submit for review': { en: 'Submit for review', zh: '提交审核' },
  'Approve': { en: 'Approve', zh: '批准' },
  'Request changes': { en: 'Request changes', zh: '要求修改' },
  'Accept handoff': { en: 'Accept handoff', zh: '接收确认' },
  'Cancel': { en: 'Cancel', zh: '取消' },
  'Generate preview': { en: 'Generate preview', zh: '生成预览' },
  'Execute Workspace export': { en: 'Execute Workspace export', zh: '执行工作区导出' },
  'Tasks & Evidence': { en: 'Tasks & Evidence', zh: '任务与证据' },
  'Approvals': { en: 'Approvals', zh: '审批记录' },
  'Event Timeline': { en: 'Event Timeline', zh: '事件时间线' },
  'Version': { en: 'Version', zh: '版本' },
  'Preview': { en: 'Preview', zh: '预览' },
  'Preview checksum': { en: 'Preview checksum', zh: '预览校验值' },
  'Handoff order created': { en: 'Handoff order created', zh: '交接单已创建' },
  'Order submitted': { en: 'Order submitted', zh: '已提交审核' },
  'Review recorded': { en: 'Review recorded', zh: '审核已记录' },
  'Handoff accepted': { en: 'Handoff accepted', zh: '已接收确认' },
  'Handoff completed': { en: 'Handoff completed', zh: '交接完成' },
  'Order cancelled': { en: 'Order cancelled', zh: '已取消' },
  'Export executed': { en: 'Export executed', zh: '导出已执行' },
  'draft': { en: 'draft', zh: '草稿' },
  'submitted': { en: 'submitted', zh: '已提交' },
  'in_review': { en: 'in_review', zh: '审核中' },
  'changes_requested': { en: 'changes_requested', zh: '要求修改' },
  'approved': { en: 'approved', zh: '已批准' },
  'receiver_accepted': { en: 'receiver_accepted', zh: '接收人已确认' },
  'completed': { en: 'completed', zh: '已完成' },
  'cancelled': { en: 'cancelled', zh: '已取消' },
  'Mark done': { en: 'Mark done', zh: '标记完成' },
  'Mark pending': { en: 'Mark pending', zh: '标记未完成' },
  // ---- Project deployment ----
  'Deploy Project': { en: 'Deploy Project', zh: '部署项目' },
  'Unable to load project.': { en: 'Unable to load project.', zh: '无法加载项目。' },
  'Unable to refresh Collector status.': { en: 'Unable to refresh Collector status.', zh: '无法刷新 Collector 状态。' },
  'Unable to refresh analysis status.': { en: 'Unable to refresh analysis status.', zh: '无法刷新分析状态。' },
  'Add at least one success criterion.': { en: 'Add at least one success criterion.', zh: '请至少添加一条成功标准。' },
  'Add at least one key output.': { en: 'Add at least one key output.', zh: '请至少添加一个关键产物。' },
  'Unable to create project.': { en: 'Unable to create project.', zh: '无法创建项目。' },
  'Unable to create pairing code.': { en: 'Unable to create pairing code.', zh: '无法生成配对码。' },
  'Unable to connect GitHub repository.': { en: 'Unable to connect GitHub repository.', zh: '无法连接 GitHub 仓库。' },
  'Archive import failed.': { en: 'Archive import failed.', zh: '压缩包导入失败。' },
  'Unable to retry analysis.': { en: 'Unable to retry analysis.', zh: '无法重试分析。' },
  'Unable to cancel analysis.': { en: 'Unable to cancel analysis.', zh: '无法取消分析。' },
  'Project information': { en: 'Project information', zh: '项目信息' },
  'Data source': { en: 'Data source', zh: '数据来源' },
  'Automatic analysis': { en: 'Automatic analysis', zh: '自动分析' },
  'Objective report': { en: 'Objective report', zh: '目标报告' },
  'Waiting for pairing': { en: 'Waiting for pairing', zh: '等待配对' },
  'Collector not paired': { en: 'Collector not paired', zh: 'Collector 尚未配对' },
  'Access revoked': { en: 'Access revoked', zh: '权限已撤销' },
  'Revoke Collector': { en: 'Revoke Collector', zh: '撤销 Collector' },
  'Revoke this Collector? Future syncs will be rejected and a new pairing will be required.': { en: 'Revoke this Collector? Future syncs will be rejected and a new pairing will be required.', zh: '确认撤销此 Collector？后续同步将被拒绝，并且需要重新配对。' },
  'Unable to revoke Collector.': { en: 'Unable to revoke Collector.', zh: '无法撤销 Collector。' },
  'Collector offline': { en: 'Collector offline', zh: 'Collector 离线' },
  'Scanning and analyzing': { en: 'Scanning and analyzing', zh: '正在扫描和分析' },
  'Collector connected': { en: 'Collector connected', zh: 'Collector 已连接' },
  'local directory': { en: 'local directory', zh: '本地目录' },
  'Deploy a project': { en: 'Deploy a project', zh: '部署项目' },
  'Connect a local directory or GitHub repository and automatically build evidence, audit it, and assess the project objective.': { en: 'Connect a local directory or GitHub repository and automatically build evidence, audit it, and assess the project objective.', zh: '连接本地目录或 GitHub 仓库，自动构建证据、执行审计并评估项目目标。' },
  'Deploy another project': { en: 'Deploy another project', zh: '部署另一个项目' },
  'Deployment stages': { en: 'Deployment stages', zh: '部署阶段' },
  'Administrator permission required': { en: 'Administrator permission required', zh: '需要管理员权限' },
  'Editor permission required': { en: 'Editor permission required', zh: '需要编辑者权限' },
  'You can view existing analysis, but an editor or administrator must connect a source.': { en: 'You can view existing analysis, but an editor or administrator must connect a source.', zh: '你可以查看已有分析，但连接来源需要编辑者或管理员权限。' },
  'You can view existing analysis, but only an administrator can create a project or connect a source.': { en: 'You can view existing analysis, but only an administrator can create a project or connect a source.', zh: '你可以查看已有分析，但只有管理员可以创建项目或连接数据源。' },
  'Describe the project and its definition of done': { en: 'Describe the project and its definition of done', zh: '描述项目及其完成定义' },
  'Every analysis run is permanently bound to this objective version.': { en: 'Every analysis run is permanently bound to this objective version.', zh: '每次分析运行都会永久绑定到当前目标版本。' },
  'Project name': { en: 'Project name', zh: '项目名称' },
  'Project slug (optional)': { en: 'Project slug (optional)', zh: '项目标识（可选）' },
  'Project objective': { en: 'Project objective', zh: '项目目的' },
  'Success criteria (one per line)': { en: 'Success criteria (one per line)', zh: '成功标准（每行一条）' },
  'Key outputs (name | expected relative path, one per line)': { en: 'Key outputs (name | expected relative path, one per line)', zh: '关键产物（名称 | 预期相对路径，每行一条）' },
  'Final report | reports/final.pdf': { en: 'Final report | reports/final.pdf', zh: '最终报告 | reports/final.pdf' },
  'Constraints (one per line)': { en: 'Constraints (one per line)', zh: '约束（每行一条）' },
  'Create project and choose source': { en: 'Create project and choose source', zh: '创建项目并选择数据源' },
  'Objective version {version}': { en: 'Objective version {version}', zh: '目标版本 {version}' },
  'Choose a data source': { en: 'Choose a data source', zh: '选择数据源' },
  'Local directory': { en: 'Local directory', zh: '本地目录' },
  'Recommended. Source code stays local by default; a signed evidence bundle is sent outbound.': { en: 'Recommended. Source code stays local by default; a signed evidence bundle is sent outbound.', zh: '推荐。源码默认保留在本机，仅向外发送签名证据包。' },
  'GitHub App': { en: 'GitHub App', zh: 'GitHub App' },
  'Connect an authorized repository without entering a personal token.': { en: 'Connect an authorized repository without entering a personal token.', zh: '连接已授权仓库，无需输入个人令牌。' },
  'ZIP fallback': { en: 'ZIP fallback', zh: 'ZIP 备用导入' },
  'One-time fallback import when Collector or GitHub cannot be used.': { en: 'One-time fallback import when Collector or GitHub cannot be used.', zh: '无法使用 Collector 或 GitHub 时的一次性备用导入。' },
  'Connect Local Collector': { en: 'Connect Local Collector', zh: '连接 Local Collector' },
  'The cloud service never reads your local path directly. Collector scans locally and sends signed metadata and evidence.': { en: 'The cloud service never reads your local path directly. Collector scans locally and sends signed metadata and evidence.', zh: '云服务不会直接读取本地路径。Collector 在本机扫描并发送签名元数据和证据。' },
  'Generate pairing code': { en: 'Generate pairing code', zh: '生成配对码' },
  'Code claimed': { en: 'Code claimed', zh: '配对码已领取' },
  'Expires at {time}': { en: 'Expires at {time}', zh: '有效期至 {time}' },
  'Run from the repository root on the machine that owns the directory:': { en: 'Run from the repository root on the machine that owns the directory:', zh: '请在保存该目录的计算机上，从仓库根目录运行：' },
  'Raw file contents: disabled': { en: 'Raw file contents: disabled', zh: '原始文件内容：禁用' },
  'Absolute local paths: disabled': { en: 'Absolute local paths: disabled', zh: '本地绝对路径：禁用' },
  'Transport: outbound HTTPS with Ed25519 signature': { en: 'Transport: outbound HTTPS with Ed25519 signature', zh: '传输：出站 HTTPS + Ed25519 签名' },
  'Connect a GitHub repository': { en: 'Connect a GitHub repository', zh: '连接 GitHub 仓库' },
  'The configured GitHub App is read-only. No personal access token is requested or stored.': { en: 'The configured GitHub App is read-only. No personal access token is requested or stored.', zh: '已配置的 GitHub App 只有读取权限，不会请求或保存个人访问令牌。' },
  'Repository URL or owner/repo': { en: 'Repository URL or owner/repo', zh: '仓库 URL 或 owner/repo' },
  'Branch (optional)': { en: 'Branch (optional)', zh: '分支（可选）' },
  'Connect and analyze': { en: 'Connect and analyze', zh: '连接并分析' },
  'One-time ZIP fallback': { en: 'One-time ZIP fallback', zh: '一次性 ZIP 备用导入' },
  'Use only when a continuous Collector or GitHub connection is unavailable. Maximum size: 100 MB.': { en: 'Use only when a continuous Collector or GitHub connection is unavailable. Maximum size: 100 MB.', zh: '仅在无法持续连接 Collector 或 GitHub 时使用。最大 100 MB。' },
  'Import once and analyze': { en: 'Import once and analyze', zh: '一次性导入并分析' },
  'Run status: {status}': { en: 'Run status: {status}', zh: '运行状态：{status}' },
  'Waiting for server status…': { en: 'Waiting for server status…', zh: '正在等待服务端状态…' },
  'Attempt {attempt}': { en: 'Attempt {attempt}', zh: '第 {attempt} 次尝试' },
  'Started {time}': { en: 'Started {time}', zh: '开始于 {time}' },
  'Completed {time}': { en: 'Completed {time}', zh: '完成于 {time}' },
  'Retry failed stage': { en: 'Retry failed stage', zh: '重试失败阶段' },
  'Cancel analysis': { en: 'Cancel analysis', zh: '取消分析' },
  'This run ended without a report. Review the failed stage and retry when allowed.': { en: 'This run ended without a report. Review the failed stage and retry when allowed.', zh: '本次运行未生成报告。请检查失败阶段，并在允许时重试。' },
  'Objective coverage report': { en: 'Objective coverage report', zh: '目标覆盖报告' },
  'Deterministic audit: {level}, score {score}': { en: 'Deterministic audit: {level}, score {score}', zh: '确定性审计：{level}，得分 {score}' },
  'Evidence': { en: 'Evidence', zh: '证据' },
  'Conflicts': { en: 'Conflicts', zh: '冲突' },
  'Audit findings': { en: 'Audit findings', zh: '审计发现' },
  'Missing evidence': { en: 'Missing evidence', zh: '缺失证据' },
  'Google ADK explanation': { en: 'Google ADK explanation', zh: 'Google ADK 说明' },
  'The deterministic report is complete, but the optional ADK explanation is unavailable.': { en: 'The deterministic report is complete, but the optional ADK explanation is unavailable.', zh: '确定性报告已经完成，但可选的 ADK 说明暂不可用。' },
  'Limitations': { en: 'Limitations', zh: '局限性' },
  'Evidence coverage does not prove scientific correctness.': { en: 'Evidence coverage does not prove scientific correctness.', zh: '证据覆盖度不等于科学正确性。' },
  'queued': { en: 'queued', zh: '排队中' },
  'ingesting': { en: 'ingesting', zh: '摄取中' },
  'scanning': { en: 'scanning', zh: '扫描中' },
  'graphing': { en: 'graphing', zh: '建图中' },
  'auditing': { en: 'auditing', zh: '审计中' },
  'summarizing': { en: 'summarizing', zh: '总结中' },
  'partial': { en: 'partial', zh: '部分完成' },
  'failed': { en: 'failed', zh: '失败' },
  'pending': { en: 'pending', zh: '等待中' },
  'running': { en: 'running', zh: '运行中' },
  'succeeded': { en: 'succeeded', zh: '已成功' },
  'skipped': { en: 'skipped', zh: '已跳过' },
  'ingest': { en: 'ingest', zh: '摄取' },
  'scan': { en: 'scan', zh: '扫描' },
  'graph': { en: 'graph', zh: '证据建图' },
  'audit': { en: 'audit', zh: '审计' },
  'goal_coverage': { en: 'goal coverage', zh: '目标覆盖' },
  'agent_summary': { en: 'agent summary', zh: 'Agent 总结' },
  'finalize': { en: 'finalize', zh: '生成报告' },
  'supported': { en: 'supported', zh: '已支持' },
  'missing': { en: 'missing', zh: '缺失' },
  'conflicted': { en: 'conflicted', zh: '有冲突' },
  'not_assessable': { en: 'not assessable', zh: '无法评估' },
  'Manifest Import': { en: 'Manifest Import', zh: '清单导入' },
  'Legacy import for a validated manifest JSON. Use Deploy Project for Local Collector, GitHub, or ZIP fallback.': { en: 'Legacy import for a validated manifest JSON. Use Deploy Project for Local Collector, GitHub, or ZIP fallback.', zh: '此页面仅用于兼容导入已校验的 Manifest JSON。Local Collector、GitHub 或 ZIP 备用导入请使用“部署项目”。' },
  'Open Deploy Project': { en: 'Open Deploy Project', zh: '打开部署项目' },
  'Only manifest JSON is accepted on this legacy page.': { en: 'Only manifest JSON is accepted on this legacy page.', zh: '此兼容页面只接受 Manifest JSON。' },
  'Click or drag a manifest.json here': { en: 'Click or drag a manifest.json here', zh: '点击或拖拽 manifest.json 到此处' },
  'Signed manifests are validated without executing embedded content.': { en: 'Signed manifests are validated without executing embedded content.', zh: '签名 Manifest 会在不执行内嵌内容的情况下完成校验。' },
  'reading': { en: 'reading', zh: '读取中' },
  'validating': { en: 'validating', zh: '校验中' },
  'success': { en: 'success', zh: '成功' },
  'error': { en: 'error', zh: '错误' },
  'Validating…': { en: 'Validating…', zh: '正在校验…' },
  'Import Manifest': { en: 'Import Manifest', zh: '导入 Manifest' },
  'Live API data': { en: 'Live API data', zh: '真实后端数据' },
  'Connecting to Guardian API…': { en: 'Connecting to Guardian API…', zh: '正在连接 Guardian API…' },
  'API connection failed: {error}': { en: 'API connection failed: {error}', zh: 'API 连接失败：{error}' },
};

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? `{${key}}`));
}

interface LanguageContextValue {
  locale: Locale;
  toggleLocale: () => void;
  t: (text: string, values?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'zh',
  toggleLocale: () => undefined,
  t: (text: string) => text,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'en' || stored === 'zh' ? stored : 'zh';
    } catch {
      return 'zh';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // localStorage unavailable; language choice stays in memory
    }
  }, [locale]);

  const value: LanguageContextValue = {
    locale,
    toggleLocale: () => setLocale((current) => (current === 'zh' ? 'en' : 'zh')),
    t: (text, values) => {
      const entry = translations[text];
      const translated = locale === 'zh' && entry ? entry.zh : entry ? entry.en : text;
      return values ? interpolate(translated, values) : translated;
    },
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useI18n(): LanguageContextValue {
  return useContext(LanguageContext);
}

// ---- 数据层标签（枚举值展示用；英文原样，中文翻译）----
const KIND_LABELS: Record<string, string> = {
  development: '开发',
  oidc: 'OIDC',
  disabled: '禁用'
};
const ROLE_LABELS: Record<string, string> = {
  viewer: '查看者',
  auditor: '审计员',
  editor: '编辑者',
  admin: '管理员'
};

/** 翻译身份类型（未知值原样返回） */
export function translateKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** 翻译角色名（未知值原样返回） */
export function translateRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** 翻译后端能力详情（含"鉴权模式 / 模型"这类动态值） */
export function translateCapabilityDetail(t: (text: string, values?: Record<string, string | number>) => string, detail: string): string {
  const auth = detail.match(/^Authentication mode: (.+)\.$/);
  if (auth) return t('Authentication mode: {mode}.', { mode: auth[1] });
  const model = detail.match(/^Model: (.+)\.$/);
  if (model) return t('Model: {model}.', { model: model[1] });
  return t(detail);
}
