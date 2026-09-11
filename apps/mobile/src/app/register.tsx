import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { router, Redirect } from "expo-router";
import { registerRequestSchema } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { colors, commonStyles } from "@/shared/theme";
import { Brand, Button, Field, Notice } from "@/shared/ui";

export default function RegisterScreen() {
  const status = useAuthStore((state) => state.status);
  const register = useAuthStore((state) => state.register);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Redirect href={"/home" as never} />;
  }

  const submit = async () => {
    const parsed = registerRequestSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise los datos ingresados.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await register(parsed.data);
      router.replace("/home" as never);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No fue posible crear la cuenta.",
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
          paddingTop: 48,
          gap: 16,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Brand />
      <View style={{ gap: 8 }}>
        <Text style={commonStyles.eyebrow}>NUEVA CUENTA</Text>
        <Text style={commonStyles.heading}>Su experiencia comienza aquí.</Text>
      </View>

      {error ? <Notice kind="error">{error}</Notice> : null}

      <View style={{ gap: 12 }}>
        <Field label="Nombre" value={firstName} onChangeText={setFirstName} />
        <Field label="Apellido" value={lastName} onChangeText={setLastName} />
        <Field
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
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
        title={busy ? "CREANDO…" : "CREAR CUENTA"}
        onPress={() => void submit()}
        disabled={busy}
      />
      <Button
        title="VOLVER A INICIAR SESIÓN"
        variant="secondary"
        onPress={() => router.back()}
      />
    </KeyboardAvoidingView>
  );
}