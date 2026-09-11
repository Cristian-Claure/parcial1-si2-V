import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/core/auth/authStore";
import { Loading } from "@/shared/ui";
import { mobilePush } from "@/core/push/mobilePush";

export default function CustomerLayout() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "CUSTOMER") return undefined;
    void mobilePush.syncIfPermissionGranted();
    return mobilePush.startLifecycleListeners();
  }, [status, user?.role]);

  if (status === "checking") {
    return <Loading label="Validando sesión…" />;
  }

  if (status !== "authenticated" || !user || user.role !== "CUSTOMER") {
    return <Redirect href={"/login" as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}