import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as sshApi from "../../api/sshConnection";
import {
  closeTerminal,
  createTerminalWebSocket,
  readOutput,
  openTerminal,
  resizeTerminal,
  TerminalWebSocketTicketError,
  writeInput,
} from "../../api/terminal";
import {
  parseTerminalServerFrame,
  terminalAckFrame,
  terminalHeartbeatFrame,
  terminalInputFrame,
  terminalResizeFrame,
} from "../../api/terminalWebSocketProtocol";
import { recordTerminalDiagnostic } from "../../lib/terminalDiagnostics";
import type { ServerConfig, SessionStatus, TerminalSession } from "../../types";
import { useThemeStore } from "../../store/themeStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { buildXtermTheme } from "../../theme/themes";
import { installTerminalEnhancements } from "./terminalEnhancements";
import type { TerminalEnhancements } from "./terminalEnhancements";

const INPUT_FLUSH_DELAY = 10;
const RESIZE_DELAY = 300;
const RECONNECT_BASE_DELAY = 500;
const RECONNECT_MAX_DELAY = 10_000;
const HEARTBEAT_INTERVAL = 10_000;
const HEARTBEAT_TIMEOUT = 30_000;
const WS_FALLBACK_ATTEMPTS = 3;
const HTTP_POLL_INTERVAL = 50;
const DISCONNECT_MARKER = "[连接已断开]";

interface Props {
  session: TerminalSession;
  server: ServerConfig;
  visible: boolean;
  disconnectConnectionOnDispose: boolean;
  setStatus: (id: string, status: SessionStatus, error?: string) => void;
  setBackendSessionId: (id: string, backendSessionId?: string) => void;
  onConnected: () => void;
  onHostKeyChallenge: (challenge: sshApi.SshHostKeyStatusDTO) => void;
}

export interface TerminalViewHandle {
  clear: () => void;
  disconnect: (disconnectConnection?: boolean) => Promise<void>;
}

function responseError(info: string | undefined, fallback: string) {
  return new Error(info || fallback);
}

