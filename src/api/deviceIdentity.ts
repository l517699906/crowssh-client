import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settingsStore";
import { buildRequestUrl } from "./config";

const REGISTER_PATH = "/api/v1/auth/device/register";
const REGISTER_TIMEOUT_MS = 15_000;
const REGISTRATION_CODE = (import.meta.env.VITE_CROWSSH_REGISTRATION_CODE as string | undefined)?.trim();

export interface DeviceIdentity {
  principalId: string;
  accessToken: string;
}

interface RegistrationResponse {
  code: string;
  info: string;
  data: DeviceIdentity | null;
}

let cachedIdentity: DeviceIdentity | null = null;
let identityPromise: Promise<DeviceIdentity> | null = null;

function isValidIdentity(value: DeviceIdentity | null): value is DeviceIdentity {
  return Boolean(value?.principalId.trim() && value?.accessToken.trim());
}

async function readStoredIdentity(): Promise<DeviceIdentity | null> {
  if (!isTauri()) return null;
  const identity = await invoke<DeviceIdentity | null>("device_identity_read");
  return isValidIdentity(identity) ? identity : null;
}

async function saveStoredIdentity(identity: DeviceIdentity): Promise<void> {
  if (!isTauri()) return;
  await invoke<void>("device_identity_save", {
    principalId: identity.principalId,
    accessToken: identity.accessToken,
  });
}

async function registerIdentity(): Promise<DeviceIdentity> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (REGISTRATION_CODE) headers["X-CrowSSH-Registration-Code"] = REGISTRATION_CODE;
    const response = await fetch(buildRequestUrl(REGISTER_PATH), {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    const result = (await response.json()) as RegistrationResponse;
    if (!response.ok || result.code !== "0000" || !isValidIdentity(result.data)) {
      throw new Error(result.info || `设备身份注册失败 (${response.status})`);
    }
    await saveStoredIdentity(result.data);
    return result.data;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      throw new Error("设备身份注册超时");
    }
    throw reason;
  } finally {
    window.clearTimeout(timer);
  }
}

async function initializeIdentity(): Promise<DeviceIdentity> {
  const stored = await readStoredIdentity();
  if (stored) return stored;
  return registerIdentity();
}

export function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cachedIdentity) return Promise.resolve(cachedIdentity);
  if (!identityPromise) {
    identityPromise = initializeIdentity()
      .then((identity) => {
        cachedIdentity = identity;
        useSettingsStore.getState().setPrincipalId(identity.principalId);
        return identity;
      })
      .catch((reason) => {
        identityPromise = null;
        throw reason;
      });
  }
  return identityPromise;
}

export async function withDeviceAuthorization(headers?: HeadersInit): Promise<Headers> {
  const identity = await getDeviceIdentity();
  const authorized = new Headers(headers);
  authorized.set("Authorization", `Bearer ${identity.accessToken}`);
  return authorized;
}

export async function getDeviceAuthorizationValue(): Promise<string> {
  const identity = await getDeviceIdentity();
  return `Bearer ${identity.accessToken}`;
}

export async function fetchWithDeviceAuthorization(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = await withDeviceAuthorization(init.headers);
  return fetch(input, { ...init, headers });
}
