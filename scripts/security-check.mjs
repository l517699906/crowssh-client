import { readFile } from "node:fs/promises";

const failures = [];
const fail = (message) => failures.push(message);

const apiConfig = await readFile(new URL("../src/api/config.ts", import.meta.url), "utf8");
const defaultUrlMatch = apiConfig.match(/DEFAULT_API_BASE_URL\s*=\s*["']([^"']+)["']/);
if (!defaultUrlMatch) {
  fail("无法识别默认 API 地址");
} else if (new URL(defaultUrlMatch[1]).protocol !== "https:") {
  fail("默认 API 地址必须使用 HTTPS");
}
if (!apiConfig.includes('import.meta.env.PROD && url.protocol !== "https:"')) {
  fail("生产 API HTTPS 强制校验缺失");
}
if (/http:\/\/(?!ipc\.localhost)/.test(apiConfig)) {
  fail("API 配置中存在非 IPC 的明文 HTTP 地址");
}

const tauriConfig = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const csp = tauriConfig?.app?.security?.csp;
if (typeof csp !== "string" || !csp.trim()) {
  fail("Tauri 生产 CSP 不能为空");
} else {
  if (csp.includes("'unsafe-eval'")) fail("Tauri 生产 CSP 禁止 unsafe-eval");
  if (/(^|\s)\*(\s|;|$)/.test(csp)) fail("Tauri 生产 CSP 禁止通配符源");
  const connectDirective = csp.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("connect-src "));
  if (!connectDirective?.includes("https:")) {
    fail("Tauri 生产 CSP 的 connect-src 必须允许 HTTPS");
  }
  const unsafeHttpSources = (connectDirective?.split(/\s+/) ?? [])
    .filter((source) => source.startsWith("http://") && source !== "http://ipc.localhost");
  if (unsafeHttpSources.length > 0) {
    fail(`Tauri 生产 CSP 存在明文 HTTP 源: ${unsafeHttpSources.join(", ")}`);
  }
}

const baseUpdaterConfig = tauriConfig?.plugins?.updater;
if (!baseUpdaterConfig || typeof baseUpdaterConfig !== "object" || Array.isArray(baseUpdaterConfig)) {
  fail("Tauri 基础配置必须包含 updater 对象，避免插件启动时解析 null");
} else {
  if (!Array.isArray(baseUpdaterConfig.endpoints) || baseUpdaterConfig.endpoints.length > 0) {
    fail("Tauri 基础 updater 配置不得包含更新地址，正式地址必须由发布配置注入");
  }
  if (baseUpdaterConfig.pubkey !== "") {
    fail("Tauri 基础 updater 公钥必须为空，正式公钥必须由发布配置注入");
  }
  const dangerousUpdaterOptions = [
    "dangerousInsecureTransportProtocol",
    "dangerousAcceptInvalidCerts",
    "dangerousAcceptInvalidHostnames",
  ];
  for (const option of dangerousUpdaterOptions) {
    if (baseUpdaterConfig[option] === true) {
      fail(`Tauri 基础 updater 配置禁止启用 ${option}`);
    }
  }
}

const forbiddenValues = [
  "CrowSSH2026SecretKey",
  "bce-v3/ALTAK-",
  "PromiscuousVerifier",
];
const checkedSources = await Promise.all([
  readFile(new URL("../src/api/agent.ts", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
]);
for (const forbidden of forbiddenValues) {
  if (checkedSources.some((source) => source.includes(forbidden))) {
    fail(`源码中存在禁止的安全回退或已知密钥片段: ${forbidden}`);
  }
}

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
if (packageJson.dependencies?.["@tauri-apps/plugin-updater"] !== "2.10.1") {
  fail("Tauri updater JavaScript 依赖必须精确锁定为 2.10.1");
}
const packageLock = await readFile(new URL("../package-lock.json", import.meta.url), "utf8");
if (!packageLock.includes('"node_modules/@tauri-apps/plugin-updater"')) {
  fail("package-lock.json 缺少 Tauri updater 依赖");
}

const cargoToml = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const cargoLock = await readFile(new URL("../src-tauri/Cargo.lock", import.meta.url), "utf8");
if (!cargoToml.includes('tauri-plugin-updater = "=2.10.1"')) {
  fail("Rust updater 插件必须精确锁定为 2.10.1");
}
if (!cargoLock.includes('name = "tauri-plugin-updater"')
    || !cargoLock.includes('"tauri-plugin-updater"')) {
  fail("Cargo.lock 尚未锁定 Tauri updater 插件");
}

const tauriLib = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
if (!tauriLib.includes("tauri_plugin_updater::Builder::new().build()")) {
  fail("Tauri updater 插件未在桌面运行时注册");
}
if (!tauriLib.includes("restart_app") || !tauriLib.includes("app.restart()")) {
  fail("更新安装后的受控重启命令缺失");
}
const capability = JSON.parse(
  await readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
);
if (!capability.permissions?.includes("updater:default")) {
  fail("主窗口缺少 updater 权限");
}

const appUpdater = await readFile(new URL("../src/services/appUpdater.ts", import.meta.url), "utf8");
if (!appUpdater.includes('import("@tauri-apps/plugin-updater")')
    || !appUpdater.includes("downloadAndInstall")
    || !appUpdater.includes('invoke("restart_app")')) {
  fail("客户端 updater 检查、安装或重启链路不完整");
}
if (appUpdater.includes("allowDowngrades")) {
  fail("客户端 updater 禁止绕过版本递增校验");
}

const releaseConfigScript = await readFile(
  new URL("./generate-release-config.mjs", import.meta.url),
  "utf8",
);
if (!releaseConfigScript.includes("createUpdaterArtifacts: true")
    || !releaseConfigScript.includes("plugins")
    || !releaseConfigScript.includes("updaterPublicKey")) {
  fail("发布配置未强制生成签名 updater 产物");
}
const releaseWorkflow = await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const releaseRequirements = [
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "verify_updater_signature",
  "generate-updater-manifest.mjs",
  "release-artifacts",
];
for (const requirement of releaseRequirements) {
  if (!releaseWorkflow.includes(requirement)) {
    fail(`签名发布工作流缺少门禁: ${requirement}`);
  }
}
if (/codesign[^\n]+dmg_path/.test(releaseWorkflow)) {
  fail("DMG 不能作为 Mach-O 代码对象执行 codesign 验证");
}

if (failures.length > 0) {
  failures.forEach((message) => console.error(`security-check: ${message}`));
  process.exitCode = 1;
} else {
  console.log("security-check: passed");
}
