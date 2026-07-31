import { post } from "./request";
import type { RuntimeModelConfig } from "../types/aiConfig";

export function testRuntimeModel(config: RuntimeModelConfig) {
  return post<string>("/api/v1/ai/runtime/test", config);
}
