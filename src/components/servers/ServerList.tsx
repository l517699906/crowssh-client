import { useState } from "react";
import { Pencil, Server, Trash2 } from "lucide-react";
import type { ServerConfig } from "../../types";

interface Props {
  servers: ServerConfig[];
  onConnect: (s: ServerConfig) => void;
  onEdit: (s: ServerConfig) => void;
  onRemove: (id: string) => Promise<boolean>;
}

export function ServerList({ servers, onConnect, onEdit, onRemove }: Props) {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  return (
    <div className="server-list">
      {servers.map((s) => (
        <div
          key={s.id}
          className={`server-item${selectedServerId === s.id ? " selected" : ""}`}
          onClick={() => setSelectedServerId(s.id)}
          onDoubleClick={() => onConnect(s)}
          title="双击连接"
        >
          <Server size={16} className="server-item-icon" />
          <div className="server-info">
            <div className="server-name">{s.name}</div>
            <div className="server-addr">
              {s.username}@{s.host}:{s.port}
            </div>
          </div>
          <div
            className="server-actions"
            onDoubleClick={(e) => e.stopPropagation()}
          >
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
                if (window.confirm(`确认删除 SSH 连接“${s.name}”吗？`)) {
                  void onRemove(s.id);
                }
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
