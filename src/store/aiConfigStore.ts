import { create } from "zustand";
import { load, save, uid } from "../lib/storage";
import {
  getProtocolDefaults,
  getProviderOption,
  normalizeAiBaseUrl,
  normalizeModelIds,
  type AiAuthType,
  type AiProfile,
  type AiProtocol,
  type AiProvider,
  type AiTokenParameter,
} from "../types/aiConfig";

const STORAGE_KEY = "settings.ai-profiles.v2";
const LEGACY_STORAGE_KEY = "settings.ai-profiles.v1";

interface PersistedAiConfig {
  version: 2;
  activeProfileId: string | null;
  profiles: AiProfile[];
}

interface AiConfigState extends PersistedAiConfig {
  createProfile: () => AiProfile;
  upsertProfile: (profile: AiProfile) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
}

const EMPTY_CONFIG: PersistedAiConfig = {
  version: 2,
  activeProfileId: null,
  profiles: [],
};

const PROVIDERS = new Set<AiProvider>([
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "openrouter",
  "groq",
  "dashscope",
  "packy",
  "openai-compatible",
]);
const PROTOCOLS = new Set<AiProtocol>(["openai-chat", "anthropic-messages", "gemini-native"]);
const AUTH_TYPES = new Set<AiAuthType>(["bearer", "x-api-key", "api-key", "custom"]);
const TOKEN_PARAMETERS = new Set<AiTokenParameter>([
  "auto",
  "max_tokens",
  "max_completion_tokens",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function optionalPrefix(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.length) return undefined;
  return value.slice(0, maxLength);
}

function migrateLegacyBaseUrl(baseUrl: string): string {
  const value = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/]/i.test(value) || /\/v1$/i.test(value)) return value;
  return `${value}/v1`;
}

function isPackyHost(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "packyapi.ai"
      || host.endsWith(".packyapi.ai")
      || host === "packyapi.com"
      || host.endsWith(".packyapi.com");
  } catch {
    return false;
  }
}

function normalizeProfile(value: unknown, legacy: boolean): AiProfile | null {
  const profile = asRecord(value);
  if (!profile) return null;

  const id = optionalText(profile.id, 200);
  const credentialId = optionalText(profile.credentialId, 200);
  const name = optionalText(profile.name, 200);
  const rawBaseUrl = optionalText(profile.baseUrl, 2048);
  const model = optionalText(profile.model, 200);
  if (!id || !credentialId || !name || !rawBaseUrl || !model) return null;

  const storedProvider = PROVIDERS.has(profile.provider as AiProvider)
    ? profile.provider as AiProvider
    : "openai-compatible";
  const migratePackyClaude = /^claude(?:[-_]|$)/i.test(model)
    && isPackyHost(rawBaseUrl);
  const provider: AiProvider = migratePackyClaude ? "packy" : storedProvider;
  const preset = getProviderOption(provider);
  const configurable = provider === "openai-compatible";
  const storedProtocol = PROTOCOLS.has(profile.protocol as AiProtocol)
    ? profile.protocol as AiProtocol
    : preset.protocol;
  const protocol = configurable ? storedProtocol : preset.protocol;
  const protocolDefaults = getProtocolDefaults(protocol);
  const storedAuthType = AUTH_TYPES.has(profile.authType as AiAuthType)
    ? profile.authType as AiAuthType
    : protocolDefaults.authType;
  const authType = configurable && protocol === "openai-chat"
    ? storedAuthType
    : protocolDefaults.authType;
  const storedTokenParameter = TOKEN_PARAMETERS.has(profile.tokenParameter as AiTokenParameter)
    ? profile.tokenParameter as AiTokenParameter
    : preset.tokenParameter;
  const tokenParameter = protocol === "openai-chat"
    ? storedTokenParameter
    : "auto";

  const temperature = typeof profile.temperature === "number" && Number.isFinite(profile.temperature)
    ? Math.min(2, Math.max(0, profile.temperature))
    : 0.2;
  const storedMaxTokens = profile.maxTokens;
  const storedNormalizedMaxTokens = typeof storedMaxTokens === "number"
    && Number.isInteger(storedMaxTokens)
    && storedMaxTokens > 0
    ? Math.min(131072, storedMaxTokens)
    : undefined;
  const maxTokens = storedNormalizedMaxTokens ?? preset.maxTokens;
  const availableModels = normalizeModelIds(
    Array.isArray(profile.availableModels) ? profile.availableModels : [],
  );
  const modelsFetchedAt = typeof profile.modelsFetchedAt === "number"
    && Number.isFinite(profile.modelsFetchedAt)
    && profile.modelsFetchedAt > 0
    ? profile.modelsFetchedAt
    : undefined;

  return {
    id,
    credentialId,
    name,
    provider,
    protocol,
    baseUrl: provider === "packy"
      ? normalizeAiBaseUrl(provider, rawBaseUrl)
      : legacy ? migrateLegacyBaseUrl(rawBaseUrl) : rawBaseUrl,
    authType,
    authHeader: authType === "custom" ? optionalText(profile.authHeader, 100) : undefined,
    authPrefix: authType === "custom" ? optionalPrefix(profile.authPrefix, 100) : undefined,
    modelListPath: provider === "packy"
      ? preset.modelListPath
      : optionalText(profile.modelListPath, 500) ?? protocolDefaults.modelListPath,
    model,
    temperature,
    omitTemperature: provider === "packy"
      ? preset.omitTemperature
      : typeof profile.omitTemperature === "boolean"
        ? profile.omitTemperature
        : preset.omitTemperature,
    tokenParameter,
    maxTokens,
    keyLastFour: typeof profile.keyLastFour === "string"
      ? profile.keyLastFour.slice(-4)
      : undefined,
    availableModels: availableModels.length ? availableModels : undefined,
    modelsFetchedAt,
  };
}

