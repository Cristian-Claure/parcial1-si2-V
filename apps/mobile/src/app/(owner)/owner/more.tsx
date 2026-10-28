import { Alert, Text } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/core/auth/authStore";
import { useOwnerStore } from "@/core/company/ownerStore";
import { OwnerShell } from "@/features/owner/OwnerShell";
import { openWeb } from "@/shared/lib/webUrl";
import { useCommonStyles } from "@/shared/theme";
import { Button, Notice } from "@/shared/ui";

/** Menú "Más" del propietario. Lo que no está en el móvil abre la web. */
export default function OwnerMoreScreen() {
  const commonStyles = useCommonStyles();
  const logout = useAuthStore((state) => state.logout);
  const companies = useOwnerStore((state) => state.companies);
  const client = useQueryClient();
  return (
    <OwnerShell active="more">
      <Text style={commonStyles.eyebrow}>MÁS</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">Tu negocio</Text>
      <Button title="Sucursales" variant="secondary" onPress={() => router.push("/owner/branches" as never)} />
      <Button title="Mi plan" variant="secondary" onPress={() => router.push("/owner/plan" as never)} />
      <Button title="Registrar producto" variant="secondary" onPress={() => router.push("/owner/register-product" as never)} />
      <Button title="Registrar cliente" variant="secondary" onPress={() => router.push("/owner/register-customer" as never)} />
      {companies.length > 1 ? <Button title="Cambiar de empresa" variant="secondary" onPress={() => router.push("/owner/companies" as never)} /> : null}
      <Notice>Crear empresas, editar la marca, el constructor de reportes, exportar a Excel o PDF e Inteligencia (ML) están en la web.</Notice>
      <Button title="Abrir el panel web" variant="secondary" onPress={() => void openWeb("/admin")} />
      <Button
        title="Cerrar sesión"
        variant="danger"
        onPress={() => Alert.alert("Cerrar sesión", "¿Quieres salir de tu cuenta?", [
          { text: "Volver", style: "cancel" },
          { text: "Salir", style: "destructive", onPress: () => void logout().then(() => { client.clear(); router.replace("/login" as never); }) },
        ])}
      />
    </OwnerShell>
  );
}
