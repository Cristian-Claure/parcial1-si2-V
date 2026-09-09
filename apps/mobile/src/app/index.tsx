import { Redirect } from "expo-router";
import { Loading } from "@/shared/ui";
import { useAuthStore } from "@/core/auth/authStore";

export default function IndexRoute() {
  const status = useAuthStore((state) => state.status);

  if (status === "checking") {
    return <Loading label="Preparando VÉLORA…" />;
  }

  return (
    <Redirect href={(status === "authenticated" ? "/home" : "/login") as never} />
  );
}