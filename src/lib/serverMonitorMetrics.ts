import type { ServerMonitorSnapshot } from "../api/serverMonitor";

export interface ServerMonitorMetrics {
  cpuPercent: number | null;
  memoryPercent: number;
  diskPercent: number | null;
  receiveBytesPerSecond: number | null;
  transmitBytesPerSecond: number | null;
}

export interface ServerMonitorHistoryPoint extends ServerMonitorMetrics {
  capturedAtEpochMs: number;
}

export const MONITOR_HISTORY_WINDOW_MS = 120_000;
export const MONITOR_HISTORY_LIMIT = 60;

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function calculateMonitorMetrics(
  current: ServerMonitorSnapshot,
  previous?: ServerMonitorSnapshot,
): ServerMonitorMetrics {
  return {
    cpuPercent: calculateCpuPercent(current, previous),
    memoryPercent: calculateUsedPercent(
      current.memory.totalBytes,
      current.memory.totalBytes - current.memory.availableBytes,
    ),
    diskPercent: current.disk
      ? calculateUsedPercent(current.disk.totalBytes, current.disk.usedBytes)
      : null,
    ...calculateNetworkRates(current, previous),
  };
}

function calculateCpuPercent(
  current: ServerMonitorSnapshot,
  previous?: ServerMonitorSnapshot,
) {
  if (!previous) return null;
  const totalDelta = current.cpu.totalTicks - previous.cpu.totalTicks;
  const idleDelta = current.cpu.idleTicks - previous.cpu.idleTicks;
  if (totalDelta <= 0 || idleDelta < 0 || idleDelta > totalDelta) return null;
  return clampPercent(((totalDelta - idleDelta) / totalDelta) * 100);
}

function calculateUsedPercent(total: number, used: number) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((Math.max(0, used) / total) * 100);
}

function calculateNetworkRates(
  current: ServerMonitorSnapshot,
  previous?: ServerMonitorSnapshot,
) {
  const unavailable = {
    receiveBytesPerSecond: null,
    transmitBytesPerSecond: null,
  };
  if (!previous?.network || !current.network) return unavailable;
  if (previous.network.interfaceName !== current.network.interfaceName) return unavailable;
  const elapsedSeconds =
    (current.capturedAtEpochMs - previous.capturedAtEpochMs) / 1000;
  const receiveDelta = current.network.receivedBytes - previous.network.receivedBytes;
  const transmitDelta = current.network.transmittedBytes - previous.network.transmittedBytes;
  if (elapsedSeconds <= 0 || receiveDelta < 0 || transmitDelta < 0) return unavailable;
  return {
    receiveBytesPerSecond: receiveDelta / elapsedSeconds,
    transmitBytesPerSecond: transmitDelta / elapsedSeconds,
  };
}

export function appendMonitorHistory(
  history: ServerMonitorHistoryPoint[],
  point: ServerMonitorHistoryPoint,
) {
  const earliest = point.capturedAtEpochMs - MONITOR_HISTORY_WINDOW_MS;
  const next = history.filter((item) => item.capturedAtEpochMs >= earliest);
  next.push(point);
  return next.slice(-MONITOR_HISTORY_LIMIT);
}

export function formatBytes(value: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let amount = normalized;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const digits = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatRate(value: number | null) {
  return value === null ? "--" : `${formatBytes(value)}/s`;
}

export function formatPercent(value: number | null) {
  return value === null ? "--" : `${Math.round(clampPercent(value))}%`;
}

export function formatUptime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}
