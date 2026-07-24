import { useEffect, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { AuthArg, ServerConfig, SessionStatus, TerminalSession } from "../../types";
import { useThemeStore } from "../../store/themeStore";
import { buildXtermTheme } from "../../theme/themes";
import { installTerminalEnhancements } from "./terminalEnhancements";
import type { TerminalEnhancements } from "./terminalEnhancements";

interface Props {
  session: TerminalSession;
  server: ServerConfig;
  visible: boolean;
  setStatus: (id: string, status: SessionStatus, error?: string) => void;
}

function buildAuth(server: ServerConfig): AuthArg {
  return server.authType === "password"
    ? { type: "password", password: server.password ?? "" }
    : {
        type: "key",
        privateKey: server.privateKey ?? "",
        passphrase: server.passphrase,
      };
}

export function TerminalView({ session, server, visible, setStatus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const enhancementsRef = useRef<TerminalEnhancements | null>(null);
  const startedRef = useRef(false);
  const termTokens = useThemeStore((s) => s.tokens.terminal);

  useEffect(() => {
    if (startedRef.current || !hostRef.current) return;
    startedRef.current = true;

    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: '"JetBrains Mono", "PingFang SC", "Microsoft YaHei", monospace',
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
    const enhancements = installTerminalEnhancements(term);
    enhancementsRef.current = enhancements;

    // 后端 SSH 输出（原始字节 -> ArrayBuffer -> 交 xterm 解码 UTF-8）
    const onOutput = new Channel<ArrayBuffer>();
    onOutput.onmessage = (buf) => term.write(new Uint8Array(buf));

    // 键盘输入 -> 后端
    const dataDisp = term.onData((d) => {
      invoke("ssh_send_input", { sessionId: session.id, data: d }).catch(() => {});
    });

    // 尺寸同步
    const doResize = () => {
      try {
        fit.fit();
        invoke("ssh_resize", {
          sessionId: session.id,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      } catch {
        /* 容器不可见时忽略 */
      }
    };
    const ro = new ResizeObserver(doResize);
    ro.observe(hostRef.current);

    // 服务器主动关闭连接
    const unlisten = listen(`ssh://closed/${session.id}`, () => {
      setStatus(session.id, "disconnected");
      term.write("\r\n\x1b[33m[连接已关闭]\x1b[0m\r\n");
    });

    // 发起连接
    invoke("ssh_connect", {
      sessionId: session.id,
      host: server.host,
      port: server.port,
      username: server.username,
      auth: buildAuth(server),
      cols: term.cols,
      rows: term.rows,
      onOutput,
    })
      .then(() => setStatus(session.id, "connected"))
      .catch((e) => {
        setStatus(session.id, "error", String(e));
        term.write(`\r\n\x1b[31m连接失败: ${e}\x1b[0m\r\n`);
      });

    return () => {
      dataDisp.dispose();
      enhancements.dispose();
      ro.disconnect();
      unlisten.then((un) => un());
      invoke("ssh_disconnect", { sessionId: session.id }).catch(() => {});
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从隐藏切回可见时重新适配尺寸（隐藏容器尺寸为 0）
  useEffect(() => {
    if (!visible || !fitRef.current || !termRef.current) return;
    const t = termRef.current;
    const f = fitRef.current;
    requestAnimationFrame(() => {
      try {
        f.fit();
        invoke("ssh_resize", {
          sessionId: session.id,
          cols: t.cols,
          rows: t.rows,
        }).catch(() => {});
        t.focus();
      } catch {
        /* ignore */
      }
    });
  }, [visible, session.id]);

  // 主题切换 -> 刷新 xterm 配色（无需重连）
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
      style={{ display: visible ? "block" : "none" }}
      ref={hostRef}
    />
  );
}
