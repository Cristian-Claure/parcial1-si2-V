import { useState } from "react";
import { Text, View } from "react-native";
import { router, Redirect } from "expo-router";
import { registerRequestSchema } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { useCommonStyles, PlatformTheme } from "@/shared/theme";
import { Brand, Button, Field, Notice, Screen } from "@/shared/ui";

/** Registro de cliente (pantalla de plataforma: siempre con la marca Trama). */
export default function RegisterScreen() {
  return <PlatformTheme><RegisterContent /></PlatformTheme>;
}

function RegisterContent() {
  const commonStyles = useCommonStyles();
  const status = useAuthStore((state) => state.status);
  const register = useAuthStore((state) => state.register);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Redirect href={"/" as never} />;
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
      router.replace("/" as never);
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
    <Screen>
      <View style={{ paddingTop: 24 }}><Brand /></View>
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
        title={busy ? "Creando…" : "Crear cuenta"}
        onPress={() => void submit()}
        disabled={busy}
      />
      <Button
        title="Ya tengo cuenta"
        variant="secondary"
        onPress={() => router.back()}
      />
    </Screen>
  );
}