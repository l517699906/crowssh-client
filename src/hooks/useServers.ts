import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerConfig } from "../types";
import * as sshApi from "../api/sshConnection";
import type { SshConnectionDTO, SshConnectionPayload } from "../api/sshConnection";
import {
  deleteSshCredentials,
  readSshCredentials,
  saveSshCredentials,
  type SshCredentials,
} from "../api/sshSecrets";
import { load, save } from "../lib/storage";
import { DEFAULT_CONNECTION_OPTIONS } from "../types";
import type { ConnectionOptions } from "../types";

interface SessionCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

type CredentialMap = Record<string, SessionCredentials>;
type ConnectionOptionsMap = Record<string, ConnectionOptions>;
const OPTIONS_KEY = "server.connection-options.v1";

function toServerConfig(
  dto: SshConnectionDTO,
  credentials: CredentialMap,
  options: ConnectionOptionsMap,
): ServerConfig {
  const local = credentials[dto.connectionId];
  const legacyOptions = options[dto.connectionId];
  return {
    id: dto.connectionId,
    name: dto.connectionName,
    host: dto.host,
    port: dto.port,
    username: dto.username,
    authType: dto.authType === 2 ? "key" : "password",
    password: local?.password,
    privateKey: local?.privateKey,
    passphrase: local?.passphrase,
    savePassword: Boolean(local),
    connectionTimeout:
      dto.connectTimeout ?? legacyOptions?.connectionTimeout ?? DEFAULT_CONNECTION_OPTIONS.connectionTimeout,
    keepAliveInterval:
      dto.keepaliveInterval ?? legacyOptions?.keepAliveInterval ?? DEFAULT_CONNECTION_OPTIONS.keepAliveInterval,
    compression: dto.compression ?? legacyOptions?.compression ?? DEFAULT_CONNECTION_OPTIONS.compression,
    startupCommand: dto.startupCommand ?? legacyOptions?.startupCommand,
    strictHostKeyCheck: true,
    hostKeyFingerprint: dto.hostKeyFingerprint ?? legacyOptions?.hostKeyFingerprint,
  };
}

function toPayload(config: ServerConfig | Omit<ServerConfig, "id">): SshConnectionPayload {
  return {
    ...("id" in config ? { connectionId: config.id } : {}),
    connectionName: config.name,
    host: config.host,
    port: config.port,
    username: config.username,
    authType: config.authType === "key" ? 2 : 1,
    password: config.authType === "password" ? config.password || undefined : undefined,
    privateKey: config.authType === "key" ? config.privateKey || undefined : undefined,
    connectTimeout: config.connectionTimeout,
    keepaliveInterval: config.keepAliveInterval,
    startupCommand: config.startupCommand || undefined,
    compression: config.compression,
    strictHostKeyCheck: true,
    hostKeyFingerprint: config.hostKeyFingerprint,
  };
}

function toSessionCredentials(config: ServerConfig | Omit<ServerConfig, "id">): SessionCredentials | null {
  if (!config.savePassword) return null;
  if (config.authType === "password") {
    return config.password ? { password: config.password } : null;
  }
  return config.privateKey
    ? { privateKey: config.privateKey, passphrase: config.passphrase }
    : null;
}

function fromStoredCredentials(credentials: SshCredentials | null): SessionCredentials | null {
  if (!credentials) return null;
  return credentials.type === "password"
    ? { password: credentials.password }
    : { privateKey: credentials.privateKey, passphrase: credentials.passphrase };
}

function toStoredCredentials(
  config: ServerConfig | Omit<ServerConfig, "id">,
): SshCredentials | null {
  const credentials = toSessionCredentials(config);
  if (!credentials) return null;
  return config.authType === "password"
    ? { type: "password", password: credentials.password! }
    : {
        type: "key",
        privateKey: credentials.privateKey!,
        passphrase: credentials.passphrase,
      };
}

