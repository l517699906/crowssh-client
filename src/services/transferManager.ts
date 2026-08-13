import { downloadFile, uploadFile, type RemoteFile } from "../api/sftp";
import { uid } from "../lib/storage";
import {
  isActiveTransfer,
  useTransferStore,
} from "../store/transferStore";
import { useFloatingPanelStore } from "../store/floatingPanelStore";
import type { TransferTask } from "../types/transfer";

const MAX_CONCURRENT_TRANSFERS = 2;
const PROGRESS_UPDATE_INTERVAL = 120;

export interface TransferContext {
  sessionId: string;
  connectionId: string;
  serverName: string;
}

interface UploadSource {
  kind: "upload";
  file: File;
  targetDirectory: string;
  onBatchSettled?: () => void;
}

interface DownloadSource {
  kind: "download";
  file: RemoteFile;
}

type TransferSource = UploadSource | DownloadSource;

interface RuntimeTransfer {
  controller: AbortController;
  lastLoaded: number;
  lastAt: number;
  lastReportedAt: number;
  speedBps: number;
}

interface BatchTracker {
  remaining: Set<string>;
  onSettled?: () => void;
}

const sources = new Map<string, TransferSource>();
const runtimes = new Map<string, RuntimeTransfer>();
const activeTaskIds = new Set<string>();
const batches = new Map<string, BatchTracker>();

function joinRemotePath(directory: string, fileName: string) {
  const base = directory.replace(/\/+$/, "");
  return `${base || ""}/${fileName}`;
}

function createTask(
  context: TransferContext,
  batchId: string,
  direction: TransferTask["direction"],
  fileName: string,
  remotePath: string,
  totalBytes: number,
  createdAt: number,
): TransferTask {
  return {
    id: uid(),
    batchId,
    sessionId: context.sessionId,
    connectionId: context.connectionId,
    serverName: context.serverName,
    direction,
    fileName,
    remotePath,
    status: "queued",
    phase: "queued",
    loadedBytes: 0,
    totalBytes,
    speedBps: 0,
    attempt: 1,
    createdAt,
  };
}

function getTask(id: string) {
  return useTransferStore.getState().tasks.find((task) => task.id === id);
}

function hasActiveTransferForConnection(connectionId: string) {
  for (const id of activeTaskIds) {
    if (getTask(id)?.connectionId === connectionId) return true;
  }
  return false;
}

function addTransferTasks(tasks: TransferTask[]) {
  const shouldOpenPanel = !useTransferStore.getState().tasks.some(isActiveTransfer);
  useTransferStore.getState().addTasks(tasks);
  if (shouldOpenPanel) {
    useFloatingPanelStore.getState().setActivePanel("transfers");
  }
}

function reportProgress(id: string, loaded: number, total: number) {
  const runtime = runtimes.get(id);
  if (!runtime) return;

  const now = performance.now();
  const elapsed = now - runtime.lastAt;
  const delta = Math.max(0, loaded - runtime.lastLoaded);
  if (elapsed > 0 && delta > 0) {
    const instantSpeed = (delta * 1_000) / elapsed;
    runtime.speedBps =
      runtime.speedBps > 0
        ? runtime.speedBps * 0.7 + instantSpeed * 0.3
        : instantSpeed;
  }
  runtime.lastLoaded = loaded;
  runtime.lastAt = now;

  if (
    now - runtime.lastReportedAt < PROGRESS_UPDATE_INTERVAL &&
    loaded < total
  ) {
    return;
  }
  runtime.lastReportedAt = now;
  useTransferStore.getState().updateTask(id, {
    loadedBytes: loaded,
    totalBytes: total,
    speedBps: runtime.speedBps,
  });
}

