import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少发布变量 ${name}`);
  }
  return value;
}

function httpsUrl(name) {
  const value = required(name);
  const normalized = value.replaceAll("{{target}}", "target")
    .replaceAll("{{arch}}", "arch")
    .replaceAll("{{current_version}}", "current-version");
  const url = new URL(normalized);
  if (url.protocol !== "https:") {
    throw new Error(`${name} 必须使用 HTTPS`);
  }
  return value;
}

function rejectPlaceholder(name, value) {
  if (/(change[-_ ]?me|placeholder|example|todo)/i.test(value)) {
    throw new Error(`${name} 不能使用占位值`);
  }
}

function releaseVersion(value) {
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error("CROWSSH_RELEASE_VERSION 必须是有效的语义化版本");
  }
  return normalized;
}

function validateUpdaterPublicKey(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("CROWSSH_UPDATER_PUBLIC_KEY 必须是 Tauri Base64 公钥");
  }
  let decoded;
  try {
    decoded = Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new Error("CROWSSH_UPDATER_PUBLIC_KEY 无法解码");
  }
  if (!decoded.startsWith("untrusted comment: minisign public key\n")) {
    throw new Error("CROWSSH_UPDATER_PUBLIC_KEY 不是有效的 minisign 公钥");
  }
}

const platform = required("CROWSSH_RELEASE_PLATFORM").toLowerCase();
const version = releaseVersion(required("CROWSSH_RELEASE_VERSION"));
const updaterEndpoint = httpsUrl("CROWSSH_UPDATER_ENDPOINT");
const updaterPublicKey = required("CROWSSH_UPDATER_PUBLIC_KEY");
rejectPlaceholder("CROWSSH_UPDATER_PUBLIC_KEY", updaterPublicKey);
validateUpdaterPublicKey(updaterPublicKey);
rejectPlaceholder("TAURI_SIGNING_PRIVATE_KEY", required("TAURI_SIGNING_PRIVATE_KEY"));
required("TAURI_SIGNING_PRIVATE_KEY_PASSWORD");

const baseConfigPath = resolve(
  process.env.CROWSSH_BASE_TAURI_CONFIG_PATH || "src-tauri/tauri.conf.json",
);
const baseConfig = JSON.parse(await readFile(baseConfigPath, "utf8"));
if (baseConfig.version !== version) {
  throw new Error(`发布版本 ${version} 与 Tauri 配置版本 ${baseConfig.version} 不一致`);
}

const bundle = {
  createUpdaterArtifacts: true,
};

if (platform === "macos") {
  required("APPLE_CERTIFICATE");
  required("APPLE_CERTIFICATE_PASSWORD");
  const signingIdentity = required("APPLE_SIGNING_IDENTITY");
  if (!signingIdentity.startsWith("Developer ID Application:")) {
    throw new Error("APPLE_SIGNING_IDENTITY 必须是 Developer ID Application 证书");
  }
  required("APPLE_ID");
  required("APPLE_PASSWORD");
  if (!/^[A-Z0-9]{10}$/.test(required("APPLE_TEAM_ID"))) {
    throw new Error("APPLE_TEAM_ID 格式无效");
  }
  bundle.targets = ["app", "dmg"];
  bundle.macOS = {
    signingIdentity,
    hardenedRuntime: true,
  };
} else if (platform === "windows") {
  required("WINDOWS_CERTIFICATE");
  required("WINDOWS_CERTIFICATE_PASSWORD");
  const certificateThumbprint = required("WINDOWS_SIGNING_THUMBPRINT").replaceAll(" ", "");
  if (!/^[A-F0-9]{40}$/i.test(certificateThumbprint)) {
    throw new Error("WINDOWS_SIGNING_THUMBPRINT 必须是 40 位证书指纹");
  }
  const timestampUrl = httpsUrl("WINDOWS_TIMESTAMP_URL");
  bundle.targets = ["nsis"];
  bundle.windows = {
    certificateThumbprint,
    digestAlgorithm: "sha256",
    timestampUrl,
    tsp: true,
  };
} else {
  throw new Error("CROWSSH_RELEASE_PLATFORM 仅支持 macos 或 windows");
}

const releaseConfig = {
  bundle,
  plugins: {
    updater: {
      endpoints: [updaterEndpoint],
      pubkey: updaterPublicKey,
    },
  },
};

const outputPath = resolve(
  process.env.CROWSSH_RELEASE_CONFIG_PATH || "src-tauri/tauri.release.conf.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(releaseConfig, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`release-config: generated ${outputPath}`);
