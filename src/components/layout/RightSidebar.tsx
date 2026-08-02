import { ChatPanel } from "../chat/ChatPanel";
import type { ServerConfig, TerminalSession } from "../../types";

interface Props {
  terminal?: TerminalSession;
  server?: ServerConfig;
}

export function RightSidebar({ terminal, server }: Props) {
  return (
    <div className="right-sidebar island">
      <ChatPanel terminal={terminal} server={server} />
    </div>
  );
}
