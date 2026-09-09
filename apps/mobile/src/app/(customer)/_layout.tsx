import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/core/auth/authStore";
import { Loading } from "@/shared/ui";

export default function CustomerLayout() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === "checking") {
    return <Loading label="Validando sesión…" />;
  }

  if (status !== "authenticated" || !user || user.role !== "CUSTOMER") {
    return <Redirect href={"/login" as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}