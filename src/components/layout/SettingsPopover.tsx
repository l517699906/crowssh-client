import { useEffect, useState, type RefObject } from "react";
import { LoaderCircle, RotateCcw, Server } from "lucide-react";
import { checkServerHealth } from "../../api/health";
import { useSettingsStore } from "../../store/settingsStore";
import { useLayoutStore } from "../../store/layoutStore";
import { useThemeStore } from "../../store/themeStore";
import type { ThemeMode } from "../../store/themeStore";

const THEME_OPTIONS: { mode: ThemeMode; label: string; color: string }[] = [
  { mode: "dark", label: "深色", color: "#3574f0" },
  { mode: "light", label: "浅色", color: "#ffffff" },
  { mode: "midnight", label: "午夜", color: "#58a6ff" },
  { mode: "forest", label: "森林", color: "#65b579" },
];

interface Props {
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

export function SettingsPopover({ onClose, anchorRef }: Props) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const setServerUrl = useSettingsStore((s) => s.setServerUrl);
  const resetLayout = useLayoutStore((s) => s.reset);
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  const saveServerUrl = (): boolean => {
    try {
      const normalized = setServerUrl(draftServerUrl);
      setDraftServerUrl(normalized);
      setStatus("服务端地址已保存");
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "服务端地址不可用");
      return false;
    }
  };

  const testServer = async () => {
    if (!saveServerUrl()) return;
    setTesting(true);
    const response = await checkServerHealth();
    setTesting(false);
    setStatus(response.code === "0000" ? "服务端连接正常" : response.info || "服务端不可达");
  };

  return (
    <div className="settings-popover" role="dialog" aria-label="设置">
      <div className="settings-title">外观</div>
      <div className="theme-grid">
        {THEME_OPTIONS.map((theme) => (
          <button
            key={theme.mode}
            className={mode === theme.mode ? "active" : ""}
            type="button"
            onClick={() => setMode(theme.mode)}
          >
            <span className="theme-swatch" style={{ backgroundColor: theme.color }} />
            {theme.label}
          </button>
        ))}
      </div>

      <div className="settings-section">
        <div className="settings-title">服务端</div>
        <label className="settings-field">
          <span>地址</span>
          <input
            className="input"
            value={draftServerUrl}
            onChange={(e) => setDraftServerUrl(e.target.value)}
            onBlur={saveServerUrl}
            placeholder="http://localhost:8091"
          />
        </label>
        <div className="settings-actions">
          <button className="btn" type="button" onClick={saveServerUrl}>
            保存
          </button>
          <button className="btn" type="button" onClick={() => void testServer()} disabled={testing}>
            {testing ? <LoaderCircle size={14} className="spin" /> : <Server size={14} />}
            检测
          </button>
        </div>
      </div>

      <div className="settings-section settings-bottom-action">
        <button className="btn" type="button" onClick={resetLayout}>
          <RotateCcw size={14} /> 重置界面布局
        </button>
        {status && <div className="settings-status" role="status">{status}</div>}
      </div>
    </div>
  );
}
