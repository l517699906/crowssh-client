import { useState } from "react";
import { useServers } from "./hooks/useServers";
import { useTerminals } from "./hooks/useTerminals";
import { Splitter } from "./components/layout/Splitter";
import { ServerPanel } from "./components/servers/ServerPanel";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { ChatPanel } from "./components/chat/ChatPanel";
import "./components/layout/layout.css";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export default function App() {
  const { servers, addServer, updateServer, removeServer } = useServers();
  const terminals = useTerminals();
  const [leftW, setLeftW] = useState(260);
  const [rightW, setRightW] = useState(360);

  return (
    <div className="app-shell">
      <aside className="island" style={{ width: leftW, flexShrink: 0 }}>
        <ServerPanel
          servers={servers}
          addServer={addServer}
          updateServer={updateServer}
          removeServer={removeServer}
          onConnect={terminals.openSession}
        />
      </aside>

      <Splitter onResize={(dx) => setLeftW((w) => clamp(w + dx, 180, 480))} />

      <main className="island" style={{ flex: 1, minWidth: 0 }}>
        <TerminalPanel terminals={terminals} servers={servers} />
      </main>

      <Splitter onResize={(dx) => setRightW((w) => clamp(w - dx, 300, 600))} />

      <aside className="island" style={{ width: rightW, flexShrink: 0 }}>
        <ChatPanel />
      </aside>
    </div>
  );
}
