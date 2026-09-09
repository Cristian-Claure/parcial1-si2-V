import { Route, Routes } from "react-router-dom";
import { RequireRole, GuestOnly } from "../../shared/auth/RouteGuards";
import { CustomerShell, OperationsShell, PublicShell } from "../../shared/layout/Shells";
import { HomePage } from "../../features/home/HomePage";
import { LoginPage, RegisterPage } from "../../features/auth/AuthPages";
import { CatalogPage, ProductDetailPage } from "../../features/catalog/CatalogPages";
import { FavoritesPage } from "../../features/favorites/FavoritesPage";
import { CartPage } from "../../features/cart/CartPage";
import { CheckoutPage } from "../../features/checkout/CheckoutPage";
import { OrdersPage } from "../../features/orders/OrdersPage";
import { AccountPage } from "../../features/account/AccountPage";
import { StripeReturnPage } from "../../features/payments/StripeReturnPage";
import { AdminDashboard, ManagerDashboard } from "../../features/operations/Dashboards";
import { CatalogManagementPage } from "../../features/operations/CatalogManagementPage";
import { InventoryPage } from "../../features/operations/InventoryPage";
import { OperationalOrdersPage } from "../../features/operations/OperationalOrdersPage";
import { PosPage } from "../../features/operations/PosPage";
import { DeferredPage } from "../../features/deferred/DeferredPage";

function NotFound() { return <main className="page centered"><span className="eyebrow">404</span><h1>Ruta no encontrada</h1><p>La navegación React no reconoce esta dirección.</p></main>; }

export function AppRouter() {
  return <Routes>
    <Route element={<PublicShell />}>
      <Route index element={<HomePage />} />
      <Route path="catalogo" element={<CatalogPage />} />
      <Route path="catalogo/:slug" element={<ProductDetailPage />} />
      <Route path="login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="registro" element={<GuestOnly><RegisterPage /></GuestOnly>} />
    </Route>
    <Route element={<RequireRole roles={["CUSTOMER"]}><CustomerShell /></RequireRole>}>
      <Route path="favoritos" element={<FavoritesPage />} />
      <Route path="bolsa" element={<CartPage />} />
      <Route path="checkout" element={<CheckoutPage />} />
      <Route path="mis-pedidos" element={<OrdersPage />} />
      <Route path="mi-cuenta" element={<AccountPage />} />
      <Route path="pago/stripe/retorno" element={<StripeReturnPage />} />
      <Route path="probador" element={<DeferredPage phase="N9" title="Probador Virtual" description="El frontend se conectará cuando migremos Try-On, AI y Azure Blob Storage." />} />
    </Route>
    <Route element={<RequireRole roles={["ADMIN"]}><OperationsShell role="ADMIN" /></RequireRole>}>
      <Route path="admin" element={<AdminDashboard />} />
      <Route path="admin/catalogo" element={<CatalogManagementPage />} />
      <Route path="admin/inventario" element={<InventoryPage />} />
      <Route path="admin/pedidos" element={<OperationalOrdersPage />} />
      <Route path="admin/pos" element={<PosPage />} />
      <Route path="admin/reportes" element={<DeferredPage phase="N10" title="Reportes" description="Reportes, KPIs e integración IA se migrarán en N10." />} />
      <Route path="admin/auditoria" element={<DeferredPage phase="N10" title="Auditoría" description="La bitácora y trazabilidad administrativa se migrarán en N10." />} />
    </Route>
    <Route element={<RequireRole roles={["STORE_MANAGER"]}><OperationsShell role="STORE_MANAGER" /></RequireRole>}>
      <Route path="sucursal" element={<ManagerDashboard />} />
      <Route path="sucursal/catalogo" element={<CatalogManagementPage />} />
      <Route path="sucursal/inventario" element={<InventoryPage />} />
      <Route path="sucursal/pedidos" element={<OperationalOrdersPage />} />
      <Route path="sucursal/pos" element={<PosPage />} />
      <Route path="sucursal/reportes" element={<DeferredPage phase="N10" title="Reportes de sucursal" description="Los reportes operativos se migrarán en N10." />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>;
}
