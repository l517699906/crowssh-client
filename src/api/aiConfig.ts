import { post } from "./request";
import type { RuntimeModelConfig, RuntimeModelListConfig } from "../types/aiConfig";

export function testRuntimeModel(config: RuntimeModelConfig) {
  return post<string>("/api/v1/ai/runtime/test", config);
}

export function listRuntimeModels(config: RuntimeModelListConfig) {
  return post<string[]>("/api/v1/ai/runtime/models", config);
}
