import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NotificationContext } from "./notification.context";
import type { NotificationItem } from "./notification.context";

export function NotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const value = useMemo(
    () => ({
      notifications,
      success: (item: NotificationItem) =>
        setNotifications((current) => [...current, item]),
    }),
    [notifications],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

