import { create } from "zustand";
import { load, save, uid } from "../lib/storage";
import type { AiProfile, AiProvider } from "../types/aiConfig";

const STORAGE_KEY = "settings.ai-profiles.v1";

interface PersistedAiConfig {
  version: 1;
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
  version: 1,
  activeProfileId: null,
  profiles: [],
};

function readConfig(): PersistedAiConfig {
  const stored = load<Partial<PersistedAiConfig>>(STORAGE_KEY, EMPTY_CONFIG);
  if (stored.version !== 1 || !Array.isArray(stored.profiles)) return EMPTY_CONFIG;

  const providers = new Set<AiProvider>(["openai", "deepseek", "openai-compatible"]);
  const profiles = stored.profiles.flatMap((profile) => {
    if (!profile?.id || !profile.credentialId || !profile.name || !profile.baseUrl || !profile.model) {
      return [];
    }
    const provider = providers.has(profile.provider) ? profile.provider : "openai-compatible";
    const temperature = Number.isFinite(profile.temperature)
      ? Math.min(2, Math.max(0, profile.temperature))
      : 0.2;
    const storedMaxTokens = profile.maxTokens;
    const maxTokens = typeof storedMaxTokens === "number"
      && Number.isInteger(storedMaxTokens)
      && storedMaxTokens > 0
      ? Math.min(131072, storedMaxTokens)
      : undefined;
    return [{
      id: profile.id,
      credentialId: profile.credentialId,
      name: profile.name,
      provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      temperature,
      maxTokens,
      keyLastFour: typeof profile.keyLastFour === "string" ? profile.keyLastFour.slice(-4) : undefined,
    }];
  });
  const activeProfileId = profiles.some((profile) => profile.id === stored.activeProfileId)
    ? stored.activeProfileId ?? null
    : profiles[0]?.id ?? null;

  return { version: 1, profiles, activeProfileId };
}

function persist(state: PersistedAiConfig) {
  save(STORAGE_KEY, state);
}

function newProfile(): AiProfile {
  const id = uid();
  return {
    id,
    credentialId: `ai-${id}`,
    name: "新建 AI 配置",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    temperature: 0.2,
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
        version: 1 as const,
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
        version: 1 as const,
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
      const next = { version: 1 as const, profiles: current.profiles, activeProfileId: id };
      persist(next);
      return next;
    });
  },
}));
