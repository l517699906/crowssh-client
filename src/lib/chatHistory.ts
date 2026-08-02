import type { ChatModelSelection, ChatTurn, Conversation, TranscriptItem } from "../types";
import { useChatStore } from "../store/chatStore";

const DATABASE_NAME = "crowssh-chat-history";
const DATABASE_VERSION = 1;
const CONVERSATION_STORE = "conversations";
const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 600;

interface StoredConversation extends Conversation {
  schemaVersion: number;
}

let initializePromise: Promise<void> | null = null;
let persistenceStarted = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
        const store = database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
        store.createIndex("serverId", "serverId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开聊天历史数据库"));
  });
}

function isTranscriptItem(value: unknown): value is TranscriptItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TranscriptItem>;
  return typeof item.id === "string" && typeof item.type === "string";
}

function normalizeTurn(turn: ChatTurn): ChatTurn {
  if (turn.status !== "running") return turn;
  const completedAt = Date.now();
  const interruptedItem: TranscriptItem = {
    id: `${turn.id}:interrupted`,
    type: "error",
    content: "上次处理已中断",
    createdAt: completedAt,
  };
  return {
    ...turn,
    status: "error",
    statusText: "处理已中断",
    completedAt,
    items: [
      ...turn.items.map((item) =>
        item.type === "status" && item.status === "running"
          ? { ...item, status: "error" as const, content: "处理已中断" }
          : item,
      ),
      interruptedItem,
    ],
  };
}

function parseModelSelection(value: unknown): ChatModelSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const selection = value as Partial<ChatModelSelection>;
  if (
    typeof selection.profileId !== "string"
    || !selection.profileId
    || typeof selection.model !== "string"
    || !selection.model.trim()
    || selection.model.length > 200
  ) {
    return undefined;
  }
  return { profileId: selection.profileId, model: selection.model.trim() };
}

function parseConversation(value: unknown): Conversation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StoredConversation>;
  if (
    item.schemaVersion !== SCHEMA_VERSION
    || typeof item.id !== "string"
    || typeof item.title !== "string"
    || typeof item.agentId !== "string"
    || typeof item.serverId !== "string"
    || typeof item.serverLabel !== "string"
    || typeof item.createdAt !== "number"
    || !Array.isArray(item.turns)
  ) {
    return null;
  }
  const turns = item.turns.filter(
    (turn): turn is ChatTurn =>
      Boolean(turn)
      && typeof turn === "object"
      && typeof (turn as ChatTurn).id === "string"
      && Array.isArray((turn as ChatTurn).items)
      && (turn as ChatTurn).items.every(isTranscriptItem),
  ).map(normalizeTurn);
  return {
    id: item.id,
    title: item.title,
    agentId: item.agentId,
    serverId: item.serverId,
    serverLabel: item.serverLabel,
    serverSessionId: item.serverSessionId,
    modelSelection: parseModelSelection(item.modelSelection),
    turns,
    createdAt: item.createdAt,
    updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : item.createdAt,
  };
}

async function loadConversations(): Promise<Conversation[]> {
  const database = await openDatabase();
  if (!database) return [];
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CONVERSATION_STORE, "readonly");
    const request = transaction.objectStore(CONVERSATION_STORE).getAll();
    request.onsuccess = () => {
      const conversations = request.result
        .map(parseConversation)
        .filter((item): item is Conversation => item !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(conversations);
    };
    request.onerror = () => reject(request.error ?? new Error("无法读取聊天历史"));
    transaction.oncomplete = () => database.close();
  });
}

async function saveConversations(conversations: Conversation[]): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CONVERSATION_STORE, "readwrite");
    const store = transaction.objectStore(CONVERSATION_STORE);
    conversations.forEach((conversation) => {
      const record: StoredConversation = {
        ...conversation,
        schemaVersion: SCHEMA_VERSION,
      };
      store.put(record);
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("无法保存聊天历史"));
    };
  });
}

function startPersistence(): void {
  if (persistenceStarted) return;
  persistenceStarted = true;
  useChatStore.subscribe((state, previous) => {
    if (!state.hydrated || state.conversations === previous.conversations) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveConversations(useChatStore.getState().conversations).catch(() => undefined);
    }, SAVE_DELAY_MS);
  });
}

export function initializeChatHistory(): Promise<void> {
  if (!initializePromise) {
    initializePromise = loadConversations()
      .catch(() => [])
      .then((conversations) => {
        useChatStore.getState().hydrate(conversations);
        startPersistence();
      });
  }
  return initializePromise;
}
