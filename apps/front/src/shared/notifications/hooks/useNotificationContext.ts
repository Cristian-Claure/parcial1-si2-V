import { useContext } from "react";
import { NotificationContext } from "../notification.context";

export function useNotificationContext() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("NotificationProvider is missing");
  }

  return context;
}
