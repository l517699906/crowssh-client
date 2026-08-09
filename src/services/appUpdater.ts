import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

export type AppUpdate = Update;
export type AppUpdateDownloadEvent = DownloadEvent;

let updateCheck: Promise<Update | null> | null = null;

export function checkForAppUpdate(): Promise<Update | null> {
  if (!import.meta.env.PROD || !isTauri()) {
    return Promise.resolve(null);
  }

  if (!updateCheck) {
    updateCheck = import("@tauri-apps/plugin-updater")
      .then(({ check }) => check({ timeout: 15_000 }))
      .catch((error) => {
        updateCheck = null;
        throw error;
      });
  }
  return updateCheck;
}

export async function installAppUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void,
): Promise<void> {
  await update.downloadAndInstall(onEvent, { timeout: 10 * 60_000 });
}

export async function restartAfterUpdate(): Promise<void> {
  await invoke("restart_app");
}
