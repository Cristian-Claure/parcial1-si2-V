import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useCompanyStore } from "@/core/company/companyStore";
import { resolveAssetUrl } from "@/shared/lib/productImages";
import { makeStyles, useCommonStyles, useTheme } from "@/shared/theme";
import tramaMark from "../../assets/images/trama-mark.png";
import veloraMark from "../../assets/images/velora-mark.png";

/** Plataforma Trama: nombre y tagline (iguales a la web). */
export const PLATFORM_NAME = "Trama";
export const PLATFORM_TAGLINE = "Tu tienda de moda, lista en minutos.";

/** Slug de la única tienda que puede mostrar el monograma editorial propio cuando no tiene logo. */
const EDITORIAL_MARK_SLUG = "velora";

/** Monograma "T" tejido de Trama (PNG generado desde el SVG de la web con el script de íconos). */
export function PlatformMark({ size = 32 }: { size?: number }) {
  return <Image source={tramaMark} style={{ width: size, height: size }} accessibilityLabel={PLATFORM_NAME} contentFit="contain" />;
}

/** Marca de la plataforma (login, registro, tiendas, elegir empresa, planes). */
export function PlatformBrand({ showTagline = true }: { showTagline?: boolean }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  return (
    <View style={styles.brandRow} accessibilityRole="header">
      <PlatformMark />
      <View style={{ flexShrink: 1 }}>
        <Text style={[commonStyles.brand, styles.platformWordmark]}>{PLATFORM_NAME}</Text>
        {showTagline ? <Text style={commonStyles.brandTag}>{PLATFORM_TAGLINE}</Text> : null}
      </View>
    </View>
  );
}

/** Compatibilidad: `Brand` era la marca de la plataforma. */
export const Brand = PlatformBrand;

export interface CompanyBrandInfo { name: string; slug?: string | null; logoUrl?: string | null }

/** Logo de la empresa; sin logo, círculo con la inicial en el color de acento (la tienda editorial usa su monograma). */
export function CompanyLogo({ company, size = 36 }: { company: CompanyBrandInfo; size?: number }) {
  const { colors } = useTheme();
  if (company.logoUrl) {
    return <Image source={{ uri: resolveAssetUrl(company.logoUrl) }} style={{ width: size, height: size, borderRadius: size / 4 }} contentFit="cover" accessibilityLabel={`Logo de ${company.name}`} />;
  }
  if (company.slug === EDITORIAL_MARK_SLUG) {
    return <Image source={veloraMark} style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: colors.paperRaised }} contentFit="contain" accessibilityLabel={`Logo de ${company.name}`} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`Logo de ${company.name}`}>
      <Text style={{ color: colors.onAccent, fontFamily: "PlayfairDisplay_700Bold", fontSize: size * 0.48 }}>{company.name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** Logo + nombre de la empresa, con "en Trama" o un subtítulo propio. */
export function CompanyBrand({ company, subtitle }: { company: CompanyBrandInfo; subtitle?: string }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  return (
    <View style={[styles.brandRow, { flexShrink: 1 }]}>
      <CompanyLogo company={company} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[commonStyles.brand, styles.companyName]} numberOfLines={1}>{company.name}</Text>
        <Text style={commonStyles.brandTag} numberOfLines={1}>{subtitle ?? `en ${PLATFORM_NAME}`}</Text>
      </View>
    </View>
  );
}

/** Encabezado del cliente: tienda activa (o Trama si aún no hay) y "Cambiar de tienda". */
export function StoreHeader() {
  const styles = useStyles();
  const companies = useCompanyStore((state) => state.companies);
  const selected = useCompanyStore((state) => state.selectedCompanyId);
  const pinned = useCompanyStore((state) => state.pinned);
  const company = companies.find((item) => item.id === selected);
  if (!company) return <PlatformBrand />;
  const info = { name: company.brand?.name ?? company.name, slug: company.brand?.slug ?? company.slug, logoUrl: company.brand?.logoUrl ?? null };
  return (
    <View style={[styles.brandRow, { justifyContent: "space-between" }]}>
      <CompanyBrand company={info} />
      {!pinned ? (
        <Pressable onPress={() => router.push("/stores" as never)} accessibilityRole="button" accessibilityLabel="Cambiar de tienda" hitSlop={8} style={styles.linkButton}>
          <Text style={styles.linkText}>Cambiar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "error" | "success" | "warning" }) {
  const styles = useStyles(); const { colors } = useTheme(); const commonStyles = useCommonStyles();
  const background = { info: colors.infoSoft, error: colors.errorSoft, success: colors.successSoft, warning: colors.warningSoft }[kind];
  const foreground = { info: colors.info, error: colors.error, success: colors.success, warning: colors.warning }[kind];
  return (
    <View style={[styles.notice, { backgroundColor: background }]} accessibilityRole={kind === "error" ? "alert" : "text"} accessibilityLiveRegion={kind === "error" ? "assertive" : "polite"}>
      <Text style={[commonStyles.body, { color: foreground }]}>{children}</Text>
    </View>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  const styles = useStyles(); const { colors } = useTheme(); const commonStyles = useCommonStyles();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} />
      <Text style={commonStyles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, children, actionTitle, onAction }: { title: string; children?: ReactNode; actionTitle?: string; onAction?: () => void }) {
  const commonStyles = useCommonStyles();
  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.subheading} accessibilityRole="header">{title}</Text>
      {children ? <Text style={commonStyles.muted}>{children}</Text> : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} /> : null}
    </View>
  );
}

