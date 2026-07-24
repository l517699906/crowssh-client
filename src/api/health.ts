import { get } from "./request";

export function checkServerHealth() {
  return get<{ status: string }>("/api/v1/health");
}
