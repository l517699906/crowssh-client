import { create } from "zustand";
import { load, save } from "../lib/storage";

export type ActivityView = "servers" | "files";
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
  selectActivity: (v) =>
    set((s) => {
      const next =
        s.activeView === v && s.leftVisible
          ? { leftVisible: false }
          : { activeView: v, leftVisible: true };
      persist({ ...s, ...next });
      return next;
    }),
  showActivity: (v) =>
    set((s) => {
      const next = { activeView: v, leftVisible: true };
      persist({ ...s, ...next });
      return next;
    }),
  toggleLeft: () =>
    set((s) => {
      const n = { leftVisible: !s.leftVisible };
      persist({ ...s, ...n });
      return n;
    }),
  toggleTerminal: () =>
    set((s) => {
      const n = { terminalVisible: !s.terminalVisible };
      persist({ ...s, ...n });
      return n;
    }),
  toggleRight: () =>
    set((s) => {
      const n = { rightVisible: !s.rightVisible };
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
      return DEFAULTS;
    }),
}));
