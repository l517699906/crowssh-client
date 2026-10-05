import { isValidElement, memo, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  LoaderCircle,
  ShieldAlert,
  SquareTerminal,
  X,
  Database,
  BrainCircuit,
  ListChecks,
} from "lucide-react";
import type { CommandApprovalDecision } from "../../api/agent";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import type {
  ChatTurn,
  StatusTranscriptItem,
  ProgressTranscriptItem,
  ToolTranscriptItem,
  TranscriptExecutionStatus,
} from "../../types";
import { ResultGrid } from '../database/ResultGrid';
import { useSqlWorkspaceStore } from '../../store/sqlWorkspaceStore';

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return null;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒` : `${seconds} 秒`;
}

// 后端风险等级为自由字符串，这里归一到三档视觉样式
function riskLevelClass(level?: string) {
  const normalized = level?.toUpperCase() ?? "";
  if (/CRITICAL|HIGH|DANGER/.test(normalized)) return "high";
  if (/MEDIUM|MODERATE|WARN/.test(normalized)) return "medium";
  if (/LOW|SAFE/.test(normalized)) return "low";
  return "medium";
}

function executionIcon(status: TranscriptExecutionStatus, size = 14) {
  if (status === "approval_required") {
    return <ShieldAlert size={size} />;
  }
  if (status === "running") {
    return <LoaderCircle className="transcript-spinner" size={size} />;
  }
  if (status === "success") {
    return <CircleCheck size={size} />;
  }
  return <CircleX size={size} />;
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

// 围栏代码块交给 CodeBlock 渲染（高亮 + 复制），行内 code 保持默认
const markdownComponents: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const className = isValidElement<{ className?: string }>(child) ? child.props.className ?? "" : "";
    const language = /language-([\w+#.-]+)/.exec(className)?.[1];
    return <CodeBlock code={nodeText(child).replace(/\n$/, "")} language={language} />;
  },
};

const MarkdownContent = memo(function MarkdownContent({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  return (
    <div className="transcript-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
        {content}
      </ReactMarkdown>
      {streaming && <span className="typing-caret" aria-hidden="true" />}
    </div>
  );
});

function StatusEntry({
  item,
  durationMs,
}: {
  item: StatusTranscriptItem;
  durationMs?: number;
}) {
  return (
    <div className={`timeline-item transcript-status-entry ${item.status}`}>
      <span className="timeline-node-icon" aria-hidden="true">
        {executionIcon(item.status)}
      </span>
      <span>{item.content}</span>
      {durationMs !== undefined && item.status !== "running" && (
        <span className="transcript-duration">{formatDuration(durationMs)}</span>
      )}
    </div>
  );
}

function ProgressEntry({ item }: { item: ProgressTranscriptItem }) {
  const Icon = item.title.startsWith("第 ") ? ListChecks : BrainCircuit;
  return (
    <div className={`timeline-item transcript-progress-entry ${item.status}`}>
      <span className="timeline-node-icon" aria-hidden="true">
        {item.status === "running" ? <LoaderCircle className="transcript-spinner" size={14} />
          : item.status === "error" ? <CircleX size={14} /> : <Icon size={14} />}
      </span>
      <strong>{item.title}</strong>
      {item.detail && <span className="transcript-progress-detail">{item.detail}</span>}
    </div>
  );
}

function ToolEntry({
  item,
  onApprovalDecision,
}: {
  item: ToolTranscriptItem;
  onApprovalDecision?: (
    item: ToolTranscriptItem,
    decision: CommandApprovalDecision,
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(item.status === "approval_required");
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const command = item.command.trim();
  const duration = formatDuration(item.durationMs);
  const isDatabase = item.resourceKind?.startsWith('DB');
  const approval = item.databaseApproval;
  const snapshot = item.resourceSnapshot;
  const liveSession = useSqlWorkspaceStore((state) => snapshot ? state.workspaces[snapshot.dbSessionId]?.session : undefined);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!approval || item.status !== 'approval_required') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [approval, item.status]);
  const approvalInvalid = isDatabase && (!approval || !snapshot || !liveSession
    || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now
    || liveSession.lifecycleStatus !== 'READY' || liveSession.configVersion !== snapshot.configVersion
    || liveSession.sessionGeneration !== snapshot.sessionGeneration
    || liveSession.targetContextVersion !== snapshot.targetContextVersion);
  const statusLabel = {
    approval_required: "等待确认",
    running: "执行中",
    success: "已完成",
    error: "执行失败",
    denied: "已拒绝",
    expired: "已过期",
    cancelled: "已取消",
  }[item.status];
  const isSubAgent = item.toolName.startsWith("subAgent:");
  const readableToolName = isSubAgent
    ? `派发子 Agent · ${item.toolName.slice("subAgent:".length)}`
    : item.toolName;

  useEffect(() => {
    if (item.status === "approval_required") setExpanded(true);
  }, [item.status]);

  const submitDecision = async (decision: CommandApprovalDecision) => {
    if (!onApprovalDecision || decisionPending) return;
    setDecisionPending(true);
    setDecisionError(null);
    try {
      await onApprovalDecision(item, decision);
    } catch (reason) {
      setDecisionError(reason instanceof Error ? reason.message : "命令审批提交失败");
    } finally {
      setDecisionPending(false);
    }
  };

  const riskClass = riskLevelClass(item.riskLevel);
  const ToolIcon = isDatabase ? Database : isSubAgent ? BrainCircuit : SquareTerminal;

  if (item.status === "approval_required") {
    const expiresAt = approval ? Date.parse(approval.expiresAt) : NaN;
    const remainingMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - now) : undefined;
    const totalMs = Number.isFinite(expiresAt) ? Math.max(1, expiresAt - item.startedAt) : undefined;
    const remainingRatio = remainingMs !== undefined && totalMs !== undefined
      ? Math.min(1, remainingMs / totalMs)
      : undefined;

    return (
      <div className={`timeline-item transcript-tool-entry ${item.status}`}>
        <span className="timeline-node-icon" aria-hidden="true">
          {executionIcon(item.status)}
        </span>
        <div className={`approval-card risk-${riskClass}`} role="group" aria-label="待确认的操作">
          <div className="approval-card-header">
            <ShieldAlert size={15} aria-hidden="true" />
            <span className="approval-card-title">
              {isDatabase ? "需要确认 SQL 执行" : isSubAgent ? "需要确认子 Agent 任务" : "需要确认命令执行"}
            </span>
            {item.riskLevel && (
              <span className={`risk-badge risk-${riskClass}`}>风险 {item.riskLevel}</span>
            )}
          </div>

          {isDatabase && approval ? (
            <>
              <dl className="approval-meta">
                <dt>连接</dt><dd>{approval.target.connectionName}</dd>
                <dt>主机</dt><dd>{approval.target.host}:{approval.target.port}</dd>
                <dt>账号</dt><dd>{approval.target.username}</dd>
                <dt>目标库</dt><dd>{snapshot?.targetDatabase ?? "未选择"}</dd>
                <dt>配置版本</dt><dd>{approval.target.configVersion}</dd>
                {approval.target.tunnelSshConnectionId && <>
                  <dt>SSH 跳板</dt><dd>{approval.target.tunnelSshConnectionId}</dd>
                </>}
                <dt>执行 ID</dt><dd>{item.executionId ?? "未知"}</dd>
              </dl>
              <CodeBlock code={approval.sql} language="sql" label="SQL" className="approval-code" />
              {approval.riskReasons && <p className="approval-reason">{approval.riskReasons}</p>}
              {(approval.impactNotice || approval.connectionNotice) && (
                <ul className="approval-notices">
                  {approval.impactNotice && <li>{approval.impactNotice}</li>}
                  {approval.connectionNotice && <li>{approval.connectionNotice}</li>}
                </ul>
              )}
            </>
          ) : (
            command
              ? <CodeBlock code={command} language={isDatabase ? "sql" : "shell"} label={isDatabase ? "SQL" : readableToolName} className="approval-code" />
              : <p className="approval-reason">{readableToolName}</p>
          )}

          {remainingMs !== undefined && (
            <div className="approval-expiry">
              <span className="approval-expiry-label">
                <Clock size={12} aria-hidden="true" />
                {remainingMs > 0 ? `剩余 ${formatCountdown(remainingMs)}` : "已到期"}
              </span>
              <span className="approval-expiry-track" aria-hidden="true">
                <span style={{ transform: `scaleX(${remainingRatio ?? 0})` }} />
              </span>
            </div>
          )}

          {approvalInvalid && (
            <p className="approval-invalid" role="status">审批已过期或目标已变化，无法继续批准。</p>
          )}

          {onApprovalDecision && (
            <div className="tool-approval-actions" role="group" aria-label="命令审批">
              <button
                type="button"
                className="tool-approval-btn approve"
                disabled={decisionPending || Boolean(approvalInvalid)}
                onClick={() => void submitDecision("approve")}
              >
                {decisionPending ? <LoaderCircle className="transcript-spinner" size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                允许
              </button>
              <button
                type="button"
                className="tool-approval-btn deny"
                disabled={decisionPending || Boolean(approvalInvalid)}
                onClick={() => void submitDecision("deny")}
              >
                <X size={13} aria-hidden="true" />
                拒绝
              </button>
            </div>
          )}

          {decisionError && <div className="tool-error-message">{decisionError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`timeline-item transcript-tool-entry ${item.status}`}>
      <span className="timeline-node-icon" aria-hidden="true">
        {executionIcon(item.status)}
      </span>
      <button
        type="button"
        className="tool-entry-toggle"
        aria-expanded={expanded}
        title={command ? "展开命令详情" : statusLabel}
        disabled={!command && !isDatabase}
        onClick={() => setExpanded((current) => !current)}
      >
        <ToolIcon size={14} aria-hidden="true" />
        <span className={`tool-status-label ${item.status}`}>{statusLabel}</span>
        <span className="tool-command-summary">{command || readableToolName}</span>
        {duration && <span className="tool-duration">{duration}</span>}
        {(command || isDatabase) && (
          <ChevronDown
            className={`tool-chevron${expanded ? " expanded" : ""}`}
            size={14}
            aria-hidden="true"
          />
        )}
      </button>

      {expanded && command && (
        <div className="tool-command-detail">
          <CodeBlock code={command} language={isDatabase ? "sql" : "shell"} label={isDatabase ? "SQL" : "命令"} />
          {item.outputLength !== undefined && (
            <span>终端输出 {item.outputLength} 字符</span>
          )}
        </div>
      )}

      {isDatabase && (expanded || item.databaseResult) && <div className="tool-command-detail">
        <dl className="approval-meta">
          <dt>目标库</dt><dd>{snapshot?.targetDatabase ?? item.databaseResult?.targetDatabase ?? '未选择'}</dd>
          <dt>执行 ID</dt><dd>{item.executionId ?? '未知'}</dd>
          {approval && <>
            <dt>连接</dt><dd>{approval.target.connectionName} · {approval.target.host}:{approval.target.port}</dd>
            {item.riskLevel && <><dt>风险</dt><dd>{item.riskLevel}</dd></>}
          </>}
        </dl>
        {expanded && approval && <CodeBlock code={approval.sql} language="sql" label="SQL" />}
        {item.databaseResult && <>
          <p className={`db-outcome${item.databaseResult.outcome === 'OUTCOME_UNKNOWN' ? ' unknown' : ''}`}>
            {item.databaseResult.outcome ?? item.databaseResult.state}{item.databaseResult.outcome === 'OUTCOME_UNKNOWN' ? '：影响尚未确认，请核查原执行，禁止自动重试。' : ''}
          </p>
          {item.databaseResult.reason && <p>{item.databaseResult.reason}</p>}
          {item.databaseResult.result && <ResultGrid result={{ ...item.databaseResult.result,
            affectedRows: item.databaseResult.result.affectedRows === null ? null : String(item.databaseResult.result.affectedRows),
            rows: item.databaseResult.result.rows.slice(0, 20),
          }} />}
          {item.databaseResult.result?.previewTruncated && <p>仅展示前20行预览。</p>}
        </>}
      </div>}

      {item.errorMessage && (
        <div className="tool-error-message">{item.errorMessage}</div>
      )}
    </div>
  );
}

export const TranscriptTurn = memo(function TranscriptTurn({
  turn,
  onApprovalDecision,
}: {
  turn: ChatTurn;
  onApprovalDecision?: (
    item: ToolTranscriptItem,
    decision: CommandApprovalDecision,
  ) => Promise<void>;
}) {
  const [stepsOpen, setStepsOpen] = useState(turn.status === "running");
  useEffect(() => setStepsOpen(turn.status === "running"), [turn.status]);
  let lastTextIndex = -1;
  turn.items.forEach((item, index) => {
    if (item.type === "assistant_text") lastTextIndex = index;
  });
  const durationMs = turn.completedAt === undefined
    ? undefined
    : Math.max(0, turn.completedAt - turn.createdAt);
  const processItems = turn.items.filter((item) => item.type === "status" || item.type === "progress" || item.type === "tool");
  const answerItems = turn.items.filter((item) => item.type === "assistant_text" || item.type === "error");
  const answerText = answerItems
    .filter((item) => item.type === "assistant_text")
    .map((item) => item.content)
    .join("\n\n")
    .trim();
  const completedSteps = processItems.filter((item) => item.type === "progress" ? item.status !== "running" : item.type === "tool" ? item.status !== "running" && item.status !== "approval_required" : true).length;

  return (
    <section className={`transcript-turn ${turn.status}`}>
      <div className="turn-prompt">
        <div className="turn-prompt-text">{turn.prompt}</div>
        <time className="turn-prompt-time" dateTime={new Date(turn.createdAt).toISOString()}>
          {new Date(turn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </time>
      </div>

      {turn.status === "running" && turn.items.length === 0 && (
        <div className="turn-thinking" role="status" aria-label="AI 正在思考">
          <span className="turn-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{turn.statusText || "正在思考"}</span>
        </div>
      )}

      {processItems.length > 0 && <details className="turn-progress" open={stepsOpen} onToggle={(event) => setStepsOpen(event.currentTarget.open)}>
        <summary className="turn-progress-summary">
          {turn.status === "running" ? <LoaderCircle className="transcript-spinner" size={14} /> : <ListChecks size={14} />}
          <span>{turn.status === "running" ? "执行步骤" : "执行过程"}</span>
          <span className="turn-progress-count">{completedSteps}/{processItems.length} 已完成</span>
          <ChevronDown className="tool-chevron" size={14} />
        </summary>
        <div className="turn-timeline">
        {processItems.map((item) => {
          if (item.type === "status") {
            return (
              <StatusEntry
                key={item.id}
                item={item}
                durationMs={durationMs}
              />
            );
          }
          if (item.type === "progress") return <ProgressEntry key={item.id} item={item} />;
          if (item.type === "tool") {
            return (
              <ToolEntry
                key={item.id}
                item={item}
                onApprovalDecision={onApprovalDecision}
              />
            );
          }
          return null;
        })}
        </div>
      </details>}
      <div className="turn-answer">
        {answerItems.map((item) => item.type === "error" ? (
          <div key={item.id} className="timeline-item transcript-error-entry" role="alert">{item.content}</div>
        ) : (
          <div key={item.id} className="timeline-item transcript-text-entry">
            <MarkdownContent content={item.content} streaming={turn.status === "running" && item.id === turn.items[lastTextIndex]?.id} />
          </div>
        ))}
      </div>

      {turn.status !== "running" && answerText && (
        <div className="turn-actions">
          <CopyAnswerButton text={answerText} />
        </div>
      )}
    </section>
  );
});

function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`turn-action-btn${copied ? " copied" : ""}`}
      title="复制回答"
      aria-label={copied ? "已复制回答" : "复制回答"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true), () => undefined);
      }}
    >
      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      <span>{copied ? "已复制" : "复制"}</span>
    </button>
  );
}
