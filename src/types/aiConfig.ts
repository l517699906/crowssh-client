export type AiProvider = "openai" | "deepseek" | "openai-compatible";

export interface AiProfile {
  id: string;
  credentialId: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  keyLastFour?: string;
}

export interface RuntimeModelConfig {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export const PROVIDER_OPTIONS: Array<{
  value: AiProvider;
  label: string;
  baseUrl: string;
  model: string;
}> = [
  {
    value: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com",
    model: "gpt-5-mini",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    value: "openai-compatible",
    label: "OpenAI 兼容",
    baseUrl: "https://",
    model: "",
  },
];
