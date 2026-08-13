import { useCallback, useEffect, useRef, useState } from "react";
import {
  getServerMonitorSnapshot,
  type ServerMonitorSnapshot,
} from "../api/serverMonitor";
import {
  appendMonitorHistory,
  calculateMonitorMetrics,
  type ServerMonitorHistoryPoint,
  type ServerMonitorMetrics,
} from "../lib/serverMonitorMetrics";

const EXPANDED_INTERVAL_MS = 2_000;
const COLLAPSED_INTERVAL_MS = 10_000;
const FAILURE_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
const STALE_AFTER_MS = 15_000;

export type ServerMonitorStatus =
  | "idle"
  | "loading"
  | "live"
  | "stale"
  | "unsupported"
  | "unavailable";

export interface ServerMonitorState {
  status: ServerMonitorStatus;
  snapshot: ServerMonitorSnapshot | null;
  metrics: ServerMonitorMetrics | null;
  history: ServerMonitorHistoryPoint[];
  error: string | null;
  updatedAt: number | null;
  refresh: () => void;
}

interface Options {
  connectionId?: string;
  connected: boolean;
  expanded: boolean;
}

export function useServerMonitor({
  connectionId,
  connected,
  expanded,
}: Options): ServerMonitorState {
  const [state, setState] = useState<Omit<ServerMonitorState, "refresh">>({
    status: "idle",
    snapshot: null,
    metrics: null,
    history: [],
    error: null,
    updatedAt: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleRef = useRef(0);
  const failureCountRef = useRef(0);
  const previousRef = useRef<ServerMonitorSnapshot | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);
  const rescheduleRef = useRef<() => void>(() => undefined);
  const activeConnectionRef = useRef<string | undefined>(undefined);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    const lifecycleId = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycleId;
    const connectionChanged = activeConnectionRef.current !== connectionId;
    activeConnectionRef.current = connectionId;
    failureCountRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;

    if (connectionChanged) {
      previousRef.current = null;
      setState({
        status: connectionId && connected ? "loading" : "idle",
        snapshot: null,
        metrics: null,
        history: [],
        error: null,
        updatedAt: null,
      });
    } else {
      if (!connected) previousRef.current = null;
      setState((current) => ({
        ...current,
        status: connected
          ? current.snapshot ? "stale" : "loading"
          : current.snapshot ? "stale" : "idle",
        error: connected ? null : "SSH 连接已断开",
      }));
    }

    if (!connectionId || !connected) {
      refreshRef.current = () => undefined;
      rescheduleRef.current = () => undefined;
      return;
    }

    let disposed = false;
    let inFlight = false;
    let requestId = 0;
    let requestController: AbortController | null = null;
    const isCurrent = () => !disposed && lifecycleRef.current === lifecycleId;

    const cancelInFlight = () => {
      requestId += 1;
      requestController?.abort();
      requestController = null;
      inFlight = false;
    };

    const schedule = (delay: number) => {
      if (!isCurrent()) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void collect(), delay);
    };

    const collect = async () => {
      timerRef.current = null;
      if (!isCurrent() || document.hidden || inFlight) return;

      inFlight = true;
      const currentRequestId = requestId + 1;
      requestId = currentRequestId;
      const controller = new AbortController();
      requestController = controller;
      const response = await getServerMonitorSnapshot(
        connectionId,
        controller.signal,
      );
      if (!isCurrent() || currentRequestId !== requestId) return;
      requestController = null;
      inFlight = false;

      if (response.code === "0000" && response.data) {
        const snapshot = response.data;
        const metrics = calculateMonitorMetrics(snapshot, previousRef.current ?? undefined);
        previousRef.current = snapshot;
        failureCountRef.current = 0;
        setState((current) => ({
          status: "live",
          snapshot,
          metrics,
          history: appendMonitorHistory(current.history, {
            capturedAtEpochMs: snapshot.capturedAtEpochMs,
            ...metrics,
          }),
          error: null,
          updatedAt: Date.now(),
        }));
        schedule(expandedRef.current ? EXPANDED_INTERVAL_MS : COLLAPSED_INTERVAL_MS);
        return;
      }

      const unsupported = response.code === "SSH_MONITOR_UNSUPPORTED";
      const failureIndex = Math.min(
        failureCountRef.current,
        FAILURE_BACKOFF_MS.length - 1,
      );
      failureCountRef.current += 1;
      setState((current) => ({
        ...current,
        status: unsupported
          ? "unsupported"
          : current.snapshot
            ? "stale"
            : "unavailable",
        error: response.info || "服务器监控暂时不可用",
      }));
      if (!unsupported) schedule(FAILURE_BACKOFF_MS[failureIndex]);
    };

    const handleVisibility = () => {
      if (!isCurrent()) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (document.hidden) {
        cancelInFlight();
        setState((current) => current.snapshot
          ? { ...current, status: "stale" }
          : current);
      } else {
        void collect();
      }
    };

    const refresh = () => {
      if (!isCurrent() || document.hidden) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      failureCountRef.current = 0;
      cancelInFlight();
      void collect();
    };
    refreshRef.current = refresh;
    rescheduleRef.current = () => {
      if (!isCurrent() || document.hidden || inFlight) return;
      schedule(expandedRef.current ? EXPANDED_INTERVAL_MS : COLLAPSED_INTERVAL_MS);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    void collect();

    const staleTimer = setInterval(() => {
      if (!isCurrent()) return;
      setState((current) => {
        if (
          current.status !== "live"
          || current.updatedAt === null
          || Date.now() - current.updatedAt <= STALE_AFTER_MS
        ) {
          return current;
        }
        return { ...current, status: "stale" };
      });
    }, 5_000);

    return () => {
      disposed = true;
      cancelInFlight();
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(staleTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [connected, connectionId]);

  useEffect(() => {
    if (expanded) refreshRef.current();
    else rescheduleRef.current();
  }, [expanded]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { ...state, refresh };
}
