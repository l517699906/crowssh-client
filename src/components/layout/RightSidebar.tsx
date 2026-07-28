import { ChatPanel } from "../chat/ChatPanel";
import type { TerminalSession } from "../../types";

export function RightSidebar({ terminal }: { terminal?: TerminalSession }) {
  return (
    <div className="right-sidebar island">
      <ChatPanel terminal={terminal} />
    </div>
  );
}
