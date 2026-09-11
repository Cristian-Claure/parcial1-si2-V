import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, commonStyles } from "./theme";

export function Brand() {
  return (
    <View>
      <Text style={commonStyles.brand}>VÉLORA</Text>
      <Text style={commonStyles.brandTag}>MODA QUE TE DEFINE.</Text>
    </View>
  );
}

export function Notice({
  children,
  kind = "info",
}: {
  children: ReactNode;
  kind?: "info" | "error" | "success" | "warning";
}) {
  const background = {
    info: "#E8EBEF",
    error: "#F3E5E4",
    success: "#E4ECE1",
    warning: "#F3EADB",
  }[kind];
  const foreground = {
    info: colors.info,
    error: colors.error,
    success: colors.success,
    warning: colors.warning,
  }[kind];

  return (
    <View style={[styles.notice, { backgroundColor: background }]}>
      <Text style={[commonStyles.body, { color: foreground }]}>
        {children}
      </Text>
    </View>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.ink} />
      <Text style={commonStyles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.subheading}>{title}</Text>
      {children ? <Text style={commonStyles.muted}>{children}</Text> : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        commonStyles.button,
        variant === "secondary" && commonStyles.buttonSecondary,
        variant === "danger" && commonStyles.buttonDanger,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
      ]}
    >
      <Text
        style={[
          commonStyles.buttonText,
          variant === "secondary" && commonStyles.buttonSecondaryText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  keyboardType,
  ...props
}: TextInputProps & {
  label: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <View>
      <Text style={commonStyles.label}>{label}</Text>
      <TextInput
        {...props}
        keyboardType={keyboardType}
        placeholderTextColor={colors.mutedLight}
        style={[commonStyles.input, props.multiline && { minHeight: 88 }]}
      />
    </View>
  );
}

export type CustomerNavKey =
  | "home"
  | "catalog"
  | "tryon"
  | "favorites"
  | "cart"
  | "account";

const navItems: Array<{
  key: CustomerNavKey;
  label: string;
  href: string;
}> = [
  { key: "home", label: "Inicio", href: "/home" },
  { key: "catalog", label: "Catálogo", href: "/catalog" },
  { key: "tryon", label: "Probador", href: "/try-on" },
  { key: "favorites", label: "Favoritos", href: "/favorites" },
  { key: "cart", label: "Bolsa", href: "/cart" },
  { key: "account", label: "Cuenta", href: "/account" },
];

export function CustomerShell({
  active,
  children,
  scroll = true,
}: {
  active?: CustomerNavKey;
  children: ReactNode;
  scroll?: boolean;
}) {
  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={commonStyles.scrollContent}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[commonStyles.scrollContent, { flex: 1 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={commonStyles.page} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Brand />
      </View>
      <View style={{ flex: 1 }}>{content}</View>
      {active ? (
        <View style={styles.nav}>
          {navItems.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.replace(item.href as never)}
              style={[styles.navItem, active === item.key && styles.navItemActive]}
            >
              <Text
                style={[
                  styles.navText,
                  active === item.key && styles.navTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  nav: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  navItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: colors.ink,
  },
  navText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  navTextActive: {
    color: colors.ivory,
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
});
