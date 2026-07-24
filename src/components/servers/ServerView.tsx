import { LoaderCircle, Plus, RefreshCw, Server } from "lucide-react";
import type { ServerConfig } from "../../types";
import { ServerList } from "./ServerList";
import "./servers.css";

interface Props {
  servers: ServerConfig[];
  onConnect: (server: ServerConfig) => void;
  onAdd: () => void;
  onEdit: (server: ServerConfig) => void;
  onRemove: (id: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function ServerView({ servers, onConnect, onAdd, onEdit, onRemove, loading, error, onRefresh }: Props) {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Server size={14} /> 服务器
        </span>
        <div className="panel-actions">
          <button className="icon-btn" title="刷新连接列表" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : undefined} />
          </button>
          <button className="icon-btn" title="新建服务器" onClick={onAdd}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      {error && <div className="server-error" role="alert">{error}</div>}

      {loading && servers.length === 0 ? (
        <div className="empty-state">
          <LoaderCircle size={28} strokeWidth={1.5} className="spin" />
          <div className="empty-title">正在读取连接列表</div>
        </div>
      ) : servers.length === 0 ? (
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
