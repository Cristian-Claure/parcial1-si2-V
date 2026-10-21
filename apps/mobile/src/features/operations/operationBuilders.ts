import {
  syncCustomerCreateSchema, syncProductCreateSchema,
  type SyncCustomerCreate, type SyncOperation, type SyncProductCreate,
} from "@velora/contracts";

export interface CustomerDraft { firstName: string; lastName: string; phone: string; email: string; taxId: string; customerType: "B2C" | "B2B"; businessName: string }
export interface VariantDraft { size: string; color: string; sku: string; price: string; stock: string }
export interface ProductDraft { name: string; categoryId: string; description: string; warehouseId: string; variants: VariantDraft[] }

export type BuildResult<T> = { ok: true; value: T; operation: SyncOperation; label: string } | { ok: false; error: string };

const blank = (value: string) => value.trim() === "" ? null : value.trim();

/** Valida el formulario con el mismo contrato que el backend y arma la operación encolable. */
export function buildCustomerOperation(draft: CustomerDraft, newId: () => string): BuildResult<SyncCustomerCreate> {
  const parsed = syncCustomerCreateSchema.safeParse({
    id: newId(), firstName: draft.firstName, lastName: draft.lastName, phone: blank(draft.phone), email: blank(draft.email),
    taxId: blank(draft.taxId), customerType: draft.customerType, businessName: draft.customerType === "B2B" ? blank(draft.businessName) : null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise los datos del cliente." };
  return { ok: true, value: parsed.data, label: `Cliente ${parsed.data.firstName} ${parsed.data.lastName}`, operation: { clientOperationId: newId(), type: "CUSTOMER_CREATE", payload: parsed.data } };
}

export function buildProductOperation(draft: ProductDraft, newId: () => string): BuildResult<SyncProductCreate> {
  const variants = draft.variants.map((variant) => ({ ...variant, id: newId() }));
  const parsed = syncProductCreateSchema.safeParse({
    id: newId(), categoryId: draft.categoryId, name: draft.name, description: blank(draft.description),
    variants: variants.map((variant) => ({ id: variant.id, sku: variant.sku, size: variant.size, color: variant.color, price: Number(variant.price.replace(",", ".")) })),
    initialStock: draft.warehouseId
      ? variants.filter((variant) => Number(variant.stock) > 0).map((variant) => ({ variantId: variant.id, warehouseId: draft.warehouseId, quantity: Number(variant.stock) }))
      : undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise los datos del producto." };
  return { ok: true, value: parsed.data, label: `Producto ${parsed.data.name}`, operation: { clientOperationId: newId(), type: "PRODUCT_CREATE", payload: parsed.data } };
}
