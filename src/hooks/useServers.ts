import { useCallback, useEffect, useState } from "react";
import type { ServerConfig } from "../types";
import { load, save, uid } from "../lib/storage";

const KEY = "servers";

/** 写入 localStorage 前，按「保存密码」开关剥离敏感字段 */
function sanitize(list: ServerConfig[]): ServerConfig[] {
  return list.map((s) =>
    s.savePassword
      ? s
      : { ...s, password: undefined, privateKey: undefined, passphrase: undefined },
  );
}

export function useServers() {
  const [servers, setServers] = useState<ServerConfig[]>(() =>
    load<ServerConfig[]>(KEY, []),
  );

  useEffect(() => {
    save(KEY, sanitize(servers));
  }, [servers]);

  const addServer = useCallback((cfg: Omit<ServerConfig, "id">) => {
    const server: ServerConfig = { ...cfg, id: uid() };
    setServers((prev) => [...prev, server]);
    return server;
  }, []);

  const updateServer = useCallback((cfg: ServerConfig) => {
    setServers((prev) => prev.map((s) => (s.id === cfg.id ? cfg : s)));
  }, []);

  const removeServer = useCallback((id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { servers, addServer, updateServer, removeServer };
}
