import type { ServerConfig } from "../../types";
import { useLayoutStore } from "../../store/layoutStore";
import { ServerView } from "../servers/ServerView";
import { FilesView } from "../files/FilesView";
import { SftpView } from "../sftp/SftpView";

interface Props {
  servers: ServerConfig[];
  onConnect: (server: ServerConfig) => void;
  onAddServer: () => void;
  onEditServer: (server: ServerConfig) => void;
  onRemoveServer: (id: string) => void;
}

export function LeftSidebar({
  servers,
  onConnect,
  onAddServer,
  onEditServer,
  onRemoveServer,
}: Props) {
  const activeView = useLayoutStore((s) => s.activeView);
  return (
    <div className="left-sidebar island">
      {activeView === "servers" && (
        <ServerView
          servers={servers}
          onConnect={onConnect}
          onAdd={onAddServer}
          onEdit={onEditServer}
          onRemove={onRemoveServer}
        />
      )}
      {activeView === "files" && <FilesView />}
      {activeView === "sftp" && <SftpView />}
    </div>
  );
}
