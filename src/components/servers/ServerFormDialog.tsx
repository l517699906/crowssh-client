import { useState } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  PlugZap,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react";
import * as sshApi from "../../api/sshConnection";
import type { AuthType, ServerConfig } from "../../types";

interface Props {
  initial?: ServerConfig;
  onSave: (cfg: ServerConfig | Omit<ServerConfig, "id">) => Promise<boolean>;
  onClose: () => void;
}

export function ServerFormDialog({ initial, onSave, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<"basic" | "advanced">("basic");
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
  const [connectionTimeout, setConnectionTimeout] = useState(initial?.connectionTimeout ?? 30);
  const [keepAliveInterval, setKeepAliveInterval] = useState(initial?.keepAliveInterval ?? 60);
  const [compression, setCompression] = useState(initial?.compression ?? false);
  const [startupCommand, setStartupCommand] = useState(initial?.startupCommand ?? "");
  const [strictHostKeyCheck, setStrictHostKeyCheck] = useState(
    initial?.strictHostKeyCheck ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
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

  const hasTestCredential = authType === "password" ? Boolean(password) : Boolean(privateKey.trim());

  const handleSave = async () => {
    if (!canSave || saving) {
      setActiveSection("basic");
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
      connectionTimeout,
      keepAliveInterval,
      compression,
      startupCommand: startupCommand.trim() || undefined,
      strictHostKeyCheck,
    };
    const success = await onSave(initial ? { ...base, id: initial.id } : base);
    setSaving(false);
    if (success) onClose();
  };

  const handleTestConnection = async () => {
    if (testing || saving) return;
    if (!host.trim() || !username.trim() || !validPort) {
      setActiveSection("basic");
      setTestResult({ success: false, message: "请填写主机、用户名和有效端口" });
      return;
    }
    if (!hasTestCredential) {
      setActiveSection("basic");
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
      const response = await sshApi.testConnection({
        connectionName: name.trim() || host.trim(),
        host: host.trim(),
        port: Number(port),
        username: username.trim(),
        authType: authType === "key" ? 2 : 1,
        password: authType === "password" ? password : undefined,
        privateKey: authType === "key" ? privateKey : undefined,
        connectTimeout: connectionTimeout,
        keepaliveInterval: keepAliveInterval,
        compression,
        startupCommand: startupCommand.trim() || undefined,
        strictHostKeyCheck,
      });
      if (response.code !== "0000") {
        setTestResult({ success: false, message: response.info || "连接测试失败" });
        return;
      }
      setTestResult({ success: true, message: response.info || "连接和认证均成功" });
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
      <div
        className="modal-card server-form-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">
            {initial ? "编辑服务器" : "新建服务器"}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="server-form-tabs" role="tablist" aria-label="服务器选项">
          <button
            className={activeSection === "basic" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeSection === "basic"}
            onClick={() => setActiveSection("basic")}
          >
            <Server size={14} />
            基础选项
          </button>
          <button
            className={activeSection === "advanced" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeSection === "advanced"}
            onClick={() => setActiveSection("advanced")}
          >
            <SlidersHorizontal size={14} />
            高级选项
          </button>
        </div>

        <div className="modal-body">
          {activeSection === "basic" ? (
            <div className="server-form-section" role="tabpanel">
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
                    type="button"
                    onClick={() => setAuthType("password")}
                  >
                    密码
                  </button>
                  <button
                    className={authType === "key" ? "active" : ""}
                    type="button"
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
                    <div className="password-input private-key-input">
                      <textarea
                        className={`textarea${privateKeyVisible ? "" : " secret-masked"}`}
                        rows={4}
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      />
                      <button
                        className="icon-btn password-visibility"
                        type="button"
                        onClick={() => setPrivateKeyVisible((visible) => !visible)}
                        aria-label={privateKeyVisible ? "隐藏私钥" : "显示私钥"}
                      >
                        {privateKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
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
                将终端凭据保存在系统钥匙串
              </label>
            </div>
          ) : (
            <div className="server-form-section advanced-options" role="tabpanel">
              <div className="field">
                <label className="field-label">连接超时：{connectionTimeout} 秒</label>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={connectionTimeout}
                  onChange={(e) => setConnectionTimeout(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="field-label">
                  保活间隔：{keepAliveInterval === 0 ? "关闭" : `${keepAliveInterval} 秒`}
                </label>
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={10}
                  value={keepAliveInterval}
                  onChange={(e) => setKeepAliveInterval(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="field-label">连接后自动执行</label>
                <input
                  className="input"
                  value={startupCommand}
                  onChange={(e) => setStartupCommand(e.target.value)}
                  placeholder="例如：cd /home && ls -la"
                />
              </div>
              <div className="advanced-checks">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={compression}
                    onChange={(e) => setCompression(e.target.checked)}
                  />
                  启用 SSH 数据压缩
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={strictHostKeyCheck}
                    onChange={(e) => setStrictHostKeyCheck(e.target.checked)}
                  />
                  严格校验 ~/.ssh/known_hosts
                </label>
              </div>
            </div>
          )}

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