function normalizeConfig(value: unknown, version: 1 | 2): PersistedAiConfig | null {
  const stored = asRecord(value);
  if (stored?.version !== version || !Array.isArray(stored.profiles)) return null;

  const profiles = stored.profiles.flatMap((profile) => {
    const normalized = normalizeProfile(profile, version === 1);
    return normalized ? [normalized] : [];
  });
  const activeProfileId = typeof stored.activeProfileId === "string"
    && profiles.some((profile) => profile.id === stored.activeProfileId)
    ? stored.activeProfileId
    : profiles[0]?.id ?? null;

  return { version: 2, profiles, activeProfileId };
}

function persist(state: PersistedAiConfig) {
  save(STORAGE_KEY, state);
}

function readConfig(): PersistedAiConfig {
  const current = normalizeConfig(load<unknown>(STORAGE_KEY, null), 2);
  if (current) return current;

  const migrated = normalizeConfig(load<unknown>(LEGACY_STORAGE_KEY, null), 1);
  if (migrated) {
    persist(migrated);
    return migrated;
  }
  return EMPTY_CONFIG;
}

function newProfile(): AiProfile {
  const id = uid();
  const preset = getProviderOption("deepseek");
  return {
    id,
    credentialId: `ai-${id}`,
    name: "新建 AI 配置",
    provider: preset.value,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    authType: preset.authType,
    modelListPath: preset.modelListPath,
    model: preset.model,
    temperature: 0.2,
    omitTemperature: preset.omitTemperature,
    tokenParameter: preset.tokenParameter,
    maxTokens: preset.maxTokens,
  };
}

const initial = readConfig();

export const useAiConfigStore = create<AiConfigState>((set) => ({
  ...initial,
  createProfile: () => newProfile(),
  upsertProfile: (profile) => {
    set((current) => {
      const exists = current.profiles.some((item) => item.id === profile.id);
      const profiles = exists
        ? current.profiles.map((item) => (item.id === profile.id ? profile : item))
        : [...current.profiles, profile];
      const next = {
        version: 2 as const,
        profiles,
        activeProfileId: current.activeProfileId ?? profile.id,
      };
      persist(next);
      return next;
    });
  },
  removeProfile: (id) => {
    set((current) => {
      const profiles = current.profiles.filter((profile) => profile.id !== id);
      const next = {
        version: 2 as const,
        profiles,
        activeProfileId:
          current.activeProfileId === id ? profiles[0]?.id ?? null : current.activeProfileId,
      };
      persist(next);
      return next;
    });
  },
  setActiveProfile: (id) => {
    set((current) => {
      if (!current.profiles.some((profile) => profile.id === id)) return current;
      const next = { version: 2 as const, profiles: current.profiles, activeProfileId: id };
      persist(next);
      return next;
    });
  },
}));
