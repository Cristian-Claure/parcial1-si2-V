import { useEffect } from "react";
import { useAuthStore } from "../auth/authStore";
import { useCompanyStore } from "./companyStore";

export function useOperationalCompanyId(): string | null {
  const user = useAuthStore((state) => state.user);
  const adminCompanyId = useCompanyStore((state) => state.adminCompanyId);
  const managerCompany = useCompanyStore((state) => state.managerCompany);
  const loadAdmin = useCompanyStore((state) => state.loadAdmin);
  const loadManager = useCompanyStore((state) => state.loadManager);
  useEffect(() => {
    if (user?.role === "ADMIN") void loadAdmin();
    if (user?.role === "STORE_MANAGER") void loadManager();
  }, [user?.role, loadAdmin, loadManager]);
  return user?.role === "ADMIN" ? adminCompanyId : user?.role === "STORE_MANAGER" ? managerCompany?.id ?? null : null;
}
