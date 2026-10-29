import { formatMoney, labelFor, PAYMENT_STATUS_LABELS } from "@velora/contracts";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { veloraApi } from "@/core/api/veloraApi";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, Notice } from "@/shared/ui";
import { formatCountdown, secondsUntil } from "./qrCountdown";

function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * QR de un pedido (Fase 5): imagen PNG en data URL (sin librerías nativas), cuenta regresiva y
 * estado que se consulta cada 3 s. En DEMO se puede abrir el "Banco demo" en el navegador.
 */
export function QrPaymentCard({ paymentId, orderId, concept, onRetry }: { paymentId: string; orderId: string; concept: string; onRetry: () => void }) {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const client = useQueryClient();
  const qr = useQuery({
    queryKey: ["order-qr", paymentId],
    queryFn: async () => {
      const result = await veloraApi.orderQr(paymentId);
      if (result.status !== "PENDING") await client.invalidateQueries({ queryKey: ["payments", orderId] });
      return result;
    },
    refetchInterval: (state) => (state.state.data?.status === "PENDING" ? 3000 : false),
  });
  const data = qr.data;
  const pending = data?.status === "PENDING";
  const now = useClock(pending);
  if (!data) return qr.isError ? <Notice kind="warning">No se pudo consultar el QR.</Notice> : null;
  const remaining = secondsUntil(data.expiresAt, now, data.secondsRemaining);

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      {data.demo ? <Notice kind="warning">Modo demostración: este QR no mueve dinero real. Ábrelo en el Banco demo para simular el pago.</Notice> : null}
      {pending && data.qrPngDataUrl ? (
        <View style={styles.qrFrame}>
          <Image source={{ uri: data.qrPngDataUrl }} style={styles.qr} accessibilityLabel={`Código QR para pagar ${formatMoney(data.amount, data.currency)}`} />
        </View>
      ) : null}
      <Text style={commonStyles.label}>{concept} · {labelFor(PAYMENT_STATUS_LABELS, data.status)}</Text>
      <Text style={styles.amount}>{formatMoney(data.amount, data.currency)}</Text>
      <Text style={commonStyles.muted}>Referencia {data.reference}</Text>
      {pending ? <Text style={[commonStyles.body, remaining <= 60 && styles.urgent]}>Vence en {formatCountdown(remaining)}</Text> : null}
      {data.status === "PAID" ? <Notice kind="success">Pago confirmado.</Notice> : null}
      {data.status === "EXPIRED" || (pending && remaining === 0) ? <Notice kind="warning">El QR venció (10 minutos). Genera uno nuevo.</Notice> : null}
      {pending && remaining > 0 && data.payUrl ? <Button title="ABRIR BANCO DEMO" variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(data.payUrl!)} /> : null}
      {data.status !== "PAID" && (!pending || remaining === 0) ? <Button title="GENERAR QR NUEVO" onPress={onRetry} /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { gap: 8, borderWidth: 1, borderColor: colors.hairline, borderRadius: 16, padding: 14, backgroundColor: colors.paperRaised },
  qrFrame: { alignSelf: "center", padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.paper },
  qr: { width: 220, height: 220 },
  amount: { color: colors.ink, fontWeight: "900", fontSize: 22 },
  urgent: { color: colors.error, fontWeight: "800" },
}));