export function useServers() {
  const credentialsRef = useRef<CredentialMap>({});
  const optionsRef = useRef<ConnectionOptionsMap>(load<ConnectionOptionsMap>(OPTIONS_KEY, {}));
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rememberCredentials = useCallback(
    async (connectionId: string, config: ServerConfig | Omit<ServerConfig, "id">) => {
      const credentials = toSessionCredentials(config);
      if (credentials) {
        credentialsRef.current = { ...credentialsRef.current, [connectionId]: credentials };
        await saveSshCredentials(connectionId, toStoredCredentials(config)!);
        return;
      }
      const { [connectionId]: _, ...next } = credentialsRef.current;
      credentialsRef.current = next;
      await deleteSshCredentials(connectionId);
    },
    [],
  );

  const forgetCredentials = useCallback(async (connectionId: string) => {
    const { [connectionId]: _, ...next } = credentialsRef.current;
    credentialsRef.current = next;
    await deleteSshCredentials(connectionId);
  }, []);

  const forgetOptions = useCallback((connectionId: string) => {
    const { [connectionId]: _, ...next } = optionsRef.current;
    optionsRef.current = next;
    save(OPTIONS_KEY, next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await sshApi.getConnectionList();
    if (response.code === "0000") {
      let credentialReadFailed = false;
      const items = response.data ?? [];
      const loadedCredentials = await Promise.all(
        items.map(async (item) => {
          const cached = credentialsRef.current[item.connectionId];
          if (cached) return [item.connectionId, cached] as const;
          try {
            const stored = await readSshCredentials(item.connectionId);
            return [item.connectionId, fromStoredCredentials(stored)] as const;
          } catch {
            credentialReadFailed = true;
            return [item.connectionId, null] as const;
          }
        }),
      );
      const nextCredentials = { ...credentialsRef.current };
      for (const [connectionId, credentials] of loadedCredentials) {
        if (credentials) nextCredentials[connectionId] = credentials;
      }
      credentialsRef.current = nextCredentials;
      setServers(items.map((item) => toServerConfig(item, nextCredentials, optionsRef.current)));
      if (credentialReadFailed) setError("部分服务器凭据无法从系统钥匙串读取");
    } else {
      setError(response.info || "无法读取服务端连接列表");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addServer = useCallback(
    async (config: Omit<ServerConfig, "id">): Promise<boolean> => {
      setError(null);
      const response = await sshApi.createConnection(toPayload(config));
      if (response.code !== "0000" || !response.data) {
        setError(response.info || "创建连接失败");
        return false;
      }

      try {
        await rememberCredentials(response.data.connectionId, config);
      } catch {
        setError("服务器已创建，但凭据无法保存到系统钥匙串");
      }
      const server = toServerConfig(response.data, credentialsRef.current, optionsRef.current);
      setServers((current) => [server, ...current]);
      return true;
    },
    [rememberCredentials],
  );

  const updateServer = useCallback(
    async (config: ServerConfig): Promise<boolean> => {
      setError(null);
      const response = await sshApi.updateConnection(toPayload(config));
      if (response.code !== "0000" || !response.data) {
        setError(response.info || "更新连接失败");
        return false;
      }

      try {
        await rememberCredentials(config.id, config);
      } catch {
        setError("服务器已更新，但凭据无法保存到系统钥匙串");
      }
      const server = toServerConfig(response.data, credentialsRef.current, optionsRef.current);
      setServers((current) => current.map((item) => (item.id === config.id ? server : item)));
      return true;
    },
    [rememberCredentials],
  );

  const trustHostKey = useCallback(async (config: ServerConfig, fingerprint: string): Promise<boolean> => {
    setError(null);
    const response = await sshApi.trustHostKey({
      connectionId: config.id,
      connectionName: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType === "key" ? 2 : 1,
      connectTimeout: config.connectionTimeout,
      keepaliveInterval: config.keepAliveInterval,
      startupCommand: config.startupCommand,
      compression: config.compression,
      strictHostKeyCheck: true,
    }, fingerprint);
    if (response.code !== "0000" || !response.data) {
      setError(response.info || "保存主机指纹失败");
      return false;
    }
    setServers((current) => current.map((item) =>
      item.id === config.id ? { ...item, hostKeyFingerprint: fingerprint } : item,
    ));
    return true;
  }, []);

  const removeServer = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      let response: Awaited<ReturnType<typeof sshApi.deleteConnection>>;
      try {
        response = await sshApi.deleteConnection(id);
      } catch {
        setError("删除服务器失败，请稍后重试");
        return false;
      }
      if (response.code !== "0000") {
        setError(response.info || "删除连接失败");
        return false;
      }

      try {
        await forgetCredentials(id);
      } catch {
        setError("服务器已删除，但系统钥匙串中的凭据清理失败");
      }
      forgetOptions(id);
      setServers((current) => current.filter((item) => item.id !== id));
      return true;
    },
    [forgetCredentials, forgetOptions],
  );

  const hasCredentials = useCallback((server: ServerConfig) => {
    return server.authType === "password"
      ? Boolean(server.password)
      : Boolean(server.privateKey);
  }, []);

  return {
    servers,
    loading,
    error,
    refresh,
    addServer,
    updateServer,
    trustHostKey,
    removeServer,
    hasCredentials,
  };
}
