import { useEffect, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { syncOfflineOrders } from "../../core/offline/syncOfflineOrders";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function Bootstrap({ children }: PropsWithChildren) {
  const restore = useAuthStore((state) => state.restore); const user = useAuthStore((state) => state.user);
  const initializePublic = useCompanyStore((state) => state.initializePublic); const loadAdmin = useCompanyStore((state) => state.loadAdmin); const loadManager = useCompanyStore((state) => state.loadManager);
  useEffect(() => { void restore(); void initializePublic(); }, [restore, initializePublic]);
  useEffect(() => { if (user?.role === "ADMIN") void loadAdmin(); if (user?.role === "STORE_MANAGER") void loadManager(); }, [user?.role, loadAdmin, loadManager]);
  useEffect(() => {
    const run = async () => { const current = useAuthStore.getState().user; if (current?.role === "CUSTOMER") { await syncOfflineOrders(current.id); await queryClient.invalidateQueries(); window.dispatchEvent(new Event("velora:offline-sync")); } };
    window.addEventListener("online", run); if (navigator.onLine) void run(); return () => window.removeEventListener("online", run);
  }, []);
  return children;
}

export function AppProviders({ children }: PropsWithChildren) {
  return <BrowserRouter><QueryClientProvider client={queryClient}><Bootstrap>{children}</Bootstrap></QueryClientProvider></BrowserRouter>;
}