function isAbortError(reason: unknown) {
  return reason instanceof Error && reason.name === "AbortError";
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function settleBatch(task: TransferTask) {
  const tracker = batches.get(task.batchId);
  if (!tracker) return;
  tracker.remaining.delete(task.id);
  if (tracker.remaining.size > 0) return;
  batches.delete(task.batchId);
  tracker.onSettled?.();
}

async function executeTransfer(id: string) {
  const task = getTask(id);
  const source = sources.get(id);
  if (!task || !source) {
    activeTaskIds.delete(id);
    useTransferStore.getState().updateTask(id, {
      status: "failed",
      error: "传输任务数据已失效",
      finishedAt: Date.now(),
    });
    if (task) settleBatch({ ...task, status: "failed" });
    pumpQueue();
    return;
  }

  const controller = new AbortController();
  runtimes.set(id, {
    controller,
    lastLoaded: 0,
    lastAt: performance.now(),
    lastReportedAt: 0,
    speedBps: 0,
  });
  useTransferStore.getState().updateTask(id, {
    status: "running",
    phase: source.kind === "upload" ? "sending" : "receiving",
    loadedBytes: 0,
    speedBps: 0,
    error: undefined,
    startedAt: Date.now(),
    finishedAt: undefined,
  });

  try {
    if (source.kind === "upload") {
      await uploadFile(task.connectionId, source.targetDirectory, source.file, {
        signal: controller.signal,
        onProgress: ({ loaded, total }) => reportProgress(id, loaded, total),
        onUploadComplete: () => {
          useTransferStore.getState().updateTask(id, {
            phase: "remote-writing",
            loadedBytes: task.totalBytes,
            speedBps: 0,
          });
        },
      });
    } else {
      await downloadFile(task.connectionId, source.file, {
        signal: controller.signal,
        onProgress: ({ loaded, total }) => reportProgress(id, loaded, total),
      });
    }

    const completedTotal = getTask(id)?.totalBytes ?? task.totalBytes;
    useTransferStore.getState().updateTask(id, {
      status: "success",
      loadedBytes: completedTotal,
      speedBps: 0,
      finishedAt: Date.now(),
    });
  } catch (reason) {
    const current = getTask(id);
    if (isAbortError(reason)) {
      useTransferStore.getState().updateTask(id, {
        status: "cancelled",
        speedBps: 0,
        finishedAt: Date.now(),
      });
    } else {
      const message = errorMessage(reason);
      useTransferStore.getState().updateTask(id, {
        status: "failed",
        speedBps: 0,
        error:
          source.kind === "upload" && current?.phase === "remote-writing"
            ? `远端写入结果未知：${message}`
            : message,
        finishedAt: Date.now(),
      });
    }
  } finally {
    runtimes.delete(id);
    activeTaskIds.delete(id);
    const settledTask = getTask(id);
    if (settledTask) {
      if (settledTask.status === "success" || settledTask.status === "cancelled") {
        sources.delete(id);
      }
      settleBatch(settledTask);
    }
    pumpQueue();
  }
}

function pumpQueue() {
  if (activeTaskIds.size >= MAX_CONCURRENT_TRANSFERS) return;
  const queuedTasks = useTransferStore
    .getState()
    .tasks.filter((task) => task.status === "queued");

  for (const task of queuedTasks) {
    if (activeTaskIds.size >= MAX_CONCURRENT_TRANSFERS) break;
    if (hasActiveTransferForConnection(task.connectionId)) continue;
    activeTaskIds.add(task.id);
    void executeTransfer(task.id);
  }
}

export function enqueueUploads(
  context: TransferContext,
  targetDirectory: string,
  files: File[],
  onBatchSettled?: () => void,
) {
  if (files.length === 0) return [];
  const batchId = uid();
  const createdAt = Date.now();
  const tasks = files.map((file, index) =>
    createTask(
      context,
      batchId,
      "upload",
      file.name,
      joinRemotePath(targetDirectory, file.name),
      file.size,
      createdAt + index,
    ),
  );
  for (let index = 0; index < tasks.length; index += 1) {
    sources.set(tasks[index].id, {
      kind: "upload",
      file: files[index],
      targetDirectory,
      onBatchSettled,
    });
  }
  batches.set(batchId, {
    remaining: new Set(tasks.map((task) => task.id)),
    onSettled: onBatchSettled,
  });
  addTransferTasks(tasks);
  pumpQueue();
  return tasks.map((task) => task.id);
}

export function enqueueDownloads(
  context: TransferContext,
  files: RemoteFile[],
) {
  if (files.length === 0) return [];
  const batchId = uid();
  const createdAt = Date.now();
  const tasks = files.map((file, index) =>
    createTask(
      context,
      batchId,
      "download",
      file.name,
      file.path,
      file.size,
      createdAt + index,
    ),
  );
  for (let index = 0; index < tasks.length; index += 1) {
    sources.set(tasks[index].id, { kind: "download", file: files[index] });
  }
  addTransferTasks(tasks);
  pumpQueue();
  return tasks.map((task) => task.id);
}

export function cancelTransfer(id: string) {
  const task = getTask(id);
  if (!task || !isActiveTransfer(task)) return false;
  if (task.status === "queued") {
    useTransferStore.getState().updateTask(id, {
      status: "cancelled",
      speedBps: 0,
      finishedAt: Date.now(),
    });
    sources.delete(id);
    settleBatch({ ...task, status: "cancelled" });
    pumpQueue();
    return true;
  }
  if (task.phase === "remote-writing") return false;
  runtimes.get(id)?.controller.abort();
  return true;
}

export function retryTransfer(id: string) {
  const task = getTask(id);
  const source = sources.get(id);
  if (!task || task.status !== "failed" || !source) return false;

  const batchId = uid();
  batches.set(batchId, {
    remaining: new Set([id]),
    onSettled: source.kind === "upload" ? source.onBatchSettled : undefined,
  });
  useTransferStore.getState().updateTask(id, {
    batchId,
    status: "queued",
    phase: "queued",
    loadedBytes: 0,
    speedBps: 0,
    error: undefined,
    startedAt: undefined,
    finishedAt: undefined,
    attempt: task.attempt + 1,
  });
  useFloatingPanelStore.getState().setActivePanel("transfers");
  pumpQueue();
  return true;
}

export function clearTransferHistory() {
  for (const task of useTransferStore.getState().tasks) {
    if (!isActiveTransfer(task)) sources.delete(task.id);
  }
  useTransferStore.getState().clearSettled();
}
