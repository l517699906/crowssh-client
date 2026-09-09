import { lazy, Suspense, useEffect, useState } from "react";
import { Database, TerminalSquare, ShieldCheck, TriangleAlert, X } from "lucide-react";
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
import { useDbConnections } from "../../hooks/useDbConnections";
import { useDbSessions } from "../../hooks/useDbSessions";
import { useWorkbenchStore } from "../../store/workbenchStore";
import type { DbConnectionConfig } from "../../types/database";
import { DatabaseView } from "../database/DatabaseView";
import { DbConnectionFormDialog } from "../database/DbConnectionFormDialog";
import "../database/database.css";
import "./layout.css";
import "./workbench.css";

type Dialog = { mode: "add" } | { mode: "edit"; server: ServerConfig } | null;
type HostKeyDialog = { server: ServerConfig; sessionId: string; challenge: SshHostKeyStatusDTO } | null;
const SqlConsoleView = lazy(() => import("../database/SqlConsoleView").then((module) => ({ default: module.SqlConsoleView })));

interface Props {
  servers: ReturnType<typeof useServers>;
  terminals: ReturnType<typeof useTerminals>;
}

export function AppLayout({ servers, terminals }: Props) {
  const layout = useLayoutStore();
  const dbConnections = useDbConnections();
  const dbSessions = useDbSessions();
  const workbench = useWorkbenchStore();
  const [dbDialog, setDbDialog] = useState<{ initial?: DbConnectionConfig } | null>(null);
  const [deleteDb, setDeleteDb] = useState<DbConnectionConfig | null>(null);
  const [closeDb, setCloseDb] = useState<string | null>(null);
  const [dbMutationPending, setDbMutationPending] = useState(false);
  const activeDb = workbench.activeId ? dbSessions.workspaces[workbench.activeId] : undefined;
  useEffect(() => {
    if (!Object.keys(dbSessions.workspaces).length) return;
    const timer = setInterval(() => { void dbSessions.refresh(); }, 15000);
    const refresh = () => { void dbSessions.refresh(); };
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [Object.keys(dbSessions.workspaces).length, dbSessions.refresh]);
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
              {layout.activeView === "databases" ? <div className="left-sidebar island"><DatabaseView
                connections={dbConnections} sessions={dbSessions} activeId={workbench.activeId}
                onAdd={() => setDbDialog({})} onEdit={(initial) => setDbDialog({ initial })} onDelete={setDeleteDb}
              /></div> : <LeftSidebar
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
              />}
            </div>
            <Splitter onResize={(dx) => layout.setLeftWidth(layout.leftWidth + dx)} />
          </>
        )}

        <main
          className="terminal-region island layout-pane layout-pane-terminal"
          data-visible={layout.terminalVisible}
          style={{ display: layout.terminalVisible ? "flex" : "none" }}
        >
          {workbench.tabs.length > 0 && <div className="db-workbench-tabs" role="tablist" aria-label="工作台标签">
            {workbench.tabs.map((tab) => {
              const terminal = terminals.sessions.find((item) => item.id === tab.id);
              const database = dbSessions.workspaces[tab.id];
              const connection = dbConnections.connections.find((item) => item.connectionId === database?.session.connectionId);
              const title = tab.kind === "terminal" ? terminal?.title ?? "终端" : connection?.connectionName ?? "SQL 控制台";
              return <div key={tab.id} className={`db-workbench-tab${tab.id === workbench.activeId ? ' active' : ''}`}>
                <button role="tab" aria-selected={tab.id === workbench.activeId} onClick={() => workbench.activate(tab.id)}>{tab.kind === 'sql' ? <Database size={14} /> : <TerminalSquare size={14} />}{title}</button>
                <button aria-label={`关闭 ${title}`} onClick={() => {
                  if (tab.kind === 'terminal') terminals.closeSession(tab.id);
                  else if (database?.session.transactionState !== 'IDLE' || database.session.lifecycleStatus === 'CLOSING') setCloseDb(tab.id);
                  else void dbSessions.closeSession(tab.id);
                }}><X size={13} /></button>
              </div>;
            })}
          </div>}
          <div className="db-workbench-content" style={{ display: activeDb ? 'none' : 'flex' }}><TerminalPanel
            terminals={terminals}
            servers={servers.servers}
            panelVisible={layout.terminalVisible && !activeDb}
            showTabs={false}
            onConnectionReady={() => layout.showActivity("files")}
            onHostKeyChallenge={(server, sessionId, challenge) => setHostKeyDialog({ server, sessionId, challenge })}
          /></div>
          {Object.keys(dbSessions.workspaces).map((id) => <div key={id} className="db-workbench-content" style={{ display: workbench.activeId === id ? 'flex' : 'none' }}>
            <Suspense fallback={<p className="db-message">加载 SQL 编辑器…</p>}><SqlConsoleView sessionId={id} refresh={dbSessions.refresh} /></Suspense>
          </div>)}
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
              <RightSidebar target={activeDb ? { kind: "sql", dbSession: activeDb.session, dbConnection: dbConnections.connections.find((item) => item.connectionId === activeDb.session.connectionId) } : activeTerminal ? { kind: "terminal", terminal: activeTerminal, server: activeServer } : undefined} />
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

      {dbDialog && <DbConnectionFormDialog initial={dbDialog.initial} servers={servers.servers} onClose={() => setDbDialog(null)} onSave={async (payload) => {
        const error = await dbConnections.save(payload);
        if (!error) await dbSessions.refresh();
        return error;
      }} />}
      {(deleteDb || closeDb) && <div className="modal-overlay"><div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="db-close-title">
        <div className="modal-header"><strong id="db-close-title">{deleteDb ? `删除连接 ${deleteDb.connectionName}` : '关闭数据库工作台'}</strong></div>
        <div className="modal-body"><p>{deleteDb ? '删除连接将使相关工作台和审批失效。' : '工作台可能存在未提交事务，关闭时将尝试回滚。连接故障或已隐式提交的修改无法保证回滚。'}</p><p>执行结果未确认时，请先核查数据库实际状态。</p>{dbConnections.error && <p role="alert">{dbConnections.error}</p>}</div>
        <div className="modal-footer"><button className="btn" disabled={dbMutationPending} onClick={() => { setDeleteDb(null); setCloseDb(null); }}>取消</button><button className="btn btn-primary" disabled={dbMutationPending} onClick={async () => {
          setDbMutationPending(true);
          try {
            const ok = deleteDb ? await dbConnections.remove(deleteDb.connectionId) : await dbSessions.closeSession(closeDb!);
            if (ok) { setDeleteDb(null); setCloseDb(null); await dbSessions.refresh(); }
          } finally { setDbMutationPending(false); }
        }}>确认{deleteDb ? '删除' : '关闭'}</button></div>
      </div></div>}

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
