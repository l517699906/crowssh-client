export type TransferDirection = "upload" | "download";

export type TransferStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type TransferPhase =
  | "queued"
  | "sending"
  | "remote-writing"
  | "receiving";

export interface TransferTask {
  id: string;
  batchId: string;
  sessionId: string;
  connectionId: string;
  serverName: string;
  direction: TransferDirection;
  fileName: string;
  remotePath: string;
  status: TransferStatus;
  phase: TransferPhase;
  loadedBytes: number;
  totalBytes: number;
  speedBps: number;
  attempt: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}