export const TerminalView = forwardRef<TerminalViewHandle, Props>(function TerminalView(
  {
    session,
    server,
    visible,
    disconnectConnectionOnDispose,
    setStatus,
    setBackendSessionId,
    onConnected,
    onHostKeyChallenge,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const enhancementsRef = useRef<TerminalEnhancements | null>(null);
  const backendSessionIdRef = useRef<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputBufferRef = useRef<string[]>([]);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const lifecycleRef = useRef(0);
  const disconnectConnectionOnDisposeRef = useRef(disconnectConnectionOnDispose);
  const stoppedRef = useRef(false);
  const httpFallbackRef = useRef(false);
  const manuallyDisconnectedRef = useRef(false);
  const termTokens = useThemeStore((state) => state.tokens.terminal);
  disconnectConnectionOnDisposeRef.current = disconnectConnectionOnDispose;

  const stopTimers = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    reconnectTimerRef.current = null;
    pollTimerRef.current = null;
    heartbeatTimerRef.current = null;
    inputTimerRef.current = null;
    resizeTimerRef.current = null;
    inputBufferRef.current = [];
  };

  const disconnect = async (disconnectConnection = disconnectConnectionOnDisposeRef.current) => {
    stoppedRef.current = true;
    stopTimers();
    const webSocket = webSocketRef.current;
    webSocketRef.current = null;
    if (webSocket && webSocket.readyState < WebSocket.CLOSING) {
      webSocket.close(1000, "manual disconnect");
    }

    const backendSessionId = backendSessionIdRef.current;
    recordTerminalDiagnostic({
      event: "terminal_manual_disconnect",
      frontendSessionId: session.id,
      backendSessionId: backendSessionId ?? undefined,
      details: { disconnectConnection },
    });
    backendSessionIdRef.current = null;
    setBackendSessionId(session.id, undefined);
    const closeResponse = backendSessionId
      ? await closeTerminal(backendSessionId)
      : null;
    const disconnectResponse = disconnectConnection
      ? await sshApi.disconnect(server.id)
      : null;
    manuallyDisconnectedRef.current = true;

    if (closeResponse && closeResponse.code !== "0000") {
      throw responseError(closeResponse.info, "关闭终端失败");
    }
    if (disconnectResponse && disconnectResponse.code !== "0000") {
      throw responseError(disconnectResponse.info, "断开 SSH 连接失败");
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      clear: () => termRef.current?.clear(),
      disconnect: async (disconnectConnection) => {
        try {
          await disconnect(disconnectConnection);
          setStatus(session.id, "disconnected");
          termRef.current?.write("\r\n\x1b[33m[连接已断开]\x1b[0m\r\n");
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          setStatus(session.id, "error", message);
          termRef.current?.write(`\r\n\x1b[31m断开失败: ${message}\x1b[0m\r\n`);
          throw reason;
        }
      },
    }),
    [server.id, session.id, setBackendSessionId, setStatus],
  );

  useEffect(() => {
    if (!hostRef.current) return;

    const lifecycleId = lifecycleRef.current + 1;
    lifecycleRef.current = lifecycleId;
    let disposed = false;
    const isCurrentLifecycle = () =>
      !disposed && lifecycleRef.current === lifecycleId;

    stoppedRef.current = false;
    manuallyDisconnectedRef.current = false;
    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: '\"JetBrains Mono\", \"PingFang SC\", \"Microsoft YaHei\", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: buildXtermTheme(useThemeStore.getState().tokens.terminal),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    enhancementsRef.current = installTerminalEnhancements(term);
    lastSizeRef.current = { cols: term.cols, rows: term.rows };

    const diagnostic = (
      event: string,
      details?: Record<string, string | number | boolean | null | undefined>,
    ) => {
      recordTerminalDiagnostic({
        event,
        frontendSessionId: session.id,
        backendSessionId: backendSessionIdRef.current ?? undefined,
        details,
      });
    };

    const markDisconnected = (message: string) => {
      if (stoppedRef.current) return;
      diagnostic("terminal_disconnected", { message });
      stoppedRef.current = true;
      stopTimers();
      const webSocket = webSocketRef.current;
      webSocketRef.current = null;
      if (webSocket && webSocket.readyState < WebSocket.CLOSING) {
        webSocket.close(1000, "terminal disconnected");
      }
      const backendSessionId = backendSessionIdRef.current;
      backendSessionIdRef.current = null;
      if (backendSessionId) void closeTerminal(backendSessionId);
      setBackendSessionId(session.id, undefined);
      setStatus(session.id, "disconnected");
      term.write(`\r\n\x1b[33m[${message}]\x1b[0m\r\n`);
      if (disconnectConnectionOnDisposeRef.current) void sshApi.disconnect(server.id);
    };

    let reconnectAttempt = 0;
    let lastServerSeq = 0;
    let clientSeq = 0;
    let lastReceivedAt = Date.now();
    let terminalPermanentlyClosed = false;
    let hasConnected = false;
    let httpFallback = false;
    httpFallbackRef.current = false;
    let connectSocket: () => Promise<void>;

    const startHttpFallback = () => {
      if (httpFallback || stoppedRef.current) return;
      httpFallback = true;
      httpFallbackRef.current = true;
      // HTTP 兼容模式只是传输层降级，必须等首次轮询成功后才能确认服务端仍可用。
      setStatus(session.id, "connecting");
      diagnostic("ws_fallback_http", { attempts: reconnectAttempt });
      const poll = async () => {
        if (stoppedRef.current || !httpFallback || !backendSessionIdRef.current) return;
        try {
          const response = await readOutput(backendSessionIdRef.current);
          if (response.code !== "0000") {
            markDisconnected(response.info || "服务端连接已断开");
            return;
          }
          setStatus(session.id, "connected");
          if (!hasConnected) {
            hasConnected = true;
            onConnected();
          }
          if (response.data?.output) term.write(response.data.output);
        } catch (reason) {
          diagnostic("http_poll_error", { message: reason instanceof Error ? reason.message : String(reason) });
          markDisconnected("服务端连接已断开，请重新连接");
          return;
        }
        pollTimerRef.current = setTimeout(() => void poll(), HTTP_POLL_INTERVAL);
      };
      void poll();
    };

    const scheduleReconnect = (reason: string) => {
      if (stoppedRef.current || terminalPermanentlyClosed || reconnectTimerRef.current) return;
      if (reconnectAttempt >= WS_FALLBACK_ATTEMPTS) {
        startHttpFallback();
        return;
      }
      const delay = Math.min(
        RECONNECT_BASE_DELAY * 2 ** reconnectAttempt,
        RECONNECT_MAX_DELAY,
      );
      reconnectAttempt += 1;
      setStatus(session.id, "connecting");
      diagnostic("ws_reconnect_scheduled", { attempt: reconnectAttempt, delay, reason });
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void connectSocket();
      }, delay);
    };

    connectSocket = async () => {
      const backendSessionId = backendSessionIdRef.current;
      if (!backendSessionId || stoppedRef.current) return;
      try {
        diagnostic("ws_connecting", { attempt: reconnectAttempt, resumeAfter: lastServerSeq });
        const webSocket = await createTerminalWebSocket(backendSessionId, lastServerSeq);
        if (!isCurrentLifecycle() || stoppedRef.current) {
          webSocket.close(1000, "stale lifecycle");
          return;
        }
        webSocketRef.current = webSocket;

        webSocket.onopen = () => {
          lastReceivedAt = Date.now();
          diagnostic("ws_open", { attempt: reconnectAttempt });
        };
        webSocket.onmessage = (message) => {
          if (webSocketRef.current !== webSocket || stoppedRef.current) return;
          lastReceivedAt = Date.now();
          const frame = parseTerminalServerFrame(String(message.data));
          if (!frame) {
            diagnostic("ws_invalid_server_frame");
            return;
          }

          switch (frame.type) {
            case "ready":
              reconnectAttempt = 0;
              setStatus(session.id, "connected");
              diagnostic("ws_ready", {
                serverSeq: frame.serverSeq,
                replayTruncated: frame.replayTruncated,
              });
              if (frame.replayTruncated) {
                term.write("\r\n\x1b[33m[断线期间部分历史输出已超出重放缓冲]\x1b[0m\r\n");
              }
              if (!hasConnected) {
                hasConnected = true;
                onConnected();
              }
              if (term.cols > 0 && term.rows > 0) {
                webSocket.send(terminalResizeFrame(term.cols, term.rows));
              }
              flushInput();
              term.focus();
              break;
            case "output":
              if (frame.serverSeq <= lastServerSeq) {
                webSocket.send(terminalAckFrame(lastServerSeq));
                break;
              }
              if (lastServerSeq > 0 && frame.serverSeq !== lastServerSeq + 1) {
                diagnostic("ws_output_gap", {
                  expected: lastServerSeq + 1,
                  received: frame.serverSeq,
                });
              }
              lastServerSeq = frame.serverSeq;
              if (frame.data.includes(DISCONNECT_MARKER)) {
                terminalPermanentlyClosed = true;
                markDisconnected("连接已断开");
                return;
              }
              term.write(frame.data);
              webSocket.send(terminalAckFrame(lastServerSeq));
              break;
            case "ping":
              webSocket.send(terminalHeartbeatFrame("pong", frame.timestamp));
              break;
            case "pong":
            case "input_ack":
              break;
            case "error":
              diagnostic("ws_server_error", { code: frame.code, message: frame.message });
              term.write(`\r\n\x1b[31m终端通信异常: ${frame.message}\x1b[0m\r\n`);
              break;
            case "terminal_closed":
              terminalPermanentlyClosed = true;
              markDisconnected(frame.message || "会话已失效");
              break;
          }
        };
        webSocket.onerror = () => {
          diagnostic("ws_transport_error", { readyState: webSocket.readyState });
        };
        webSocket.onclose = (event) => {
          if (webSocketRef.current !== webSocket) return;
          webSocketRef.current = null;
          diagnostic("ws_closed", {
            code: event.code,
            reason: event.reason || "none",
            clean: event.wasClean,
          });
          if (stoppedRef.current || terminalPermanentlyClosed) return;
          if (event.code === 4002) {
            terminalPermanentlyClosed = true;
            markDisconnected("会话已失效");
            return;
          }
          scheduleReconnect(`close:${event.code}`);
        };
      } catch (reason) {
        if (!isCurrentLifecycle() || stoppedRef.current) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        const code = reason instanceof TerminalWebSocketTicketError ? reason.code : "UNKNOWN";
        diagnostic("ws_ticket_error", { code, message });
        if (code === "ILLEGAL_PARAMETER") {
          terminalPermanentlyClosed = true;
          markDisconnected("会话已失效");
          return;
        }
        scheduleReconnect(`ticket:${code}`);
      }
    };

    const flushInput = async () => {
      inputTimerRef.current = null;
      const input = inputBufferRef.current.join("");
      const webSocket = webSocketRef.current;
      if (!input || stoppedRef.current) return;
      if (httpFallback) {
        inputBufferRef.current = [];
        const response = await writeInput({ sessionId: backendSessionIdRef.current!, input });
        if (response.code !== "0000") {
          inputBufferRef.current.unshift(input);
          markDisconnected(response.info || "服务端连接已断开，请重新连接");
        }
        return;
      }
      if (webSocket?.readyState !== WebSocket.OPEN) return;
      inputBufferRef.current = [];
      try {
        webSocket.send(terminalInputFrame(++clientSeq, input));
      } catch (reason) {
        inputBufferRef.current.unshift(input);
        diagnostic("ws_input_send_error", {
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    };

    const dataDisposable = term.onData((data) => {
      if (stoppedRef.current || !backendSessionIdRef.current) return;
      inputBufferRef.current.push(data);
      if (!inputTimerRef.current) {
        inputTimerRef.current = setTimeout(() => void flushInput(), INPUT_FLUSH_DELAY);
      }
    });
    const scrollDisposable = term.onScroll((line) => {
      useWorkspaceStore.getState().setTerminalViewportLine(session.id, line);
    });

    const sendResize = () => {
      resizeTimerRef.current = null;
      const webSocket = webSocketRef.current;
      if (stoppedRef.current) return;
      try {
        fit.fit();
        const nextSize = { cols: term.cols, rows: term.rows };
        if (
          nextSize.cols <= 0 ||
          nextSize.rows <= 0 ||
          (nextSize.cols === lastSizeRef.current.cols &&
            nextSize.rows === lastSizeRef.current.rows)
        ) {
          return;
        }
        lastSizeRef.current = nextSize;
        if (httpFallback) {
          void resizeTerminal({ sessionId: backendSessionIdRef.current!, ...nextSize });
        } else if (webSocket?.readyState === WebSocket.OPEN) {
          webSocket.send(terminalResizeFrame(nextSize.cols, nextSize.rows));
        }
      } catch {
        // 容器不可见时 xterm 可能无法计算尺寸。
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(sendResize, RESIZE_DELAY);
    });
    resizeObserver.observe(hostRef.current);

    const connect = async () => {
      try {
        const connectResponse = await sshApi.connect(server.id);
        if (
          (connectResponse.code === "SSH_HOST_KEY_UNTRUSTED" || connectResponse.code === "SSH_HOST_KEY_CHANGED")
          && connectResponse.data?.fingerprint
        ) {
          onHostKeyChallenge(connectResponse.data);
        }
        if (connectResponse.code !== "0000") {
          throw responseError(connectResponse.info, "SSH 连接失败");
        }
        if (!isCurrentLifecycle() || stoppedRef.current) {
          if (
            lifecycleRef.current === lifecycleId &&
            disconnectConnectionOnDisposeRef.current
          ) {
            void sshApi.disconnect(server.id);
          }
          return;
        }

        const openResponse = await openTerminal({
          connectionId: server.id,
          cols: term.cols,
          rows: term.rows,
        });
        if (openResponse.code !== "0000" || !openResponse.data) {
          throw responseError(openResponse.info, "打开终端失败");
        }
        if (!isCurrentLifecycle() || stoppedRef.current) {
          void closeTerminal(openResponse.data.sessionId);
          if (
            lifecycleRef.current === lifecycleId &&
            disconnectConnectionOnDisposeRef.current
          ) {
            void sshApi.disconnect(server.id);
          }
          return;
        }

        backendSessionIdRef.current = openResponse.data.sessionId;
        setBackendSessionId(session.id, openResponse.data.sessionId);
        if (openResponse.data.initialOutput) term.write(openResponse.data.initialOutput);
        diagnostic("terminal_opened", { connectionId: server.id });
        heartbeatTimerRef.current = setInterval(() => {
          const webSocket = webSocketRef.current;
          if (webSocket?.readyState !== WebSocket.OPEN) return;
          const silence = Date.now() - lastReceivedAt;
          if (silence >= HEARTBEAT_TIMEOUT) {
            diagnostic("ws_heartbeat_timeout", { silence });
            webSocket.close(4000, "heartbeat timeout");
            return;
          }
          webSocket.send(terminalHeartbeatFrame("ping", Date.now()));
        }, HEARTBEAT_INTERVAL);
        await connectSocket();
      } catch (reason) {
        if (!isCurrentLifecycle() || stoppedRef.current) return;
        stoppedRef.current = true;
        stopTimers();
        setBackendSessionId(session.id, undefined);
        const message = reason instanceof Error ? reason.message : String(reason);
        diagnostic("terminal_connect_error", { message });
        setStatus(session.id, "error", message);
        term.write(`\r\n\x1b[31m连接失败: ${message}\x1b[0m\r\n`);
        if (disconnectConnectionOnDisposeRef.current) void sshApi.disconnect(server.id);
      }
    };

    // 允许开发模式或热更新的同步卸载先取消本次初始化，避免重复打开同一服务端终端。
    const connectTimer = setTimeout(() => void connect(), 0);

    return () => {
      disposed = true;
      clearTimeout(connectTimer);
      stoppedRef.current = true;
      stopTimers();
      const webSocket = webSocketRef.current;
      webSocketRef.current = null;
      if (webSocket && webSocket.readyState < WebSocket.CLOSING) {
        webSocket.close(1000, "component disposed");
      }
      dataDisposable.dispose();
      scrollDisposable.dispose();
      enhancementsRef.current?.dispose();
      resizeObserver.disconnect();

      const backendSessionId = backendSessionIdRef.current;
      diagnostic("terminal_component_disposed");
      backendSessionIdRef.current = null;
      setBackendSessionId(session.id, undefined);
      if (!manuallyDisconnectedRef.current) {
        if (backendSessionId) void closeTerminal(backendSessionId);
        if (disconnectConnectionOnDisposeRef.current) void sshApi.disconnect(server.id);
      }

      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      enhancementsRef.current = null;
    };
    // TerminalView 由 session generation 的 key 控制完整重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible || !fitRef.current || !termRef.current) return;
    const term = termRef.current;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        const viewportLine =
          useWorkspaceStore.getState().workspaces[session.id]?.terminalViewportLine ?? 0;
        term.scrollToLine(viewportLine);
        const webSocket = webSocketRef.current;
        const nextSize = { cols: term.cols, rows: term.rows };
        if (
          (webSocket?.readyState === WebSocket.OPEN || httpFallbackRef.current) &&
          nextSize.cols > 0 &&
          nextSize.rows > 0 &&
          (nextSize.cols !== lastSizeRef.current.cols ||
            nextSize.rows !== lastSizeRef.current.rows)
        ) {
          lastSizeRef.current = nextSize;
          if (httpFallbackRef.current) {
            void resizeTerminal({ sessionId: backendSessionIdRef.current!, ...nextSize });
          } else {
            webSocket?.send(terminalResizeFrame(nextSize.cols, nextSize.rows));
          }
        }
        term.focus();
      } catch {
        // 容器恢复可见后的首帧可能尚未完成布局。
      }
    });
  }, [visible]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = buildXtermTheme(termTokens);
    }
  }, [termTokens]);

  useEffect(() => {
    enhancementsRef.current?.refresh();
  }, [termTokens]);

  return (
    <div
      className="terminal-view"
      style={{
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
      ref={hostRef}
    />
  );
});
