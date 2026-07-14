import { Pencil, Server, Trash2 } from "lucide-react";
import type { ServerConfig } from "../../types";

interface Props {
  servers: ServerConfig[];
  onConnect: (s: ServerConfig) => void;
  onEdit: (s: ServerConfig) => void;
  onRemove: (id: string) => void;
}

export function ServerList({ servers, onConnect, onEdit, onRemove }: Props) {
  return (
    <div className="server-list">
      {servers.map((s) => (
        <div
          key={s.id}
          className="server-item"
          onClick={() => onConnect(s)}
          title="点击连接"
        >
          <Server size={16} className="server-item-icon" />
          <div className="server-info">
            <div className="server-name">{s.name}</div>
            <div className="server-addr">
              {s.username}@{s.host}:{s.port}
            </div>
          </div>
          <div className="server-actions">
            <button
              className="icon-btn"
              title="编辑"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(s);
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              className="icon-btn danger"
              title="删除"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(s.id);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
