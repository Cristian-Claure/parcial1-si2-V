import { useEffect, useState, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { DirectoryEntry } from "@velora/contracts";
import { veloraApi } from "@/core/api/veloraApi";
import { useCompanyStore } from "@/core/company/companyStore";
import { commonStyles } from "@/shared/theme";
import { Button, EmptyState, Loading, Notice, PLATFORM_NAME } from "@/shared/ui";

/**
 * Sin tienda elegida (y sin pin en la instalación) se muestra el selector de tiendas del
 * directorio público de la plataforma. Nunca se elige una tienda arbitrariamente.
 */
export function CompanyGate({ children }: { children: ReactNode }) {
  const status = useCompanyStore((state) => state.status);
  const selectedCompanyId = useCompanyStore((state) => state.selectedCompanyId);
  const error = useCompanyStore((state) => state.error);
  const load = useCompanyStore((state) => state.load);

  if (status === "idle" || status === "loading") {
    return <Loading label="Cargando tiendas…" />;
  }

  if (status === "error") {
    return (
      <View style={{ gap: 12 }}>
        <Notice kind="error">{error ?? "No fue posible cargar las tiendas."}</Notice>
        <Button title="REINTENTAR" onPress={() => void load()} />
      </View>
    );
  }

  if (!selectedCompanyId) return <StorePicker />;
  return <>{children}</>;
}

function StorePicker() {
  const selectBySlug = useCompanyStore((state) => state.selectBySlug);
  const [stores, setStores] = useState<DirectoryEntry[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const request = () => veloraApi.directory().then(setStores).catch((reason: unknown) => setFailure(reason instanceof Error ? reason.message : "No fue posible cargar el directorio."));
  const fetchStores = () => { setFailure(null); void request(); };
  useEffect(() => { void request(); }, []);

  if (failure) {
    return (
      <View style={{ gap: 12 }}>
        <Notice kind="error">{failure}</Notice>
        <Button title="REINTENTAR" variant="secondary" onPress={fetchStores} />
      </View>
    );
  }
  if (!stores) return <Loading label="Cargando tiendas…" />;
  if (stores.length === 0) {
    return <EmptyState title="Aún no hay tiendas">Vuelve pronto: las tiendas de {PLATFORM_NAME} aparecerán aquí.</EmptyState>;
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={commonStyles.eyebrow}>TIENDAS EN {PLATFORM_NAME.toUpperCase()}</Text>
      <Text style={commonStyles.subheading}>Elige una tienda para empezar</Text>
      <Text style={commonStyles.muted}>Puedes cambiar de tienda cuando quieras desde el encabezado.</Text>
      {stores.map((store) => (
        <Pressable
          key={store.slug}
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => { setBusy(store.slug); selectBySlug(store.slug).catch((reason: unknown) => setFailure(reason instanceof Error ? reason.message : "No se pudo abrir la tienda.")).finally(() => setBusy(null)); }}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: store.palette.paper, borderLeftWidth: 5, borderLeftColor: store.palette.accent, opacity: busy && busy !== store.slug ? 0.5 : 1 }}
        >
          {store.logoUrl
            ? <Image source={{ uri: store.logoUrl }} style={{ width: 46, height: 46, borderRadius: 12 }} accessibilityLabel={store.name} />
            : <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: store.palette.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontFamily: "PlayfairDisplay_700Bold", fontSize: 20 }}>{store.name.slice(0, 1)}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: store.palette.ink }}>{store.name}</Text>
            {store.tagline ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: store.palette.ink, opacity: 0.75 }}>{store.tagline}</Text> : null}
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", color: store.palette.accent }}>{busy === store.slug ? "…" : "Entrar"}</Text>
        </Pressable>
      ))}
    </View>
  );
}
