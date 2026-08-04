import { useState } from "react";
import { LoaderCircle, Pencil, Server, Trash2, X } from "lucide-react";
import type { ServerConfig } from "../../types";

interface Props {
  servers: ServerConfig[];
  onConnect: (s: ServerConfig) => void;
  onEdit: (s: ServerConfig) => void;
  onRemove: (id: string) => Promise<boolean>;
}

export function ServerList({ servers, onConnect, onEdit, onRemove }: Props) {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServerConfig | null>(null);

  const handleRemove = async (server: ServerConfig) => {
    if (deletingServerId) return;

    setDeletingServerId(server.id);
    try {
      const removed = await onRemove(server.id);
      if (removed) {
        setSelectedServerId((current) => (current === server.id ? null : current));
      }
    } finally {
      setDeletingServerId((current) => (current === server.id ? null : current));
      setPendingDelete((current) => (current?.id === server.id ? null : current));
    }
  };

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
              title={deletingServerId === s.id ? "删除中" : "删除"}
              disabled={deletingServerId !== null}
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(s);
              }}
            >
              {deletingServerId === s.id ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
        </div>
      ))}

      {pendingDelete && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (!deletingServerId) setPendingDelete(null);
          }}
        >
          <div
            className="modal-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-server-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" id="delete-server-title">确认删除服务器</div>
              <button
                className="icon-btn"
                type="button"
                title="关闭"
                aria-label="关闭"
                disabled={deletingServerId !== null}
                onClick={() => setPendingDelete(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              确认删除 SSH 连接“{pendingDelete.name}”吗？
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                disabled={deletingServerId !== null}
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={deletingServerId !== null}
                onClick={() => void handleRemove(pendingDelete)}
              >
                {deletingServerId === pendingDelete.id ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                {deletingServerId === pendingDelete.id ? "删除中" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
