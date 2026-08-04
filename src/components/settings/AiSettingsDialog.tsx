import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { listRuntimeModels, testRuntimeModel } from "../../api/aiConfig";
import {
  deleteAiSecret,
  getAiSecretStatus,
  readAiSecretForRequest,
  saveAiSecret,
  type SecretStatus,
} from "../../api/aiSecrets";
import { useAiConfigStore } from "../../store/aiConfigStore";
import {
  AUTH_OPTIONS,
  getProtocolDefaults,
  getProviderOption,
  normalizeModelIds,
  PROVIDER_OPTIONS,
  PROTOCOL_OPTIONS,
  runtimeModelConfigFromProfile,
  runtimeModelListConfigFromProfile,
  TOKEN_PARAMETER_OPTIONS,
  type AiAuthType,
  type AiProfile,
  type AiProtocol,
  type AiProvider,
  type AiTokenParameter,
} from "../../types/aiConfig";
import "./ai-settings.css";

interface Props {
  onClose: () => void;
}

const EMPTY_SECRET_STATUS: SecretStatus = { configured: false };

function validateEndpoint(profile: AiProfile) {
  let url: URL;
  try {
    url = new URL(profile.baseUrl.trim());
  } catch {
    throw new Error("服务地址必须是完整的 HTTPS 地址");
  }
  if (url.protocol !== "https:") throw new Error("服务地址必须使用 HTTPS");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("服务地址不能包含账号、查询参数或锚点");
  }
}

function validateRelativePath(path: string) {
  const value = path.trim().replace(/^\/+/, "");
  if (!value || value.length > 500 || value.includes("..") || /[?#]/.test(value)) {
    throw new Error("模型列表路径必须是有效的相对路径");
  }
}

function validateCustomAuth(profile: AiProfile) {
  if (profile.authType !== "custom") return;
  const header = profile.authHeader?.trim() ?? "";
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(header)) {
    throw new Error("自定义鉴权 Header 名称无效");
  }
  if ((profile.authPrefix?.length ?? 0) > 100 || /[\r\n]/.test(profile.authPrefix ?? "")) {
    throw new Error("自定义鉴权前缀无效");
  }
}

function validateProfile(profile: AiProfile) {
  if (!profile.name.trim()) throw new Error("配置名称不能为空");
  if (!profile.model.trim()) throw new Error("模型名称不能为空");
  validateEndpoint(profile);
  validateRelativePath(profile.modelListPath);
  validateCustomAuth(profile);
  if (profile.temperature < 0 || profile.temperature > 2) {
    throw new Error("Temperature 必须在 0 到 2 之间");
  }
  if (profile.maxTokens !== undefined && (profile.maxTokens < 1 || profile.maxTokens > 131072)) {
    throw new Error("最大输出 Token 必须在 1 到 131072 之间");
  }
}

