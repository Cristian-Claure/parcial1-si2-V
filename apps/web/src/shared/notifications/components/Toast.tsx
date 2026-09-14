import type { NotificationItem } from "../notification.context";

interface Props {
  item: NotificationItem;
}

export function Toast({item}: Props) {
  return (
    <div role="status">
      <strong>{item.title}</strong>
      <p>{item.message}</p>
    </div>
  );
}
