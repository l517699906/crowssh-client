import { invoke } from "@tauri-apps/api/core";

export type SshCredentials =
  | { type: "password"; password: string }
  | { type: "key"; privateKey: string; passphrase?: string };

export function saveSshCredentials(connectionId: string, credentials: SshCredentials) {
  return invoke<void>("ssh_credentials_save", { connectionId, credentials });
}

export function readSshCredentials(connectionId: string) {
  return invoke<SshCredentials | null>("ssh_credentials_read", { connectionId });
}

export function deleteSshCredentials(connectionId: string) {
  return invoke<void>("ssh_credentials_delete", { connectionId });
}
