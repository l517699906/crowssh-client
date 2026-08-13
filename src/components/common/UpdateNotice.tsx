import { useEffect, useState } from "react";
import { Download, RefreshCw, RotateCcw, X } from "lucide-react";
import {
  checkForAppUpdate,
  installAppUpdate,
  restartAfterUpdate,
  type AppUpdate,
  type AppUpdateDownloadEvent,
} from "../../services/appUpdater";
import "./update-notice.css";

type Phase = "available" | "installing" | "restart-required" | "error";

interface DownloadProgress {
  downloaded: number;
  total?: number;
  finished: boolean;
}

const INITIAL_PROGRESS: DownloadProgress = { downloaded: 0, finished: false };

function nextProgress(
  current: DownloadProgress,
  event: AppUpdateDownloadEvent,
): DownloadProgress {
  if (event.event === "Started") {
    return { downloaded: 0, total: event.data.contentLength, finished: false };
  }
  if (event.event === "Progress") {
    return { ...current, downloaded: current.downloaded + event.data.chunkLength };
  }
  return { ...current, finished: true };
}

export function UpdateNotice() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>("available");
  const [progress, setProgress] = useState<DownloadProgress>(INITIAL_PROGRESS);

  useEffect(() => {
    let active = true;
    void checkForAppUpdate()
      .then((availableUpdate) => {
        if (active && availableUpdate) setUpdate(availableUpdate);
      })
      .catch(() => {
        // 自动检查失败不打断工作台，用户将在下一次启动时重试。
      });
    return () => {
      active = false;
    };
  }, []);

  if (!update) return null;

  const percent = progress.total && progress.total > 0
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : null;

  const dismiss = () => {
    void update.close().catch(() => undefined);
    setUpdate(null);
  };

  const install = async () => {
    setPhase("installing");
    setProgress(INITIAL_PROGRESS);
    try {
      await installAppUpdate(update, (event) => {
        setProgress((current) => nextProgress(current, event));
      });
      try {
        await restartAfterUpdate();
      } catch {
        setPhase("restart-required");
      }
    } catch {
      setPhase("error");
    }
  };

  const restart = async () => {
    try {
      await restartAfterUpdate();
    } catch {
      setPhase("restart-required");
    }
  };

  const status = phase === "installing"
    ? progress.finished ? "正在安装更新" : percent === null ? "正在下载更新" : `正在下载 ${percent}%`
    : phase === "restart-required"
      ? "更新已安装，重启后生效"
      : phase === "error"
        ? "更新失败，请重试"
        : `CrowSSH ${update.version} 可用`;

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <div className="update-notice-icon" aria-hidden="true">
        <Download size={18} />
      </div>
      <div className="update-notice-content">
        <div className="update-notice-title">{status}</div>
        {phase === "installing" ? (
          <div className="update-progress" aria-hidden="true">
            <span style={{ width: percent === null ? "35%" : `${percent}%` }} />
          </div>
        ) : null}
      </div>
      <div className="update-notice-actions">
        {phase === "restart-required" ? (
          <button className="btn btn-primary" type="button" onClick={() => void restart()}>
            <RotateCcw size={14} />
            立即重启
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            disabled={phase === "installing"}
            onClick={() => void install()}
          >
            {phase === "error" || phase === "installing"
              ? <RefreshCw className={phase === "installing" ? "spin" : undefined} size={14} />
              : <Download size={14} />}
            {phase === "error" ? "重试" : phase === "installing" ? "更新中" : "安装并重启"}
          </button>
        )}
        {phase !== "installing" && phase !== "restart-required" ? (
          <button className="icon-btn" type="button" title="稍后更新" onClick={dismiss}>
            <X size={16} />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
