import { Text, View } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/core/auth/authStore";
import { useCompanyStore } from "@/core/company/companyStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { CompanyGate } from "@/features/company/CompanyGate";
import { colors, commonStyles } from "@/shared/theme";
import { Button, CustomerShell, Notice } from "@/shared/ui";

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user)!;
  const isConnected = useNetworkStore((state) => state.isConnected);
  const companyId = useCompanyStore((state) => state.selectedCompanyId);
  const companies = useCompanyStore((state) => state.companies);
  const company = companies.find((item) => item.id === companyId) ?? null;

  return (
    <CustomerShell active="home">
      {!isConnected ? (
        <Notice kind="warning">
          Está sin conexión. Puede revisar datos guardados y preparar un pedido
          offline; el stock solo se reservará al sincronizar.
        </Notice>
      ) : null}

      <CompanyGate>
        <Text style={commonStyles.eyebrow}>VÉLORA PARA USTED</Text>
        <Text style={commonStyles.heading}>Hola, {user.firstName}.</Text>
        <Text style={commonStyles.body}>
          Descubra piezas para cada momento y continúe su experiencia donde la
          dejó.
        </Text>

        {company ? (
          <Text style={commonStyles.muted}>Catálogo: {company.name}</Text>
        ) : null}

        <View
          style={[
            commonStyles.card,
            { backgroundColor: colors.ink, paddingVertical: 24 },
          ]}
        >
          <Text style={[commonStyles.eyebrow, { color: colors.champagne }]}>
            NUEVA COLECCIÓN
          </Text>
          <Text style={[commonStyles.subheading, { color: colors.ivory }]}>
            Encuentre la pieza que define su estilo.
          </Text>
          <Text style={[commonStyles.body, { color: colors.mutedLight }]}>
            Prendas, calzado y accesorios seleccionados para acompañarla.
          </Text>
          <Button
            title="EXPLORAR COLECCIÓN"
            variant="secondary"
            onPress={() => router.push("/catalog" as never)}
          />
        </View>

        <Text style={commonStyles.eyebrow}>CONTINÚE SU EXPERIENCIA</Text>
        <View style={{ gap: 10 }}>
          <Button
            title="VER MIS PEDIDOS"
            variant="secondary"
            onPress={() => router.push("/orders" as never)}
          />
          <Button
            title="IR A MI BOLSA"
            variant="secondary"
            onPress={() => router.push("/cart" as never)}
          />
          <Button
            title="EDITAR MI CUENTA"
            variant="secondary"
            onPress={() => router.push("/account" as never)}
          />
        </View>
      </CompanyGate>
    </CustomerShell>
  );
}