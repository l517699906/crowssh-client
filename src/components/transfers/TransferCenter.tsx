import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowUpDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock3,
  Download,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  cancelTransfer,
  clearTransferHistory,
  retryTransfer,
} from "../../services/transferManager";
import {
  isActiveTransfer,
  useTransferStore,
} from "../../store/transferStore";
import { useFloatingPanelStore } from "../../store/floatingPanelStore";
import type { TransferTask } from "../../types/transfer";
import "./transfers.css";

type TransferFilter = "all" | "active" | "success" | "failed";

const FILTERS: Array<{ id: TransferFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "success", label: "已完成" },
  { id: "failed", label: "失败" },
];

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${Math.max(1, Math.ceil(seconds))} 秒`;
  if (seconds < 3600) return `约 ${Math.ceil(seconds / 60)} 分钟`;
  return `约 ${(seconds / 3600).toFixed(1)} 小时`;
}

function getProgress(task: TransferTask) {
  if (task.totalBytes <= 0) return task.status === "success" ? 100 : 0;
  return Math.min(100, (task.loadedBytes / task.totalBytes) * 100);
}

function getStatusText(task: TransferTask, progress: number) {
  if (task.status === "queued") return "等待中";
  if (task.status === "success") return "已完成";
  if (task.status === "failed") return "失败";
  if (task.status === "cancelled") return "已取消";
  if (task.phase === "remote-writing") return "写入远端";
  return `${Math.round(progress)}%`;
}

function getTaskMeta(task: TransferTask) {
  if (task.status === "failed") return task.error || "传输失败";
  if (task.status === "cancelled") return "任务已取消";
  if (task.status === "queued") return `${formatBytes(task.totalBytes)} · 等待传输`;
  if (task.status === "success") {
    return `${formatBytes(task.totalBytes)} · 传输完成${
      task.attempt > 1 ? ` · 第 ${task.attempt} 次尝试` : ""
    }`;
  }
  if (task.phase === "remote-writing") {
    return "文件已发送，正在等待远端写入结果";
  }

  const parts = [
    `${formatBytes(task.loadedBytes)} / ${formatBytes(task.totalBytes)}`,
  ];
  if (task.speedBps > 0) {
    parts.push(`${formatBytes(task.speedBps)}/s`);
    const remaining = Math.max(0, task.totalBytes - task.loadedBytes);
    if (remaining > 0) parts.push(formatDuration(remaining / task.speedBps));
  }
  return parts.join(" · ");
}

const TransferRow = memo(function TransferRow({ task }: { task: TransferTask }) {
  const progress = getProgress(task);
  const active = isActiveTransfer(task);
  const canCancel = active && task.phase !== "remote-writing";
  const statusText = getStatusText(task, progress);
  const taskMeta = getTaskMeta(task);

  return (
    <div className={`transfer-task ${task.status}`}>
      <div className="transfer-task-main">
        <span className="transfer-direction" aria-hidden="true">
          {task.direction === "upload" ? <Upload size={15} /> : <Download size={15} />}
        </span>
        <div className="transfer-task-copy">
          <div className="transfer-task-title-row">
            <span className="transfer-file-name" title={task.fileName}>
              {task.fileName}
            </span>
            <span className="transfer-status">{statusText}</span>
          </div>
          <div
            className="transfer-task-path"
            title={`${task.serverName} · ${task.remotePath}`}
          >
            {task.serverName} · {task.remotePath}
          </div>
        </div>
        {task.status === "failed" ? (
          <button
            className="transfer-task-action"
            type="button"
            title="重试传输"
            aria-label={`重试 ${task.fileName}`}
            onClick={() => retryTransfer(task.id)}
          >
            <RotateCcw size={14} />
          </button>
        ) : canCancel ? (
          <button
            className="transfer-task-action"
            type="button"
            title="取消传输"
            aria-label={`取消 ${task.fileName}`}
            onClick={() => cancelTransfer(task.id)}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div
        className={`transfer-progress${
          task.phase === "remote-writing" && task.status === "running"
            ? " remote-writing"
            : ""
        }`}
        role="progressbar"
        aria-label={`${task.fileName} 传输进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          task.phase === "remote-writing" && task.status === "running"
            ? undefined
            : Math.round(progress)
        }
        aria-valuetext={statusText}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div
        className={`transfer-task-meta${task.status === "failed" ? " error" : ""}`}
        title={taskMeta}
      >
        {taskMeta}
      </div>
    </div>
  );
});

function filterTasks(tasks: TransferTask[], filter: TransferFilter) {
  if (filter === "active") return tasks.filter(isActiveTransfer);
  if (filter === "success") {
    return tasks.filter((task) => task.status === "success");
  }
  if (filter === "failed") {
    return tasks.filter((task) => task.status === "failed");
  }
  return [...tasks];
}