export function AiSettingsDialog({ onClose }: Props) {
  const profiles = useAiConfigStore((state) => state.profiles);
  const activeProfileId = useAiConfigStore((state) => state.activeProfileId);
  const createProfile = useAiConfigStore((state) => state.createProfile);
  const upsertProfile = useAiConfigStore((state) => state.upsertProfile);
  const removeProfile = useAiConfigStore((state) => state.removeProfile);
  const setActiveProfile = useAiConfigStore((state) => state.setActiveProfile);

  const initialProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const [draft, setDraft] = useState<AiProfile>(() => ({ ...(initialProfile ?? createProfile()) }));
  const [isNew, setIsNew] = useState(!initialProfile);
  const [secret, setSecret] = useState("");
  const [secretStatus, setSecretStatus] = useState<SecretStatus>(EMPTY_SECRET_STATUS);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "models" | "delete" | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setSecret("");
    setShowSecret(false);
    setSecretStatus(EMPTY_SECRET_STATUS);
    setStatus(null);
    setConfirmDelete(false);

    void getAiSecretStatus(draft.credentialId)
      .then(async (nextStatus) => {
        if (cancelled) return;
        setSecretStatus(nextStatus);
        if (!nextStatus.configured) return;

        const savedSecret = await readAiSecretForRequest(draft.credentialId);
        if (!cancelled) setSecret(savedSecret);
      })
      .catch((error: unknown) => {
        if (!cancelled && !isNew) {
          setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.credentialId, isNew]);

  const selectProfile = (profile: AiProfile) => {
    setDraft({ ...profile });
    setIsNew(false);
  };

  const startNewProfile = () => {
    setDraft(createProfile());
    setIsNew(true);
  };

  const changeProvider = (provider: AiProvider) => {
    const preset = getProviderOption(provider);
    setDraft((current) => ({
      ...current,
      provider,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      authType: preset.authType,
      authHeader: undefined,
      authPrefix: undefined,
      modelListPath: preset.modelListPath,
      model: preset.model,
      omitTemperature: preset.omitTemperature,
      tokenParameter: preset.tokenParameter,
      availableModels: undefined,
      modelsFetchedAt: undefined,
    }));
  };

  const changeProtocol = (protocol: AiProtocol) => {
    const defaults = getProtocolDefaults(protocol);
    setDraft((current) => ({
      ...current,
      protocol,
      authType: defaults.authType,
      authHeader: undefined,
      authPrefix: undefined,
      modelListPath: defaults.modelListPath,
      tokenParameter: defaults.tokenParameter,
      availableModels: undefined,
      modelsFetchedAt: undefined,
    }));
  };

  const persistDraft = async () => {
    validateProfile(draft);
    if (!secret.trim() && !secretStatus.configured) throw new Error("请填写 API Key");

    let nextProfile: AiProfile = {
      ...draft,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""),
      authHeader: draft.authType === "custom" ? draft.authHeader?.trim() : undefined,
      authPrefix: draft.authType === "custom" ? draft.authPrefix : undefined,
      modelListPath: draft.modelListPath.trim().replace(/^\/+/, ""),
      model: draft.model.trim(),
      availableModels: draft.availableModels?.length
        ? normalizeModelIds(draft.availableModels)
        : undefined,
      modelsFetchedAt: draft.availableModels?.length ? draft.modelsFetchedAt : undefined,
    };
    if (secret.trim()) {
      const normalizedSecret = secret.trim();
      const nextSecretStatus = await saveAiSecret(draft.credentialId, normalizedSecret);
      setSecretStatus(nextSecretStatus);
      setSecret(normalizedSecret);
      nextProfile = { ...nextProfile, keyLastFour: nextSecretStatus.lastFour };
    }

    upsertProfile(nextProfile);
    setDraft(nextProfile);
    setIsNew(false);
    return nextProfile;
  };

  const queryModels = async () => {
    setBusy("models");
    setStatus(null);
    try {
      validateEndpoint(draft);
      validateRelativePath(draft.modelListPath);
      validateCustomAuth(draft);
      const apiKey = secret.trim()
        ? secret.trim()
        : await readAiSecretForRequest(draft.credentialId);
      const response = await listRuntimeModels(runtimeModelListConfigFromProfile({
        ...draft,
        baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""),
        modelListPath: draft.modelListPath.trim().replace(/^\/+/, ""),
      }, apiKey));
      if (response.code !== "0000") throw new Error(response.info || "模型列表查询失败");

      const models = normalizeModelIds(response.data ?? []);
      if (!models.length) throw new Error("服务商未返回可用模型");
      setDraft((current) => ({
        ...current,
        model: current.model.trim() || models[0],
        availableModels: models,
        modelsFetchedAt: Date.now(),
      }));
      setStatus({ kind: "success", text: `已查询到 ${models.length} 个模型` });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "模型列表查询失败" });
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    setBusy("save");
    setStatus(null);
    try {
      await persistDraft();
      setStatus({ kind: "success", text: "AI 配置已保存" });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setBusy("test");
    setStatus(null);
    try {
      const profile = await persistDraft();
      const apiKey = await readAiSecretForRequest(profile.credentialId);
      const response = await testRuntimeModel(runtimeModelConfigFromProfile(profile, apiKey));
      if (response.code !== "0000") throw new Error(response.info || "连接测试失败");
      setStatus({ kind: "success", text: "模型连接正常" });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "连接测试失败" });
    } finally {
      setBusy(null);
    }
  };

  const activateProfile = async () => {
    setBusy("save");
    setStatus(null);
    try {
      const profile = await persistDraft();
      setActiveProfile(profile.id);
      setStatus({ kind: "success", text: "已设为当前 AI 配置" });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "设置失败" });
    } finally {
      setBusy(null);
    }
  };

  const deleteProfile = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy("delete");
    setStatus(null);
    try {
      await deleteAiSecret(draft.credentialId);
      removeProfile(draft.id);
      const remaining = profiles.filter((profile) => profile.id !== draft.id);
      setDraft({ ...(remaining[0] ?? createProfile()) });
      setIsNew(remaining.length === 0);
      setStatus({ kind: "success", text: "AI 配置和本地密钥已删除" });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "删除失败" });
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="modal-overlay ai-settings-overlay" onMouseDown={onClose}>
      <div
        className="modal-card ai-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="AI 密钥与模型"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header ai-settings-header">
          <div>
            <span className="modal-title"><KeyRound size={15} /> AI 密钥与模型</span>
            <span className="ai-vault-state"><ShieldCheck size={13} /> 系统钥匙串</span>
          </div>
          <button className="icon-btn" type="button" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="ai-settings-body">
          <aside className="ai-profile-sidebar">
            <div className="ai-profile-sidebar-header">
              <span>配置</span>
              <button
                className="icon-btn"
                type="button"
                title="新建 AI 配置"
                disabled={busy !== null}
                onClick={startNewProfile}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="ai-profile-list">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  className={`ai-profile-item${!isNew && draft.id === profile.id ? " selected" : ""}`}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => selectProfile(profile)}
                >
                  <span className="ai-profile-name">{profile.name}</span>
                  <span className="ai-profile-model">{profile.model}</span>
                  {profile.id === activeProfileId ? <Check size={14} aria-label="当前配置" /> : null}
                </button>
              ))}
              {profiles.length === 0 ? <div className="ai-profile-empty">暂无配置</div> : null}
            </div>
          </aside>

          <form className="ai-profile-editor" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
            <div className="ai-editor-scroll">
              <div className="ai-editor-section-title">身份</div>
              <label className="field">
                <span className="field-label">配置名称</span>
                <input
                  className="input"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <div className="form-row">
                <label className="field">
                  <span className="field-label">服务商</span>
                  <select
                    className="select"
                    value={draft.provider}
                    disabled={busy !== null}
                    onChange={(event) => changeProvider(event.target.value as AiProvider)}
                  >
                    {PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.value} value={provider.value}>{provider.label}</option>
                    ))}
                  </select>
                </label>
                <div className="field ai-model-field">
                  <span className="field-label">模型</span>
                  <div className="ai-model-row">
                    {draft.availableModels?.length ? (
                      <select
                        className="select"
                        value={draft.availableModels.includes(draft.model) ? draft.model : ""}
                        disabled={busy !== null}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          model: event.target.value,
                        }))}
                      >
                        <option value="">手动输入</option>
                        {draft.availableModels.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        value={draft.model}
                        disabled={busy !== null}
                        placeholder="deepseek-chat"
                        onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                      />
                    )}
                    <button
                      className="btn ai-model-query-btn"
                      type="button"
                      disabled={busy !== null}
                      title="查询当前密钥可用的模型"
                      onClick={() => void queryModels()}
                    >
                      <RefreshCw size={14} className={busy === "models" ? "spin" : undefined} />
                      查询
                    </button>
                  </div>
                  {draft.availableModels?.length && !draft.availableModels.includes(draft.model) ? (
                    <input
                      className="input"
                      value={draft.model}
                      disabled={busy !== null}
                      placeholder="输入自定义模型名称"
                      onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                    />
                  ) : null}
                  {draft.modelsFetchedAt ? (
                    <span className="ai-model-meta">
                      最近查询：{new Date(draft.modelsFetchedAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </div>

              <label className="field">
                <span className="field-label">服务地址</span>
                <input
                  className="input"
                  inputMode="url"
                  value={draft.baseUrl}
                  disabled={busy !== null}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                    availableModels: undefined,
                    modelsFetchedAt: undefined,
                  }))}
                />
              </label>

              <details className="ai-advanced-settings">
                <summary>
                  <Settings2 size={13} />
                  高级兼容配置
                </summary>
                <div className="ai-advanced-content">
                  <div className="form-row">
                    <label className="field">
                      <span className="field-label">协议</span>
                      <select
                        className="select"
                        value={draft.protocol}
                        disabled={busy !== null || draft.provider !== "openai-compatible"}
                        onChange={(event) => changeProtocol(event.target.value as AiProtocol)}
                      >
                        {PROTOCOL_OPTIONS.map((protocol) => (
                          <option key={protocol.value} value={protocol.value}>{protocol.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">鉴权方式</span>
                      <select
                        className="select"
                        value={draft.authType}
                        disabled={
                          busy !== null
                          || draft.provider !== "openai-compatible"
                          || draft.protocol !== "openai-chat"
                        }
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          authType: event.target.value as AiAuthType,
                          authHeader: undefined,
                          authPrefix: undefined,
                        }))}
                      >
                        {AUTH_OPTIONS.map((auth) => (
                          <option key={auth.value} value={auth.value}>{auth.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span className="field-label">模型列表路径</span>
                    <input
                      className="input"
                      value={draft.modelListPath}
                      disabled={busy !== null || draft.provider !== "openai-compatible"}
                      placeholder="models"
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        modelListPath: event.target.value,
                        availableModels: undefined,
                        modelsFetchedAt: undefined,
                      }))}
                    />
                  </label>

                  {draft.provider === "openai-compatible" && draft.authType === "custom" ? (
                    <div className="form-row">
                      <label className="field">
                        <span className="field-label">Header 名称</span>
                        <input
                          className="input"
                          value={draft.authHeader ?? ""}
                          disabled={busy !== null}
                          placeholder="X-API-Key"
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            authHeader: event.target.value,
                          }))}
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">密钥前缀</span>
                        <input
                          className="input"
                          value={draft.authPrefix ?? ""}
                          disabled={busy !== null}
                          placeholder="Bearer "
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            authPrefix: event.target.value,
                          }))}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </details>

              <div className="ai-editor-section-title">密钥</div>
              <label className="field">
                <span className="field-label ai-secret-label">
                  API Key
                  {/*<span className={secretStatus.configured ? "configured" : "missing"}>*/}
                  {/*  {secretStatus.configured*/}
                  {/*    ? `已保存 ····${secretStatus.lastFour ?? draft.keyLastFour ?? ""}`*/}
                  {/*    : "未保存"}*/}
                  {/*</span>*/}
                </span>
                <span className="password-input">
                  <input
                    className="input"
                    type={showSecret ? "text" : "password"}
                    value={secret}
                    disabled={busy !== null}
                    autoComplete="off"
                    placeholder="输入 API Key"
                    onChange={(event) => {
                      setSecret(event.target.value);
                      setDraft((current) => ({
                        ...current,
                        availableModels: undefined,
                        modelsFetchedAt: undefined,
                      }));
                    }}
                  />
                  <button
                    className="icon-btn password-visibility"
                    type="button"
                    title={showSecret ? "隐藏密钥" : "显示密钥"}
                    onClick={() => setShowSecret((current) => !current)}
                  >
                    {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>

              <div className="ai-editor-section-title">生成参数</div>
              <div className="form-row ai-generation-switches">
                <label className="ai-checkbox-field">
                  <input
                    type="checkbox"
                    checked={!draft.omitTemperature}
                    disabled={busy !== null}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      omitTemperature: !event.target.checked,
                    }))}
                  />
                  <span>发送 Temperature</span>
                </label>
                <label className="field">
                  <span className="field-label">Token 参数</span>
                  <select
                    className="select"
                    value={draft.tokenParameter}
                    disabled={busy !== null || draft.protocol !== "openai-chat"}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      tokenParameter: event.target.value as AiTokenParameter,
                    }))}
                  >
                    {TOKEN_PARAMETER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field-label ai-range-label">
                  Temperature <span>{draft.omitTemperature ? "不发送" : draft.temperature.toFixed(1)}</span>
                </span>
                <input
                  className="ai-range"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={draft.temperature}
                  disabled={busy !== null || draft.omitTemperature}
                  onChange={(event) => setDraft((current) => ({ ...current, temperature: Number(event.target.value) }))}
                />
              </label>
              <label className="field">
                <span className="field-label">最大输出 Token</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="131072"
                  placeholder="使用模型默认值"
                  value={draft.maxTokens ?? ""}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    maxTokens: event.target.value ? Number(event.target.value) : undefined,
                  }))}
                />
              </label>

              {status ? <div className={`ai-settings-status ${status.kind}`} role="status">{status.text}</div> : null}
            </div>

            <div className="ai-editor-footer">
              {!isNew ? (
                <button
                  className={`btn${confirmDelete ? " btn-danger" : ""}`}
                  type="button"
                  onClick={() => void deleteProfile()}
                  disabled={busy !== null}
                >
                  {busy === "delete" ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                  {confirmDelete ? "确认删除" : "删除"}
                </button>
              ) : <span />}
              <div className="ai-editor-actions">
                <button className="btn" type="button" onClick={() => void testConnection()} disabled={busy !== null}>
                  {busy === "test" ? <LoaderCircle size={14} className="spin" /> : <Zap size={14} />}
                  测试
                </button>
                {draft.id !== activeProfileId ? (
                  <button className="btn" type="button" onClick={() => void activateProfile()} disabled={busy !== null}>
                    设为当前
                  </button>
                ) : null}
                <button className="btn btn-primary" type="submit" disabled={busy !== null}>
                  {busy === "save" ? <LoaderCircle size={14} className="spin" /> : null}
                  保存
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
