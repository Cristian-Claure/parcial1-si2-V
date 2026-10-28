import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { CompanyResponse } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { useOwnerStore } from "@/core/company/ownerStore";
import { openWeb } from "@/shared/lib/webUrl";
import { makeStyles, PlatformTheme, StoreThemeProvider, useCommonStyles } from "@/shared/theme";
import { Button, CompanyLogo, EmptyState, ErrorState, Loading, PlatformBrand, Screen } from "@/shared/ui";

/** Mis empresas: el propietario elige con cuál trabajar (se recuerda la última). */
export default function OwnerCompaniesScreen() {
  return <PlatformTheme><CompaniesContent /></PlatformTheme>;
}

function CompaniesContent() {
  const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { status, companies, selectedCompanyId, error, load, select } = useOwnerStore();

  const enter = async (company: CompanyResponse) => {
    await select(company.id);
    router.replace("/owner/dashboard" as never);
  };

  return (
    <Screen header={<PlatformBrand showTagline={false} />} refreshing={status === "loading"} onRefresh={() => user && void load(user.id)}>
      <Text style={commonStyles.eyebrow}>TUS EMPRESAS</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">¿Con qué empresa quieres trabajar?</Text>
      <Text style={commonStyles.muted}>Puedes cambiar de empresa cuando quieras desde el menú «Más».</Text>
      {status === "loading" && companies.length === 0 ? <Loading label="Cargando tus empresas…" /> : null}
      {status === "error" ? <ErrorState message={error ?? "No se pudieron cargar tus empresas."} onRetry={() => user && void load(user.id)} /> : null}
      {status === "ready" && companies.length === 0 ? (
        <EmptyState title="Aún no tienes empresas activas" actionTitle="Crear empresa en la web" onAction={() => void openWeb("/admin/empresas")}>
          Las empresas se crean desde la web. Cuando tengas una, aparecerá aquí.
        </EmptyState>
      ) : null}
      {companies.map((company) => (
        <StoreThemeProvider key={company.id} palette={company.brand?.palette ?? null} brandKey={company.id}>
          <CompanyCard company={company} last={company.id === selectedCompanyId} onPress={() => void enter(company)} />
        </StoreThemeProvider>
      ))}
      <Button title="Cerrar sesión" variant="secondary" onPress={() => void logout().then(() => router.replace("/login" as never))} />
    </Screen>
  );
}

function CompanyCard({ company, last, onPress }: { company: CompanyResponse; last: boolean; onPress: () => void }) {
  const styles = useStyles();
  const name = company.brand?.name ?? company.displayName ?? company.name;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Entrar a ${name}${last ? ", última usada" : ""}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
      <CompanyLogo company={{ name, slug: company.brand?.slug ?? company.slug, logoUrl: company.brand?.logoUrl ?? null }} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta} numberOfLines={1}>/t/{company.brand?.slug ?? company.slug}</Text>
        {last ? <Text style={styles.badge}>Última usada</Text> : null}
      </View>
      <Text style={styles.enter}>Entrar</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18,
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.hairline, borderLeftWidth: 6, borderLeftColor: colors.accent,
  },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: colors.ink },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: colors.inkSoft },
  badge: { fontFamily: "Inter_700Bold", fontSize: 11, color: colors.accentDeep },
  enter: { fontFamily: "Inter_700Bold", fontSize: 14, color: colors.accentDeep },
}));
