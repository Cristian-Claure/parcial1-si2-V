import { create } from "zustand";

export type ToastKind = "success" | "info" | "error";
export interface ToastItem { id: number; kind: ToastKind; message: string }

const TOAST_MS = 4500;
let counter = 0;

/** Avisos breves que se cierran solos (P3 · UX_AUDIT): los errores persistentes siguen como Notice. */
export const useToastStore = create<{ toasts: ToastItem[]; push: (message: string, kind?: ToastKind) => void; dismiss: (id: number) => void }>((set, get) => ({
  toasts: [],
  push: (message, kind = "success") => {
    counter += 1;
    const id = counter;
    set({ toasts: [...get().toasts.slice(-2), { id, kind, message }] });
    setTimeout(() => get().dismiss(id), TOAST_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export const toast = (message: string, kind?: ToastKind) => useToastStore.getState().push(message, kind);
