import { Text } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/core/auth/authStore";
import { openWeb, webBaseUrl } from "@/shared/lib/webUrl";
import { PlatformTheme, useCommonStyles } from "@/shared/theme";
import { Button, Notice, PLATFORM_NAME, PlatformBrand, Screen } from "@/shared/ui";

/** PLATFORM_ADMIN no usa el móvil: la administración de la plataforma está en la web. */
export default function PlatformOnlyScreen() {
  return <PlatformTheme><PlatformOnlyContent /></PlatformTheme>;
}

function PlatformOnlyContent() {
  const commonStyles = useCommonStyles();
  const logout = useAuthStore((state) => state.logout);
  return (
    <Screen header={<PlatformBrand showTagline={false} />}>
      <Text style={commonStyles.eyebrow}>ADMINISTRACIÓN DE {PLATFORM_NAME.toUpperCase()}</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Usa la web para administrar la plataforma</Text>
      <Notice kind="info">Propietarios, empresas, planes y suscripciones se gestionan en {webBaseUrl}/plataforma. La app móvil es para clientes, propietarios y encargados.</Notice>
      <Button title="Abrir la web" onPress={() => void openWeb("/plataforma")} />
      <Button title="Cerrar sesión" variant="secondary" onPress={() => void logout().then(() => router.replace("/login" as never))} />
    </Screen>
  );
}
