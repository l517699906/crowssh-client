export type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "groq"
  | "dashscope"
  | "packy"
  | "openai-compatible";

export type AiProtocol = "openai-chat" | "anthropic-messages" | "gemini-native";

export type AiAuthType = "bearer" | "x-api-key" | "api-key" | "custom";

export type AiTokenParameter = "auto" | "max_tokens" | "max_completion_tokens";

export type RuntimeAiProvider = Exclude<AiProvider, "packy">;

export interface AiProfile {
  id: string;
  credentialId: string;
  name: string;
  provider: AiProvider;
  protocol: AiProtocol;
  baseUrl: string;
  authType: AiAuthType;
  authHeader?: string;
  authPrefix?: string;
  modelListPath: string;
  model: string;
  temperature: number;
  omitTemperature: boolean;
  tokenParameter: AiTokenParameter;
  maxTokens?: number;
  keyLastFour?: string;
  availableModels?: string[];
  modelsFetchedAt?: number;
}

export interface RuntimeModelConfig {
  provider: RuntimeAiProvider;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  authType: AiAuthType;
  authHeader?: string;
  authPrefix?: string;
  modelListPath: string;
  model: string;
  temperature?: number;
  omitTemperature: boolean;
  tokenParameter: AiTokenParameter;
  maxTokens?: number;
}

export type RuntimeModelListConfig = Pick<
  RuntimeModelConfig,
  | "provider"
  | "protocol"
  | "baseUrl"
  | "apiKey"
  | "authType"
  | "authHeader"
  | "authPrefix"
  | "modelListPath"
>;

export interface AiProviderOption {
  value: AiProvider;
  label: string;
  baseUrl: string;
  model: string;
  protocol: AiProtocol;
  authType: AiAuthType;
  modelListPath: string;
  tokenParameter: AiTokenParameter;
  omitTemperature: boolean;
  maxTokens?: number;
}

const MAX_MODEL_COUNT = 500;
const MAX_MODEL_ID_LENGTH = 200;

export function normalizeAiBaseUrl(provider: AiProvider, baseUrl: string): string {
  const value = baseUrl.trim().replace(/\/+$/, "");
  if (provider !== "packy") return value;

  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return value;
    let path = url.pathname.replace(/\/+$/, "");
    path = path
      .replace(/\/v1\/(?:chat\/completions|messages)$/i, "")
      .replace(/\/v1$/i, "");
    return `${url.origin}${path}`;
  } catch {
    return value;
  }
}

export function normalizeModelIds(models: readonly unknown[]): string[] {
  const unique = new Set<string>();
  for (const model of models) {
    if (typeof model !== "string") continue;
    const id = model.trim();
    if (!id || id.length > MAX_MODEL_ID_LENGTH) continue;
    unique.add(id);
    if (unique.size >= MAX_MODEL_COUNT) break;
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

export const PROTOCOL_OPTIONS: Array<{ value: AiProtocol; label: string }> = [
  { value: "openai-chat", label: "OpenAI Chat Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "gemini-native", label: "Google Gemini Native" },
];

export const AUTH_OPTIONS: Array<{ value: AiAuthType; label: string }> = [
  { value: "bearer", label: "Authorization: Bearer" },
  { value: "x-api-key", label: "x-api-key" },
  { value: "api-key", label: "api-key" },
  { value: "custom", label: "自定义 Header" },
];

export const TOKEN_PARAMETER_OPTIONS: Array<{ value: AiTokenParameter; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "max_tokens", label: "max_tokens" },
  { value: "max_completion_tokens", label: "max_completion_tokens" },
];

export const PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    value: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    protocol: "openai-chat",
    authType: "bearer",
    modelListPath: "models",
    tokenParameter: "max_completion_tokens",
    omitTemperature: true,
  },
  {
    value: "anthropic",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    protocol: "anthropic-messages",
    authType: "x-api-key",
    modelListPath: "v1/models",
    tokenParameter: "auto",
    omitTemperature: false,
    maxTokens: 4096,
  },
  {
    value: "packy",
    label: "PackyAPI Claude",
    baseUrl: "https://www.packyapi.ai",
    model: "claude-sonnet-4-6",
    protocol: "anthropic-messages",
    authType: "x-api-key",
    modelListPath: "v1/models",
    tokenParameter: "auto",
    omitTemperature: true,
    maxTokens: 4096,
  },
  {
    value: "gemini",
    label: "Gemini (Google)",
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-flash",
    protocol: "gemini-native",
    authType: "x-api-key",
    modelListPath: "v1beta/models",
    tokenParameter: "auto",
    omitTemperature: false,
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    protocol: "openai-chat",
    authType: "bearer",
    modelListPath: "models",
    tokenParameter: "max_tokens",
    omitTemperature: false,
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    protocol: "openai-chat",
    authType: "bearer",
    modelListPath: "models",
    tokenParameter: "max_tokens",
    omitTemperature: false,
  },
  {
    value: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    protocol: "openai-chat",
    authType: "bearer",
    modelListPath: "models",
    tokenParameter: "max_tokens",
    omitTemperature: false,
  },
  {
    value: "dashscope",
    label: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    protocol: "openai-chat",
    authType: "bearer",
    modelListPath: "models",
    tokenParameter: "max_tokens",
    omitTemperature: false,
  },
  {
    value: "openai-compatible",
    label: "自定义 / 中转站",
    baseUrl: "https://",
    model: "",
    protocol: "openai-chat",
    authType: "bearer",
    modelListPath: "models",
    tokenParameter: "max_tokens",
    omitTemperature: false,
  },
];

export function getProviderOption(provider: AiProvider): AiProviderOption {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)
    ?? PROVIDER_OPTIONS[PROVIDER_OPTIONS.length - 1];
}

export function getProtocolDefaults(protocol: AiProtocol) {
  switch (protocol) {
    case "anthropic-messages":
      return {
        authType: "x-api-key" as const,
        modelListPath: "v1/models",
        tokenParameter: "auto" as const,
      };
    case "gemini-native":
      return {
        authType: "x-api-key" as const,
        modelListPath: "v1beta/models",
        tokenParameter: "auto" as const,
      };
    default:
      return {
        authType: "bearer" as const,
        modelListPath: "models",
        tokenParameter: "max_tokens" as const,
      };
  }
}

export function runtimeModelConfigFromProfile(
  profile: AiProfile,
  apiKey: string,
  model = profile.model,
): RuntimeModelConfig {
  return {
    provider: profile.provider === "packy" ? "openai-compatible" : profile.provider,
    protocol: profile.protocol,
    baseUrl: normalizeAiBaseUrl(profile.provider, profile.baseUrl),
    apiKey,
    authType: profile.authType,
    authHeader: profile.authHeader,
    authPrefix: profile.authPrefix,
    modelListPath: profile.modelListPath,
    model,
    temperature: profile.omitTemperature ? undefined : profile.temperature,
    omitTemperature: profile.omitTemperature,
    tokenParameter: profile.tokenParameter,
    maxTokens: profile.maxTokens,
  };
}

export function runtimeModelListConfigFromProfile(
  profile: AiProfile,
  apiKey: string,
): RuntimeModelListConfig {
  const runtime = runtimeModelConfigFromProfile(profile, apiKey);
  return {
    provider: runtime.provider,
    protocol: runtime.protocol,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    authType: runtime.authType,
    authHeader: runtime.authHeader,
    authPrefix: runtime.authPrefix,
    modelListPath: runtime.modelListPath,
  };
}
