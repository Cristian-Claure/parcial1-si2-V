import { useEffect, useRef, type ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { useOwnerStore } from "@/core/company/ownerStore";
import { useLoadedManagerCompany } from "@/features/operations/useManagerCompany";
import { StoreThemeProvider } from "@/shared/theme";
import {
  deriveIsConnected,
  networkReady,
  useNetworkStore,
} from "@/core/network/networkStore";
import { initMobileDb } from "@/core/offline/mobileDb";
import { syncOfflineOrders } from "@/core/offline/syncOfflineOrders";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 20_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Bootstrap />
        <ActiveTheme>{children}</ActiveTheme>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Tema activo según quién usa la app: el cliente ve la paleta de la tienda elegida, el
 * propietario la de su empresa activa y el encargado la de su empresa. Sin empresa → Trama.
 * Las pantallas de plataforma fuerzan Trama con <PlatformTheme>.
 */
function ActiveTheme({ children }: { children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role);
  const storefront = useCompanyStore((state) => state.companies.find((company) => company.id === state.selectedCompanyId) ?? null);
  const owner = useOwnerStore((state) => state.companies.find((company) => company.id === state.selectedCompanyId) ?? null);
  const manager = useLoadedManagerCompany();
  const company = role === "ADMIN" ? owner : role === "STORE_MANAGER" ? manager : role === "PLATFORM_ADMIN" ? null : storefront;
  return <StoreThemeProvider palette={company?.brand?.palette ?? null} brandKey={company?.id ?? null}>{children}</StoreThemeProvider>;
}


function Bootstrap() {
  const client = useQueryClient();
  const setConnected = useNetworkStore((state) => state.setConnected);
  const started = useRef(false);

  useEffect(() => {
    let active = true;

    const syncCustomer = async () => {
      const user = useAuthStore.getState().user;
      if (!user || user.role !== "CUSTOMER") {
        return;
      }

      await syncOfflineOrders(user.id);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["orders"] }),
        client.invalidateQueries({
          queryKey: ["offline-orders", user.id],
        }),
        client.invalidateQueries({ queryKey: ["cart", user.id] }),
      ]);
    };

    if (!started.current) {
      started.current = true;
      void (async () => {
        await initMobileDb();
        await Promise.all([
          useAuthStore.getState().restore(),
          useCompanyStore.getState().load(),
        ]);

        const connected = await networkReady;

        if (!active) {
          return;
        }

        if (connected) {
          await syncCustomer().catch(() => undefined);
        }
      })();
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = deriveIsConnected(state);

      setConnected(connected);

      if (connected) {
        void syncCustomer().catch(() => undefined);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, setConnected]);

  return null;
}
