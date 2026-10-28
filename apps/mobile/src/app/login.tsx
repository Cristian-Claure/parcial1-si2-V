import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, Redirect } from "expo-router";
import { loginRequestSchema } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { openWeb } from "@/shared/lib/webUrl";
import { makeStyles, PlatformTheme, useCommonStyles } from "@/shared/theme";
import { Button, Field, Notice, PLATFORM_NAME, PlatformBrand, Screen } from "@/shared/ui";

/** Login de la plataforma Trama: tras ingresar, "/" redirige por rol (mobileHomePath). */
export default function LoginScreen() {
  return <PlatformTheme><LoginContent /></PlatformTheme>;
}

function LoginContent() {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const status = useAuthStore((state) => state.status);
  const expired = useAuthStore((state) => state.sessionExpired);
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") return <Redirect href={"/" as never} />;

  const submit = async () => {
    const parsed = loginRequestSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa el correo y la contraseña.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(parsed.data);
      router.replace("/" as never);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.top}><PlatformBrand /></View>
      <View style={{ gap: 8 }}>
        <Text style={commonStyles.eyebrow}>BIENVENIDO</Text>
        <Text style={commonStyles.heading} accessibilityRole="header">Ingresa a {PLATFORM_NAME}</Text>
        <Text style={commonStyles.muted}>Compra en tus tiendas favoritas o administra la tuya.</Text>
      </View>

      {expired && !error ? <Notice kind="warning">Tu sesión expiró. Ingresa de nuevo para continuar.</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}

      <View style={{ gap: 14 }}>
        <Field label="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" returnKeyType="next" />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()} />
      </View>

      <Button title="Ingresar" busy={busy} onPress={() => void submit()} />

      <View style={styles.divider}><Text style={commonStyles.muted}>¿Primera vez en {PLATFORM_NAME}?</Text></View>

      <Pressable accessibilityRole="button" accessibilityLabel="Soy cliente: crear cuenta para comprar" onPress={() => router.push("/register" as never)} style={({ pressed }) => [styles.path, pressed && styles.pressed]}>
        <Text style={styles.pathTitle}>Soy cliente</Text>
        <Text style={commonStyles.muted}>Compra en las tiendas, guarda favoritos y sigue tus pedidos.</Text>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel="Quiero abrir mi tienda: se abre la web de Trama" onPress={() => void openWeb("/crear-tienda")} style={({ pressed }) => [styles.path, pressed && styles.pressed]}>
        <Text style={styles.pathTitle}>Quiero abrir mi tienda</Text>
        <Text style={commonStyles.muted}>Crea tu marca y elige un plan en la web; luego administra tu tienda desde aquí.</Text>
      </Pressable>
      <Button title="Explorar tiendas" variant="secondary" onPress={() => router.push("/stores" as never)} />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  top: { paddingTop: 24, paddingBottom: 8 },
  divider: { alignItems: "center", paddingTop: 6 },
  path: {
    minHeight: 64,
    padding: 16,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.paperRaised,
  },
  pathTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.accentDeep },
  pressed: { opacity: 0.8 },
}));
