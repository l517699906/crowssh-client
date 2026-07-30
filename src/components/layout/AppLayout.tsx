import { useState } from "react";
import type { ServerConfig } from "../../types";
import type { useServers } from "../../hooks/useServers";
import type { useTerminals } from "../../hooks/useTerminals";
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

interface Props {
  servers: ReturnType<typeof useServers>;
  terminals: ReturnType<typeof useTerminals>;
}

export function AppLayout({ servers, terminals }: Props) {
  const layout = useLayoutStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const activeTerminal = terminals.sessions.find(
    (session) => session.id === terminals.activeId && session.status === "connected",
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

  return (
    <div className="app-layout">
      <Header terminals={terminals} onAddServer={() => setDialog({ mode: "add" })} />

      <div className="workbench">
        <ActivityBar />

        {layout.leftVisible && (
          <>
            <div
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
          className="terminal-region island"
          style={{ display: layout.terminalVisible ? "flex" : "none" }}
        >
          <TerminalPanel
            terminals={terminals}
            servers={servers.servers}
            panelVisible={layout.terminalVisible}
            onConnectionReady={() => layout.showActivity("files")}
          />
        </main>

        {layout.rightVisible && (
          <>
            <Splitter
              onResize={(dx) => layout.setRightWidth(layout.rightWidth - dx)}
            />
            <div
              style={{ width: layout.rightWidth, flexShrink: 0, display: "flex" }}
            >
              <RightSidebar terminal={activeTerminal} />
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
    </div>
  );
}
