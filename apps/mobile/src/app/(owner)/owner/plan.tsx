import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatMoney, labelFor, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@velora/contracts";
import { ownerApi } from "@/core/api/ownerApi";
import { useAuthStore } from "@/core/auth/authStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { OwnerShell } from "@/features/owner/OwnerShell";
import { openWeb } from "@/shared/lib/webUrl";
import { makeStyles, PlatformTheme, useCommonStyles } from "@/shared/theme";
import { Button, ErrorState, Loading, Notice } from "@/shared/ui";

const STATUS_LABELS: Record<string, string> = { TRIAL: "Prueba", ACTIVE: "Activa", PAST_DUE: "Vencida", CANCELLED: "Cancelada" };

/** Mi plan (marca Trama): uso contra los límites, estado y fechas. Mejorar el plan se hace en la web. */
export default function OwnerPlanScreen() {
  return <PlatformTheme><PlanContent /></PlatformTheme>;
}

function PlanContent() {
  const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user)!;
  const plan = useQuery({ queryKey: ["owner-plan", user.id], queryFn: () => cachedFetch("owner-plan", user.id, ownerApi.plan) });
  // Fase 5: el móvil solo muestra el estado de los pagos del plan; pagar o renovar se hace en la web.
  const payments = useQuery({ queryKey: ["owner-plan-payments", user.id], queryFn: () => cachedFetch("owner-plan-payments", user.id, ownerApi.planPayments) });
  const open = payments.data?.find((payment) => payment.status === "PENDING" || payment.status === "PENDING_REVIEW") ?? null;
  const data = plan.data;
  const limits = data?.effectivePlan.limits;

  return (
    <OwnerShell active="more" refreshing={plan.isRefetching} onRefresh={() => void plan.refetch()}>
      <Text style={commonStyles.eyebrow}>MI PLAN</Text>
      {plan.isLoading ? <Loading label="Cargando tu plan…" /> : null}
      {plan.isError && !data ? <ErrorState message={plan.error instanceof Error ? plan.error.message : "No se pudo cargar tu plan."} onRetry={() => void plan.refetch()} /> : null}
      {data && limits ? (
        <>
          <Text style={commonStyles.heading} accessibilityRole="header">Plan {data.effectivePlan.name}</Text>
          <Text style={commonStyles.body}>{formatMoney(data.effectivePlan.priceMonthly, data.effectivePlan.currency)} al mes</Text>
          {data.restricted ? <Notice kind="warning">Tu suscripción no está vigente: se aplican los límites de FREE hasta que la renueves desde la web.</Notice> : null}
          {data.subscription ? (
            <View style={commonStyles.card}>
              <Text style={commonStyles.subheading}>Suscripción</Text>
              <Text style={commonStyles.body}>Estado: {STATUS_LABELS[data.subscription.status] ?? data.subscription.status}{data.subscription.grandfathered ? " (sin vencimiento)" : ""}</Text>
              <Text style={commonStyles.body}>Desde: {formatDate(data.subscription.currentPeriodStart)}</Text>
              <Text style={commonStyles.body}>Hasta: {data.subscription.currentPeriodEnd ? formatDate(data.subscription.currentPeriodEnd) : "sin vencimiento"}</Text>
            </View>
          ) : null}
          <View style={commonStyles.card}>
            <Text style={commonStyles.subheading}>Uso</Text>
            <Usage label="Empresas" used={data.usage.companies} limit={limits.maxCompanies} />
            {data.usage.storesByCompany.map((entry) => (
              <View key={entry.companyId} style={{ gap: 8, marginTop: 6 }}>
                <Text style={commonStyles.label}>{entry.companyName}</Text>
                <Usage label="Sucursales" used={entry.stores} limit={limits.maxStoresPerCompany} />
                <Usage label="Productos" used={entry.products} limit={limits.maxProductsPerCompany} />
              </View>
            ))}
            <Text style={commonStyles.muted}>Probador virtual: {limits.tryOnMonthlyPerCustomer === null ? "ilimitado" : `${limits.tryOnMonthlyPerCustomer} pruebas por cliente al mes`}</Text>
          </View>
          {open ? <Notice kind={open.rejectionReason ? "error" : "info"}>
            Pago del plan {open.planName} por {labelFor(PAYMENT_METHOD_LABELS, open.method)}: {labelFor(PAYMENT_STATUS_LABELS, open.status)}.{open.rejectionReason ? ` Comprobante rechazado: ${open.rejectionReason}.` : ""} Continúalo desde la web.
          </Notice> : null}
          {payments.data?.length ? (
            <View style={commonStyles.card}>
              <Text style={commonStyles.subheading}>Pagos recientes</Text>
              {payments.data.slice(0, 5).map((payment) => (
                <View key={payment.id} style={commonStyles.rowBetween}>
                  <Text style={commonStyles.body}>{formatDate(payment.paidAt ?? payment.createdAt)} · {payment.planName}</Text>
                  <Text style={commonStyles.muted}>{formatMoney(payment.amount, payment.currency)} · {labelFor(PAYMENT_STATUS_LABELS, payment.status)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Button title="Mejorar mi plan en la web" onPress={() => void openWeb("/admin/mi-plan")} />
        </>
      ) : null}
    </OwnerShell>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const full = limit !== null && used >= limit;
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${used} de ${limit ?? "ilimitado"}`}>
      <View style={commonStyles.rowBetween}><Text style={commonStyles.body}>{label}</Text><Text style={[commonStyles.muted, full && styles.full]}>{used} / {limit ?? "∞"}</Text></View>
      {limit ? <View style={styles.track}><View style={[styles.fill, full && styles.fillFull, { width: `${ratio * 100}%` }]} /></View> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceSoft, overflow: "hidden" },
  fill: { height: 8, backgroundColor: colors.accent },
  fillFull: { backgroundColor: colors.warning },
  full: { color: colors.warning },
}));
