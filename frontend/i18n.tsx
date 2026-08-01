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
