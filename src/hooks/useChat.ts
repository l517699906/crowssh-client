import { useCallback, useState } from "react";
import type { Agent, ChatMessage, Conversation } from "../types";
import { uid } from "../lib/storage";

export const AGENTS: Agent[] = [
  { id: "assistant", name: "通用助手", description: "日常问答与命令帮助" },
  { id: "ops", name: "运维专家", description: "服务器运维与故障排查" },
  { id: "coder", name: "代码助手", description: "脚本与代码编写" },
];

function createConversation(): Conversation {
  return {
    id: uid(),
    title: "新对话",
    agentId: AGENTS[0].id,
    messages: [],
    createdAt: Date.now(),
  };
}

/**
 * mock 流式回复。真实 AI 接入时替换此函数为对后端/大模型 API 的调用即可，
 * onChunk 承接流式增量，签名保持不变。
 */
function streamMockReply(
  agent: Agent,
  userText: string,
  onChunk: (text: string) => void,
  onDone: () => void,
) {
  const full = `【${agent.name}】已收到你的消息：“${userText}”。\n\n这是一条占位回复 —— 真实大模型接入将在后续迭代实现（当前仅演示对话交互）。`;
  let i = 0;
  const timer = setInterval(() => {
    i = Math.min(i + 2, full.length);
    onChunk(full.slice(0, i));
    if (i >= full.length) {
      clearInterval(timer);
      onDone();
    }
  }, 16);
}

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(() => [
    createConversation(),
  ]);
  const [activeId, setActiveId] = useState<string>(
    () => conversations[0]?.id ?? "",
  );

  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  const newConversation = useCallback(() => {
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
  }, []);

  const setAgent = useCallback((agentId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, agentId } : c)),
    );
  }, [activeId]);

  /** 更新当前对话中某条消息 */
  const patchMessage = useCallback(
    (msgId: string, patch: Partial<ChatMessage>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, ...patch } : m,
                ),
              }
            : c,
        ),
      );
    },
    [activeId],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || !active) return;
      const agent =
        AGENTS.find((a) => a.id === active.agentId) ?? AGENTS[0];

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        createdAt: Date.now(),
      };
      const aiMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        pending: true,
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === active.id
            ? {
                ...c,
                title:
                  c.messages.length === 0 ? content.slice(0, 20) : c.title,
                messages: [...c.messages, userMsg, aiMsg],
              }
            : c,
        ),
      );

      streamMockReply(
        agent,
        content,
        (t) => patchMessage(aiMsg.id, { content: t }),
        () => patchMessage(aiMsg.id, { pending: false }),
      );
    },
    [active, patchMessage],
  );

  return {
    conversations,
    active,
    activeId,
    setActiveConversation: setActiveId,
    newConversation,
    setAgent,
    sendMessage,
  };
}
