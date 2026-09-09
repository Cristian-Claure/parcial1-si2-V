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
import { useNetworkStore } from "@/core/network/networkStore";
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
        {children}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
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

        const network = await NetInfo.fetch();
        const connected =
          network.isConnected !== false &&
          network.isInternetReachable !== false;

        if (!active) {
          return;
        }

        setConnected(connected);

        if (connected) {
          await syncCustomer().catch(() => undefined);
        }
      })();
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected =
        state.isConnected !== false &&
        state.isInternetReachable !== false;

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
