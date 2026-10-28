import { useLocalSearchParams } from "expo-router";
import { OrderDetailScreen } from "@/features/owner/OrdersPanel";

/** Detalle de un pedido operativo (propietario o encargado). */
export default function OrderDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <OrderDetailScreen orderId={typeof id === "string" ? id : ""} />;
}
