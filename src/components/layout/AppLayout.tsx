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
import "./workbench.css";

type Dialog = { mode: "add" } | { mode: "edit"; server: ServerConfig } | null;

interface Props {
  servers: ReturnType<typeof useServers>;
  terminals: ReturnType<typeof useTerminals>;
}

export function AppLayout({ servers, terminals }: Props) {
  const layout = useLayoutStore();
  const [dialog, setDialog] = useState<Dialog>(null);

  const handleSave = (cfg: ServerConfig | Omit<ServerConfig, "id">) => {
    if ("id" in cfg) servers.updateServer(cfg);
    else servers.addServer(cfg);
    setDialog(null);
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
                onConnect={terminals.openSession}
                onAddServer={() => setDialog({ mode: "add" })}
                onEditServer={(s) => setDialog({ mode: "edit", server: s })}
                onRemoveServer={servers.removeServer}
              />
            </div>
            <Splitter onResize={(dx) => layout.setLeftWidth(layout.leftWidth + dx)} />
          </>
        )}

        {layout.terminalVisible && (
          <main className="terminal-region island">
            <TerminalPanel terminals={terminals} servers={servers.servers} />
          </main>
        )}

        {layout.rightVisible && (
          <>
            <Splitter
              onResize={(dx) => layout.setRightWidth(layout.rightWidth - dx)}
            />
            <div
              style={{ width: layout.rightWidth, flexShrink: 0, display: "flex" }}
            >
              <RightSidebar />
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
