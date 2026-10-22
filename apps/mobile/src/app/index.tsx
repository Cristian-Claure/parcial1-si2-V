import { Redirect } from "expo-router";
import { Loading } from "@/shared/ui";
import { useAuthStore } from "@/core/auth/authStore";

export default function IndexRoute() {
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.user?.role);

  if (status === "checking") {
    return <Loading label="Preparando Trama…" />;
  }

  return (
    <Redirect href={(status !== "authenticated" ? "/login" : role === "STORE_MANAGER" ? "/operations" : "/home") as never} />
  );
}