import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { veloraApi } from "../../core/api/veloraApi";
import type { UserRole } from "@velora/contracts";
import { useAuthStore } from "../../core/auth/authStore";
import { useCompanyStore } from "../../core/company/companyStore";
import { Brand } from "../brand";
import { TenantTheme } from "../brand/TenantTheme";
import { useOperationalBrand, useStorefrontBrand } from "../../core/company/useBrand";
import { SyncIndicator } from "../../features/sync/SyncIndicator";
import { postLoginPath } from "../../core/auth/postLoginPath";
import { PLATFORM_NAME, PLATFORM_TAGLINE, PlatformBrand, PlatformTheme } from "../platform/PlatformBrand";

const customerNav = [
  ["Catálogo", "/catalogo"], ["Probador", "/probador"], ["Favoritos", "/favoritos"], ["Mi bolsa", "/bolsa"], ["Mis pedidos", "/mis-pedidos"], ["Mi cuenta", "/mi-cuenta"],
] as const;
const adminNav = [
  ["Dashboard", "/admin"], ["Catálogo", "/admin/catalogo"], ["Inventario", "/admin/inventario"], ["Pedidos", "/admin/pedidos"],
  ["POS", "/admin/pos"], ["Reportes", "/admin/reportes"], ["Inteligencia", "/admin/ml"], ["Auditoría", "/admin/auditoria"],
  ["Registro sin conexión", "/admin/registro"], ["Sincronización", "/admin/sincronizacion"],
  ["Mis tiendas", "/admin/empresas"], ["Marca", "/admin/marca"], ["Mi plan", "/admin/mi-plan"],
] as const;
const managerNav = [
  ["Sucursal", "/sucursal"], ["Catálogo", "/sucursal/catalogo"], ["Inventario", "/sucursal/inventario"], ["Pedidos", "/sucursal/pedidos"],
  ["POS", "/sucursal/pos"], ["Reportes", "/sucursal/reportes"],
  ["Registro sin conexión", "/sucursal/registro"], ["Sincronización", "/sucursal/sincronizacion"],
] as const;

function NavItems({ items, locked = {} }: { items: readonly (readonly [string, string])[]; locked?: Record<string, string> }) {
  return <>{items.map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>{label}{locked[to] ? <span className="nav-lock" title={`Disponible en ${locked[to]}`}>{locked[to]}</span> : null}</NavLink>)}</>;
}

export function PublicShell() {
  const user = useAuthStore((state) => state.user); const brand = useStorefrontBrand();
  const home = brand ? `/t/${brand.slug}` : "/tiendas";
  return <TenantTheme brand={brand}><header className="public-header"><Link to={home}><Brand variant="lockup" brand={brand} showTagline /></Link><nav><NavLink to="/catalogo">Catálogo</NavLink>{user?.role === "CUSTOMER" ? <NavLink to="/bolsa">Mi bolsa</NavLink> : null}{!user ? <NavLink to="/planes">Planes</NavLink> : null}</nav><div className="header-actions">{user ? <RoleLink role={user.role} /> : <><Link to="/login">Ingresar</Link><Link className="button small" to="/registro">Crear cuenta</Link></>}</div></header><Outlet /><footer className="public-footer"><Brand variant="wordmark" brand={brand} /><span>{brand ? <>Tienda en <Link to="/tiendas">{PLATFORM_NAME}</Link></> : <Link to="/tiendas">Ver tiendas en {PLATFORM_NAME}</Link>}</span></footer></TenantTheme>;
}

function RoleLink({ role }: { role: UserRole }) {
  const to = role === "CUSTOMER" ? "/mis-pedidos" : postLoginPath({ role, lastStoreSlug: null, adminCompanyCount: 0 });
  return <Link className="button small" to={to}>Mi espacio</Link>;
}

/** Header y footer públicos de la plataforma Trama (entrada neutral, planes, directorio, alta de tienda). */
export function PlatformPublicShell() {
  const user = useAuthStore((state) => state.user);
  return <PlatformTheme>
    <header className="platform-header">
      <Link to="/" aria-label={`${PLATFORM_NAME}: inicio`}><PlatformBrand /></Link>
      <nav className="platform-nav" aria-label="Plataforma">
        <NavLink to="/tiendas">Tiendas</NavLink>
        <NavLink to="/planes">Planes</NavLink>
        <NavLink to="/crear-tienda">Abre tu tienda</NavLink>
      </nav>
      <div className="header-actions">{user ? <RoleLink role={user.role} /> : <><Link className="button secondary small" to="/login">Ingresar</Link><Link className="button primary small" to="/registro">Crear cuenta</Link></>}</div>
    </header>
    <Outlet />
    <footer className="platform-footer">
      <PlatformBrand showTagline />
      <nav><Link to="/tiendas">Tiendas</Link><Link to="/planes">Planes</Link><Link to="/registro">Crear cuenta</Link></nav>
      <span>© 2026 {PLATFORM_NAME} · {PLATFORM_TAGLINE}</span>
    </footer>
  </PlatformTheme>;
}

