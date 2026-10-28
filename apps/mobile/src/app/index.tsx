import { useEffect } from "react";
import { Redirect } from "expo-router";
import { mobileHomePath } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { useOwnerStore } from "@/core/company/ownerStore";
import { PlatformTheme } from "@/shared/theme";
import { Loading } from "@/shared/ui";

/** Entrada: redirección por rol con la función compartida de @velora/contracts. */
export default function IndexRoute() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const storeStatus = useCompanyStore((state) => state.status);
  const hasStore = useCompanyStore((state) => Boolean(state.selectedCompanyId));
  const ownerStatus = useOwnerStore((state) => state.status);
  const ownerSelected = useOwnerStore((state) => Boolean(state.selectedCompanyId));
  const loadOwner = useOwnerStore((state) => state.load);

  const isOwner = status === "authenticated" && user?.role === "ADMIN";
  useEffect(() => {
    if (isOwner && user && ownerStatus === "idle") void loadOwner(user.id);
  }, [isOwner, user, ownerStatus, loadOwner]);

  const waiting = status === "checking"
    || (user?.role === "CUSTOMER" && (storeStatus === "idle" || storeStatus === "loading"))
    || (isOwner && (ownerStatus === "idle" || ownerStatus === "loading"));
  const target = waiting ? null : mobileHomePath({ status, role: user?.role ?? null, hasStore, ownerCompanySelected: ownerSelected });

  if (!target) return <PlatformTheme><Loading label="Preparando Trama…" /></PlatformTheme>;
  return <Redirect href={target as never} />;
}
