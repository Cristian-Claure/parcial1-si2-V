import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoney, type VariantResponse } from "@velora/contracts";
import { ApiClientError } from "@/core/api/apiClient";
import { ownerApi } from "@/core/api/ownerApi";
import { useOwnerCompany } from "@/core/company/ownerStore";
import { OwnerShell } from "@/features/owner/OwnerShell";
import { parsePrice, productUpdateBody, variantPriceBody } from "@/features/owner/panelLogic";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, ErrorState, Field, Loading, Notice } from "@/shared/ui";
import { useManagedProducts } from "@/features/owner/ownerQueries";

function errorText(error: unknown): string {
  if (error instanceof ApiClientError && error.code?.startsWith("PLAN_LIMIT")) return `${error.message} Puedes mejorar el plan desde la web.`;
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

/** Detalle del producto: activar o desactivar (PUT del producto) y editar el precio de cada variante. */
export default function OwnerProductScreen() {
  const styles = useStyles(); const commonStyles = useCommonStyles();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const company = useOwnerCompany();
  const products = useManagedProducts(company?.id ?? null);
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const product = products.data?.find((item) => item.id === id) ?? null;
  const toggle = useMutation({
    mutationFn: (status: "ACTIVE" | "INACTIVE") => ownerApi.updateProduct(product!.id, productUpdateBody(product!, status)),
    onSuccess: async (updated) => { setMessage(updated.status === "ACTIVE" ? "Producto activado: ya se ve en la tienda." : "Producto desactivado: ya no se ve en la tienda."); await client.invalidateQueries({ queryKey: ["owner-products"] }); },
  });

  if (products.isLoading) return <OwnerShell active="catalog"><Loading label="Cargando producto…" /></OwnerShell>;
  if (!product) return <OwnerShell active="catalog"><ErrorState message="No encontramos este producto en tu empresa." onRetry={() => void products.refetch()} /></OwnerShell>;
  const active = product.status === "ACTIVE";

  return (
    <OwnerShell active="catalog" refreshing={products.isRefetching} onRefresh={() => void products.refetch()}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back} hitSlop={8}><Text style={styles.backText}>← Catálogo</Text></Pressable>
      <Text style={commonStyles.eyebrow}>{product.categoryName.toUpperCase()}</Text>
      <Text style={commonStyles.heading} accessibilityRole="header">{product.name}</Text>
      <Text style={commonStyles.muted}>Estado: {active ? "Activo (visible en la tienda)" : product.status === "DRAFT" ? "Borrador" : "Inactivo (oculto en la tienda)"}</Text>
      {message ? <Notice kind="success">{message}</Notice> : null}
      {toggle.isError ? <Notice kind="error">{errorText(toggle.error)}</Notice> : null}
      <Button
        title={active ? "Desactivar producto" : "Activar producto"}
        variant={active ? "danger" : "primary"}
        busy={toggle.isPending}
        onPress={() => Alert.alert(active ? "Desactivar producto" : "Activar producto", active ? "Dejará de verse en la tienda. Los pedidos existentes no cambian." : "Volverá a verse en la tienda.", [
          { text: "Volver", style: "cancel" },
          { text: active ? "Desactivar" : "Activar", style: active ? "destructive" : "default", onPress: () => toggle.mutate(active ? "INACTIVE" : "ACTIVE") },
        ])}
      />
      <Text style={commonStyles.subheading}>Variantes y precios</Text>
      {product.variants.map((variant) => <VariantPrice key={variant.id} variant={variant} />)}
      <Notice>Las fotos, descripciones y nuevas variantes se editan desde la web.</Notice>
    </OwnerShell>
  );
}

function VariantPrice({ variant }: { variant: VariantResponse }) {
  const commonStyles = useCommonStyles();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (price: number) => ownerApi.updateVariant(variant.id, variantPriceBody(variant, price)),
    onSuccess: async () => { setSaved(true); setText(""); await client.invalidateQueries({ queryKey: ["owner-products"] }); },
  });
  const submit = () => {
    const price = parsePrice(text);
    if (price === null) { setError("Escribe un precio válido, por ejemplo 249,90."); return; }
    setError(null); setSaved(false); save.mutate(price);
  };
  return (
    <View style={commonStyles.card}>
      <View style={commonStyles.rowBetween}>
        <Text style={[commonStyles.body, { flex: 1 }]} numberOfLines={1}>{variant.size} · {variant.color}</Text>
        <Text style={commonStyles.body}>{formatMoney(variant.price, variant.currency)}</Text>
      </View>
      <Text style={commonStyles.muted}>{variant.sku}{variant.active ? "" : " · inactiva"}</Text>
      <Field label="Nuevo precio (Bs)" value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={String(variant.price).replace(".", ",")} error={error} returnKeyType="done" onSubmitEditing={submit} />
      {save.isError ? <Notice kind="error">{errorText(save.error)}</Notice> : null}
      {saved ? <Notice kind="success">Precio actualizado.</Notice> : null}
      <Button title="Guardar precio" variant="secondary" busy={save.isPending} disabled={!text.trim()} onPress={submit} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.accentDeep },
}));
