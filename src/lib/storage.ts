// localStorage 持久化封装（本次迭代的存储方案，KISS）
// TODO(安全): 密码/私钥当前明文存储。后续应迁移到加密存储或系统钥匙串。
const PREFIX = "crowssh.";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 忽略写入失败（配额/隐私模式）
  }
}

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
