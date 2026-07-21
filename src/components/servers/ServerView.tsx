import { Plus, Server } from "lucide-react";
import type { ServerConfig } from "../../types";
import { ServerList } from "./ServerList";
import "./servers.css";

interface Props {
  servers: ServerConfig[];
  onConnect: (server: ServerConfig) => void;
  onAdd: () => void;
  onEdit: (server: ServerConfig) => void;
  onRemove: (id: string) => void;
}

export function ServerView({ servers, onConnect, onAdd, onEdit, onRemove }: Props) {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Server size={14} /> 服务器
        </span>
        <button className="icon-btn" title="新建服务器" onClick={onAdd}>
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
          onEdit={onEdit}
          onRemove={onRemove}
        />
      )}
    </>
  );
}
