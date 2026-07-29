import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  File,
  Folder,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Upload,
} from "lucide-react";
import type { ServerConfig } from "../../types";
import {
  downloadFile,
  listFiles,
  uploadFile,
  type RemoteFile,
} from "../../api/sftp";
import "./files.css";

interface Props {
  server?: ServerConfig;
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

export function FilesView({ server }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [path, setPath] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = async (nextPath?: string) => {
    if (!server) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);
    const response = await listFiles(server.id, nextPath);
    if (requestRef.current !== requestId) return;
    setLoading(false);
    if (response.code !== "0000" || !response.data) {
      setError(response.info || "读取远程目录失败");
      return;
    }
    setPath(response.data.path);
    setPathInput(response.data.path);
    setFiles(response.data.files);
  };

  useEffect(() => {
    setPath("");
    setPathInput("");
    setFiles([]);
    setError(null);
    if (server) void loadDirectory();
    return () => {
      requestRef.current += 1;
    };
    // 切换服务器时从该用户的远程主目录重新加载。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id]);

  const handleUpload = async (file?: File) => {
    if (!server || !file || !path) return;
    setTransferring(true);
    setError(null);
    try {
      await uploadFile(server.id, path, file);
      await loadDirectory(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTransferring(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = (file: RemoteFile) => {
    if (!server) return;
    setError(null);
    downloadFile(server.id, file);
  };

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
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
          <button
            className="icon-btn"
            type="button"
            title="上传文件"
            disabled={!server || !path || transferring}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={15} />
          </button>
          <button
            className="icon-btn"
            type="button"
            title="刷新目录"
            disabled={!server || loading || transferring}
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
              onChange={(event) => setPathInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const nextPath = pathInput.trim();
                  if (nextPath) void loadDirectory(nextPath);
                } else if (event.key === "Escape") {
                  setPathInput(path);
                  event.currentTarget.blur();
                }
              }}
            />
          </div>

          {error && <div className="file-error" role="alert">{error}</div>}

          {loading && files.length === 0 ? (
            <div className="empty-state">
              <LoaderCircle size={28} strokeWidth={1.5} className="spin" />
              <div className="empty-title">正在读取远程目录</div>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <Folder size={28} strokeWidth={1.5} />
              <div className="empty-title">目录为空</div>
            </div>
          ) : (
            <div className="file-list" aria-busy={loading || transferring}>
              {files.map((file) => (
                <div
                  key={file.path}
                  className={`file-item${file.directory ? " directory" : ""}`}
                  title={file.path}
                  onDoubleClick={() => {
                    if (file.directory) void loadDirectory(file.path);
                  }}
                >
                  {file.directory ? <Folder size={16} /> : <File size={16} />}
                  <div className="file-info">
                    <div className="file-name">{file.name}</div>
                    {!file.directory && (
                      <div className="file-size">{formatSize(file.size)}</div>
                    )}
                  </div>
                  {file.directory ? (
                    <button
                      className="file-row-action"
                      type="button"
                      title="打开目录"
                      onClick={() => void loadDirectory(file.path)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button
                      className="file-row-action"
                      type="button"
                      title={`下载 ${file.name}`}
                      disabled={transferring}
                      onClick={() => handleDownload(file)}
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {transferring && (
            <div className="file-transfer-status">
              <LoaderCircle size={13} className="spin" /> 正在传输文件
            </div>
          )}
        </>
      )}
    </>
  );
}
