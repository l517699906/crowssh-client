import { useRef, useState } from "react";
import { FolderSync, Folder, Server, Settings } from "lucide-react";
import { useLayoutStore, type ActivityView } from "../../store/layoutStore";
import { SettingsPopover } from "./SettingsPopover";

const ITEMS: { view: ActivityView; icon: typeof Server; label: string }[] = [
  { view: "servers", icon: Server, label: "服务器" },
  { view: "files", icon: Folder, label: "文件目录" },
  { view: "sftp", icon: FolderSync, label: "SFTP 传输" },
];

export function ActivityBar() {
  const activeView = useLayoutStore((s) => s.activeView);
  const leftVisible = useLayoutStore((s) => s.leftVisible);
  const selectActivity = useLayoutStore((s) => s.selectActivity);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  return (
    <div className="activity-bar">
      <div className="activity-top">
        {ITEMS.map(({ view, icon: Icon, label }) => {
          const active = activeView === view && leftVisible;
          return (
            <button
              key={view}
              className={`activity-item${active ? " active" : ""}`}
              title={label}
              onClick={() => selectActivity(view)}
            >
              <Icon size={22} strokeWidth={1.6} />
            </button>
          );
        })}
      </div>
      <div className="activity-bottom" ref={settingsRef}>
        <button
          className={`activity-item${settingsOpen ? " active" : ""}`}
          title="设置"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings size={22} strokeWidth={1.6} />
        </button>
        {settingsOpen && (
          <SettingsPopover
            anchorRef={settingsRef}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
