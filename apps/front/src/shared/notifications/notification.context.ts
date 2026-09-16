import { createContext } from "react";

export interface NotificationItem {
  title: string;
  message: string;
  type?: "success" | "error" | "info";
}

export interface NotificationContextValue {
  notifications: NotificationItem[];
  success: (item: NotificationItem) => void;
}

export const NotificationContext =
  createContext<NotificationContextValue | null>(null);
