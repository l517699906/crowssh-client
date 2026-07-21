import { Folder } from "lucide-react";

export function FilesView() {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Folder size={14} /> 文件目录
        </span>
      </div>
      <div className="empty-state">
        <Folder size={28} strokeWidth={1.5} />
        <div className="empty-title">文件浏览开发中</div>
        <div className="empty-hint">连接服务器后浏览远程文件目录</div>
      </div>
    </>
  );
}
