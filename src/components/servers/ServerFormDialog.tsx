import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, LoaderCircle, PlugZap, X } from "lucide-react";
import type { AuthArg, AuthType, ServerConfig } from "../../types";

interface Props {
  initial?: ServerConfig;
  onSave: (cfg: ServerConfig | Omit<ServerConfig, "id">) => Promise<boolean>;
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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passphraseVisible, setPassphraseVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const validPort = Number.isInteger(port) && port > 0 && port <= 65535;
  const hasRequiredCredential =
    initial && initial.authType === authType
      ? true
      : authType === "password"
        ? Boolean(password)
        : Boolean(privateKey.trim());
  const canSave = Boolean(host.trim() && username.trim() && validPort && hasRequiredCredential);

  const buildAuth = (): AuthArg =>
    authType === "password"
      ? { type: "password", password }
      : { type: "key", privateKey, passphrase: passphrase || undefined };

  const hasTestCredential = authType === "password" ? Boolean(password) : Boolean(privateKey.trim());

  const handleSave = async () => {
    if (!canSave || saving) {
      if (!validPort) setError("端口必须在 1 到 65535 之间");
      else if (!hasRequiredCredential) setError("请填写当前认证方式所需的凭据");
      return;
    }
    setError(null);
    setSaving(true);
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
    const success = await onSave(initial ? { ...base, id: initial.id } : base);
    setSaving(false);
    if (success) onClose();
  };

  const handleTestConnection = async () => {
    if (testing || saving) return;
    if (!host.trim() || !username.trim() || !validPort) {
      setTestResult({ success: false, message: "请填写主机、用户名和有效端口" });
      return;
    }
    if (!hasTestCredential) {
      setTestResult({
        success: false,
        message: authType === "password" ? "请输入密码后再测试" : "请输入私钥后再测试",
      });
      return;
    }

    setError(null);
    setTestResult(null);
    setTesting(true);
    try {
      await invoke("ssh_test_connection", {
        host: host.trim(),
        port: Number(port),
        username: username.trim(),
        auth: buildAuth(),
      });
      setTestResult({ success: true, message: "连接和认证均成功" });
    } catch (reason) {
      setTestResult({
        success: false,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setTesting(false);
    }
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
                min={1}
                max={65535}
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
              <div className="password-input">
                <input
                  className="input"
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="连接密码"
                />
                <button
                  className="icon-btn password-visibility"
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                >
                  {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
                <div className="password-input">
                  <input
                    className="input"
                    type={passphraseVisible ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                  <button
                    className="icon-btn password-visibility"
                    type="button"
                    onClick={() => setPassphraseVisible((visible) => !visible)}
                    aria-label={passphraseVisible ? "隐藏私钥口令" : "显示私钥口令"}
                  >
                    {passphraseVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={savePassword}
              onChange={(e) => setSavePassword(e.target.checked)}
            />
            本次运行中保留终端凭据
          </label>
          {testResult && (
            <div
              className={`form-test-result ${testResult.success ? "success" : "error"}`}
              role="status"
            >
              {testResult.message}
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={saving || testing}>
            取消
          </button>
          <button className="btn" type="button" onClick={() => void handleTestConnection()} disabled={saving || testing}>
            {testing ? <LoaderCircle size={14} className="spin" /> : <PlugZap size={14} />}
            {testing ? "测试中" : "测试连接"}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || testing}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
