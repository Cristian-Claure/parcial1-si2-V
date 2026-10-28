import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/core/auth/authStore";
import { useOwnerStore } from "@/core/company/ownerStore";
import { Loading } from "@/shared/ui";

/** Área del propietario (ADMIN). El alcance de cada dato lo decide el backend (TenantScopeService). */
export default function OwnerLayout() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const ownerStatus = useOwnerStore((state) => state.status);
  const load = useOwnerStore((state) => state.load);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN" && ownerStatus === "idle") void load(user.id);
  }, [status, user, ownerStatus, load]);

  if (status === "checking") return <Loading label="Validando sesión…" />;
  if (status !== "authenticated" || !user) return <Redirect href={"/login" as never} />;
  if (user.role !== "ADMIN") return <Redirect href={"/" as never} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
