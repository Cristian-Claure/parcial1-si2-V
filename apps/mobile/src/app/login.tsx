import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { router, Redirect } from "expo-router";
import { loginRequestSchema } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { colors, commonStyles } from "@/shared/theme";
import { Brand, Button, Field, Notice } from "@/shared/ui";

export default function LoginScreen() {
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Redirect href={"/home" as never} />;
  }

  const submit = async () => {
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise los datos ingresados.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await login(parsed.data);
      router.replace("/home" as never);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible iniciar sesión.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[
        commonStyles.page,
        {
          paddingHorizontal: 24,
          paddingTop: 70,
          gap: 20,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Brand />
      <View style={{ gap: 8, marginTop: 24 }}>
        <Text style={commonStyles.eyebrow}>ACCESO PERSONAL</Text>
        <Text style={commonStyles.heading}>Bienvenido de nuevo.</Text>
        <Text style={commonStyles.muted}>
          Ingrese con su cuenta CUSTOMER para continuar.
        </Text>
      </View>

      {error ? <Notice kind="error">{error}</Notice> : null}

      <View style={{ gap: 14 }}>
        <Field
          label="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Field
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      <Button
        title={busy ? "INGRESANDO…" : "INICIAR SESIÓN"}
        onPress={() => void submit()}
        disabled={busy}
      />

      <Button
        title="CREAR CUENTA"
        variant="secondary"
        onPress={() => router.push("/register" as never)}
      />
    </KeyboardAvoidingView>
  );
}