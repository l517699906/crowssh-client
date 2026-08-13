import { create } from "zustand";
import type { TransferTask } from "../types/transfer";

export function isActiveTransfer(task: TransferTask) {
  return task.status === "queued" || task.status === "running";
}

interface TransferStore {
  tasks: TransferTask[];
  addTasks: (tasks: TransferTask[]) => void;
  updateTask: (id: string, patch: Partial<TransferTask>) => void;
  clearSettled: () => void;
}

export const useTransferStore = create<TransferStore>((set) => ({
  tasks: [],
  addTasks: (tasks) => {
    if (tasks.length === 0) return;
    set((state) => ({ tasks: [...state.tasks, ...tasks] }));
  },
  updateTask: (id, patch) =>
    set((state) => {
      const index = state.tasks.findIndex((task) => task.id === id);
      if (index < 0) return state;
      const tasks = [...state.tasks];
      tasks[index] = { ...tasks[index], ...patch };
      return { tasks };
    }),
  clearSettled: () =>
    set((state) => ({
      tasks: state.tasks.filter(isActiveTransfer),
    })),
}));
