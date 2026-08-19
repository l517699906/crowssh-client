import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronRight,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Upload,
} from "lucide-react";
import type { ServerConfig } from "../../types";
import {
  listFiles,
  type RemoteFile,
} from "../../api/sftp";
import {
  enqueueDownloads,
  enqueueUploads,
} from "../../services/transferManager";
import {
  REMOTE_TEXT_SAVED_EVENT,
  openRemoteTextEditor,
  type RemoteTextSavedEvent,
} from "../../services/editorWindowService";
import {
  isRemoteTextFile,
  remoteTextOpenError,
} from "../../config/editorFormats";
import {
  EMPTY_WORKSPACE,
  useWorkspaceStore,
} from "../../store/workspaceStore";
import { FileContextMenu } from "./FileContextMenu";
import { FileOperationDialog } from "./FileOperationDialog";
import { useRemoteFileOperations } from "./useRemoteFileOperations";
import type { RemoteFileAction } from "./fileOperations";
import "./files.css";

interface Props {
  server?: ServerConfig;
  activeSessionId?: string;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function parentPath(path: string) {
  if (path === "/") return "/";
  const normalized = path.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function modifiedDate(modifiedAt: number) {
  if (!Number.isFinite(modifiedAt) || modifiedAt <= 0) return null;
  const milliseconds = modifiedAt < 10_000_000_000 ? modifiedAt * 1_000 : modifiedAt;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

const modifiedTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatModifiedTime(modifiedAt: number) {
  const date = modifiedDate(modifiedAt);
  return date ? modifiedTimeFormatter.format(date).replace(/\//g, "-") : "时间未知";
}

export function FilesView({ server, activeSessionId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    file: RemoteFile;
    target: "entry" | "directory";
    x: number;
    y: number;
  } | null>(null);
  const connectionId = server?.id;
  const workspace = useWorkspaceStore(
    useShallow((state) => {
      const current = activeSessionId
        ? state.workspaces[activeSessionId]
        : undefined;
      const value = current ?? EMPTY_WORKSPACE;
      return {
        fileConnectionId: value.fileConnectionId,
        path: value.path,
        pathInput: value.pathInput,
        files: value.files,
        loading: value.loading,
        initialized: value.initialized,
        error: value.error,
      };
    }),
  );
  const {
    fileConnectionId,
    path,
    pathInput,
    files,
    loading,
    initialized,
    error,
  } = workspace;
  const viewScopeKey = `${activeSessionId ?? ""}\0${connectionId ?? ""}`;
  const viewScopeKeyRef = useRef(viewScopeKey);
  viewScopeKeyRef.current = viewScopeKey;

  const loadDirectory = useCallback(
    async (nextPath?: string) => {
      if (!connectionId || !activeSessionId) return;
      const requestScope = viewScopeKey;
      if (viewScopeKeyRef.current !== requestScope) return;
      const store = useWorkspaceStore.getState();
      const requestId = store.beginFileRequest(activeSessionId, connectionId);
      try {
        const response = await listFiles(connectionId, nextPath);
        if (viewScopeKeyRef.current !== requestScope) return;
        const current = useWorkspaceStore.getState().workspaces[activeSessionId];
        if (!current || current.requestId !== requestId) return;
        if (response.code !== "0000" || !response.data) {
          useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
            loading: false,
            error: response.info || "读取远程目录失败",
          });
          return;
        }
        const keepScrollPosition = response.data.path === current.path;
        useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
          path: response.data.path,
          pathInput: response.data.path,
          files: response.data.files,
          loading: false,
          error: null,
          fileScrollTop: keepScrollPosition ? current.fileScrollTop : 0,
        });
      } catch (reason) {
        if (viewScopeKeyRef.current !== requestScope) return;
        const current = useWorkspaceStore.getState().workspaces[activeSessionId];
        if (!current || current.requestId !== requestId) return;
        useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
          loading: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    },
    [activeSessionId, connectionId, viewScopeKey],
  );

  useEffect(() => {
    if (connectionId
        && activeSessionId
        && (!initialized || fileConnectionId !== connectionId)) {
      void loadDirectory();
    }
  }, [activeSessionId, connectionId, fileConnectionId, initialized, loadDirectory]);

  useEffect(() => {
    if (!activeSessionId || !fileListRef.current) return;
    const saved = useWorkspaceStore.getState().workspaces[activeSessionId];
    fileListRef.current.scrollTop = saved?.fileScrollTop ?? 0;
  }, [activeSessionId, files]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen<RemoteTextSavedEvent>(
        REMOTE_TEXT_SAVED_EVENT,
        ({ payload }) => {
          if (payload.connectionId !== connectionId) return;
          if (parentPath(payload.path) !== path) return;
          void loadDirectory(path);
        },
      ))
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {
        // 浏览器预览环境没有 Tauri 事件通道，不影响编辑器窗口使用。
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [connectionId, loadDirectory, path]);

  const handleUpload = (fileList?: FileList | null) => {
    if (!server || !activeSessionId || !fileList?.length || !path) return;
    useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
      error: null,
    });
    enqueueUploads(
      {
        sessionId: activeSessionId,
        connectionId: server.id,
        serverName: server.name || `${server.username}@${server.host}`,
      },
      path,
      Array.from(fileList),
      () => {
        const currentWorkspace =
          useWorkspaceStore.getState().workspaces[activeSessionId];
        if (!currentWorkspace
            || currentWorkspace.fileConnectionId !== server.id
            || currentWorkspace.path !== path) return;
        void loadDirectory(path);
      },
    );
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDownload = useCallback((file: RemoteFile) => {
    if (!server || !activeSessionId) return;
    useWorkspaceStore.getState().updateWorkspace(activeSessionId, { error: null });
    enqueueDownloads(
      {
        sessionId: activeSessionId,
        connectionId: server.id,
        serverName: server.name || `${server.username}@${server.host}`,
      },
      [file],
    );
  }, [activeSessionId, server]);

