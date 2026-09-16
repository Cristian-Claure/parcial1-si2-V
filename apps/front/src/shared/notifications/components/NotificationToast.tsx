import type { NotificationItem } from "../notification.context";

export function NotificationToast({
  item,
}: {
  item: NotificationItem;
}) {
  return (
    <div role="status" className="velora-motion">
      <strong>{item.title}</strong>
      <p>{item.message}</p>
    </div>
  );
}
