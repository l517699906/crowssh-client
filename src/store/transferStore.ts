import { create } from "zustand";
import type { TransferTask } from "../types/transfer";

export type TransferPanelMode = "expanded" | "collapsed";

export function isActiveTransfer(task: TransferTask) {
  return task.status === "queued" || task.status === "running";
}

interface TransferStore {
  tasks: TransferTask[];
  panelMode: TransferPanelMode;
  addTasks: (tasks: TransferTask[]) => void;
  updateTask: (id: string, patch: Partial<TransferTask>) => void;
  setPanelMode: (mode: TransferPanelMode) => void;
  clearSettled: () => void;
}

export const useTransferStore = create<TransferStore>((set) => ({
  tasks: [],
  panelMode: "collapsed",
  addTasks: (tasks) => {
    if (tasks.length === 0) return;
    set((state) => {
      const hasActiveTasks = state.tasks.some(isActiveTransfer);
      return {
        tasks: [...state.tasks, ...tasks],
        panelMode: hasActiveTasks ? state.panelMode : "expanded",
      };
    });
  },
  updateTask: (id, patch) =>
    set((state) => {
      const index = state.tasks.findIndex((task) => task.id === id);
      if (index < 0) return state;
      const tasks = [...state.tasks];
      tasks[index] = { ...tasks[index], ...patch };
      return { tasks };
    }),
  setPanelMode: (panelMode) => set({ panelMode }),
  clearSettled: () =>
    set((state) => ({
      tasks: state.tasks.filter(isActiveTransfer),
    })),
}));