export function TransferCenter() {
  const tasks = useTransferStore(useShallow((state) => state.tasks));
  const [filter, setFilter] = useState<TransferFilter>("all");
  const expanded = useFloatingPanelStore((state) => state.activePanel === "transfers");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const closePanel = () => {
      useFloatingPanelStore.getState().setActivePanel(null);
      triggerRef.current?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [expanded]);

  const summary = useMemo(() => {
    let active = 0;
    let running = 0;
    let queued = 0;
    let success = 0;
    let failed = 0;
    let cancelled = 0;
    let loadedBytes = 0;
    let totalBytes = 0;
    let activeLoadedBytes = 0;
    let activeTotalBytes = 0;
    for (const task of tasks) {
      if (isActiveTransfer(task)) {
        active += 1;
        activeLoadedBytes += Math.min(task.loadedBytes, task.totalBytes);
        activeTotalBytes += task.totalBytes;
      }
      if (task.status === "running") running += 1;
      if (task.status === "queued") queued += 1;
      if (task.status === "success") success += 1;
      if (task.status === "failed") failed += 1;
      if (task.status === "cancelled") cancelled += 1;
      loadedBytes += Math.min(task.loadedBytes, task.totalBytes);
      totalBytes += task.totalBytes;
    }
    const progress =
      active > 0
        ? activeTotalBytes > 0
          ? (activeLoadedBytes / activeTotalBytes) * 100
          : 0
        : totalBytes > 0
          ? (loadedBytes / totalBytes) * 100
          : 0;
    return { active, running, queued, success, failed, cancelled, progress };
  }, [tasks]);

  const filteredTasks = useMemo(
    () => filterTasks(tasks, filter).reverse(),
    [filter, tasks],
  );
  const settledCount = summary.success + summary.failed + summary.cancelled;
  const counts: Record<TransferFilter, number> = {
    all: tasks.length,
    active: summary.active,
    success: summary.success,
    failed: summary.failed,
  };
  const headerSummary =
    tasks.length === 0
      ? "暂无传输记录"
      : summary.active > 0
        ? summary.running > 0
          ? `${summary.running} 进行中${summary.queued > 0 ? ` · ${summary.queued} 等待` : ""}`
          : `${summary.queued} 等待中`
        : summary.failed > 0
          ? `${summary.success} 完成 · ${summary.failed} 失败`
          : summary.cancelled > 0
            ? `${summary.success} 完成 · ${summary.cancelled} 取消`
            : `${summary.success} 项已完成`;
  const triggerTitle = expanded
    ? "收起文件传输面板"
    : summary.active > 0
      ? `${summary.active} 项传输中，已完成 ${Math.round(summary.progress)}%`
      : summary.failed > 0
        ? `${summary.failed} 项传输失败，点击查看`
        : tasks.length > 0
          ? "查看文件传输记录"
          : "文件传输";

  return (
    <div
      className={`transfer-center${expanded ? " is-expanded" : ""}`}
      data-window-no-drag
    >
      <button
        ref={triggerRef}
        className={`transfer-menu-button${expanded ? " active" : ""}${
          summary.active > 0 ? " transferring" : ""
        }${summary.failed > 0 ? " has-failures" : ""}`}
        type="button"
        title={triggerTitle}
        aria-label={triggerTitle}
        aria-expanded={expanded}
        aria-controls="transfer-panel"
        onClick={() =>
          useFloatingPanelStore.getState().togglePanel("transfers")
        }
      >
        <ArrowUpDown size={16} />
        {summary.active > 0 && !expanded ? (
          <>
            <span className="transfer-menu-value" aria-live="polite">
              {Math.round(summary.progress)}%
            </span>
            <span
              className="transfer-menu-progress"
              role="progressbar"
              aria-label="文件传输总进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(summary.progress)}
            >
              <span style={{ width: `${summary.progress}%` }} />
            </span>
          </>
        ) : null}
      </button>

      {expanded ? (
        <aside
          ref={panelRef}
          id="transfer-panel"
          className="transfer-panel"
          aria-label="文件传输"
        >
          <div className="transfer-panel-header">
            <div className="transfer-panel-heading">
              <ArrowUpDown size={15} />
              <div>
                <strong>文件传输</strong>
                <span aria-live="polite">{headerSummary}</span>
              </div>
            </div>
            <div className="transfer-panel-actions">
              {settledCount > 0 ? (
                <button
                  className="transfer-icon-button"
                  type="button"
                  title="清除传输记录"
                  aria-label="清除传输记录"
                  onClick={clearTransferHistory}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
              <button
                className="transfer-icon-button"
                type="button"
                title="收起传输面板"
                aria-label="收起传输面板"
                onClick={() => {
                  useFloatingPanelStore.getState().setActivePanel(null);
                  triggerRef.current?.focus();
                }}
              >
                <ChevronUp size={15} />
              </button>
            </div>
          </div>

          <div className="transfer-filters" role="group" aria-label="传输状态筛选">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                className={filter === item.id ? "active" : undefined}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label} <span>{counts[item.id]}</span>
              </button>
            ))}
          </div>

          <div className="transfer-list">
            {tasks.length === 0 ? (
              <div className="transfer-filter-empty">
                <ArrowUpDown size={20} />
                暂无传输记录
              </div>
            ) : filteredTasks.length > 0 ? (
              filteredTasks.map((task) => <TransferRow key={task.id} task={task} />)
            ) : (
              <div className="transfer-filter-empty">
                {filter === "failed" ? (
                  <CircleCheck size={20} />
                ) : filter === "active" ? (
                  <Clock3 size={20} />
                ) : (
                  <CircleX size={20} />
                )}
                当前筛选下没有传输记录
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
