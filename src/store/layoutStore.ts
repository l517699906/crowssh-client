import { create } from "zustand";
import { load, save } from "../lib/storage";

export type ActivityView = "servers" | "files";
export type LayoutPane = "left" | "terminal" | "right";
const KEY = "layout.state";

interface Persisted {
  activeView: ActivityView;
  leftVisible: boolean;
  terminalVisible: boolean;
  rightVisible: boolean;
  leftWidth: number;
  rightWidth: number;
}

const DEFAULTS: Persisted = {
  activeView: "servers",
  leftVisible: true,
  terminalVisible: true,
  rightVisible: true,
  leftWidth: 260,
  rightWidth: 360,
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

interface LayoutState extends Persisted {
  activePane: LayoutPane;
  activatePane: (pane: LayoutPane) => void;
  selectActivity: (v: ActivityView) => void;
  showActivity: (v: ActivityView) => void;
  toggleLeft: () => void;
  toggleTerminal: () => void;
  toggleRight: () => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
  reset: () => void;
}

const stored = load<Partial<Persisted> & { activeView?: string }>(KEY, {});
const init: Persisted = {
  ...DEFAULTS,
  ...stored,
  activeView: DEFAULTS.activeView,
};

const firstVisiblePane = (
  state: Pick<Persisted, "leftVisible" | "terminalVisible" | "rightVisible">,
): LayoutPane => {
  if (state.leftVisible) return "left";
  if (state.terminalVisible) return "terminal";
  return "right";
};

function persist(s: LayoutState) {
  const {
    activeView,
    leftVisible,
    terminalVisible,
    rightVisible,
    leftWidth,
    rightWidth,
  } = s;
  save<Persisted>(KEY, {
    activeView,
    leftVisible,
    terminalVisible,
    rightVisible,
    leftWidth,
    rightWidth,
  });
}

export const useLayoutStore = create<LayoutState>((set) => ({
  ...init,
  activePane: firstVisiblePane(init),
  activatePane: (pane) =>
    set((s) => {
      const next = {
        activePane: pane,
        ...(pane === "left" ? { leftVisible: true } : {}),
        ...(pane === "terminal" ? { terminalVisible: true } : {}),
        ...(pane === "right" ? { rightVisible: true } : {}),
      };
      persist({ ...s, ...next });
      return next;
    }),
  selectActivity: (v) =>
    set((s) => {
      if (s.activeView === v && s.leftVisible) {
        const next = { leftVisible: false };
        const result = {
          ...next,
          activePane:
            s.activePane === "left"
              ? firstVisiblePane({ ...s, ...next })
              : s.activePane,
        };
        persist({ ...s, ...result });
        return result;
      }

      const next = { activeView: v, leftVisible: true, activePane: "left" as const };
      persist({ ...s, ...next });
      return next;
    }),
  showActivity: (v) =>
    set((s) => {
      const next = { activeView: v, leftVisible: true, activePane: "left" as const };
      persist({ ...s, ...next });
      return next;
    }),
  toggleLeft: () =>
    set((s) => {
      const leftVisible = !s.leftVisible;
      const n = {
        leftVisible,
        activePane: leftVisible
          ? ("left" as const)
          : s.activePane === "left"
            ? firstVisiblePane({ ...s, leftVisible })
            : s.activePane,
      };
      persist({ ...s, ...n });
      return n;
    }),
  toggleTerminal: () =>
    set((s) => {
      const terminalVisible = !s.terminalVisible;
      const n = {
        terminalVisible,
        activePane: terminalVisible
          ? ("terminal" as const)
          : s.activePane === "terminal"
            ? firstVisiblePane({ ...s, terminalVisible })
            : s.activePane,
      };
      persist({ ...s, ...n });
      return n;
    }),
  toggleRight: () =>
    set((s) => {
      const rightVisible = !s.rightVisible;
      const n = {
        rightVisible,
        activePane: rightVisible
          ? ("right" as const)
          : s.activePane === "right"
            ? firstVisiblePane({ ...s, rightVisible })
            : s.activePane,
      };
      persist({ ...s, ...n });
      return n;
    }),
  setLeftWidth: (w) =>
    set((s) => {
      const n = { leftWidth: clamp(w, 180, 480) };
      persist({ ...s, ...n });
      return n;
    }),
  setRightWidth: (w) =>
    set((s) => {
      const n = { rightWidth: clamp(w, 300, 600) };
      persist({ ...s, ...n });
      return n;
    }),
  reset: () =>
    set((s) => {
      persist({ ...s, ...DEFAULTS });
      return { ...DEFAULTS, activePane: "left" };
    }),
}));
