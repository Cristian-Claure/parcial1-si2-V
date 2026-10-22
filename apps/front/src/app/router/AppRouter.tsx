import { lazy, Suspense } from "react";

import { Link, Route, Routes } from "react-router-dom";
import { PageLoader } from "../../shared/ui/PageLoader";
import { Brand } from "../../shared/brand/Brand";
function lazyNamed(
  importer: () => Promise<any>,
  name: string
) {
  return lazy(() => importer().then((module) => ({ default: module[name] })));
}
import { RequireRole, GuestOnly } from "../../shared/auth/RouteGuards";
import { CustomerShell, OperationsShell, PlatformShell, PublicShell } from "../../shared/layout/Shells";
const HomePage = lazy(() => import("../../features/home/HomePage").then((module) => ({ default: module.HomePage })));
import { LoginPage, RegisterPage } from "../../features/auth/AuthPages";
const CatalogPage = lazyNamed(() => import("../../features/catalog/CatalogPages"), "CatalogPage");
const ProductDetailPage = lazyNamed(() => import("../../features/catalog/CatalogPages"), "ProductDetailPage");
const FavoritesPage = lazyNamed(() => import("../../features/favorites/FavoritesPage"), "FavoritesPage");
const CartPage = lazyNamed(() => import("../../features/cart/CartPage"), "CartPage");
const CheckoutPage = lazyNamed(() => import("../../features/checkout/CheckoutPage"), "CheckoutPage");
const OrdersPage = lazyNamed(() => import("../../features/orders/OrdersPage"), "OrdersPage");
const AccountPage = lazyNamed(() => import("../../features/account/AccountPage"), "AccountPage");
import { StripeReturnPage } from "../../features/payments/StripeReturnPage";
const TryOnPage = lazyNamed(() => import("../../features/try-on/TryOnPage"), "TryOnPage");
import { AdminDashboard, ManagerDashboard } from "../../features/operations/Dashboards";
import { CatalogManagementPage } from "../../features/operations/CatalogManagementPage";
import { InventoryPage } from "../../features/operations/InventoryPage";
import { OperationalOrdersPage } from "../../features/operations/OperationalOrdersPage";
const PosPage = lazy(() => import("../../features/operations/PosPage").then((module) => ({ default: module.PosPage })));
const ReportsPage = lazy(() => import("../../features/reports/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const MlPage = lazy(() => import("../../features/ml/MlPage").then((module) => ({ default: module.MlPage })));
const ReportBuilderPage = lazy(() => import("../../features/reports/ReportBuilderPage").then((module) => ({ default: module.ReportBuilderPage })));
import { AuditPage } from "../../features/audit/AuditPage";
const PlansPage = lazyNamed(() => import("../../features/saas/PlansPage"), "PlansPage");
const CreateStorePage = lazyNamed(() => import("../../features/saas/CreateStorePage"), "CreateStorePage");
const MyPlanPage = lazyNamed(() => import("../../features/saas/MyPlanPage"), "MyPlanPage");
const CompaniesPage = lazyNamed(() => import("../../features/saas/CompaniesPage"), "CompaniesPage");
const BrandEditorPage = lazyNamed(() => import("../../features/saas/BrandEditorPage"), "BrandEditorPage");
import { TenantEntry } from "../../features/tenant/TenantEntry";
const PlatformPage = lazyNamed(() => import("../../features/platform/PlatformPage"), "PlatformPage");
const SyncCenterPage = lazyNamed(() => import("../../features/sync/SyncCenterPage"), "SyncCenterPage");
const OfflineRegistryPage = lazyNamed(() => import("../../features/sync/OfflineRegistryPage"), "OfflineRegistryPage");

function NotFound() { return <main className="page centered"><Brand variant="mark" /><span className="eyebrow">404</span><h1>Ruta no encontrada</h1><p>La navegación no reconoce esta dirección.</p><Link className="button primary" to="/">Volver al inicio</Link></main>; }

export function AppRouter() {
  return <Suspense fallback={<PageLoader />}><Routes>
    <Route element={<PublicShell />}>
      <Route index element={<HomePage />} />
      <Route path="catalogo" element={<CatalogPage />} />
      <Route path="catalogo/:slug" element={<ProductDetailPage />} />
      <Route path="login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="registro" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="planes" element={<PlansPage />} />
      <Route path="t/:tenantSlug" element={<TenantEntry />}>
        <Route index element={<HomePage />} />
        <Route path="catalogo" element={<CatalogPage />} />
        <Route path="catalogo/:slug" element={<ProductDetailPage />} />
      </Route>
      <Route path="crear-tienda" element={<GuestOnly><CreateStorePage /></GuestOnly>} />
    </Route>
    <Route element={<RequireRole roles={["CUSTOMER"]}><CustomerShell /></RequireRole>}>
      <Route path="favoritos" element={<FavoritesPage />} />
      <Route path="bolsa" element={<CartPage />} />
      <Route path="checkout" element={<CheckoutPage />} />
      <Route path="mis-pedidos" element={<OrdersPage />} />
      <Route path="mi-cuenta" element={<AccountPage />} />
      <Route path="pago/stripe/retorno" element={<StripeReturnPage />} />
      <Route path="probador" element={<TryOnPage />} />
    </Route>
    <Route element={<RequireRole roles={["ADMIN"]}><OperationsShell role="ADMIN" /></RequireRole>}>
      <Route path="admin" element={<AdminDashboard />} />
      <Route path="admin/catalogo" element={<CatalogManagementPage />} />
      <Route path="admin/inventario" element={<InventoryPage />} />
      <Route path="admin/pedidos" element={<OperationalOrdersPage />} />
      <Route path="admin/pos" element={<PosPage />} />
      <Route path="admin/reportes" element={<ReportsPage />} />
      <Route path="admin/reportes/constructor" element={<ReportBuilderPage />} />
      <Route path="admin/ml" element={<MlPage />} />
      <Route path="admin/auditoria" element={<AuditPage />} />
      <Route path="admin/mi-plan" element={<MyPlanPage />} />
      <Route path="admin/empresas" element={<CompaniesPage />} />
      <Route path="admin/marca" element={<BrandEditorPage />} />
      <Route path="admin/registro" element={<OfflineRegistryPage />} />
      <Route path="admin/sincronizacion" element={<SyncCenterPage />} />
    </Route>
    <Route element={<RequireRole roles={["STORE_MANAGER"]}><OperationsShell role="STORE_MANAGER" /></RequireRole>}>
      <Route path="sucursal" element={<ManagerDashboard />} />
      <Route path="sucursal/catalogo" element={<CatalogManagementPage />} />
      <Route path="sucursal/inventario" element={<InventoryPage />} />
      <Route path="sucursal/pedidos" element={<OperationalOrdersPage />} />
      <Route path="sucursal/pos" element={<PosPage />} />
      <Route path="sucursal/reportes" element={<ReportsPage />} />
      <Route path="sucursal/reportes/constructor" element={<ReportBuilderPage />} />
      <Route path="sucursal/registro" element={<OfflineRegistryPage />} />
      <Route path="sucursal/sincronizacion" element={<SyncCenterPage />} />
    </Route>
    <Route element={<RequireRole roles={["PLATFORM_ADMIN"]}><PlatformShell /></RequireRole>}>
      <Route path="plataforma" element={<PlatformPage />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>;
}