/** Pantallas de la plataforma para usuarios con sesión (p. ej. /elegir-empresa). */
export function PlatformAppShell() {
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout); const navigate = useNavigate();
  return <PlatformTheme>
    <header className="platform-header">
      <Link to="/"><PlatformBrand /></Link>
      <div className="header-actions">{user ? <span>{user.firstName} {user.lastName}</span> : null}<button className="button secondary small" type="button" onClick={() => { logout(); navigate("/"); }}>Cerrar sesión</button></div>
    </header>
    <Outlet />
  </PlatformTheme>;
}

export function CustomerShell() {
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout); const navigate = useNavigate(); const brand = useStorefrontBrand();
  return <TenantTheme brand={brand}><div className="app-shell"><aside className="sidebar"><Link to={brand && !brand.isPlatformBrand ? `/t/${brand.slug}` : "/"}><Brand variant="mark" brand={brand} /></Link><div className="sidebar-user"><span>Cliente</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong></div><nav><NavItems items={customerNav} /></nav><button className="nav-button" type="button" onClick={() => { logout(); navigate("/"); }}>Cerrar sesión</button></aside><main className="app-content"><Outlet /></main></div></TenantTheme>;
}

export function OperationsShell({ role }: { role: "ADMIN" | "STORE_MANAGER" }) {
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout); const navigate = useNavigate();
  const companies = useCompanyStore((state) => state.companies); const adminCompanyId = useCompanyStore((state) => state.adminCompanyId);
  const selectAdmin = useCompanyStore((state) => state.selectAdmin); const managerCompany = useCompanyStore((state) => state.managerCompany);
  const items = role === "ADMIN" ? adminNav : managerNav; const brand = useOperationalBrand(role); const location = useLocation();
  const ownCompanies = useQuery({ queryKey: ["admin-companies"], queryFn: veloraApi.adminCompanies, enabled: role === "ADMIN", staleTime: 60_000 });
  const manyCompanies = (ownCompanies.data?.length ?? 0) >= 2;
  // "Inteligencia" (ML) solo en MAX: el menú lo marca bloqueado; el backend igual responde 403.
  const plan = useQuery({ queryKey: ["admin-plan"], queryFn: veloraApi.adminPlan, enabled: role === "ADMIN", staleTime: 60_000 });
  const locked: Record<string, string> = plan.data && !plan.data.effectivePlan.reports.canMlDashboards ? { "/admin/ml": "MAX" } : {};
  if (role === "ADMIN" && manyCompanies && !ownCompanies.data?.some((company) => company.id === adminCompanyId)) return <Navigate to="/elegir-empresa" replace state={{ from: location.pathname }} />;
  return <div className="app-shell"><aside className="sidebar ops"><Link to={role === "ADMIN" ? "/admin" : "/sucursal"}><Brand variant="mark" brand={brand} tone="dark" /></Link><div className="sidebar-user"><span>{role === "ADMIN" ? "Administración" : "Encargado de sucursal"}</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong>{user?.storeName ? <small>{user.storeName}</small> : null}</div>{role === "ADMIN" ? <label className="sidebar-select">Compañía<select value={adminCompanyId ?? ""} onChange={(event) => selectAdmin(event.target.value)}><option value="" disabled>Seleccione</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.brand?.name ?? company.displayName ?? company.name}</option>)}</select>{manyCompanies ? <Link className="switch-company" to="/elegir-empresa">Cambiar de empresa</Link> : null}</label> : <div className="sidebar-company">{managerCompany?.brand?.name ?? managerCompany?.name ?? "Compañía de la sucursal"}</div>}<SyncIndicator centerPath={role === "ADMIN" ? "/admin/sincronizacion" : "/sucursal/sincronizacion"} /><nav><NavItems items={items} locked={locked} /></nav><button className="nav-button" type="button" onClick={() => { logout(); navigate("/"); }}>Cerrar sesión</button></aside><main className="app-content"><Outlet /></main></div>;
}

/** Área mínima de la plataforma (PLATFORM_ADMIN): marca de la plataforma, sin selector de empresa. */
export function PlatformShell() {
  const user = useAuthStore((state) => state.user); const logout = useAuthStore((state) => state.logout); const navigate = useNavigate();
  return <div className="app-shell"><aside className="sidebar ops"><Link to="/plataforma"><PlatformBrand variant="mark" tone="dark" /></Link><div className="sidebar-user"><span>Plataforma {PLATFORM_NAME}</span><strong>{user ? `${user.firstName} ${user.lastName}` : ""}</strong></div><nav><NavItems items={[["Plataforma", "/plataforma"], ["Tiendas", "/tiendas"], ["Planes públicos", "/planes"]] as const} /></nav><button className="nav-button" type="button" onClick={() => { logout(); navigate("/"); }}>Cerrar sesión</button></aside><main className="app-content"><PlatformTheme><Outlet /></PlatformTheme></main></div>;
}
