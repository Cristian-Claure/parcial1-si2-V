import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useCompanyStore } from "@/core/company/companyStore";
import { commonStyles } from "@/shared/theme";
import { Button, EmptyState, Loading, Notice } from "@/shared/ui";

export function CompanyGate({ children }: { children: ReactNode }) {
  const status = useCompanyStore((state) => state.status);
  const companies = useCompanyStore((state) => state.companies);
  const selectedCompanyId = useCompanyStore(
    (state) => state.selectedCompanyId,
  );
  const error = useCompanyStore((state) => state.error);
  const select = useCompanyStore((state) => state.select);
  const load = useCompanyStore((state) => state.load);

  if (status === "idle" || status === "loading") {
    return <Loading label="Cargando compañía…" />;
  }

  if (status === "error") {
    return (
      <View style={{ gap: 12 }}>
        <Notice kind="error">
          {error ?? "No fue posible cargar las compañías."}
        </Notice>
        <Button title="REINTENTAR" onPress={() => void load()} />
      </View>
    );
  }

  if (companies.length === 0) {
    return (
      <View style={{ gap: 12 }}>
        <EmptyState title="No hay una compañía activa">
          El catálogo todavía no está disponible.
        </EmptyState>
        <Button title="REINTENTAR" variant="secondary" onPress={() => void load()} />
      </View>
    );
  }

  if (!selectedCompanyId) {
    return (
      <View style={{ gap: 14 }}>
        <Text style={commonStyles.eyebrow}>SELECCIONE COMPAÑÍA</Text>
        <Text style={commonStyles.subheading}>
          Esta instalación atiende más de una compañía.
        </Text>
        <Text style={commonStyles.muted}>
          VÉLORA no elegirá una compañía arbitrariamente.
        </Text>
        {companies.map((company) => (
          <Button
            key={company.id}
            title={company.name.toUpperCase()}
            variant="secondary"
            onPress={() => void select(company.id)}
          />
        ))}
      </View>
    );
  }

  return <>{children}</>;
}
