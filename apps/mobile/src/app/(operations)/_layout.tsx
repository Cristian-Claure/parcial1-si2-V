import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { runOperationsSync, useOperationsSync } from "@/core/sync/syncEngine";
import { loadManagerCompany } from "@/features/operations/useManagerCompany";
import { Loading } from "@/shared/ui";

/** Modo operaciones: solo STORE_MANAGER. Sincroniza al entrar y al recuperar la red. */
export default function OperationsLayout() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const isConnected = useNetworkStore((state) => state.isConnected);

  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "STORE_MANAGER") return;
    void (async () => {
      const company = await loadManagerCompany(isConnected);
      await useOperationsSync.getState().refresh(company?.id ?? null, user.id);
      if (isConnected) await runOperationsSync(user.id, company?.id ?? null);
    })();
  }, [status, user, isConnected]);

  if (status === "checking") return <Loading label="Validando sesión…" />;
  if (status !== "authenticated" || !user) return <Redirect href={"/login" as never} />;
  if (user.role !== "STORE_MANAGER") return <Redirect href={"/home" as never} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
