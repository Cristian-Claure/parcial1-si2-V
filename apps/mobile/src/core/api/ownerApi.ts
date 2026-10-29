import type {
  AdminPlanResponse,
  InventoryMovementRequest,
  InventoryStock,
  ManagerResponse,
  OperationalOrderListItem,
  PaymentResponse,
  ProductRequest,
  ProductResponse,
  ReportOverview,
  StoreResponse,
  VariantRequest,
  VariantResponse,
  WarehouseResponse,
  PlanPayment,
} from "@velora/contracts";
import { apiRequest, jsonBody } from "./apiClient";

/**
 * Fase 4C · endpoints del panel (los mismos que usa la web). El móvil nunca decide el alcance:
 * cada ruta pasa por TenantScopeService en el backend (ADMIN → sus empresas; encargado → su sucursal).
 */
export type PanelRole = "ADMIN" | "STORE_MANAGER";

const q = (value: string) => encodeURIComponent(value);
const prefix = (role: PanelRole) => (role === "ADMIN" ? "admin" : "manager");

function query(values: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const ownerApi = {
  plan: () => apiRequest<AdminPlanResponse>("/api/admin/plan"),
  planPayments: () => apiRequest<PlanPayment[]>("/api/admin/plan/payments"),
  stores: (companyId: string) => apiRequest<StoreResponse[]>(`/api/admin/stores?companyId=${q(companyId)}`),
  managers: (companyId: string) => apiRequest<ManagerResponse[]>(`/api/admin/users/managers?companyId=${q(companyId)}`),

  overview: (role: PanelRole, params: { companyId?: string | null; storeId?: string | null; from?: string | null; to?: string | null }) =>
    apiRequest<ReportOverview>(`/api/${prefix(role)}/reports/overview${query(role === "ADMIN" ? params : { from: params.from, to: params.to })}`),

  orders: (role: PanelRole, companyId?: string | null) =>
    apiRequest<OperationalOrderListItem[]>(`/api/${prefix(role)}/orders${role === "ADMIN" && companyId ? `?companyId=${q(companyId)}` : ""}`),
  confirmPayment: (role: PanelRole, paymentId: string) =>
    apiRequest<PaymentResponse>(`/api/${prefix(role)}/payments/${q(paymentId)}/confirm`, { method: "POST", body: jsonBody({ reason: "Pago confirmado desde la app móvil." }) }),
  failPayment: (role: PanelRole, paymentId: string) =>
    apiRequest<PaymentResponse>(`/api/${prefix(role)}/payments/${q(paymentId)}/fail`, { method: "POST", body: jsonBody({ reason: "Pago marcado como fallido desde la app móvil." }) }),
  refundPayment: (role: PanelRole, paymentId: string) =>
    apiRequest<PaymentResponse>(`/api/${prefix(role)}/payments/${q(paymentId)}/refund`, { method: "POST", body: jsonBody({ reason: "Reembolso desde la app móvil." }) }),
  fulfillOrder: (role: PanelRole, orderId: string) =>
    apiRequest<unknown>(`/api/${prefix(role)}/orders/${q(orderId)}/fulfill`, { method: "POST", body: "{}" }),

  warehouses: () => apiRequest<WarehouseResponse[]>("/api/inventory/warehouses"),
  stock: (warehouseId: string) => apiRequest<InventoryStock[]>(`/api/inventory/warehouses/${q(warehouseId)}/stock`),
  movement: (body: InventoryMovementRequest) => apiRequest<InventoryStock>("/api/inventory/movements", { method: "POST", body: jsonBody(body) }),

  managedProducts: (companyId: string) => apiRequest<ProductResponse[]>(`/api/catalog/manage/products?companyId=${q(companyId)}`),
  updateProduct: (productId: string, body: ProductRequest) =>
    apiRequest<ProductResponse>(`/api/catalog/manage/products/${q(productId)}`, { method: "PUT", body: jsonBody(body) }),
  updateVariant: (variantId: string, body: VariantRequest) =>
    apiRequest<VariantResponse>(`/api/catalog/manage/variants/${q(variantId)}`, { method: "PUT", body: jsonBody(body) }),
};
