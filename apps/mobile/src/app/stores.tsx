import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { COMPANY_SEGMENT_LABELS, companySegmentSchema, type CompanySegment, type DirectoryEntry } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { cachedFetch } from "@/core/offline/cachedFetch";
import { makeStyles, PlatformTheme, StoreThemeProvider, useCommonStyles, useTheme } from "@/shared/theme";
import { CompanyLogo, EmptyState, ErrorState, Loading, Notice, PLATFORM_NAME, PlatformBrand, Screen } from "@/shared/ui";

const SEGMENTS = companySegmentSchema.options;

/** Directorio de tiendas de la plataforma: buscador, filtro por segmento y tarjetas con el color de cada tienda. */
export default function StoresScreen() {
  return <PlatformTheme><StoresContent /></PlatformTheme>;
}

function StoresContent() {
  const styles = useStyles(); const commonStyles = useCommonStyles(); const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const pinned = useCompanyStore((state) => state.pinned);
  const selectBySlug = useCompanyStore((state) => state.selectBySlug);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<CompanySegment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const directory = useQuery({
    queryKey: ["directory", q.trim(), segment],
    queryFn: () => cachedFetch(`directory:${segment ?? "all"}:${q.trim()}`, "public", () => veloraApi.directory({ q, segment })),
    placeholderData: (previous) => previous,
  });

  const enter = async (store: DirectoryEntry) => {
    setBusy(store.slug); setFailure(null);
    try {
      await selectBySlug(store.slug);
      router.replace((user?.role === "CUSTOMER" ? "/home" : user ? "/" : "/login") as never);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "No se pudo abrir la tienda.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen header={<PlatformBrand showTagline={false} />} refreshing={directory.isRefetching} onRefresh={() => void directory.refetch()}>
      <Text style={commonStyles.eyebrow}>TIENDAS EN {PLATFORM_NAME.toUpperCase()}</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Elige una tienda</Text>
      {pinned ? <Notice>Esta instalación está fijada a una tienda; el directorio es solo informativo.</Notice> : null}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Buscar por nombre o estilo…"
        placeholderTextColor={colors.mutedLight}
        style={commonStyles.input}
        accessibilityLabel="Buscar tiendas"
        returnKeyType="search"
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="Filtrar por segmento">
        <Chip label="Todas" active={segment === null} onPress={() => setSegment(null)} />
        {SEGMENTS.map((value) => <Chip key={value} label={COMPANY_SEGMENT_LABELS[value]} active={segment === value} onPress={() => setSegment(value)} />)}
      </ScrollView>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      {directory.isLoading ? <Loading label="Cargando tiendas…" /> : null}
      {directory.isError && !directory.data ? <ErrorState message={directory.error instanceof Error ? directory.error.message : "No se pudo cargar el directorio."} onRetry={() => void directory.refetch()} /> : null}
      {directory.data && directory.data.length === 0 ? <EmptyState title="Sin resultados">No hay tiendas que coincidan. Prueba con otro nombre o segmento.</EmptyState> : null}
      {directory.data?.map((store) => (
        <StoreThemeProvider key={store.slug} palette={store.palette} brandKey={store.slug}>
          <StoreCard store={store} busy={busy === store.slug} disabled={busy !== null || pinned} onPress={() => void enter(store)} />
        </StoreThemeProvider>
      ))}
      {!user ? <View style={styles.footer}><Text style={commonStyles.muted}>Para comprar necesitas una cuenta de cliente.</Text></View> : null}
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const commonStyles = useCommonStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[commonStyles.chip, active && commonStyles.chipActive]}>
      <Text style={[commonStyles.chipText, active && commonStyles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Tarjeta pintada con la paleta de la tienda (el StoreThemeProvider de arriba la aplica). */
function StoreCard({ store, busy, disabled, onPress }: { store: DirectoryEntry; busy: boolean; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Entrar a ${store.name}${store.tagline ? `. ${store.tagline}` : ""}`}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, (pressed || (disabled && !busy)) && { opacity: 0.7 }]}
    >
      <CompanyLogo company={{ name: store.name, slug: store.slug, logoUrl: store.logoUrl }} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{store.name}</Text>
        {store.tagline ? <Text style={styles.cardTagline} numberOfLines={2}>{store.tagline}</Text> : null}
        {store.segment ? <Text style={styles.cardSegment}>{COMPANY_SEGMENT_LABELS[store.segment]}</Text> : null}
      </View>
      <Text style={styles.cardEnter}>{busy ? "…" : "Entrar"}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderLeftWidth: 6,
    borderLeftColor: colors.accent,
  },
  cardTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: colors.ink },
  cardTagline: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.inkSoft },
  cardSegment: { fontFamily: "Inter_700Bold", fontSize: 11, color: colors.accentDeep, letterSpacing: 0.6 },
  cardEnter: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.accentDeep },
  footer: { alignItems: "center", paddingVertical: 8 },
}));
