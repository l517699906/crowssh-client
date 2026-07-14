import { useState } from "react";
import { Plus, Server } from "lucide-react";
import type { ServerConfig } from "../../types";
import { ServerList } from "./ServerList";
import { ServerFormDialog } from "./ServerFormDialog";
import "./servers.css";

type DialogState =
  | { mode: "add" }
  | { mode: "edit"; server: ServerConfig }
  | null;

interface Props {
  servers: ServerConfig[];
  addServer: (cfg: Omit<ServerConfig, "id">) => ServerConfig;
  updateServer: (cfg: ServerConfig) => void;
  removeServer: (id: string) => void;
  onConnect: (server: ServerConfig) => void;
}

export function ServerPanel({
  servers,
  addServer,
  updateServer,
  removeServer,
  onConnect,
}: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const handleSave = (cfg: ServerConfig | Omit<ServerConfig, "id">) => {
    if ("id" in cfg) updateServer(cfg);
    else addServer(cfg);
    setDialog(null);
  };

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Server size={14} /> 服务器
        </span>
        <button
          className="icon-btn"
          title="新建服务器"
          onClick={() => setDialog({ mode: "add" })}
        >
          <Plus size={18} />
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="empty-state">
          <Server size={28} strokeWidth={1.5} />
          <div className="empty-title">还没有服务器</div>
          <div className="empty-hint">点击右上角 + 添加一个 SSH 连接</div>
        </div>
      ) : (
        <ServerList
          servers={servers}
          onConnect={onConnect}
          onEdit={(s) => setDialog({ mode: "edit", server: s })}
          onRemove={removeServer}
        />
      )}

      {dialog && (
        <ServerFormDialog
          initial={dialog.mode === "edit" ? dialog.server : undefined}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
