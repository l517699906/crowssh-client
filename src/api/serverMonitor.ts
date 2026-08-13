import { getWithTimeout } from "./request";

const BASE = "/api/v1/ssh/monitor";
const SNAPSHOT_TIMEOUT_MS = 5_000;

export interface ServerMonitorSnapshot {
  capturedAtEpochMs: number;
  host: {
    hostname: string;
    osName: string;
    osVersion?: string;
    kernelVersion: string;
    architecture: string;
  };
  uptimeSeconds: number;
  cpu: {
    logicalProcessors: number;
    totalTicks: number;
    idleTicks: number;
  };
  load: {
    oneMinute: number;
    fiveMinutes: number;
    fifteenMinutes: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
  };
  disk: {
    mountPoint: "/";
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
  } | null;
  network: {
    interfaceName: string;
    receivedBytes: number;
    transmittedBytes: number;
  } | null;
}

export function getServerMonitorSnapshot(connectionId: string, signal?: AbortSignal) {
  return getWithTimeout<ServerMonitorSnapshot>(
    `${BASE}/snapshot`,
    { connectionId },
    SNAPSHOT_TIMEOUT_MS,
    signal,
  );
}
