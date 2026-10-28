import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { MirrorRecord } from "@velora/contracts";
import { useAuthStore } from "@/core/auth/authStore";
import { useNetworkStore } from "@/core/network/networkStore";
import { listMirror } from "@/core/sync/syncDb";
import { enqueueOperation, newId, runOperationsSync, useOperationsSync } from "@/core/sync/syncEngine";
import { buildProductOperation, type ProductDraft, type VariantDraft } from "@/features/operations/operationBuilders";
import { OperationsShell } from "@/features/operations/OperationsShell";
import { useManagerCompany } from "@/features/operations/useManagerCompany";
import { makeStyles, useCommonStyles } from "@/shared/theme";
import { Button, Field, Notice } from "@/shared/ui";

const emptyVariant = (): VariantDraft => ({ size: "", color: "", sku: "", price: "", stock: "" });
const emptyProduct = (): ProductDraft => ({ name: "", categoryId: "", description: "", warehouseId: "", variants: [emptyVariant()] });

function Chips({ options, value, onChange, allowNone }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void; allowNone?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      {allowNone ? <Pressable onPress={() => onChange("")} style={[styles.chip, value === "" && styles.chipActive]}><Text style={styles.chipText}>{allowNone}</Text></Pressable> : null}
      {options.map((option) => (
        <Pressable key={option.id} onPress={() => onChange(option.id)} style={[styles.chip, value === option.id && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: value === option.id }}>
          <Text style={styles.chipText}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function RegisterProductScreen() {
  const commonStyles = useCommonStyles();
  const user = useAuthStore((state) => state.user)!;
  const isConnected = useNetworkStore((state) => state.isConnected);
  const company = useManagerCompany();
  const version = useOperationsSync((state) => state.version);
  const [categories, setCategories] = useState<MirrorRecord[]>([]);
  const [warehouses, setWarehouses] = useState<MirrorRecord[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyProduct);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    void listMirror(company.id, "CATEGORY").then(setCategories);
    void listMirror(company.id, "WAREHOUSE").then(setWarehouses);
  }, [company, version]);

  const setVariant = (index: number, field: keyof VariantDraft, value: string) =>
    setDraft({ ...draft, variants: draft.variants.map((variant, position) => position === index ? { ...variant, [field]: field === "sku" ? value.toUpperCase() : value } : variant) });

  const submit = async () => {
    setMessage(null); setError(null);
    if (!company) { setError("Sincroniza una vez con conexión para identificar tu tienda."); return; }
    const built = buildProductOperation(draft, newId);
    if (!built.ok) { setError(built.error); return; }
    await enqueueOperation(company.id, user.id, built.operation, built.label, {
      entityType: "PRODUCT", id: built.value.id,
      data: { ...built.value, slug: "", status: "ACTIVE", version: 0, imageUrl: null, variants: built.value.variants.map((variant) => ({ ...variant, currency: "BOB", active: true })), stock: (built.value.initialStock ?? []).map((entry) => ({ variantId: entry.variantId, warehouseId: entry.warehouseId, available: entry.quantity })) },
    });
    setDraft({ ...emptyProduct(), categoryId: draft.categoryId, warehouseId: draft.warehouseId });
    setMessage(isConnected ? `${built.label} registrado. Sincronizando…` : `${built.label} guardado en el teléfono; se enviará al reconectar.`);
    if (isConnected) void runOperationsSync(user.id, company.id);
  };

  return (
    <OperationsShell active="product">
      <Text style={commonStyles.heading}>Registrar producto</Text>
      {message ? <Notice kind="success">{message}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {categories.length === 0 ? <Notice kind="warning">Sincroniza al menos una vez con conexión para tener categorías y almacenes disponibles sin red.</Notice> : null}
      <View style={{ gap: 12 }}>
        <Field label="Nombre" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
        <Text style={commonStyles.label}>Categoría</Text>
        <Chips options={categories.map((record) => ({ id: record.id, label: String(record.data.name) }))} value={draft.categoryId} onChange={(categoryId) => setDraft({ ...draft, categoryId })} />
        <Field label="Descripción" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline />
        <Text style={commonStyles.label}>Almacén para stock inicial</Text>
        <Chips options={warehouses.map((record) => ({ id: record.id, label: String(record.data.name) }))} value={draft.warehouseId} onChange={(warehouseId) => setDraft({ ...draft, warehouseId })} allowNone="Sin stock inicial" />
        {draft.variants.map((variant, index) => (
          <View key={index} style={[commonStyles.card, { gap: 8 }]}>
            <Text style={commonStyles.subheading}>Variante {index + 1}</Text>
            <Field label="Talla" value={variant.size} onChangeText={(value) => setVariant(index, "size", value)} />
            <Field label="Color" value={variant.color} onChangeText={(value) => setVariant(index, "color", value)} />
            <Field label="SKU" value={variant.sku} onChangeText={(value) => setVariant(index, "sku", value)} autoCapitalize="characters" />
            <Field label="Precio (BOB)" value={variant.price} onChangeText={(value) => setVariant(index, "price", value)} keyboardType="decimal-pad" />
            {draft.warehouseId ? <Field label="Stock inicial" value={variant.stock} onChangeText={(value) => setVariant(index, "stock", value)} keyboardType="number-pad" /> : null}
            {draft.variants.length > 1 ? <Button title="QUITAR VARIANTE" variant="secondary" onPress={() => setDraft({ ...draft, variants: draft.variants.filter((_, position) => position !== index) })} /> : null}
          </View>
        ))}
        <Button title="AGREGAR VARIANTE" variant="secondary" onPress={() => setDraft({ ...draft, variants: [...draft.variants, emptyVariant()] })} />
        <Text style={commonStyles.muted}>Las fotos de producto se agregan desde el panel web después de sincronizar.</Text>
        <Button title="REGISTRAR PRODUCTO" onPress={() => void submit()} />
      </View>
    </OperationsShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.hairline, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.accentSoft },
  chipText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
}));