/** Error con reintento (y aviso de "sin conexión" si el mensaje lo indica). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Notice kind="error">{message}</Notice>
      {onRetry ? <Button title="Reintentar" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  accessibilityLabel,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
  busy?: boolean;
}) {
  const commonStyles = useCommonStyles();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        commonStyles.button,
        variant === "secondary" && commonStyles.buttonSecondary,
        variant === "danger" && commonStyles.buttonDanger,
        (pressed || inactive) && { opacity: inactive ? 0.5 : 0.8 },
      ]}
    >
      <Text style={[commonStyles.buttonText, variant === "secondary" && commonStyles.buttonSecondaryText, variant === "danger" && commonStyles.buttonDangerText]}>
        {busy ? "Procesando…" : title}
      </Text>
    </Pressable>
  );
}

export function Field({ label, keyboardType, error, ...props }: TextInputProps & { label: string; keyboardType?: KeyboardTypeOptions; error?: string | null }) {
  const { colors } = useTheme(); const commonStyles = useCommonStyles();
  return (
    <View>
      <Text style={commonStyles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        keyboardType={keyboardType}
        placeholderTextColor={colors.mutedLight}
        style={[commonStyles.input, props.multiline && { minHeight: 88 }, error ? { borderColor: colors.error } : null]}
      />
      {error ? <Text style={[commonStyles.muted, { color: colors.error, marginTop: 4 }]} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

/** Contenedor de pantalla: área segura, teclado y pull-to-refresh opcional. */
export function Screen({ children, header, footer, scroll = true, refreshing = false, onRefresh }: { children: ReactNode; header?: ReactNode; footer?: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }) {
  const styles = useStyles(); const { colors } = useTheme(); const commonStyles = useCommonStyles();
  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={commonStyles.scrollContent}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[commonStyles.scrollContent, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={commonStyles.page} edges={["top", "left", "right"]}>
      {header ? <View style={styles.header}>{header}</View> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>{content}</KeyboardAvoidingView>
      {footer}
    </SafeAreaView>
  );
}

export interface NavItem<K extends string> { key: K; label: string; href: string }

/** Barra inferior de navegación (≥ 44dp por botón, con estado seleccionado accesible). */
export function BottomNav<K extends string>({ items, active }: { items: readonly NavItem<K>[]; active?: K }) {
  const styles = useStyles();
  return (
    <SafeAreaView edges={["bottom"]} style={styles.navSafe}>
      <View style={styles.nav} accessibilityRole="tablist">
        {items.map((item) => {
          const selected = active === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => router.replace(item.href as never)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              style={[styles.navItem, selected && styles.navItemActive]}
            >
              <Text style={[styles.navText, selected && styles.navTextActive]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export type CustomerNavKey = "home" | "catalog" | "tryon" | "favorites" | "cart" | "orders" | "account";

const customerNav: NavItem<CustomerNavKey>[] = [
  { key: "home", label: "Inicio", href: "/home" },
  { key: "catalog", label: "Catálogo", href: "/catalog" },
  { key: "tryon", label: "Probador", href: "/try-on" },
  { key: "favorites", label: "Favoritos", href: "/favorites" },
  { key: "cart", label: "Bolsa", href: "/cart" },
  { key: "account", label: "Cuenta", href: "/account" },
];

export function CustomerShell({ active, children, scroll = true, refreshing, onRefresh }: { active?: CustomerNavKey; children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <Screen header={<StoreHeader />} scroll={scroll} refreshing={refreshing} onRefresh={onRefresh} footer={active ? <BottomNav items={customerNav} active={active} /> : null}>
      {children}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  navSafe: {
    backgroundColor: colors.paperRaised,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  nav: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
  },
  navItem: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: colors.accent,
  },
  navText: {
    color: colors.inkSoft,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  navTextActive: {
    color: colors.onAccent,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  platformWordmark: {
    fontFamily: "PlayfairDisplay_700Bold",
  },
  companyName: {
    fontSize: 18,
  },
  linkButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  linkText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: colors.accentDeep,
    textDecorationLine: "underline",
  },
  notice: {
    borderRadius: 14,
    padding: 12,
  },
  center: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
}));
