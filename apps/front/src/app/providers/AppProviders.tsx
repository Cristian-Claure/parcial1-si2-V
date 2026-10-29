import { useEffect, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "../../shared/feedback/Toaster";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { syncOfflineOrders } from "../../core/offline/syncOfflineOrders";
import { runOperationsSync, useSyncStatus } from "../../core/sync/syncEngine";
import { useOnlineTracking } from "../../core/sync/useOperationalContext";

const OPERATIONS_SYNC_INTERVAL_MS = 60_000;

function operationalCompanyId(): string | null {
  const user = useAuthStore.getState().user; const companies = useCompanyStore.getState();
  return user?.role === "ADMIN" ? companies.adminCompanyId : user?.role === "STORE_MANAGER" ? companies.managerCompany?.id ?? null : null;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function Bootstrap({ children }: PropsWithChildren) {
  const restore = useAuthStore((state) => state.restore); const user = useAuthStore((state) => state.user);
  const initializePublic = useCompanyStore((state) => state.initializePublic); const loadAdmin = useCompanyStore((state) => state.loadAdmin); const loadManager = useCompanyStore((state) => state.loadManager);
  useEffect(() => { void restore(); void initializePublic(); }, [restore, initializePublic]);
  useEffect(() => { if (user?.role === "ADMIN") void loadAdmin(); if (user?.role === "STORE_MANAGER") void loadManager(); }, [user?.role, loadAdmin, loadManager]);
  useOnlineTracking();
  const adminCompanyId = useCompanyStore((state) => state.adminCompanyId); const managerCompanyId = useCompanyStore((state) => state.managerCompany?.id ?? null);
  // Fase 2: motor único de operaciones (cola genérica + POS + pull) al reconectar, al entrar y cada minuto.
  useEffect(() => {
    if (!user || (user.role !== "ADMIN" && user.role !== "STORE_MANAGER")) return;
    const run = () => { const current = useAuthStore.getState().user; if (current) void runOperationsSync(current, operationalCompanyId()).then(() => queryClient.invalidateQueries()); };
    void useSyncStatus.getState().refreshCounts(operationalCompanyId(), user.id);
    run();
    const timer = window.setInterval(() => { if (navigator.onLine) run(); }, OPERATIONS_SYNC_INTERVAL_MS);
    window.addEventListener("online", run);
    return () => { window.clearInterval(timer); window.removeEventListener("online", run); };
  }, [user, adminCompanyId, managerCompanyId]);
  useEffect(() => {
    const run = async () => { const current = useAuthStore.getState().user; if (current?.role === "CUSTOMER") { await syncOfflineOrders(current.id); await queryClient.invalidateQueries(); window.dispatchEvent(new Event("velora:offline-sync")); } };
    window.addEventListener("online", run); if (navigator.onLine) void run(); return () => window.removeEventListener("online", run);
  }, []);
  return children;
}

export function AppProviders({ children }: PropsWithChildren) {
  return <BrowserRouter><QueryClientProvider client={queryClient}><Bootstrap>{children}<Toaster /></Bootstrap></QueryClientProvider></BrowserRouter>;
}
