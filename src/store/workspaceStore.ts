import { create } from "zustand";
import type { RemoteFile } from "../api/sftp";

export interface WorkspaceState {
  path: string;
  pathInput: string;
  files: RemoteFile[];
  loading: boolean;
  transferring: boolean;
  initialized: boolean;
  error: string | null;
  requestId: number;
  fileScrollTop: number;
  terminalViewportLine: number;
}

const createWorkspace = (): WorkspaceState => ({
  path: "",
  pathInput: "",
  files: [],
  loading: false,
  transferring: false,
  initialized: false,
  error: null,
  requestId: 0,
  fileScrollTop: 0,
  terminalViewportLine: 0,
});

export const EMPTY_WORKSPACE = createWorkspace();

interface WorkspaceStore {
  workspaces: Record<string, WorkspaceState>;
  beginFileRequest: (sessionId: string) => number;
  updateWorkspace: (
    sessionId: string,
    patch: Partial<WorkspaceState>,
  ) => void;
  setFileScrollTop: (sessionId: string, scrollTop: number) => void;
  setTerminalViewportLine: (sessionId: string, line: number) => void;
  removeWorkspace: (sessionId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: {},
  beginFileRequest: (sessionId) => {
    const current = get().workspaces[sessionId] ?? createWorkspace();
    const requestId = current.requestId + 1;
    set((state) => ({
      workspaces: {
        ...state.workspaces,
        [sessionId]: {
          ...current,
          requestId,
          loading: true,
          initialized: true,
          error: null,
        },
      },
    }));
    return requestId;
  },
  updateWorkspace: (sessionId, patch) =>
    set((state) => {
      const current = state.workspaces[sessionId];
      if (!current) return state;
      return {
        workspaces: {
          ...state.workspaces,
          [sessionId]: { ...current, ...patch },
        },
      };
    }),
  setFileScrollTop: (sessionId, fileScrollTop) =>
    set((state) => {
      const current = state.workspaces[sessionId];
      if (!current || current.fileScrollTop === fileScrollTop) return state;
      return {
        workspaces: {
          ...state.workspaces,
          [sessionId]: { ...current, fileScrollTop },
        },
      };
    }),
  setTerminalViewportLine: (sessionId, terminalViewportLine) =>
    set((state) => {
      const current = state.workspaces[sessionId] ?? createWorkspace();
      if (current.terminalViewportLine === terminalViewportLine) return state;
      return {
        workspaces: {
          ...state.workspaces,
          [sessionId]: { ...current, terminalViewportLine },
        },
      };
    }),
  removeWorkspace: (sessionId) =>
    set((state) => {
      if (!state.workspaces[sessionId]) return state;
      const { [sessionId]: _removed, ...workspaces } = state.workspaces;
      return { workspaces };
    }),
}));
