import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { veloraApi } from "@/core/api/veloraApi";
import { commonStyles } from "@/shared/theme";
import { Button, CustomerShell, Loading, Notice } from "@/shared/ui";

export default function StripeReturnScreen() {
  const params = useLocalSearchParams<{
    payment_id?: string | string[];
    session_id?: string | string[];
  }>();
  const client = useQueryClient();
  const paymentId =
    typeof params.payment_id === "string" ? params.payment_id : "";

  const payment = useQuery({
    queryKey: ["stripe-return-payment", paymentId],
    queryFn: () => veloraApi.payment(paymentId),
    enabled: Boolean(paymentId),
  });

  const refresh = async () => {
    if (paymentId) {
      await payment.refetch();
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: ["orders"] }),
      client.invalidateQueries({ queryKey: ["payments"] }),
    ]);
  };

  return (
    <CustomerShell>
      <Text style={commonStyles.eyebrow}>PAGO SEGURO</Text>
      <Text style={commonStyles.heading}>Regresó a VÉLORA.</Text>

      {payment.isLoading ? <Loading label="Verificando pago…" /> : null}

      {payment.data ? (
        <Notice
          kind={
            payment.data.status === "PAID"
              ? "success"
              : payment.data.status === "FAILED" ||
                  payment.data.status === "CANCELLED"
                ? "warning"
                : "info"
          }
        >
          Estado actual: {payment.data.status}. El webhook de Stripe es la
          autoridad definitiva y puede actualizarse unos instantes después del
          retorno.
        </Notice>
      ) : (
        <Notice>
          El estado definitivo del pago lo confirma el backend mediante el
          webhook de Stripe. Actualice sus pedidos para ver el resultado.
        </Notice>
      )}

      {payment.isError ? (
        <Notice kind="warning">
          No fue posible consultar el pago todavía. Puede volver a intentarlo
          desde Mis pedidos.
        </Notice>
      ) : null}

      <Button
        title="ACTUALIZAR ESTADO"
        variant="secondary"
        onPress={() => void refresh()}
      />
      <Button
        title="VOLVER A MIS PEDIDOS"
        onPress={() => {
          void refresh().finally(() => router.replace("/orders" as never));
        }}
      />
    </CustomerShell>
  );
}
