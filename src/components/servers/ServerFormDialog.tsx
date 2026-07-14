import { useState } from "react";
import { X } from "lucide-react";
import type { AuthType, ServerConfig } from "../../types";

interface Props {
  initial?: ServerConfig;
  onSave: (cfg: ServerConfig | Omit<ServerConfig, "id">) => void;
  onClose: () => void;
}

export function ServerFormDialog({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(initial?.port ?? 22);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [authType, setAuthType] = useState<AuthType>(
    initial?.authType ?? "password",
  );
  const [password, setPassword] = useState(initial?.password ?? "");
  const [privateKey, setPrivateKey] = useState(initial?.privateKey ?? "");
  const [passphrase, setPassphrase] = useState(initial?.passphrase ?? "");
  const [savePassword, setSavePassword] = useState(initial?.savePassword ?? true);

  const canSave = host.trim() && username.trim();

  const handleSave = () => {
    if (!canSave) return;
    const base = {
      name: name.trim() || host.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      authType,
      password: authType === "password" ? password : undefined,
      privateKey: authType === "key" ? privateKey : undefined,
      passphrase: authType === "key" ? passphrase || undefined : undefined,
      savePassword,
    };
    onSave(initial ? { ...base, id: initial.id } : base);
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            {initial ? "编辑服务器" : "新建服务器"}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">别名</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：生产服务器"
            />
          </div>

          <div className="form-row">
            <div className="field" style={{ flex: 3 }}>
              <label className="field-label">主机 *</label>
              <input
                className="input"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.10 或 example.com"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field-label">端口</label>
              <input
                className="input"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label">用户名 *</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
            />
          </div>

          <div className="field">
            <label className="field-label">认证方式</label>
            <div className="segmented">
              <button
                className={authType === "password" ? "active" : ""}
                onClick={() => setAuthType("password")}
              >
                密码
              </button>
              <button
                className={authType === "key" ? "active" : ""}
                onClick={() => setAuthType("key")}
              >
                私钥
              </button>
            </div>
          </div>

          {authType === "password" ? (
            <div className="field">
              <label className="field-label">密码</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="连接密码"
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label className="field-label">私钥内容 (PEM)</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                />
              </div>
              <div className="field">
                <label className="field-label">私钥口令（可选）</label>
                <input
                  className="input"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
            </>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={savePassword}
              onChange={(e) => setSavePassword(e.target.checked)}
            />
            保存凭据到本地
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
