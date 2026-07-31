import { invoke } from "@tauri-apps/api/core";

export interface SecretStatus {
  configured: boolean;
  lastFour?: string;
}

export function saveAiSecret(credentialId: string, secret: string) {
  return invoke<SecretStatus>("ai_secret_save", { credentialId, secret });
}

export function getAiSecretStatus(credentialId: string) {
  return invoke<SecretStatus>("ai_secret_status", { credentialId });
}

export function readAiSecretForRequest(credentialId: string) {
  return invoke<string>("ai_secret_read_for_request", { credentialId });
}

export function deleteAiSecret(credentialId: string) {
  return invoke<void>("ai_secret_delete", { credentialId });
}
