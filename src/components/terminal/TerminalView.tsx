import { useEffect, useRef } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { AuthArg, ServerConfig, SessionStatus, TerminalSession } from "../../types";

interface Props {
  session: TerminalSession;
  server: ServerConfig;
  visible: boolean;
  setStatus: (id: string, status: SessionStatus, error?: string) => void;
}

const TERMINAL_THEME = {
  background: "#191a1c",
  foreground: "#dfe1e5",
  cursor: "#dfe1e5",
  cursorAccent: "#191a1c",
  selectionBackground: "#2e436e",
  black: "#3f4451",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#abb2bf",
  brightBlack: "#4b5263",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#dfe1e5",
};

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
  const startedRef = useRef(false); // 防 React StrictMode 开发期双连接

  useEffect(() => {
    if (startedRef.current || !hostRef.current) return;
    startedRef.current = true;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

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

  return (
    <div
      className="terminal-view"
      style={{ display: visible ? "block" : "none" }}
      ref={hostRef}
    />
  );
}
