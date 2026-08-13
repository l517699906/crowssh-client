import { useState } from "react";
import { ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { ServerConfig } from "../../types";
import type { useServers } from "../../hooks/useServers";
import type { useTerminals } from "../../hooks/useTerminals";
import type { SshHostKeyStatusDTO } from "../../api/sshConnection";
import { useLayoutStore } from "../../store/layoutStore";
import { Header } from "./Header";
import { ActivityBar } from "./ActivityBar";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { Splitter } from "./Splitter";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { ServerFormDialog } from "../servers/ServerFormDialog";
import "./layout.css";
import "./workbench.css";

type Dialog = { mode: "add" } | { mode: "edit"; server: ServerConfig } | null;
type HostKeyDialog = { server: ServerConfig; sessionId: string; challenge: SshHostKeyStatusDTO } | null;

interface Props {
  servers: ReturnType<typeof useServers>;
  terminals: ReturnType<typeof useTerminals>;
}

export function AppLayout({ servers, terminals }: Props) {
  const layout = useLayoutStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [hostKeyDialog, setHostKeyDialog] = useState<HostKeyDialog>(null);
  const [trustingHostKey, setTrustingHostKey] = useState(false);
  const activeTerminal = terminals.sessions.find(
    (session) => session.id === terminals.activeId,
  );
  const activeServer = activeTerminal
    ? servers.servers.find((server) => server.id === activeTerminal.serverId)
    : undefined;

  const handleSave = async (cfg: ServerConfig | Omit<ServerConfig, "id">) => {
    return "id" in cfg ? servers.updateServer(cfg) : servers.addServer(cfg);
  };

  const handleConnect = (server: ServerConfig) => {
    terminals.openSession(server);
  };

  const handleTrustHostKey = async () => {
    if (!hostKeyDialog || trustingHostKey) return;
    setTrustingHostKey(true);
    try {
      const trusted = await servers.trustHostKey(
        hostKeyDialog.server,
        hostKeyDialog.challenge.fingerprint,
      );
      if (trusted) {
        setHostKeyDialog(null);
        const session = terminals.sessions.find((item) => item.id === hostKeyDialog.sessionId);
        if (session) terminals.reconnectSession(session.id);
      }
    } finally {
      setTrustingHostKey(false);
    }
  };

  return (
    <div className="app-layout">
      <Header terminals={terminals} onAddServer={() => setDialog({ mode: "add" })} />

      <div className="workbench" data-active-pane={layout.activePane}>
        <ActivityBar />

        {layout.leftVisible && (
          <>
            <div
              className="layout-pane layout-pane-left"
              style={{ width: layout.leftWidth, flexShrink: 0, display: "flex" }}
            >
              <LeftSidebar
                servers={servers.servers}
                onConnect={handleConnect}
                onAddServer={() => setDialog({ mode: "add" })}
                onEditServer={(s) => setDialog({ mode: "edit", server: s })}
                onRemoveServer={servers.removeServer}
                loading={servers.loading}
                error={servers.error}
                onRefreshServers={() => void servers.refresh()}
                activeServer={activeServer}
                activeSessionId={activeTerminal?.id}
              />
            </div>
            <Splitter onResize={(dx) => layout.setLeftWidth(layout.leftWidth + dx)} />
          </>
        )}

        <main
          className="terminal-region island layout-pane layout-pane-terminal"
          data-visible={layout.terminalVisible}
          style={{ display: layout.terminalVisible ? "flex" : "none" }}
        >
          <TerminalPanel
            terminals={terminals}
            servers={servers.servers}
            panelVisible={layout.terminalVisible}
            onConnectionReady={() => layout.showActivity("files")}
            onHostKeyChallenge={(server, sessionId, challenge) => setHostKeyDialog({ server, sessionId, challenge })}
          />
        </main>

        {layout.rightVisible && (
          <>
            <Splitter
              onResize={(dx) => layout.setRightWidth(layout.rightWidth - dx)}
            />
            <div
              className="layout-pane layout-pane-right"
              style={{ width: layout.rightWidth, flexShrink: 0, display: "flex" }}
            >
              <RightSidebar terminal={activeTerminal} server={activeServer} />
            </div>
          </>
        )}
      </div>

      {dialog && (
        <ServerFormDialog
          initial={dialog.mode === "edit" ? dialog.server : undefined}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      )}

      {hostKeyDialog && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="host-key-title">
            <div className="modal-header">
              <div className="modal-title" id="host-key-title">
                {hostKeyDialog.challenge.changed ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}
                确认 SSH 主机密钥
                <button
                  className="icon-btn"
                  type="button"
                  title="关闭"
                  aria-label="关闭"
                  disabled={trustingHostKey}
                  onClick={() => setHostKeyDialog(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="modal-body">
              <p>{hostKeyDialog.challenge.changed
                ? "检测到服务器指纹已变化。只有在确认服务器已更换主机密钥时才继续。"
                : "这是该保存连接首次建立会话，请核对下面的指纹后决定是否信任。"}</p>
              <p><strong>{hostKeyDialog.server.username}@{hostKeyDialog.server.host}:{hostKeyDialog.server.port}</strong></p>
              <p>算法：<code>{hostKeyDialog.challenge.algorithm}</code></p>
              <p>SHA-256：<code>{hostKeyDialog.challenge.fingerprint}</code></p>
            </div>
            <div className="modal-footer">
              <button className="btn" type="button" disabled={trustingHostKey} onClick={() => setHostKeyDialog(null)}>取消连接</button>
              <button className="btn btn-primary" type="button" disabled={trustingHostKey} onClick={() => void handleTrustHostKey()}>
                <ShieldCheck size={14} />
                {trustingHostKey ? "保存并重连中" : "信任密钥并重连"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
