import { Text } from "react-native";
import { Redirect, router } from "expo-router";
import { useOwnerCompany, useOwnerStore } from "@/core/company/ownerStore";
import { useCommonStyles } from "@/shared/theme";
import { Button, CompanyBrand, Loading, Screen } from "@/shared/ui";

/** Resumen del propietario (se completa con los widgets del backend en el bloque 4). */
export default function OwnerDashboardScreen() {
  const commonStyles = useCommonStyles();
  const status = useOwnerStore((state) => state.status);
  const company = useOwnerCompany();
  if (status === "idle" || status === "loading") return <Loading label="Cargando tu empresa…" />;
  if (!company) return <Redirect href={"/owner/companies" as never} />;
  const name = company.brand?.name ?? company.name;
  return (
    <Screen header={<CompanyBrand company={{ name, slug: company.brand?.slug ?? company.slug, logoUrl: company.brand?.logoUrl ?? null }} subtitle="Panel del propietario" />}>
      <Text style={commonStyles.heading} accessibilityRole="header">Resumen</Text>
      <Button title="Cambiar de empresa" variant="secondary" onPress={() => router.push("/owner/companies" as never)} />
    </Screen>
  );
}
