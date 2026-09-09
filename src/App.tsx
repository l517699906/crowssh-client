import { useServers } from "./hooks/useServers";
import { useTerminals } from "./hooks/useTerminals";
import { AppLayout } from "./components/layout/AppLayout";
import { UpdateNotice } from "./components/common/UpdateNotice";
import { useEffect, useState } from 'react';
import { pruneSqlHistory } from './lib/sqlHistory';

export default function App() {
  const servers = useServers();
  const terminals = useTerminals();
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    let active = true;
    let running = false;
    const prune = async () => {
      if (running) return;
      running = true;
      try { await pruneSqlHistory(); if (active) setHistoryError(false); }
      catch { if (active) setHistoryError(true); }
      finally { running = false; }
    };
    void prune();
    const timer = setInterval(() => void prune(), 60000);
    window.addEventListener('focus', prune);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', prune); };
  }, []);
  return (
    <>
      <AppLayout servers={servers} terminals={terminals} />
      <UpdateNotice />
      {historyError && <div className="db-message" role="alert">查询历史过期清理失败，请检查本地存储；应用将继续尝试。</div>}
    </>
  );
}
