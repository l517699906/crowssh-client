import { ChatPanel } from "../chat/ChatPanel";
import type { ChatTarget } from "../../types";

interface Props {
  target?: ChatTarget;
}

export function RightSidebar({ target }: Props) {
  return (
    <div className="right-sidebar island">
      <ChatPanel target={target} />
    </div>
  );
}
