import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as sshApi from "../../api/sshConnection";
import {
  closeTerminal,
  openTerminal,
  readOutput,
  resizeTerminal,
  writeInput,
} from "../../api/terminal";
import type { ServerConfig, SessionStatus, TerminalSession } from "../../types";
import { useThemeStore } from "../../store/themeStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { buildXtermTheme } from "../../theme/themes";
import { installTerminalEnhancements } from "./terminalEnhancements";
import type { TerminalEnhancements } from "./terminalEnhancements";

const POLL_INTERVAL = 50;
const POLL_ERROR_THRESHOLD = 3;
const INPUT_FLUSH_DELAY = 10;
const RESIZE_DELAY = 300;
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
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputBufferRef = useRef<string[]>([]);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const lifecycleRef = useRef(0);
  const disconnectConnectionOnDisposeRef = useRef(disconnectConnectionOnDispose);
  const stoppedRef = useRef(false);
  const manuallyDisconnectedRef = useRef(false);
  const termTokens = useThemeStore((state) => state.tokens.terminal);
  disconnectConnectionOnDisposeRef.current = disconnectConnectionOnDispose;

  const stopTimers = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    pollTimerRef.current = null;
    inputTimerRef.current = null;
    resizeTimerRef.current = null;
    inputBufferRef.current = [];
  };

  const disconnect = async (disconnectConnection = disconnectConnectionOnDisposeRef.current) => {
    stoppedRef.current = true;
    stopTimers();

    const backendSessionId = backendSessionIdRef.current;
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

    const markDisconnected = (message: string) => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      stopTimers();
      setBackendSessionId(session.id, undefined);
      setStatus(session.id, "disconnected");
      term.write(`\r\n\x1b[33m[${message}]\x1b[0m\r\n`);
      if (disconnectConnectionOnDisposeRef.current) void sshApi.disconnect(server.id);
    };

    let pollErrors = 0;
    const poll = async () => {
      if (stoppedRef.current || !backendSessionIdRef.current) return;
      const response = await readOutput(backendSessionIdRef.current);
      if (stoppedRef.current) return;

      if (response.code === "0000") {
        pollErrors = 0;
        const output = response.data?.output;
        if (output?.includes(DISCONNECT_MARKER)) {
          markDisconnected("连接已断开");
          return;
        }
        if (output) term.write(output);
      } else if (
        response.code === "ILLEGAL_PARAMETER" &&
        response.info?.includes("不存在")
      ) {
        markDisconnected("会话已失效");
        return;
      } else {
        pollErrors += 1;
        if (pollErrors >= POLL_ERROR_THRESHOLD) {
          markDisconnected(response.code === "NETWORK_ERROR" ? "网络异常" : "连接异常");
          return;
        }
      }

      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
    };

    const flushInput = async () => {
      inputTimerRef.current = null;
      const input = inputBufferRef.current.join("");
      inputBufferRef.current = [];
      const backendSessionId = backendSessionIdRef.current;
      if (!input || !backendSessionId || stoppedRef.current) return;

      const response = await writeInput({ sessionId: backendSessionId, input });
      if (response.code !== "0000" && !stoppedRef.current) {
        term.write(`\r\n\x1b[31m输入发送失败: ${response.info || "未知错误"}\x1b[0m\r\n`);
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
      const backendSessionId = backendSessionIdRef.current;
      if (!backendSessionId || stoppedRef.current) return;
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
        void resizeTerminal({ sessionId: backendSessionId, ...nextSize });
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
        setStatus(session.id, "connected");
        onConnected();
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
        term.focus();
      } catch (reason) {
        if (!isCurrentLifecycle() || stoppedRef.current) return;
        stoppedRef.current = true;
        stopTimers();
        setBackendSessionId(session.id, undefined);
        const message = reason instanceof Error ? reason.message : String(reason);
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
      dataDisposable.dispose();
      scrollDisposable.dispose();
      enhancementsRef.current?.dispose();
      resizeObserver.disconnect();

      const backendSessionId = backendSessionIdRef.current;
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
        const backendSessionId = backendSessionIdRef.current;
        const nextSize = { cols: term.cols, rows: term.rows };
        if (
          backendSessionId &&
          nextSize.cols > 0 &&
          nextSize.rows > 0 &&
          (nextSize.cols !== lastSizeRef.current.cols ||
            nextSize.rows !== lastSizeRef.current.rows)
        ) {
          lastSizeRef.current = nextSize;
          void resizeTerminal({ sessionId: backendSessionId, ...nextSize });
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
