import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { makeStyles } from "@/shared/theme";
import { estimateLoyaltyDiscount, type LoyaltyEstimate } from "./loyalty";

/**
 * Estimación del descuento por compras de la tienda activa. Solo existe en las tiendas cuyo plan
 * lo incluye (MAX): el plan se identifica por el nivel de marca público de la tienda.
 */
export function useLoyaltyEstimate(subtotal: number): LoyaltyEstimate | null {
  const user = useAuthStore((state) => state.user);
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const tier = useCompanyStore((state) => state.companies.find((company) => company.id === state.selectedCompanyId)?.brand?.tier ?? null);
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => cachedFetch("plans", "public", veloraApi.plans), staleTime: 3_600_000 });
  const rules = plans.data?.find((plan) => plan.brandingTier === tier)?.loyaltyDiscounts ?? null;
  const enabled = Boolean(rules && user && companyId);
  const orders = useQuery({ queryKey: ["orders", user?.id], queryFn: () => cachedFetch("orders", user!.id, veloraApi.orders), enabled });
  const warehouses = useQuery({ queryKey: ["checkout-warehouses", companyId], queryFn: () => cachedFetch("checkout-warehouses", companyId!, () => veloraApi.checkoutWarehouses(companyId!)), enabled });
  if (!enabled || !orders.data || !warehouses.data) return null;
  return estimateLoyaltyDiscount(rules, orders.data, new Set(warehouses.data.map((warehouse) => warehouse.storeId)), subtotal);
}

export function LoyaltyBanner({ estimate, currency = "BOB" }: { estimate: LoyaltyEstimate | null; currency?: string }) {
  const styles = useStyles();
  if (!estimate) return null;
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text style={styles.title}>Descuento por compras</Text>
      {estimate.percent > 0
        ? <Text style={styles.body}>Tienes {estimate.percent}% por tus compras en esta tienda: aprox. −{formatMoney(estimate.amount, currency)}. Se confirma al crear el pedido.</Text>
        : <Text style={styles.body}>Esta tienda premia tus compras entregadas.</Text>}
      {estimate.next ? <Text style={styles.hint}>Te faltan {formatMoney(estimate.next.missing, currency)} en compras entregadas para llegar a {estimate.next.percent}%.</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  box: { borderRadius: 16, padding: 14, gap: 4, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.hairline },
  title: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.accentDeep },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: colors.ink },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.inkSoft },
}));
