import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { ReportChart, ReportKpi, ReportLockedWidget, ReportTable } from "@velora/contracts";
import { ownerApi } from "@/core/api/ownerApi";
import { useOwnerCompany, useOwnerStore } from "@/core/company/ownerStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { Chips } from "@/features/owner/OrdersPanel";
import { OwnerShell } from "@/features/owner/OwnerShell";
import { useOwnerStores } from "@/features/owner/ownerQueries";
import { chartBars, formatChange, formatKpiValue, lockedLabel, rangeFor } from "@/features/owner/panelLogic";
import { openWeb } from "@/shared/lib/webUrl";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, EmptyState, ErrorState, Loading, Notice } from "@/shared/ui";

const RANGES: [string, string][] = [["7", "7 días"], ["30", "30 días"], ["90", "90 días"]];

/**
 * Resumen del propietario: muestra exactamente los widgets que devuelve el backend para el plan de
 * la empresa (KPIs, gráficos y tablas) y los bloqueados como "Disponible en PLUS/MAX".
 */
export default function OwnerDashboardScreen() {
  const commonStyles = useCommonStyles();
  const status = useOwnerStore((state) => state.status);
  const company = useOwnerCompany();
  const [days, setDays] = useState("30");
  const [storeId, setStoreId] = useState("");
  const range = useMemo(() => rangeFor(Number(days)), [days]);
  const companyId = company?.id ?? null;
  const stores = useOwnerStores(companyId);
  const overview = useQuery({
    queryKey: ["owner-overview", companyId, range.from, range.to, storeId],
    enabled: Boolean(companyId),
    queryFn: () => cachedFetch("owner-overview", `${companyId}:${range.from}:${range.to}:${storeId}`, () => ownerApi.overview("ADMIN", { companyId, from: range.from, to: range.to, storeId: storeId || null })),
  });

  if (status === "idle" || status === "loading") return <Loading label="Cargando tu empresa…" />;
  if (!company) return <Redirect href={"/owner/companies" as never} />;
  const data = overview.data;
  const policy = data?.policy;
  const activeStores = (stores.data ?? []).filter((store) => store.active);

  return (
    <OwnerShell active="dashboard" refreshing={overview.isRefetching} onRefresh={() => void overview.refetch()}>
      <Text style={commonStyles.eyebrow}>RESUMEN</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">{company.brand?.name ?? company.name}</Text>
      <Chips label="Rango" options={RANGES} value={days} onChange={setDays} />
      {activeStores.length > 1 && policy?.canStoreFilter !== false ? (
        <Chips label="Sucursal" options={[["", "Todas las sucursales"], ...activeStores.map((store) => [store.id, store.name] as [string, string])]} value={storeId} onChange={setStoreId} />
      ) : null}
      {overview.isLoading ? <Loading label="Calculando indicadores…" /> : null}
      {overview.isError && !data ? <ErrorState message={overview.error instanceof Error ? overview.error.message : "No se pudo cargar el resumen."} onRetry={() => void overview.refetch()} /> : null}
      {data ? (
        <>
          <Text style={commonStyles.muted}>{data.scopeLabel} · del {range.from.split("-").reverse().join("/")} al {range.to.split("-").reverse().join("/")}</Text>
          {policy?.clamped ? <Notice kind="warning">Tu plan muestra hasta {policy.historyDays} días de historial; el rango se ajustó.</Notice> : null}
          {data.kpis.length === 0 && data.charts.length === 0 ? <EmptyState title="Sin datos en este rango">Prueba con un rango más amplio.</EmptyState> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{data.kpis.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}</View>
          {data.charts.map((chart) => <ChartCard key={chart.id} chart={chart} />)}
          {data.tables.map((table) => <TableCard key={table.id} table={table} />)}
          {(data.locked ?? []).length ? <Text style={commonStyles.subheading}>Con un plan superior</Text> : null}
          {(data.locked ?? []).map((widget) => <LockedCard key={widget.id} widget={widget} />)}
          {data.deterministicInsights.length ? (
            <View style={commonStyles.card}>
              <Text style={commonStyles.subheading}>Para tener en cuenta</Text>
              {data.deterministicInsights.slice(0, 4).map((insight) => <Text key={insight} style={commonStyles.body}>• {insight}</Text>)}
            </View>
          ) : null}
        </>
      ) : null}
      <Button title="Cambiar de empresa" variant="secondary" onPress={() => router.push("/owner/companies" as never)} />
    </OwnerShell>
  );
}

function KpiCard({ kpi }: { kpi: ReportKpi }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const change = formatChange(kpi.changePct);
  return (
    <View style={[commonStyles.card, styles.kpi]} accessible accessibilityLabel={`${kpi.label}: ${formatKpiValue(kpi)}${change ? `, ${change.text}` : ""}`}>
      <Text style={styles.kpiLabel} numberOfLines={2}>{kpi.label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{formatKpiValue(kpi)}</Text>
      {change ? <Text style={[styles.change, change.trend === "down" ? styles.down : change.trend === "up" ? styles.up : null]}>{change.text}</Text> : null}
    </View>
  );
}

/** Barras con Views (sin librerías de gráficos): la primera serie del gráfico. */
function ChartCard({ chart }: { chart: ReportChart }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const bars = chartBars(chart);
  if (chart.type === "HEATMAP") return <View style={commonStyles.card}><Text style={commonStyles.subheading}>{chart.title}</Text><Text style={commonStyles.muted}>Este mapa de calor se ve completo en la web.</Text></View>;
  if (chart.type === "DONUT") {
    const total = bars.reduce((sum, bar) => sum + bar.value, 0);
    return (
      <View style={commonStyles.card}>
        <Text style={commonStyles.subheading}>{chart.title}</Text>
        {bars.map((bar) => (
          <View key={bar.label} style={{ gap: 4 }} accessible accessibilityLabel={`${bar.label}: ${total ? Math.round((bar.value / total) * 100) : 0} %`}>
            <View style={commonStyles.rowBetween}><Text style={commonStyles.body} numberOfLines={1}>{bar.label}</Text><Text style={commonStyles.muted}>{total ? Math.round((bar.value / total) * 100) : 0} %</Text></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${total ? (bar.value / total) * 100 : 0}%` }]} /></View>
          </View>
        ))}
      </View>
    );
  }
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  return (
    <View style={commonStyles.card} accessible accessibilityLabel={`${chart.title}: ${bars.length} valores, máximo ${Math.round(max)}`}>
      <Text style={commonStyles.subheading}>{chart.title}</Text>
      <View style={styles.chart}>
        {bars.map((bar, index) => <View key={`${bar.label}-${index}`} style={[styles.bar, { height: `${Math.max(2, bar.ratio * 100)}%` }]} />)}
      </View>
      <View style={commonStyles.rowBetween}><Text style={commonStyles.muted}>{bars[0]?.label ?? ""}</Text><Text style={commonStyles.muted}>{bars.at(-1)?.label ?? ""}</Text></View>
    </View>
  );
}

function TableCard({ table }: { table: ReportTable }) {
  const commonStyles = useCommonStyles();
  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.subheading}>{table.title}</Text>
      {table.rows.length === 0 ? <Text style={commonStyles.muted}>Sin datos.</Text> : table.rows.slice(0, 5).map((row, index) => (
        <View key={index} style={commonStyles.rowBetween}>
          <Text style={[commonStyles.body, { flex: 1 }]} numberOfLines={1}>{index + 1}. {row[0]}</Text>
          <Text style={commonStyles.muted}>{row.at(-1)}</Text>
        </View>
      ))}
    </View>
  );
}

function LockedCard({ widget }: { widget: ReportLockedWidget }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  return (
    <View style={[commonStyles.card, styles.locked]}>
      <Text style={styles.lockedBadge}>{lockedLabel(widget)}</Text>
      <Text style={commonStyles.body}>{widget.title}</Text>
      <Button title="Ver planes en la web" variant="secondary" onPress={() => void openWeb("/admin/mi-plan")} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  kpi: { flexGrow: 1, flexBasis: "46%", gap: 4 },
  kpiLabel: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.inkSoft },
  kpiValue: { fontFamily: "Inter_800ExtraBold", fontSize: 22, color: colors.ink },
  change: { fontFamily: "Inter_500Medium", fontSize: 12, color: colors.inkSoft },
  up: { color: colors.success },
  down: { color: colors.error },
  chart: { height: 140, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  bar: { flex: 1, minWidth: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.accent },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceSoft, overflow: "hidden" },
  fill: { height: 8, backgroundColor: colors.accent },
  locked: { borderStyle: "dashed", backgroundColor: colors.paper },
  lockedBadge: { fontFamily: "Inter_700Bold", fontSize: 12, color: colors.accentDeep },
}));
