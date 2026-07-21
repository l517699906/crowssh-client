import { FolderSync } from "lucide-react";

export function SftpView() {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <FolderSync size={14} /> SFTP 传输
        </span>
      </div>
      <div className="empty-state">
        <FolderSync size={28} strokeWidth={1.5} />
        <div className="empty-title">SFTP 传输开发中</div>
        <div className="empty-hint">后续迭代支持文件上传 / 下载</div>
      </div>
    </>
  );
}
