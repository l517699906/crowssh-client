import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerConfig } from "../types";
import * as sshApi from "../api/sshConnection";
import type { SshConnectionDTO, SshConnectionPayload } from "../api/sshConnection";
import { useSettingsStore } from "../store/settingsStore";
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
    ...DEFAULT_CONNECTION_OPTIONS,
    ...options[dto.connectionId],
  };
}

function toPayload(config: ServerConfig | Omit<ServerConfig, "id">, userId: string): SshConnectionPayload {
  return {
    ...("id" in config ? { connectionId: config.id } : {}),
    connectionName: config.name,
    host: config.host,
    port: config.port,
    username: config.username,
    authType: config.authType === "key" ? 2 : 1,
    password: config.authType === "password" ? config.password || undefined : undefined,
    privateKey: config.authType === "key" ? config.privateKey || undefined : undefined,
    userId,
    connectTimeout: config.connectionTimeout,
    keepaliveInterval: config.keepAliveInterval,
    startupCommand: config.startupCommand || undefined,
    compression: config.compression,
    strictHostKeyCheck: config.strictHostKeyCheck,
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

export function useServers() {
  const userId = useSettingsStore((state) => state.userId);
  const serverUrl = useSettingsStore((state) => state.serverUrl);
  const credentialsRef = useRef<CredentialMap>({});
  const optionsRef = useRef<ConnectionOptionsMap>(load<ConnectionOptionsMap>(OPTIONS_KEY, {}));
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rememberCredentials = useCallback(
    (connectionId: string, config: ServerConfig | Omit<ServerConfig, "id">) => {
      const credentials = toSessionCredentials(config);
      if (credentials) {
        credentialsRef.current = { ...credentialsRef.current, [connectionId]: credentials };
        return;
      }
      const { [connectionId]: _, ...next } = credentialsRef.current;
      credentialsRef.current = next;
    },
    [],
  );

  const forgetCredentials = useCallback((connectionId: string) => {
    const { [connectionId]: _, ...next } = credentialsRef.current;
    credentialsRef.current = next;
  }, []);

  const rememberOptions = useCallback(
    (connectionId: string, config: ServerConfig | Omit<ServerConfig, "id">) => {
      optionsRef.current = {
        ...optionsRef.current,
        [connectionId]: {
          connectionTimeout: config.connectionTimeout,
          keepAliveInterval: config.keepAliveInterval,
          compression: config.compression,
          startupCommand: config.startupCommand,
          strictHostKeyCheck: config.strictHostKeyCheck,
        },
      };
      save(OPTIONS_KEY, optionsRef.current);
    },
    [],
  );

  const forgetOptions = useCallback((connectionId: string) => {
    const { [connectionId]: _, ...next } = optionsRef.current;
    optionsRef.current = next;
    save(OPTIONS_KEY, next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await sshApi.getConnectionList(userId);
    if (response.code === "0000") {
      setServers(
        (response.data ?? []).map((item) =>
          toServerConfig(item, credentialsRef.current, optionsRef.current),
        ),
      );
    } else {
      setError(response.info || "无法读取服务端连接列表");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, serverUrl]);

  const addServer = useCallback(
    async (config: Omit<ServerConfig, "id">): Promise<boolean> => {
      setError(null);
      const response = await sshApi.createConnection(toPayload(config, userId));
      if (response.code !== "0000" || !response.data) {
        setError(response.info || "创建连接失败");
        return false;
      }

      rememberCredentials(response.data.connectionId, config);
      rememberOptions(response.data.connectionId, config);
      const server = toServerConfig(response.data, credentialsRef.current, optionsRef.current);
      setServers((current) => [server, ...current]);
      return true;
    },
    [rememberCredentials, rememberOptions, userId],
  );

  const updateServer = useCallback(
    async (config: ServerConfig): Promise<boolean> => {
      setError(null);
      const response = await sshApi.updateConnection(toPayload(config, userId));
      if (response.code !== "0000" || !response.data) {
        setError(response.info || "更新连接失败");
        return false;
      }

      rememberCredentials(config.id, config);
      rememberOptions(config.id, config);
      const server = toServerConfig(response.data, credentialsRef.current, optionsRef.current);
      setServers((current) => current.map((item) => (item.id === config.id ? server : item)));
      return true;
    },
    [rememberCredentials, rememberOptions, userId],
  );

  const removeServer = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      const response = await sshApi.deleteConnection(id);
      if (response.code !== "0000") {
        setError(response.info || "删除连接失败");
        return false;
      }

      forgetCredentials(id);
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
    removeServer,
    hasCredentials,
  };
}
