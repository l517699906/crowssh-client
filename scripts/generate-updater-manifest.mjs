import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少发布变量 ${name}`);
  return value;
}

function normalizeVersion(value) {
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error("CROWSSH_RELEASE_VERSION 必须是有效的语义化版本");
  }
  return normalized;
}

function httpsUrl(name) {
  const value = required(name).replace(/\/$/, "");
  if (new URL(value).protocol !== "https:") {
    throw new Error(`${name} 必须使用 HTTPS`);
  }
  return value;
}

function selectArtifact(names, predicate, label) {
  const matches = names.filter((name) => predicate(name) && !name.endsWith(".sig"));
  if (matches.length !== 1) {
    throw new Error(`${label} updater 产物数量必须为 1，实际为 ${matches.length}`);
  }
  return matches[0];
}

async function readSignature(artifactDirectory, artifactName, names) {
  const signatureName = `${artifactName}.sig`;
  if (!names.includes(signatureName)) {
    throw new Error(`缺少 updater 签名 ${signatureName}`);
  }
  const signature = (await readFile(resolve(artifactDirectory, signatureName), "utf8")).trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature) || signature.length < 80) {
    throw new Error(`updater 签名格式无效: ${signatureName}`);
  }
  return { signature, signatureName };
}

async function artifactMetadata(artifactDirectory, artifactName, signatureName) {
  const bytes = await readFile(resolve(artifactDirectory, artifactName));
  return {
    file: artifactName,
    signatureFile: signatureName,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const version = normalizeVersion(required("CROWSSH_RELEASE_VERSION"));
const tag = required("CROWSSH_RELEASE_TAG");
if (tag !== `v${version}`) throw new Error(`发布标签 ${tag} 与版本 ${version} 不一致`);
const commitSha = required("CROWSSH_RELEASE_COMMIT_SHA");
if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error("CROWSSH_RELEASE_COMMIT_SHA 格式无效");

const downloadBaseUrl = httpsUrl("CROWSSH_RELEASE_DOWNLOAD_BASE_URL");
const artifactDirectory = resolve(required("CROWSSH_RELEASE_ARTIFACT_DIR"));
const outputDirectory = resolve(process.env.CROWSSH_RELEASE_OUTPUT_DIR || artifactDirectory);
const publishedAt = process.env.CROWSSH_RELEASE_PUB_DATE?.trim() || new Date().toISOString();
if (Number.isNaN(Date.parse(publishedAt))) throw new Error("CROWSSH_RELEASE_PUB_DATE 格式无效");

const names = (await readdir(artifactDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const macArtifact = selectArtifact(names, (name) => name.endsWith(".app.tar.gz"), "macOS");
const windowsArtifact = selectArtifact(
  names,
  (name) => name.endsWith(".exe") && /setup/i.test(name),
  "Windows",
);
const macSignature = await readSignature(artifactDirectory, macArtifact, names);
const windowsSignature = await readSignature(artifactDirectory, windowsArtifact, names);

const releaseEntry = (artifact, signature) => ({
  url: `${downloadBaseUrl}/${encodeURIComponent(artifact)}`,
  signature,
});
const macRelease = releaseEntry(macArtifact, macSignature.signature);
const windowsRelease = releaseEntry(windowsArtifact, windowsSignature.signature);
const latest = {
  version,
  notes: `CrowSSH ${version}`,
  pub_date: new Date(publishedAt).toISOString(),
  platforms: {
    "darwin-aarch64-app": macRelease,
    "darwin-aarch64": macRelease,
    "windows-x86_64-nsis": windowsRelease,
    "windows-x86_64": windowsRelease,
  },
};

const releaseMetadata = {
  version,
  tag,
  commitSha,
  publishedAt: new Date(publishedAt).toISOString(),
  updatePolicy: "forward-only",
  rollbackPolicy: "publish-a-higher-version-from-the-last-known-good-commit",
  artifacts: {
    macos: await artifactMetadata(
      artifactDirectory,
      macArtifact,
      macSignature.signatureName,
    ),
    windows: await artifactMetadata(
      artifactDirectory,
      windowsArtifact,
      windowsSignature.signatureName,
    ),
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`),
  writeFile(
    resolve(outputDirectory, "release-metadata.json"),
    `${JSON.stringify(releaseMetadata, null, 2)}\n`,
  ),
]);
console.log(`updater-manifest: generated ${basename(outputDirectory)}/latest.json`);
