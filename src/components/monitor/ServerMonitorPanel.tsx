import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronUp,
  CircleAlert,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
} from "lucide-react";
import type { TerminalSession } from "../../types";
import { useServerMonitor } from "../../hooks/useServerMonitor";
import {
  formatBytes,
  formatPercent,
  formatRate,
  formatUptime,
  type ServerMonitorHistoryPoint,
} from "../../lib/serverMonitorMetrics";
import { useFloatingPanelStore } from "../../store/floatingPanelStore";
import "./server-monitor.css";

interface Props {
  terminal?: TerminalSession;
}

function statusLabel(status: ReturnType<typeof useServerMonitor>["status"]) {
  if (status === "live") return "实时";
  if (status === "stale") return "数据已过期";
  if (status === "unsupported") return "不支持";
  if (status === "unavailable") return "暂不可用";
  if (status === "loading") return "正在采集";
  return "等待连接";
}

function formatUpdatedAt(updatedAt: number | null) {
  if (updatedAt === null) return "尚无数据";
  return `更新于 ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function emptyStateMessage(status: ReturnType<typeof useServerMonitor>["status"]) {
  return status === "loading"
    ? "正在读取当前服务器状态"
    : "连接服务器后开始采集实时状态";
}

function linePoints(
  history: ServerMonitorHistoryPoint[],
  select: (point: ServerMonitorHistoryPoint) => number | null,
  maxValue = 100,
) {
  if (history.length < 2) return "";
  return history
    .map((point, index) => {
      const value = select(point) ?? 0;
      const x = (index / (history.length - 1)) * 100;
      const y = 30 - Math.min(30, Math.max(0, (value / Math.max(maxValue, 1)) * 30));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function TelemetryStrip({ history }: { history: ServerMonitorHistoryPoint[] }) {
  const maxNetwork = Math.max(
    1,
    ...history.flatMap((point) => [
      point.receiveBytesPerSecond ?? 0,
      point.transmitBytesPerSecond ?? 0,
    ]),
  );
  return (
    <div className="monitor-telemetry" aria-label="最近两分钟资源趋势">
      <div className="monitor-telemetry-legend">
        <span><i className="cpu" />CPU</span>
        <span><i className="memory" />内存</span>
        <span><i className="network" />网络</span>
        <small>最近 2 分钟</small>
      </div>
      {history.length < 2 ? (
        <div className="monitor-telemetry-empty">正在积累趋势数据</div>
      ) : (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
          <polyline className="monitor-line cpu" points={linePoints(history, (point) => point.cpuPercent)} />
          <polyline className="monitor-line memory" points={linePoints(history, (point) => point.memoryPercent)} />
          <polyline
            className="monitor-line network"
            points={linePoints(
              history,
              (point) => (point.receiveBytesPerSecond ?? 0) + (point.transmitBytesPerSecond ?? 0),
              maxNetwork,
            )}
          />
        </svg>
      )}
    </div>
  );
}

function MetricRow({
  icon,
  label,
  value,
  detail,
  percent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  percent: number | null;
}) {
  return (
    <div className="monitor-metric-row">
      <span className="monitor-metric-icon" aria-hidden="true">{icon}</span>
      <div className="monitor-metric-copy">
        <div><span>{label}</span><strong>{value}</strong></div>
        <small>{detail}</small>
      </div>
      <div className="monitor-meter" aria-hidden="true">
        <span style={{ width: `${percent ?? 0}%` }} />
      </div>
    </div>
  );
}

export function ServerMonitorPanel({ terminal }: Props) {
  const expanded = useFloatingPanelStore((state) => state.activePanel === "monitor");
  const setActivePanel = useFloatingPanelStore((state) => state.setActivePanel);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const connected = terminal?.status === "connected";
  const monitor = useServerMonitor({
    connectionId: terminal?.serverId,
    connected,
    expanded,
  });
  const { snapshot, metrics } = monitor;

  const triggerTitle = !terminal
    ? "服务器监控需要活动连接"
    : expanded
      ? "收起服务器监控"
      : "查看服务器实时状态";

  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActivePanel(null);
      triggerRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setActivePanel(null);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [expanded, setActivePanel]);

  useEffect(() => {
    if (expanded && !terminal) setActivePanel(null);
  }, [expanded, setActivePanel, terminal]);

  const hostDetail = useMemo(() => {
    if (!snapshot) return "等待服务器返回主机信息";
    return `${snapshot.host.osName} · ${snapshot.host.architecture}`;
  }, [snapshot]);

  return (
    <div className={`server-monitor-center${expanded ? " is-expanded" : ""}`} data-window-no-drag>
      <button
        ref={triggerRef}
        className={`monitor-menu-button ${monitor.status}${expanded ? " active" : ""}`}
        type="button"
        title={triggerTitle}
        aria-label={triggerTitle}
        aria-expanded={expanded}
        aria-controls="server-monitor-panel"
        disabled={!terminal}
        onClick={() => useFloatingPanelStore.getState().togglePanel("monitor")}
      >
        <Activity size={16} />
        {terminal ? (
          <span className="monitor-menu-summary">
            <span><small>CPU</small>{formatPercent(metrics?.cpuPercent ?? null)}</span>
            <span><small>内存</small>{formatPercent(metrics?.memoryPercent ?? null)}</span>
          </span>
        ) : null}
        <i className="monitor-freshness-dot" aria-hidden="true" />
      </button>

      {expanded ? (
        <aside
          ref={panelRef}
          id="server-monitor-panel"
          className="server-monitor-panel"
          aria-label="服务器实时状态"
        >
          <div className="monitor-panel-header">
            <div className="monitor-panel-heading">
              <Server size={16} />
              <div>
                <strong>{snapshot?.host.hostname || terminal?.title || "服务器状态"}</strong>
                <span>{hostDetail}</span>
              </div>
            </div>
            <div className="monitor-panel-actions">
              <span className={`monitor-status ${monitor.status}`} role="status">
                {statusLabel(monitor.status)}
              </span>
              <button
                type="button"
                title="立即刷新"
                aria-label="立即刷新服务器状态"
                disabled={!connected || monitor.status === "loading"}
                onClick={monitor.refresh}
              >
                <RefreshCw className={monitor.status === "loading" ? "spin" : undefined} size={14} />
              </button>
              <button
                type="button"
                title="收起监控面板"
                aria-label="收起监控面板"
                onClick={() => {
                  setActivePanel(null);
                  triggerRef.current?.focus();
                }}
              >
                <ChevronUp size={15} />
              </button>
            </div>
          </div>

          {monitor.error ? (
            <div className={`monitor-notice ${snapshot ? "stale" : "error"}`} role={snapshot ? "status" : "alert"}>
              <CircleAlert size={14} />
              <span>{monitor.error}</span>
            </div>
          ) : null}

          {snapshot && metrics ? (
            <div className="monitor-panel-body">
              <TelemetryStrip history={monitor.history} />

              <div className="monitor-metrics">
                <MetricRow
                  icon={<Cpu size={15} />}
                  label="CPU"
                  value={formatPercent(metrics.cpuPercent)}
                  detail={`${snapshot.cpu.logicalProcessors} 逻辑核心`}
                  percent={metrics.cpuPercent}
                />
                <MetricRow
                  icon={<MemoryStick size={15} />}
                  label="内存"
                  value={formatPercent(metrics.memoryPercent)}
                  detail={`${formatBytes(snapshot.memory.totalBytes - snapshot.memory.availableBytes)} / ${formatBytes(snapshot.memory.totalBytes)}`}
                  percent={metrics.memoryPercent}
                />
                <MetricRow
                  icon={<HardDrive size={15} />}
                  label="根磁盘"
                  value={formatPercent(metrics.diskPercent)}
                  detail={snapshot.disk
                    ? `${formatBytes(snapshot.disk.usedBytes)} / ${formatBytes(snapshot.disk.totalBytes)}`
                    : "远端未返回磁盘信息"}
                  percent={metrics.diskPercent}
                />
              </div>

              <div className="monitor-detail-grid">
                <div>
                  <Gauge size={14} />
                  <span>系统负载</span>
                  <strong>{snapshot.load.oneMinute.toFixed(2)} · {snapshot.load.fiveMinutes.toFixed(2)} · {snapshot.load.fifteenMinutes.toFixed(2)}</strong>
                  <small>1 / 5 / 15 分钟</small>
                </div>
                <div>
                  <Network size={14} />
                  <span>网络速率</span>
                  <strong><ArrowDown size={12} />{formatRate(metrics.receiveBytesPerSecond)}</strong>
                  <small><ArrowUp size={12} />{formatRate(metrics.transmitBytesPerSecond)} · {snapshot.network?.interfaceName || "未识别"}</small>
                </div>
                <div>
                  <Database size={14} />
                  <span>运行时长</span>
                  <strong>{formatUptime(snapshot.uptimeSeconds)}</strong>
                  <small>{snapshot.host.kernelVersion}</small>
                </div>
              </div>
            </div>
          ) : (
            <div className="monitor-empty-state">
              {monitor.status === "loading" ? <RefreshCw className="spin" size={22} /> : <Activity size={22} />}
              <strong>{statusLabel(monitor.status)}</strong>
              <span>{monitor.error || emptyStateMessage(monitor.status)}</span>
            </div>
          )}

          <div className="monitor-panel-footer">
            <span>{formatUpdatedAt(monitor.updatedAt)}</span>
            <span>{expanded ? "每 2 秒刷新" : "每 10 秒刷新"}</span>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