  const handleOpenTextFile = useCallback(async (file: RemoteFile) => {
    if (!server || !activeSessionId) return;
    const editorScope = `${activeSessionId}\0${server.id}\0${path}`;
    const reason = remoteTextOpenError(file);
    if (reason) {
      useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
        error: reason,
      });
      return;
    }

    useWorkspaceStore.getState().updateWorkspace(activeSessionId, { error: null });
    try {
      await openRemoteTextEditor({
        connectionId: server.id,
        path: file.path,
        fileName: file.name,
        serverName: server.name || `${server.username}@${server.host}`,
      });
    } catch (reason) {
      const current = useWorkspaceStore.getState().workspaces[activeSessionId];
      const currentScope = current
        ? `${activeSessionId}\0${current.fileConnectionId ?? ""}\0${current.path}`
        : "";
      if (currentScope !== editorScope || viewScopeKeyRef.current !== viewScopeKey) return;
      useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }, [activeSessionId, path, server, viewScopeKey]);

  const setOperationError = useCallback((message: string | null) => {
    if (!activeSessionId) return;
    useWorkspaceStore.getState().updateWorkspace(activeSessionId, { error: message });
  }, [activeSessionId]);

  const refreshCurrentDirectory = useCallback(
    () => loadDirectory(path),
    [loadDirectory, path],
  );

  const fileOperations = useRemoteFileOperations({
    scopeId: activeSessionId,
    connectionId,
    currentPath: path,
    onRefresh: refreshCurrentDirectory,
    onDownload: handleDownload,
    onEdit: handleOpenTextFile,
    onError: setOperationError,
  });

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const handleDirectoryContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (!path || loading) {
        setContextMenu(null);
        return;
      }

      setContextMenu({
        file: {
          name: path,
          path,
          directory: true,
          size: 0,
          modifiedAt: 0,
        },
        target: "directory",
        x: event.clientX,
        y: event.clientY,
      });
    },
    [loading, path],
  );
  const handleContextAction = useCallback((action: RemoteFileAction) => {
    const file = contextMenu?.file;
    setContextMenu(null);
    if (file) void fileOperations.openAction(file, action);
  }, [contextMenu, fileOperations.openAction]);

  useEffect(() => {
    setContextMenu(null);
  }, [activeSessionId, connectionId, path]);

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <FolderOpen size={14} /> 远程文件
        </span>
        <div className="panel-actions">
          <input
            ref={inputRef}
            className="file-upload-input"
            type="file"
            multiple
            onChange={(event) => handleUpload(event.target.files)}
          />
          <button
            className="icon-btn"
            type="button"
            title="上传文件"
            disabled={!server || !path || loading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={15} />
          </button>
          <button
            className="icon-btn"
            type="button"
            title="刷新目录"
            disabled={!server || loading}
            onClick={() => void loadDirectory(path)}
          >
            <RefreshCw size={15} className={loading ? "spin" : undefined} />
          </button>
        </div>
      </div>

      {!server ? (
        <div className="empty-state">
          <Folder size={28} strokeWidth={1.5} />
          <div className="empty-title">未连接服务器</div>
          <div className="empty-hint">建立 SSH 连接后将自动打开远程目录</div>
        </div>
      ) : (
        <>
          <div className="file-server" title={`${server.username}@${server.host}`}>
            {server.name}
          </div>
          <div className="file-pathbar">
            <button
              className="file-path-up"
              type="button"
              title="返回上级目录"
              disabled={!path || path === "/" || loading}
              onClick={() => void loadDirectory(parentPath(path))}
            >
              <ChevronRight size={14} />
            </button>
            <input
              className="file-path-input"
              type="text"
              aria-label="远程目录路径"
              title="输入远程目录路径，按 Enter 跳转"
              placeholder="正在读取主目录..."
              value={pathInput}
              spellCheck={false}
              onChange={(event) => {
                if (!activeSessionId) return;
                useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
                  pathInput: event.target.value,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const nextPath = pathInput.trim();
                  if (nextPath) void loadDirectory(nextPath);
                } else if (event.key === "Escape") {
                  if (activeSessionId) {
                    useWorkspaceStore.getState().updateWorkspace(activeSessionId, {
                      pathInput: path,
                    });
                  }
                  event.currentTarget.blur();
                }
              }}
            />
          </div>

          {error && <div className="file-error" role="alert">{error}</div>}
          {fileOperations.notice && (
            <div className="file-notice" role="status">{fileOperations.notice}</div>
          )}

          {loading && files.length === 0 ? (
            <div className="empty-state" onContextMenu={handleDirectoryContextMenu}>
              <LoaderCircle size={28} strokeWidth={1.5} className="spin" />
              <div className="empty-title">正在读取远程目录</div>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state" onContextMenu={handleDirectoryContextMenu}>
              <Folder size={28} strokeWidth={1.5} />
              <div className="empty-title">目录为空</div>
            </div>
          ) : (
            <div
              ref={fileListRef}
              className="file-list"
              role="list"
              aria-busy={loading}
              onContextMenu={handleDirectoryContextMenu}
              onScroll={(event) => {
                if (!activeSessionId) return;
                useWorkspaceStore
                  .getState()
                  .setFileScrollTop(activeSessionId, event.currentTarget.scrollTop);
              }}
            >
              {files.map((file) => {
                const editable = isRemoteTextFile(file);
                const date = modifiedDate(file.modifiedAt);
                const formattedModifiedTime = formatModifiedTime(file.modifiedAt);
                const openEntry = () => {
                  if (file.directory) void loadDirectory(file.path);
                  else if (editable) void handleOpenTextFile(file);
                };
                return (
                  <div
                    key={file.path}
                    className={`file-item${file.directory ? " directory" : ""}${editable ? " editable" : ""}${(contextMenu?.target === "entry" && contextMenu.file.path === file.path) || fileOperations.dialog?.file.path === file.path ? " context-target" : ""}`}
                    role="listitem"
                    tabIndex={0}
                    aria-haspopup="menu"
                    title={file.directory ? `${file.path}\n双击打开目录` : editable ? `${file.path}\n双击在新窗口编辑` : file.path}
                    onDoubleClick={openEntry}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({
                        file,
                        target: "entry",
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        openEntry();
                      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setContextMenu({
                          file,
                          target: "entry",
                          x: bounds.left + 28,
                          y: bounds.top + 24,
                        });
                      }
                    }}
                  >
                    {file.directory ? (
                      <Folder size={16} />
                    ) : editable ? (
                      <FileCode2 size={16} />
                    ) : (
                      <File size={16} />
                    )}
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">
                        <span>{file.directory ? "文件夹" : formatSize(file.size)}</span>
                        <time
                          className="file-modified"
                          dateTime={date?.toISOString()}
                          title={`最近修改：${formattedModifiedTime}`}
                        >
                          {formattedModifiedTime}
                        </time>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {contextMenu && (
        <FileContextMenu
          file={contextMenu.file}
          target={contextMenu.target}
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextAction}
          onClose={closeContextMenu}
        />
      )}

      {fileOperations.dialog && (
        <FileOperationDialog
          key={`${fileOperations.dialog.action}:${fileOperations.dialog.file.path}`}
          action={fileOperations.dialog.action}
          file={fileOperations.dialog.file}
          basePath={fileOperations.dialog.basePath}
          busy={fileOperations.busy}
          error={fileOperations.dialogError}
          onClose={fileOperations.closeDialog}
          onSubmit={(value) => void fileOperations.submitDialog(value)}
        />
      )}
    </>
  );
}
